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
      contactPersonName: item.contact_person_name,
      contactPersonPhone: item.contact_person_phone,
      contactPersonEmail: item.contact_person_email,
      notes: item.notes,
      createdAt: item.created_at,
      lastUpdated: item.last_updated,
    }));

    return success({ subVendors });
  } catch (err) {
    console.error('Error listing sub-vendors:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to list sub-vendors',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
