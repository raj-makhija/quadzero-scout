import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { getClientByName } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const clientName = event.queryStringParameters?.clientName;
    if (!clientName) {
      return error(ErrorCodes.VALIDATION_ERROR, 'clientName query parameter is required', 400);
    }

    const clientNameLower = clientName.toLowerCase().trim();
    const client = await getClientByName(clientNameLower);

    if (!client) {
      return success({
        found: false,
      });
    }

    return success({
      found: true,
      clientId: client.client_id,
      clientName: client.client_name,
      defaultPaymentTermsDays: client.default_payment_terms_days,
      defaultEngagementModel: client.default_engagement_model,
      defaultPayroll: client.default_payroll,
    });
  } catch (err) {
    console.error('Error fetching client defaults:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to fetch client defaults',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
