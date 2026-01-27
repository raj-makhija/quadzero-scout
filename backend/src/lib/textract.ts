import {
  TextractClient,
  DetectDocumentTextCommand,
  AnalyzeDocumentCommand,
  Block,
} from '@aws-sdk/client-textract';
import { config } from './config.js';
import { getObject } from './s3.js';

const textractClient = new TextractClient({ region: config.region });

export interface ExtractedText {
  text: string;
  confidence: number;
  pageCount: number;
}

export async function extractTextFromResume(s3Key: string): Promise<ExtractedText> {
  // Get the document from S3
  const documentBytes = await getObject(s3Key);

  // Use DetectDocumentText for simple text extraction
  const command = new DetectDocumentTextCommand({
    Document: {
      Bytes: documentBytes,
    },
  });

  const response = await textractClient.send(command);

  if (!response.Blocks) {
    throw new Error('No text blocks returned from Textract');
  }

  // Extract text from LINE blocks
  const textBlocks = response.Blocks.filter(
    (block: Block) => block.BlockType === 'LINE' && block.Text
  );

  const text = textBlocks
    .map((block: Block) => block.Text)
    .join('\n');

  // Calculate average confidence
  const confidences = textBlocks
    .filter((block: Block) => block.Confidence !== undefined)
    .map((block: Block) => block.Confidence as number);

  const avgConfidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length / 100
    : 0;

  // Count pages
  const pageBlocks = response.Blocks.filter(
    (block: Block) => block.BlockType === 'PAGE'
  );

  return {
    text,
    confidence: avgConfidence,
    pageCount: pageBlocks.length || 1,
  };
}

export async function extractTextWithLayout(s3Key: string): Promise<ExtractedText> {
  // Get the document from S3
  const documentBytes = await getObject(s3Key);

  // Use AnalyzeDocument for more detailed extraction
  const command = new AnalyzeDocumentCommand({
    Document: {
      Bytes: documentBytes,
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
