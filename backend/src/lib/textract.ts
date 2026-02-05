import {
  TextractClient,
  DetectDocumentTextCommand,
  AnalyzeDocumentCommand,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
  Block,
} from '@aws-sdk/client-textract';
import mammoth from 'mammoth';
import { config } from './config.js';
import { getObject } from './s3.js';

const textractClient = new TextractClient({ region: config.region });

const ASYNC_POLL_INTERVAL_MS = 1000;
const ASYNC_MAX_WAIT_MS = 50000;

export interface ExtractedText {
  text: string;
  confidence: number;
  pageCount: number;
}

async function extractTextFromDocx(documentBytes: Buffer): Promise<ExtractedText> {
  const result = await mammoth.extractRawText({ buffer: documentBytes });
  return {
    text: result.value,
    confidence: 0.95,
    pageCount: 1,
  };
}

function parseTextractBlocks(blocks: Block[]): ExtractedText {
  const textBlocks = blocks.filter(
    (block: Block) => block.BlockType === 'LINE' && block.Text
  );

  const text = textBlocks
    .map((block: Block) => block.Text)
    .join('\n');

  const confidences = textBlocks
    .filter((block: Block) => block.Confidence !== undefined)
    .map((block: Block) => block.Confidence as number);

  const avgConfidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length / 100
    : 0;

  const pageBlocks = blocks.filter(
    (block: Block) => block.BlockType === 'PAGE'
  );

  return {
    text,
    confidence: avgConfidence,
    pageCount: pageBlocks.length || 1,
  };
}

async function extractTextAsync(s3Key: string): Promise<ExtractedText> {
  const startCommand = new StartDocumentTextDetectionCommand({
    DocumentLocation: {
      S3Object: {
        Bucket: config.s3.resumesBucket,
        Name: s3Key,
      },
    },
  });

  const startResponse = await textractClient.send(startCommand);
  const jobId = startResponse.JobId;

  if (!jobId) {
    throw new Error('Textract did not return a JobId');
  }

  const startTime = Date.now();
  while (Date.now() - startTime < ASYNC_MAX_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, ASYNC_POLL_INTERVAL_MS));

    const getCommand = new GetDocumentTextDetectionCommand({ JobId: jobId });
    const getResponse = await textractClient.send(getCommand);

    if (getResponse.JobStatus === 'SUCCEEDED') {
      if (!getResponse.Blocks) {
        throw new Error('No text blocks returned from Textract');
      }
      return parseTextractBlocks(getResponse.Blocks);
    }

    if (getResponse.JobStatus === 'FAILED') {
      throw new Error(`Textract job failed: ${getResponse.StatusMessage}`);
    }
  }

  throw new Error('Textract async job timed out');
}

async function extractTextWithTextract(s3Key: string): Promise<ExtractedText> {
  try {
    const command = new DetectDocumentTextCommand({
      Document: {
        S3Object: {
          Bucket: config.s3.resumesBucket,
          Name: s3Key,
        },
      },
    });

    const response = await textractClient.send(command);

    if (!response.Blocks) {
      throw new Error('No text blocks returned from Textract');
    }

    return parseTextractBlocks(response.Blocks);
  } catch (err) {
    if ((err as { __type?: string }).__type === 'UnsupportedDocumentException') {
      console.log('Synchronous Textract unsupported, falling back to async:', s3Key);
      return extractTextAsync(s3Key);
    }
    throw err;
  }
}

export async function extractTextFromResume(s3Key: string): Promise<ExtractedText> {
  const extension = s3Key.toLowerCase().split('.').pop();

  if (extension === 'docx') {
    const documentBytes = await getObject(s3Key);
    return extractTextFromDocx(documentBytes);
  }

  return extractTextWithTextract(s3Key);
}

export async function extractTextWithLayout(s3Key: string): Promise<ExtractedText> {
  // Use AnalyzeDocument for more detailed extraction
  const command = new AnalyzeDocumentCommand({
    Document: {
      S3Object: {
        Bucket: config.s3.resumesBucket,
        Name: s3Key,
      },
    },
    FeatureTypes: ['TABLES', 'FORMS'],
  });

  const response = await textractClient.send(command);

  if (!response.Blocks) {
    throw new Error('No text blocks returned from Textract');
  }

  // Build text with structure awareness
  const lines: string[] = [];
  let currentPage = 0;

  for (const block of response.Blocks) {
    if (block.BlockType === 'PAGE') {
      currentPage++;
      if (currentPage > 1) {
        lines.push('\n--- Page Break ---\n');
      }
    } else if (block.BlockType === 'LINE' && block.Text) {
      lines.push(block.Text);
    }
  }

  const text = lines.join('\n');

  // Calculate average confidence
  const confidences = response.Blocks
    .filter((block: Block) => block.BlockType === 'LINE' && block.Confidence !== undefined)
    .map((block: Block) => block.Confidence as number);

  const avgConfidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length / 100
    : 0;

  const pageBlocks = response.Blocks.filter(
    (block: Block) => block.BlockType === 'PAGE'
  );

  return {
    text,
    confidence: avgConfidence,
    pageCount: pageBlocks.length || 1,
  };
}
