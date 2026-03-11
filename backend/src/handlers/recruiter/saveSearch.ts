import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, SaveSearchRequestSchema } from '../../lib/validation.js';
import { saveSavedSearch } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import type { SavedSearch, SearchCriteria } from '../../types/index.js';

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
    const validation = validate(SaveSearchRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const { name, criteria } = validation.data;

    const recruiterId = event.auth.userId;

    const searchId = `search_${uuidv4()}`;
    const now = new Date().toISOString();

    // Ensure criteria has required fields with defaults
    const normalizedCriteria: SearchCriteria = {
      mustHaveSkills: criteria.mustHaveSkills || [],
      goodToHaveSkills: criteria.goodToHaveSkills || [],
      minExperience: criteria.minExperience,
      maxExperience: criteria.maxExperience,
      seniority: criteria.seniority,
      availability: criteria.availability,
      location: criteria.location,
      remote: criteria.remote,
      industries: criteria.industries,
    };

    const savedSearch: SavedSearch = {
      recruiterId,
      searchId,
      name,
      criteria: normalizedCriteria,
      createdAt: now,
    };

    await saveSavedSearch(savedSearch);

    return success({
      searchId,
      name,
      createdAt: now,
    });
  } catch (err) {
    console.error('Error saving search:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to save search',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
