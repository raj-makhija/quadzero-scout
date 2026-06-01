import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { snoozeTaskById, POOL_OWNER, type SnoozePreset } from '../../lib/recruiterTasks.js';

const PRESETS: SnoozePreset[] = ['1h', '4h', 'tomorrow', 'next_week', 'custom'];

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const taskId = event.pathParameters?.taskId;
    if (!taskId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'taskId is required', 400);
    }
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body is required', 400);
    }

    let body: { preset?: string; customDate?: string; pool?: boolean };
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON in request body', 400);
    }

    if (!body.preset || !PRESETS.includes(body.preset as SnoozePreset)) {
      return error(ErrorCodes.VALIDATION_ERROR, `preset must be one of: ${PRESETS.join(', ')}`, 400);
    }
    if (body.preset === 'custom' && !body.customDate) {
      return error(ErrorCodes.VALIDATION_ERROR, 'customDate is required for the custom preset', 400);
    }

    const ownerId = body.pool ? POOL_OWNER : event.auth.userId;
    const snoozedUntil = await snoozeTaskById({
      ownerId,
      taskId,
      preset: body.preset as SnoozePreset,
      customDate: body.customDate,
    });

    return success({ snoozed: true, snoozedUntil });
  } catch (err) {
    console.error('Error snoozing task:', err);
    return error(ErrorCodes.DYNAMODB_ERROR, 'Failed to snooze task', 500, { message: (err as Error).message });
  }
}

export const handler = withAuth(['recruiter'], handleRequest);
