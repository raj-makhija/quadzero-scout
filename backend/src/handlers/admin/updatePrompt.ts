import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { logAuditEvent } from '../../lib/audit.js';
import { savePromptVersion, getNextPromptVersion } from '../../lib/dynamodb.js';
import { validate, formatZodErrors } from '../../lib/validation.js';

const RequestSchema = z.object({
  promptKey: z.string().min(1),
  content: z.string().min(10),
  description: z.string().max(500).optional(),
});

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body required', 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON', 400);
    }

    const validation = validate(RequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { promptKey, content, description } = validation.data;
    const version = await getNextPromptVersion(promptKey);

    await savePromptVersion({
      prompt_key: promptKey,
      version,
      content,
      is_active: true,
      created_at: new Date().toISOString(),
      created_by: event.auth.userId,
      description,
    });

    logAuditEvent(event.auth, event, {
      action: 'PROMPT_UPDATE',
      entityType: 'config',
      entityId: promptKey,
      metadata: { promptKey, version },
    });

    return success({ promptKey, version });
  } catch (err) {
    console.error('Error updating prompt:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to update prompt', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
