/**
 * Seed the admin-editable LinkedIn prompts (text + image) for #442.
 * Run with: DYNAMODB_TABLE_PROMPTS=Prompts-<stage> npx tsx scripts/seedLinkedinPrompts.ts
 *
 * Insert-only and idempotent: seeds version 1 ONLY when a key has no rows.
 * It NEVER overwrites an existing version, so re-running cannot clobber an
 * admin's edits (unlike seedPrompts.ts, whose migrate path is for parser prompts).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  LINKEDIN_POST_PROMPT_DEFAULT,
  LINKEDIN_IMAGE_PROMPT_DEFAULT,
} from '../src/lib/linkedinPrompts.js';

const region = process.env.AWS_REGION || 'ap-south-1';
const tableName = process.env.DYNAMODB_TABLE_PROMPTS || 'Prompts-dev';
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

const PROMPTS = [
  { key: 'linkedin_post_generator', content: LINKEDIN_POST_PROMPT_DEFAULT },
  { key: 'linkedin_image_generator', content: LINKEDIN_IMAGE_PROMPT_DEFAULT },
];

async function seed(key: string, content: string): Promise<void> {
  const existing = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'prompt_key = :key',
      ExpressionAttributeValues: { ':key': key },
      Limit: 1,
    })
  );
  if ((existing.Count || 0) > 0) {
    console.log(`Prompt "${key}" already has rows — leaving it untouched.`);
    return;
  }
  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        prompt_key: key,
        version: 1,
        content,
        is_active: true,
        created_at: new Date().toISOString(),
        created_by: 'system-seed',
        description: 'Initial seed from codebase (#442)',
      },
    })
  );
  console.log(`Seeded prompt "${key}" (v1) into ${tableName}.`);
}

async function main(): Promise<void> {
  for (const p of PROMPTS) {
    await seed(p.key, p.content);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
