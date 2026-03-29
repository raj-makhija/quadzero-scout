import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { validate, formatZodErrors, UpdateSubVendorRequestSchema } from '../../lib/validation.js';
import { updateSubVendor } from '../../lib/dynamodb.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';

async function handleRequest(
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResultV2> {
  try {
    const subVendorId = event.pathParameters?.subVendorId;
    if (!subVendorId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'subVendorId is required', 400);
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

    const validation = validate(UpdateSubVendorRequestSchema, body);
    if (!validation.success) {
      return error(
        ErrorCodes.VALIDATION_ERROR,
        formatZodErrors(validation.errors),
        400
      );
    }

    const data = validation.data;

    await updateSubVendor(subVendorId, {
      contactPersonName: data.contactPersonName,
      contactPersonPhone: data.contactPersonPhone,
      contactPersonEmail: data.contactPersonEmail,
      notes: data.notes,
    });

    logAuditEvent(event.auth, event, {
      action: 'SUB_VENDOR_UPDATE',
      entityType: 'sub_vendor',
      entityId: subVendorId,
      metadata: { subVendorId },
    });

    return success({ updated: true });
  } catch (err) {
    console.error('Error updating sub-vendor:', err);
    if ((err as Error).name === 'ConditionalCheckFailedException') {
      return error(ErrorCodes.NOT_FOUND, 'Sub-vendor not found', 404);
    }
    return error(
      ErrorCodes.DYNAMODB_ERROR,
      'Failed to update sub-vendor',
      500,
      { message: (err as Error).message }
    );
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
