import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { listClients } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(
  _event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const items = await listClients();

    const clients = items.map((item) => ({
      clientId: item.client_id,
      clientName: item.client_name,
      defaultPaymentTermsDays: item.default_payment_terms_days,
      defaultEngagementModel: item.default_engagement_model,
      defaultPayroll: item.default_payroll,
      createdAt: item.created_at,
      lastUpdated: item.last_updated,
    }));

    return success({ clients });
  } catch (err) {
    console.error('Error listing clients:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to list clients',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
