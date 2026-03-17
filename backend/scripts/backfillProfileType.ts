/**
 * Backfill script to add _type = "PROFILE" to existing TalentProfiles items.
 * This is required for the RecentProfilesIndex GSI to index existing records.
 *
 * Run with: npx ts-node scripts/backfillProfileType.ts
 *
 * Environment variables:
 * - AWS_REGION (default: ap-south-1)
 * - DYNAMODB_TABLE_TALENT_PROFILES (default: TalentProfiles-dev)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION || 'ap-south-1';
const tableName = process.env.DYNAMODB_TABLE_TALENT_PROFILES || 'TalentProfiles-dev';

const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

const BATCH_SIZE = 25;

async function backfillProfileType() {
  console.log(`Backfilling _type on table: ${tableName} in region: ${region}`);

  let lastKey: Record<string, unknown> | undefined;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'candidate_id, #type',
        ExpressionAttributeNames: { '#type': '_type' },
        Limit: 100,
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      })
    );

    const items = (result.Items || []) as Array<{ candidate_id: string; _type?: string }>;
    scanned += items.length;

    const needsUpdate = items.filter((item) => item._type !== 'PROFILE');
    skipped += items.length - needsUpdate.length;

    // Process in batches of BATCH_SIZE concurrently
    for (let i = 0; i < needsUpdate.length; i += BATCH_SIZE) {
      const batch = needsUpdate.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((item) =>
          docClient.send(
            new UpdateCommand({
              TableName: tableName,
              Key: { candidate_id: item.candidate_id },
              UpdateExpression: 'SET #type = :type',
              ExpressionAttributeNames: { '#type': '_type' },
              ExpressionAttributeValues: { ':type': 'PROFILE' },
              ConditionExpression: 'attribute_exists(candidate_id)',
            })
          )
        )
      );
      updated += batch.length;
    }

    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    console.log(`Progress: scanned=${scanned}, updated=${updated}, skipped=${skipped}`);
  } while (lastKey);

  console.log(`Done. Total scanned=${scanned}, updated=${updated}, skipped=${skipped}`);
}

backfillProfileType().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
