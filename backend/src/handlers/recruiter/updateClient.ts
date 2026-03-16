import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, UpdateClientRequestSchema } from '../../lib/validation.js';
import { updateClient } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const clientId = event.pathParameters?.clientId;
    if (!clientId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'clientId is required', 400);
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

    const validation = validate(UpdateClientRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const data = validation.data;

    await updateClient(clientId, {
      defaultPaymentTermsDays: data.defaultPaymentTermsDays,
      defaultEngagementModel: data.defaultEngagementModel,
      defaultPayroll: data.defaultPayroll,
      notes: data.notes,
    });

    logAuditEvent(event.auth, event, {
      action: 'CLIENT_UPDATE',
      entityType: 'client',
      entityId: clientId,
      metadata: { clientId },
    });

    return success({ updated: true });
  } catch (err) {
    console.error('Error updating client:', err);
    if ((err as Error).name === 'ConditionalCheckFailedException') {
      return error(ErrorCodes.NOT_FOUND, 'Client not found', 404);
    }
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to update client',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
