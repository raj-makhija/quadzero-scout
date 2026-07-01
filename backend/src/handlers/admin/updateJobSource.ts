import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, UpdateJobSourceSchema } from '../../lib/validation.js';
import { getJobSource, replaceJobSource } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { VALID_TYPES } from '../../lib/portalScan/adapters/index.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const sourceId = event.pathParameters?.source_id;
    if (!sourceId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'source_id path parameter is required', 400);
    }

    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    const validation = validate(UpdateJobSourceSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const updates = validation.data;

    if (updates.type !== undefined && !VALID_TYPES.includes(updates.type)) {
      return error(ErrorCodes.VALIDATION_ERROR, `Unknown type "${updates.type}". Valid types: ${VALID_TYPES.join(', ')}`, 400);
    }

    const existing = await getJobSource(sourceId);
    if (!existing) {
      return error(ErrorCodes.NOT_FOUND, 'Job source not found', 404);
    }

    const updated = { ...existing, ...updates };
    await replaceJobSource(updated);

    return success({ source: updated });
  } catch (err) {
    console.error('Error updating job source:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to update job source', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
