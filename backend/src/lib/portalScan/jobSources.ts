import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../config.js';
import type { JobSource } from './adapters/index.js';

const client = new DynamoDBClient({ region: config.region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export async function getEnabledSources(): Promise<JobSource[]> {
  const sources: JobSource[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: config.dynamodb.jobSourcesTable,
        FilterExpression: 'enabled = :true',
        ExpressionAttributeValues: { ':true': true },
        ExclusiveStartKey: lastKey,
      })
    );
    sources.push(...((result.Items as JobSource[]) || []));
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return sources;
}
