import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, CalculatePricingRequestSchema } from '../../lib/validation.js';
import { getActivePricingConfig } from '../../lib/dynamodb.js';
import { calculatePricing } from '../../lib/pricingEngine.js';
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

    const validation = validate(CalculatePricingRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const input = validation.data;
    const config = await getActivePricingConfig();
    const result = calculatePricing(input, config);

    return success(result);
  } catch (err) {
    console.error('Error calculating pricing:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to calculate pricing', 500);
  }
}

export const handler = withAuth(['recruiter', 'admin'], handleRequest);
