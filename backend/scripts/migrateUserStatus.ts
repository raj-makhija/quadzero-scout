/**
 * Migration script to add status field to existing users
 * Run with: npx ts-node scripts/migrateUserStatus.ts
 *
 * Environment variables required:
 * - AWS_REGION (default: ap-south-1)
 * - DYNAMODB_TABLE_USERS (default: Users-dev)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION || 'ap-south-1';
const tableName = process.env.DYNAMODB_TABLE_USERS || 'Users-dev';

const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

interface UserItem {
  id: string;
  email: string;
  role: string;
  status?: string;
}

async function migrateUserStatus() {
  console.log(`Migrating users in table: ${tableName} in region: ${region}`);

  // Scan all users
  const result = await docClient.send(
    new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'id, email, #role, #status',
      ExpressionAttributeNames: {
        '#role': 'role',
        '#status': 'status',
      },
    })
  );

  const users = (result.Items || []) as UserItem[];
  console.log(`Found ${users.length} users to check`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const user of users) {
    if (user.status !== undefined) {
      console.log(`  - ${user.email}: already has status "${user.status}", skipping`);
      skippedCount++;
      continue;
    }

    // All existing users are assumed approved (backward compatibility)
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: user.id },
        UpdateExpression: 'SET #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'approved' },
      })
    );

    console.log(`  ✓ ${user.email}: migrated to "approved"`);
    migratedCount++;
  }

  console.log(`\nMigration complete!`);
  console.log(`  Migrated: ${migratedCount}`);
  console.log(`  Skipped: ${skippedCount}`);
}

migrateUserStatus().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
