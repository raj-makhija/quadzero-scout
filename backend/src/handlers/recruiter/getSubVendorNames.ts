import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { listSubVendors } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';

async function handleRequest(
  _event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const items = await listSubVendors();

    const subVendors = items.map((item) => ({
      subVendorId: item.sub_vendor_id,
      subVendorName: item.sub_vendor_name,
    }));

    return success({ subVendors });
  } catch (err) {
    console.error('Error listing sub-vendor names:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to list sub-vendor names',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
