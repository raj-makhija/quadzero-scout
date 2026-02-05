import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { getAllPromptKeys, getActivePrompt } from '../../lib/dynamodb.js';

async function handleRequest(_event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const promptKeys = await getAllPromptKeys();

    // Get active version for each key
    const prompts = await Promise.all(
      promptKeys.map(async (key) => {
        const active = await getActivePrompt(key);
        return {
          promptKey: key,
          activeVersion: active?.version || null,
          content: active?.content || null,
          lastUpdated: active?.created_at || null,
          description: active?.description || null,
        };
      })
    );

    return success({ prompts });
  } catch (err) {
    console.error('Error listing prompts:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to list prompts', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
