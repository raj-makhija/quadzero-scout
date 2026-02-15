import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { validate, formatZodErrors, BulkImportResumeRequestSchema } from '../../lib/validation.js';
import { getBulkImportBatch, updateBulkImportFileStatus } from '../../lib/dynamodb.js';
import { invokeLambdaAsync } from '../../lib/lambdaInvoke.js';
import { config } from '../../lib/config.js';

const STALL_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

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

    const validation = validate(BulkImportResumeRequestSchema, body);
    if (!validation.success) {
      return error(ErrorCodes.VALIDATION_ERROR, formatZodErrors(validation.errors), 400);
    }

    const { batchId } = validation.data;

    const batch = await getBulkImportBatch(batchId);
    if (!batch) {
      return error(ErrorCodes.NOT_FOUND, 'Batch not found', 404);
    }

    if (batch.status === 'completed') {
      return success({ batchId, resumed: false, message: 'Batch already completed' });
    }

    const hasPendingFiles = batch.files.some(f => f.status === 'pending' || f.status === 'processing');
    if (!hasPendingFiles) {
      return success({ batchId, resumed: false, message: 'No pending files remaining' });
    }

    const lastUpdate = new Date(batch.updated_at).getTime();
    const isStalled = Date.now() - lastUpdate > STALL_THRESHOLD_MS;

    if (!isStalled) {
      return success({ batchId, resumed: false, message: 'Batch is still actively processing' });
    }

    // Reset any 'processing' files back to 'pending'
    for (let i = 0; i < batch.files.length; i++) {
      if (batch.files[i].status === 'processing') {
        await updateBulkImportFileStatus(batchId, i, 'pending');
      }
    }

    // Re-invoke the worker
    if (config.lambda.bulkImportWorkerName) {
      await invokeLambdaAsync(config.lambda.bulkImportWorkerName, { batchId });
      console.log('Resumed bulk import worker for batch:', batchId);
    }

    return success({ batchId, resumed: true });
  } catch (err) {
    console.error('Error resuming bulk import:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to resume bulk import', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
