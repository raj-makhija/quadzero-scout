/**
 * DynamoDB operations for the EmailIngestLog table.
 * Provides idempotency — prevents duplicate processing of the same email.
 * Keyed by RFC 822 internet_message_id (globally unique per email).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { config } from './config.js';

const client = new DynamoDBClient({ region: config.region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export interface EmailIngestLogEntry {
  internet_message_id: string; // PK
  graph_message_id: string;
  from_address: string;
  subject: string;
  received_at: string; // ISO 8601
  processed_at: string; // ISO 8601
  status: 'processing' | 'completed' | 'failed';
  candidate_ids: string[];
  attachment_count: number;
  error_message?: string;
  sub_vendor_id?: string;
  sub_vendor_match_method?: string; // 'exact_email' | 'domain' | 'none'
  requirement_id?: string;
  ttl: number; // Unix timestamp — auto-expire after 90 days
}

/**
 * Sub-vendor / requirement attribution recorded on the log entry after resolution.
 */
export interface IngestLogAttribution {
  subVendorId?: string;
  subVendorMatchMethod?: string;
  requirementId?: string;
}

/**
 * Check if an email has already been processed (or is currently being processed).
 */
export async function getIngestLogEntry(
  internetMessageId: string
): Promise<EmailIngestLogEntry | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: config.dynamodb.emailIngestLogTable,
      Key: { internet_message_id: internetMessageId },
    })
  );
  return (result.Item as EmailIngestLogEntry) || null;
}

/**
 * Write an initial idempotency record when starting to process an email.
 * Uses a conditional write to prevent race conditions between concurrent Lambda invocations.
 */
export async function putIngestLogEntry(entry: EmailIngestLogEntry): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: config.dynamodb.emailIngestLogTable,
      Item: entry,
      ConditionExpression: 'attribute_not_exists(internet_message_id)',
    })
  );
}

/**
 * Update the status of an existing idempotency record after processing completes or fails.
 */
export async function updateIngestLogStatus(
  internetMessageId: string,
  status: 'completed' | 'failed',
  candidateIds?: string[],
  errorMessage?: string,
  attribution?: IngestLogAttribution
): Promise<void> {
  const updateParts: string[] = [
    '#s = :status',
    'processed_at = :processedAt',
  ];
  const attrNames: Record<string, string> = { '#s': 'status' };
  const attrValues: Record<string, unknown> = {
    ':status': status,
    ':processedAt': new Date().toISOString(),
  };

  if (candidateIds) {
    updateParts.push('candidate_ids = :candidateIds');
    attrValues[':candidateIds'] = candidateIds;
  }

  if (errorMessage) {
    updateParts.push('error_message = :errorMessage');
    attrValues[':errorMessage'] = errorMessage;
  }

  if (attribution) {
    if (attribution.subVendorMatchMethod !== undefined) {
      updateParts.push('sub_vendor_match_method = :svmm');
      attrValues[':svmm'] = attribution.subVendorMatchMethod;
    }
    if (attribution.subVendorId !== undefined) {
      updateParts.push('sub_vendor_id = :svid');
      attrValues[':svid'] = attribution.subVendorId;
    }
    if (attribution.requirementId !== undefined) {
      updateParts.push('requirement_id = :rid');
      attrValues[':rid'] = attribution.requirementId;
    }
  }

  await docClient.send(
    new UpdateCommand({
      TableName: config.dynamodb.emailIngestLogTable,
      Key: { internet_message_id: internetMessageId },
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeNames: attrNames,
      ExpressionAttributeValues: attrValues,
    })
  );
}
