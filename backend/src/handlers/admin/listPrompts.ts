import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { getAllPromptKeys, getActivePrompt } from '../../lib/dynamodb.js';

// Prompt keys the app manages via fallbacks. These always appear in the admin
// list even before an admin has saved a DB version, so they can be created.
const MANAGED_PROMPT_KEYS = ['resume_parser', 'jd_parser', 'resume_formatter', 'screening_questions', 'linkedin_post_generator', 'linkedin_image_generator', 'candidate_reranker'];

async function handleRequest(_event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const scannedKeys = await getAllPromptKeys();
    const promptKeys = Array.from(new Set([...MANAGED_PROMPT_KEYS, ...scannedKeys]));

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
