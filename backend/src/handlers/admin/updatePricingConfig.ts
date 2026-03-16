import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, UpdatePricingConfigRequestSchema } from '../../lib/validation.js';
import { savePricingConfig } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';

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

    const validation = validate(UpdatePricingConfigRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const { config: pricingConfig, description } = validation.data;
    const userId = event.auth.userId;

    const version = await savePricingConfig(pricingConfig, userId, description);

    logAuditEvent(event.auth, event, {
      action: 'PRICING_CONFIG_UPDATE',
      entityType: 'config',
      entityId: 'pricing',
      metadata: { version },
    });

    return success({ version });
  } catch (err) {
    console.error('Error updating pricing config:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to update pricing config', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
