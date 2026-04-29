import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, ParseJdRequestSchema } from '../../lib/validation.js';
import { parseJobDescription } from '../../lib/llm/index.js';
import { withOptionalAuth, type OptionalAuthEvent } from '../../lib/auth.js';
import type { ParseJdResponse } from '../../types/index.js';
import { normalizeLocation } from '../../lib/locationNormalizer.js';

async function handleRequest(
  event: OptionalAuthEvent
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
    const validation = validate(ParseJdRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const { jobDescription, jobTitle } = validation.data;

    // Parse JD using LLM
    console.log('Parsing job description, length:', jobDescription.length);
    let parseResult: { output: unknown; confidence: number; suggestions: string[] };

    try {
      parseResult = await parseJobDescription(jobDescription, jobTitle);
    } catch (err) {
      console.error('LLM parse error:', err);
      return error(
        ErrorCodes.LLM_PARSE_ERROR,
        'Failed to parse job description',
        422,
        { message: (err as Error).message }
      );
    }

    const parsedCriteria = parseResult.output as ParseJdResponse['parsedCriteria'];
    parsedCriteria.location = normalizeLocation(parsedCriteria.location) ?? null;

    const response: ParseJdResponse = {
      parsedCriteria,
      confidence: parseResult.confidence,
      suggestions: parseResult.suggestions,
    };

    return success(response);
  } catch (err) {
    console.error('Unexpected error in parseJd handler:', err);
    return error(
      ErrorCodes.INTERNAL_ERROR,
      'An unexpected error occurred',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withOptionalAuth(handleRequest);
