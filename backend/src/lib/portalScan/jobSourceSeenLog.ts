import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../config.js';

const client = new DynamoDBClient({ region: config.region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export interface SeenLogEntry {
  source_id: string;
  external_job_id: string;
  first_seen_at: string;
  ttl: number;
}

export async function getSeenLogEntry(
  sourceId: string,
  externalJobId: string
): Promise<SeenLogEntry | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: config.dynamodb.jobSourceSeenLogTable,
      Key: { source_id: sourceId, external_job_id: externalJobId },
    })
  );
  return (result.Item as SeenLogEntry) || null;
}

/**
 * Write a new seen-log entry. Uses a conditional put so concurrent Lambda
 * invocations writing the same key don't crash — the second write simply
 * throws ConditionalCheckFailedException, which the caller handles.
 */
export async function putSeenLogEntry(
  sourceId: string,
  externalJobId: string,
  ttl: number
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: config.dynamodb.jobSourceSeenLogTable,
      Item: {
        source_id: sourceId,
        external_job_id: externalJobId,
        first_seen_at: new Date().toISOString(),
        ttl,
      },
      ConditionExpression: 'attribute_not_exists(source_id)',
    })
  );
}
