import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, SaveClientRequestSchema } from '../../lib/validation.js';
import { saveClient, getClientByName } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import type { ClientItem } from '../../types/index.js';

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

    const validation = validate(SaveClientRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const data = validation.data;
    const clientNameLower = data.clientName.toLowerCase().trim();

    // Check if client already exists
    const existing = await getClientByName(clientNameLower);
    if (existing) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        `Client "${data.clientName}" already exists`,
        409
      );
    }

    const now = new Date().toISOString();
    const item: ClientItem = {
      client_id: uuidv4(),
      client_name: data.clientName.trim(),
      client_name_lower: clientNameLower,
      default_payment_terms_days: data.defaultPaymentTermsDays,
      default_engagement_model: data.defaultEngagementModel,
      default_payroll: data.defaultPayroll,
      notes: data.notes,
      created_by: event.auth.userId,
      created_at: now,
      last_updated: now,
    };

    await saveClient(item);

    logAuditEvent(event.auth, event, {
      action: 'CLIENT_CREATE',
      entityType: 'client',
      entityId: item.client_id,
      metadata: { clientId: item.client_id, clientName: item.client_name },
    });

    return success({
      clientId: item.client_id,
      clientName: item.client_name,
      createdAt: now,
    }, 201);
  } catch (err) {
    console.error('Error saving client:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to save client',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
