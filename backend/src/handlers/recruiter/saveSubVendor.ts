import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, SaveSubVendorRequestSchema } from '../../lib/validation.js';
import { saveSubVendor, getSubVendorByName } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import type { SubVendorItem } from '../../types/index.js';

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

    const validation = validate(SaveSubVendorRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const data = validation.data;
    const subVendorNameLower = data.subVendorName.toLowerCase().trim();

    // Check if sub-vendor already exists
    const existing = await getSubVendorByName(subVendorNameLower);
    if (existing) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        `Sub-vendor "${data.subVendorName}" already exists`,
        409
      );
    }

    const now = new Date().toISOString();
    const item: SubVendorItem = {
      sub_vendor_id: uuidv4(),
      sub_vendor_name: data.subVendorName.trim(),
      sub_vendor_name_lower: subVendorNameLower,
      contact_person_name: data.contactPersonName,
      contact_person_phone: data.contactPersonPhone,
      contact_person_email: data.contactPersonEmail,
      notes: data.notes,
      created_by: event.auth.userId,
      created_at: now,
      last_updated: now,
    };

    await saveSubVendor(item);

    logAuditEvent(event.auth, event, {
      action: 'SUB_VENDOR_CREATE',
      entityType: 'sub_vendor',
      entityId: item.sub_vendor_id,
      metadata: { subVendorId: item.sub_vendor_id, subVendorName: item.sub_vendor_name },
    });

    return success({
      subVendorId: item.sub_vendor_id,
      subVendorName: item.sub_vendor_name,
      contactPersonName: item.contact_person_name,
      contactPersonPhone: item.contact_person_phone,
      contactPersonEmail: item.contact_person_email,
      notes: item.notes,
      createdAt: now,
      lastUpdated: now,
    }, 201);
  } catch (err) {
    console.error('Error saving sub-vendor:', err);
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to save sub-vendor',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
