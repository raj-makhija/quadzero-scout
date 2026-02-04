import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { parseResume } from '../../lib/llm/index.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import type { AnalyzeResponse } from '../../types/index.js';
// Import pdf-parse internals directly to avoid the test code in index.js
// that tries to readFileSync a test PDF (fails when bundled by esbuild)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

/**
 * Local development endpoint that accepts a base64-encoded file,
 * extracts text using pdf-parse (instead of AWS Textract),
 * and parses with LLM. Bypasses S3 and Textract for local dev.
 */
async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: { fileContent: string; fileName: string; contentType: string };
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    if (!body.fileContent || !body.fileName) {
      return error(ErrorCodes.VALIDATION_ERROR, 'fileContent and fileName are required', 400);
    }

    // Decode base64 file content
    const fileBuffer = Buffer.from(body.fileContent, 'base64');
    console.log(`Processing file: ${body.fileName} (${fileBuffer.length} bytes)`);

    // Extract text from PDF using pdf-parse
    let extractedText: string;
    try {
      const pdfData = await pdfParse(fileBuffer);
      extractedText = pdfData.text;
      console.log(`Extracted ${extractedText.length} characters from PDF`);
    } catch (err) {
      console.error('PDF parse error:', err);
      return error(
        ErrorCodes.TEXTRACT_ERROR,
        'Failed to extract text from PDF. Ensure the file is a valid PDF.',
        422,
        { message: (err as Error).message }
      );
    }

    if (!extractedText || extractedText.trim().length < 50) {
      return error(
        ErrorCodes.TEXTRACT_ERROR,
        'Could not extract sufficient text from resume. Please ensure the document is readable.',
        422
      );
    }

    // Parse resume using LLM
    console.log('Parsing resume with LLM, text length:', extractedText.length);
    let parseResult: { output: unknown; confidence: number };

    try {
      parseResult = await parseResume(extractedText);
    } catch (err) {
      console.error('LLM parse error:', err);
      return error(
        ErrorCodes.LLM_PARSE_ERROR,
        'Failed to parse resume content',
        422,
        { message: (err as Error).message }
      );
    }

    const response: AnalyzeResponse = {
      extractedProfile: parseResult.output as AnalyzeResponse['extractedProfile'],
      confidence: parseResult.confidence,
      rawTextLength: extractedText.length,
    };

    return success(response);
  } catch (err) {
    console.error('Unexpected error in upload-and-analyze handler:', err);
    return error(
      ErrorCodes.INTERNAL_ERROR,
      'An unexpected error occurred',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['candidate'], handleRequest);
