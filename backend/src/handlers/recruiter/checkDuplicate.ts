import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, CheckDuplicateRequestSchema } from '../../lib/validation.js';
import { getActiveRequirementsByClient } from '../../lib/dynamodb.js';
import { compareRequirements } from '../../lib/llm/index.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    const validation = validate(CheckDuplicateRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const { clientName, parsedCriteria, jobTitle } = validation.data;

    // Get existing active requirements from this client
    const existingRequirements = await getActiveRequirementsByClient(
      clientName.toLowerCase().trim()
    );

    if (existingRequirements.length === 0) {
      return success({ duplicates: [] });
    }

    // Use LLM to compare the new requirement against existing ones
    const existingSummaries = existingRequirements.map((req) => ({
      requirementId: req.requirement_id,
      jobTitle: req.job_title,
      mustHaveSkills: req.parsed_criteria?.mustHaveSkills || [],
      goodToHaveSkills: req.parsed_criteria?.goodToHaveSkills || [],
      minExperience: req.parsed_criteria?.minExperience,
      maxExperience: req.parsed_criteria?.maxExperience,
      seniority: req.parsed_criteria?.seniority || [],
      location: req.parsed_criteria?.location,
      createdAt: req.created_at,
      requestCount: req.request_count || 1,
      lastRequestedAt: req.last_requested_at,
    }));

    const duplicates = await compareRequirements(
      {
        jobTitle,
        mustHaveSkills: parsedCriteria.mustHaveSkills,
        goodToHaveSkills: parsedCriteria.goodToHaveSkills,
        minExperience: parsedCriteria.minExperience,
        maxExperience: parsedCriteria.maxExperience,
        seniority: parsedCriteria.seniority,
        location: parsedCriteria.location,
      },
      existingSummaries
    );

    return success({ duplicates });
  } catch (err) {
    console.error('Error checking duplicates:', err);
    return error(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to check for duplicates',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
