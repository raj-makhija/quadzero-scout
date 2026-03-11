/**
 * Re-parse all active requirements through the updated JD parser prompt.
 *
 * This script:
 * 1. Scans all active requirements from DynamoDB
 * 2. Re-parses each requirement's jd_text through the LLM with the latest prompt
 * 3. Updates only mustHaveSkills and goodToHaveSkills in parsed_criteria
 * 4. Logs a before/after comparison for each requirement
 *
 * Run with:
 *   npx tsx scripts/reparseRequirements.ts
 *
 * Environment variables:
 * - STAGE (default: dev) — determines which DynamoDB table to target
 * - AWS_REGION (default: ap-south-1)
 * - DRY_RUN=1 — preview changes without writing to DynamoDB
 * - LLM provider env vars (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { parseJobDescription } from '../src/lib/llm/index.js';

const region = process.env.AWS_REGION || 'ap-south-1';
const stage = process.env.STAGE || 'dev';
const tableName = process.env.DYNAMODB_TABLE_REQUIREMENTS || `Requirements-${stage}`;
const dryRun = process.env.DRY_RUN === '1';

const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

interface RequirementRecord {
  requirement_id: string;
  job_title?: string;
  jd_text: string;
  parsed_criteria: {
    mustHaveSkills: string[];
    goodToHaveSkills: string[];
    [key: string]: unknown;
  };
  status: string;
}

async function scanAllActive(): Promise<RequirementRecord[]> {
  const allItems: RequirementRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: '#status = :active',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':active': 'active' },
        Limit: 100,
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      })
    );
    allItems.push(...((result.Items || []) as RequirementRecord[]));
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return allItems;
}

async function reparseRequirements() {
  console.log(`\n=== Re-parse Requirements ===`);
  console.log(`Table: ${tableName}`);
  console.log(`Region: ${region}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}\n`);

  const requirements = await scanAllActive();
  console.log(`Found ${requirements.length} active requirements\n`);

  let updated = 0;
  let skipped = 0;
  let errored = 0;

  for (const req of requirements) {
    const reqLabel = `[${req.requirement_id}] ${req.job_title || '(no title)'}`;

    if (!req.jd_text || req.jd_text.trim().length < 50) {
      console.log(`SKIP ${reqLabel} — jd_text too short or missing`);
      skipped++;
      continue;
    }

    const oldMustHave = req.parsed_criteria.mustHaveSkills || [];
    const oldGoodToHave = req.parsed_criteria.goodToHaveSkills || [];

    try {
      const { output } = await parseJobDescription(req.jd_text, req.job_title);
      const newMustHave = output.mustHaveSkills;
      const newGoodToHave = output.goodToHaveSkills;

      // Check if anything changed
      const mustHaveSame =
        oldMustHave.length === newMustHave.length &&
        oldMustHave.every((s: string) => newMustHave.includes(s));
      const goodToHaveSame =
        oldGoodToHave.length === newGoodToHave.length &&
        oldGoodToHave.every((s: string) => newGoodToHave.includes(s));

      if (mustHaveSame && goodToHaveSame) {
        console.log(`SAME ${reqLabel}`);
        skipped++;
        continue;
      }

      console.log(`\nUPDATE ${reqLabel}`);
      console.log(`  must-have:    [${oldMustHave.join(', ')}] → [${newMustHave.join(', ')}]`);
      console.log(`  good-to-have: [${oldGoodToHave.join(', ')}] → [${newGoodToHave.join(', ')}]`);

      if (!dryRun) {
        // Merge new skill classification into existing parsed_criteria (preserve other fields)
        const updatedCriteria = {
          ...req.parsed_criteria,
          mustHaveSkills: newMustHave,
          goodToHaveSkills: newGoodToHave,
        };

        await docClient.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { requirement_id: req.requirement_id },
            UpdateExpression: 'SET parsed_criteria = :criteria, last_updated = :now',
            ExpressionAttributeValues: {
              ':criteria': updatedCriteria,
              ':now': new Date().toISOString(),
            },
            ConditionExpression: 'attribute_exists(requirement_id)',
          })
        );
        console.log(`  --> saved`);
      } else {
        console.log(`  --> dry run, not saved`);
      }

      updated++;
    } catch (err) {
      console.error(`ERROR ${reqLabel}: ${err instanceof Error ? err.message : err}`);
      errored++;
    }

    // Small delay to avoid LLM rate limits
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors:  ${errored}`);
  console.log(`  Total:   ${requirements.length}\n`);
}

reparseRequirements().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
