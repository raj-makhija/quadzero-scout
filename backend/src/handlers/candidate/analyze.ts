import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, AnalyzeRequestSchema } from '../../lib/validation.js';
import { extractTextFromResume } from '../../lib/textract.js';
import { parseResume } from '../../lib/llm/index.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import type { AnalyzeResponse } from '../../types/index.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    // Parse request body
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    // Validate request
    const validation = validate(AnalyzeRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const { s3Key } = validation.data;

    // Extract text from resume using Textract
    console.log('Extracting text from resume:', s3Key);
    let extractedText: { text: string; confidence: number };

    try {
      extractedText = await extractTextFromResume(s3Key);
    } catch (err) {
      console.error('Textract error:', err);
      return error(
        ErrorCodes.TEXTRACT_ERROR,
        'Failed to extract text from resume',
        500,
        { message: (err as Error).message }
      );
    }

    if (!extractedText.text || extractedText.text.trim().length < 50) {
      return error(
        ErrorCodes.TEXTRACT_ERROR,
        'Could not extract sufficient text from resume. Please ensure the document is readable.',
        422
      );
    }

    // Parse resume using LLM
    console.log('Parsing resume with LLM, text length:', extractedText.text.length);
    let parseResult: { output: unknown; confidence: number };

    try {
      parseResult = await parseResume(extractedText.text);
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
      confidence: Math.min(extractedText.confidence, parseResult.confidence),
      rawTextLength: extractedText.text.length,
    };

    return success(response);
  } catch (err) {
    console.error('Unexpected error in analyze handler:', err);
    return error(
      ErrorCodes.INTERNAL_ERROR,
      'An unexpected error occurred',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['candidate'], handleRequest);
