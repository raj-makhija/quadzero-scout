import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, CreateJobSourceSchema } from '../../lib/validation.js';
import { createJobSource } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { VALID_TYPES } from '../../lib/portalScan/adapters/index.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
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

    const validation = validate(CreateJobSourceSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { type, identifier, url, cadence, enabled } = validation.data;

    if (!VALID_TYPES.includes(type)) {
      return error(ErrorCodes.VALIDATION_ERROR, `Unknown type "${type}". Valid types: ${VALID_TYPES.join(', ')}`, 400);
    }

    const source = {
      source_id: uuidv4(),
      type,
      identifier,
      url,
      cadence,
      enabled,
    };

    await createJobSource(source);

    return success({ source });
  } catch (err) {
    console.error('Error creating job source:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to create job source', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
