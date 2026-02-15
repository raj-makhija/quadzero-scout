import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { validate, formatZodErrors, BulkImportStartRequestSchema } from '../../lib/validation.js';
import { createBulkImportBatch } from '../../lib/dynamodb.js';
import { invokeLambdaAsync } from '../../lib/lambdaInvoke.js';
import { config } from '../../lib/config.js';
import type { BulkImportBatchItem } from '../../types/index.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    if (!event.body) {
      return error(ErrorCodes.VALIDATION_ERROR, 'Request body required', 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      return error(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON', 400);
    }

    const validation = validate(BulkImportStartRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { files } = validation.data;
    const batchId = `batch_${uuidv4()}`;
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

    const batch: BulkImportBatchItem = {
      batch_id: batchId,
      status: 'processing',
      created_by: event.auth.userId,
      created_at: now,
      updated_at: now,
      total_files: files.length,
      completed_count: 0,
      failed_count: 0,
      files: files.map(f => ({
        s3_key: f.s3Key,
        file_name: f.fileName,
        status: 'pending' as const,
      })),
      ttl,
    };

    await createBulkImportBatch(batch);

    // Invoke the worker Lambda asynchronously
    if (config.lambda.bulkImportWorkerName) {
      await invokeLambdaAsync(config.lambda.bulkImportWorkerName, { batchId });
      console.log('Triggered bulk import worker for batch:', batchId);
    } else {
      console.warn('BULK_IMPORT_WORKER_NAME not configured, batch created but worker not invoked');
    }

    return success({ batchId });
  } catch (err) {
    console.error('Error starting bulk import:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to start bulk import', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
