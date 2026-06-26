/**
 * One-time backfill: generate vendor_jd for all active requirements that lack it.
 * Run with:
 *   DYNAMODB_TABLE_REQUIREMENTS=Requirements-<stage> \
 *   DYNAMODB_TABLE_PROMPTS=Prompts-<stage> \
 *   LLM_PROVIDER=claude \
 *   ANTHROPIC_API_KEY=... \
 *   npx tsx scripts/backfillVendorJd.ts
 *
 * Idempotent: skips requirements that already have a vendor_jd field.
 * Continues on per-requirement LLM failures (logs and moves on).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { generateVendorJd } from '../src/lib/llm/index.js';
import type { RequirementItem } from '../src/types/index.js';

const region = process.env.AWS_REGION || 'ap-south-1';
const requirementsTable = process.env.DYNAMODB_TABLE_REQUIREMENTS || 'Requirements-dev';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});

async function scanActiveRequirementsWithoutVendorJd(): Promise<RequirementItem[]> {
  const items: RequirementItem[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: requirementsTable,
        FilterExpression: '#s = :active AND attribute_not_exists(vendor_jd)',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':active': 'active' },
        ExclusiveStartKey: lastKey,
      })
    );
    items.push(...((result.Items || []) as RequirementItem[]));
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return items;
}

async function patchVendorJd(requirementId: string, vendorJd: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: requirementsTable,
      Key: { requirement_id: requirementId },
      UpdateExpression: 'SET vendor_jd = :v',
      ExpressionAttributeValues: { ':v': vendorJd },
      ConditionExpression: 'attribute_exists(requirement_id)',
    })
  );
}

async function backfill(): Promise<void> {
  console.log(`Scanning ${requirementsTable} for active requirements without vendor_jd…`);
  const requirements = await scanActiveRequirementsWithoutVendorJd();
  console.log(`Found ${requirements.length} requirement(s) to backfill.`);

  let succeeded = 0;
  let failed = 0;

  for (const req of requirements) {
    try {
      const vendorJd = await generateVendorJd(req.jd_text, req.client_name, req.end_client);
      await patchVendorJd(req.requirement_id, vendorJd);
      console.log(`  ✓ ${req.requirement_id} (${req.job_title || 'untitled'})`);
      succeeded++;
    } catch (err) {
      console.error(`  ✗ ${req.requirement_id}: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\nBackfill complete: ${succeeded} succeeded, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

const isMain = process.argv[1]?.includes('backfillVendorJd');
if (isMain) {
  backfill().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
