/**
 * One-time migration: strip country from location values stored as "City, Country".
 *
 * TalentProfiles.location        "Chennai, India"   → "Chennai"
 * Requirements.parsed_criteria.location  "New York, USA"    → "New York"
 *
 * Records already stored as city-only are skipped (no write issued).
 * Three-part values ("City, State, Country") → "City" only (first segment).
 * Null, missing, empty, or whitespace-only location fields are skipped.
 * Values without a comma (e.g. "Mumbai", "Remote") are left unchanged.
 *
 * Usage:
 *   npx tsx scripts/migrateLocationCityOnly.ts          # dry run (default)
 *   npx tsx scripts/migrateLocationCityOnly.ts --apply  # write to DB
 *
 * Env vars:
 *   AWS_REGION                      (default: ap-south-1)
 *   DYNAMODB_TABLE_TALENT_PROFILES  (default: TalentProfiles-prod)
 *   DYNAMODB_TABLE_REQUIREMENTS     (default: Requirements-prod)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION || 'ap-south-1';
const talentTable = process.env.DYNAMODB_TABLE_TALENT_PROFILES || 'TalentProfiles-prod';
const requirementsTable = process.env.DYNAMODB_TABLE_REQUIREMENTS || 'Requirements-prod';
const APPLY = process.argv.includes('--apply');
const BATCH_CONCURRENCY = 10;

const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

/**
 * Returns the city-only string if normalization is needed, or null if the
 * value should be left unchanged (no comma, null/empty/whitespace).
 */
function normalizeLocation(location: unknown): string | null {
  if (typeof location !== 'string') return null;
  const trimmed = location.trim();
  if (!trimmed) return null;
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx === -1) return null;
  return trimmed.slice(0, commaIdx).trim();
}

async function migrateTalentProfiles(): Promise<{ scanned: number; updated: number; skipped: number }> {
  let lastKey: Record<string, unknown> | undefined;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: talentTable,
        ProjectionExpression: 'candidate_id, #loc',
        ExpressionAttributeNames: { '#loc': 'location' },
        Limit: 200,
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      })
    );

    const items = (result.Items || []) as Array<{ candidate_id: string; location?: unknown }>;
    scanned += items.length;

    const targets: Array<{ candidate_id: string; city: string }> = [];
    for (const item of items) {
      const city = normalizeLocation(item.location);
      if (city === null) {
        skipped++;
      } else {
        targets.push({ candidate_id: item.candidate_id, city });
      }
    }

    if (targets.length > 0) {
      if (APPLY) {
        for (let i = 0; i < targets.length; i += BATCH_CONCURRENCY) {
          const batch = targets.slice(i, i + BATCH_CONCURRENCY);
          await Promise.all(
            batch.map(({ candidate_id, city }) =>
              docClient.send(
                new UpdateCommand({
                  TableName: talentTable,
                  Key: { candidate_id },
                  UpdateExpression: 'SET #loc = :city',
                  ExpressionAttributeNames: { '#loc': 'location' },
                  ExpressionAttributeValues: { ':city': city },
                })
              )
            )
          );
        }
      }
      updated += targets.length;
    }

    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    console.log(`[TalentProfiles] scanned=${scanned} updated=${updated} skipped=${skipped}`);
  } while (lastKey);

  return { scanned, updated, skipped };
}

async function migrateRequirements(): Promise<{ scanned: number; updated: number; skipped: number }> {
  let lastKey: Record<string, unknown> | undefined;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: requirementsTable,
        ProjectionExpression: 'requirement_id, parsed_criteria',
        Limit: 200,
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      })
    );

    const items = (result.Items || []) as Array<{
      requirement_id: string;
      parsed_criteria?: Record<string, unknown>;
    }>;
    scanned += items.length;

    const targets: Array<{ requirement_id: string; city: string }> = [];
    for (const item of items) {
      const criteria = item.parsed_criteria;
      if (!criteria) {
        skipped++;
        continue;
      }
      const city = normalizeLocation(criteria.location);
      if (city === null) {
        skipped++;
      } else {
        targets.push({ requirement_id: item.requirement_id, city });
      }
    }

    if (targets.length > 0) {
      if (APPLY) {
        for (let i = 0; i < targets.length; i += BATCH_CONCURRENCY) {
          const batch = targets.slice(i, i + BATCH_CONCURRENCY);
          await Promise.all(
            batch.map(({ requirement_id, city }) =>
              docClient.send(
                new UpdateCommand({
                  TableName: requirementsTable,
                  Key: { requirement_id },
                  UpdateExpression: 'SET parsed_criteria.#loc = :city',
                  ExpressionAttributeNames: { '#loc': 'location' },
                  ExpressionAttributeValues: { ':city': city },
                })
              )
            )
          );
        }
      }
      updated += targets.length;
    }

    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    console.log(`[Requirements] scanned=${scanned} updated=${updated} skipped=${skipped}`);
  } while (lastKey);

  return { scanned, updated, skipped };
}

async function run() {
  console.log(`TalentProfiles table:  ${talentTable}`);
  console.log(`Requirements table:    ${requirementsTable}`);
  console.log(`Region:                ${region}`);
  console.log(`Mode:                  ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`);
  console.log('');

  const tp = await migrateTalentProfiles();
  console.log('');
  const req = await migrateRequirements();

  console.log('');
  console.log('---');
  console.log(`DONE (${APPLY ? 'APPLIED' : 'DRY RUN'})`);
  console.log('');
  console.log('TalentProfiles:');
  console.log(`  scanned: ${tp.scanned}`);
  console.log(`  updated: ${tp.updated}`);
  console.log(`  skipped: ${tp.skipped}`);
  console.log('');
  console.log('Requirements:');
  console.log(`  scanned: ${req.scanned}`);
  console.log(`  updated: ${req.updated}`);
  console.log(`  skipped: ${req.skipped}`);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
