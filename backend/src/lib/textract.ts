import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import { getObject } from './s3.js';

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

async function extractTextFromPdf(documentBytes: Buffer): Promise<ExtractedText> {
  const pdfData = await pdfParse(documentBytes);
  return {
    text: pdfData.text,
    confidence: 0.9,
    pageCount: pdfData.numpages,
  };
}

export async function extractTextFromResume(s3Key: string): Promise<ExtractedText> {
  const extension = s3Key.toLowerCase().split('.').pop();
  const documentBytes = await getObject(s3Key);

  if (extension === 'docx') {
    return extractTextFromDocx(documentBytes);
  }

  return extractTextFromPdf(documentBytes);
}
