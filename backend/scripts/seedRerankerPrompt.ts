/**
 * Seed the admin-editable candidate_reranker prompt for #486.
 * Run with: DYNAMODB_TABLE_PROMPTS=Prompts-<stage> npx tsx scripts/seedRerankerPrompt.ts
 *
 * Insert-only and idempotent: seeds version 1 ONLY when the key has no rows.
 * Never overwrites an existing version, so re-running cannot clobber an admin's edits.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { FALLBACK_CANDIDATE_RERANKER_PROMPT } from '../src/lib/llm/index.js';

const region = process.env.AWS_REGION || 'ap-south-1';
const tableName = process.env.DYNAMODB_TABLE_PROMPTS || 'Prompts-dev';
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

export const PROMPT_KEY = 'candidate_reranker';
export const SEED_CONTENT = FALLBACK_CANDIDATE_RERANKER_PROMPT;

export function planSeed(existingRowCount: number): 'seed' | 'skip' {
  return existingRowCount === 0 ? 'seed' : 'skip';
}

async function seed(): Promise<void> {
  const existing = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'prompt_key = :key',
      ExpressionAttributeValues: { ':key': PROMPT_KEY },
      Limit: 1,
    })
  );
  const plan = planSeed(existing.Count || 0);
  if (plan === 'skip') {
    console.log(`Prompt "${PROMPT_KEY}" already has rows — leaving it untouched.`);
    return;
  }
  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        prompt_key: PROMPT_KEY,
        version: 1,
        content: SEED_CONTENT,
        is_active: true,
        created_at: new Date().toISOString(),
        created_by: 'system-seed',
        description: 'Initial seed from codebase (#486)',
      },
    })
  );
  console.log(`Seeded prompt "${PROMPT_KEY}" (v1) into ${tableName}.`);
}

const isMain = process.argv[1]?.includes('seedRerankerPrompt');
if (isMain) {
  seed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
