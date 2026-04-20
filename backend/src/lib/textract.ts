import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
  type Block,
} from '@aws-sdk/client-textract';
import { getObject } from './s3.js';
import { config } from './config.js';

export interface ExtractedText {
  text: string;
  confidence: number;
  pageCount: number;
}

const MIN_TEXT_LENGTH = 50;
const TEXTRACT_POLL_INTERVAL_MS = 2000;
const TEXTRACT_MAX_POLL_ATTEMPTS = 30; // ~60s total

let textractClient: TextractClient | null = null;
function getTextractClient(): TextractClient {
  if (!textractClient) {
    textractClient = new TextractClient({ region: config.region });
  }
  return textractClient;
}

async function extractTextFromDocx(documentBytes: Buffer): Promise<ExtractedText> {
  const result = await mammoth.extractRawText({ buffer: documentBytes });
  return {
    text: result.value,
    confidence: 0.95,
    pageCount: 1,
  };
}

async function extractTextFromPdf(documentBytes: Buffer): Promise<ExtractedText> {
  const pdfData = await pdfParse(documentBytes);
  return {
    text: pdfData.text,
    confidence: 0.9,
    pageCount: pdfData.numpages,
  };
}

/**
 * OCR fallback for scanned/image-only PDFs that pdf-parse can't read.
 * Uses AWS Textract async DetectDocumentText (handles multi-page PDFs via S3 ref).
 * Cost: ~$0.0015 per page; only invoked when pdf-parse yields < MIN_TEXT_LENGTH chars.
 */
async function extractTextWithTextract(s3Key: string): Promise<ExtractedText> {
  const client = getTextractClient();

  const startResp = await client.send(
    new StartDocumentTextDetectionCommand({
      DocumentLocation: {
        S3Object: { Bucket: config.s3.resumesBucket, Name: s3Key },
      },
    })
  );

  const jobId = startResp.JobId;
  if (!jobId) throw new Error('Textract did not return a JobId');

  let blocks: Block[] = [];
  let pageCount = 0;
  let nextToken: string | undefined;

  for (let attempt = 0; attempt < TEXTRACT_MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, TEXTRACT_POLL_INTERVAL_MS));
    const result = await client.send(
      new GetDocumentTextDetectionCommand({ JobId: jobId })
    );

    if (result.JobStatus === 'IN_PROGRESS') continue;
    if (result.JobStatus === 'FAILED' || result.JobStatus === 'PARTIAL_SUCCESS') {
      throw new Error(`Textract job ${result.JobStatus}: ${result.StatusMessage ?? 'no message'}`);
    }
    if (result.JobStatus !== 'SUCCEEDED') {
      throw new Error(`Unexpected Textract job status: ${result.JobStatus}`);
    }

    blocks = blocks.concat(result.Blocks ?? []);
    pageCount = result.DocumentMetadata?.Pages ?? pageCount;
    nextToken = result.NextToken;

    while (nextToken) {
      const next = await client.send(
        new GetDocumentTextDetectionCommand({ JobId: jobId, NextToken: nextToken })
      );
      blocks = blocks.concat(next.Blocks ?? []);
      nextToken = next.NextToken;
    }
    break;
  }

  if (!blocks.length) {
    throw new Error('Textract returned no blocks (job may have timed out)');
  }

  const lines = blocks
    .filter((b) => b.BlockType === 'LINE' && b.Text)
    .map((b) => b.Text as string);

  const confidences = blocks
    .filter((b) => b.BlockType === 'LINE' && typeof b.Confidence === 'number')
    .map((b) => b.Confidence as number);

  const avgConfidence = confidences.length
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length / 100
    : 0;

  return {
    text: lines.join('\n'),
    confidence: avgConfidence,
    pageCount: pageCount || 1,
  };
}

export async function extractTextFromResume(s3Key: string): Promise<ExtractedText> {
  const extension = s3Key.toLowerCase().split('.').pop();
  const documentBytes = await getObject(s3Key);

  if (extension === 'docx') {
    return extractTextFromDocx(documentBytes);
  }

  const pdfResult = await extractTextFromPdf(documentBytes);
  if (pdfResult.text.trim().length >= MIN_TEXT_LENGTH) {
    return pdfResult;
  }

  // pdf-parse found no embedded text layer — likely a scanned/image PDF.
  // Fall back to Textract OCR (uses S3 reference; supports multi-page).
  console.warn(
    `pdf-parse extracted only ${pdfResult.text.trim().length} chars from ${s3Key}; falling back to Textract OCR.`
  );
  try {
    return await extractTextWithTextract(s3Key);
  } catch (err) {
    console.error('Textract OCR fallback failed:', err);
    return pdfResult;
  }
}
