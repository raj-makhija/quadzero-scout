import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { getPromptVersions } from '../../lib/dynamodb.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const promptKey = event.pathParameters?.promptKey;
    if (!promptKey) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Prompt key required', 400);
    }

    const decodedKey = decodeURIComponent(promptKey);
    const rawVersions = await getPromptVersions(decodedKey);

    // Transform to camelCase for frontend
    const versions = rawVersions.map((v) => ({
      promptKey: v.prompt_key,
      version: v.version,
      content: v.content,
      isActive: v.is_active,
      createdAt: v.created_at,
      createdBy: v.created_by,
      description: v.description,
    }));

    return success({ promptKey: decodedKey, versions });
  } catch (err) {
    console.error('Error getting prompt versions:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to get prompt versions', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
