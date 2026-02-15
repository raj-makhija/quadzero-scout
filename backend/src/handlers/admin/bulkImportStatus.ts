import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { getBulkImportBatch } from '../../lib/dynamodb.js';

async function handleRequest(event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const batchId = event.pathParameters?.batchId;
    if (!batchId) {
      return error(ErrorCodes.VALIDATION_ERROR, 'batchId is required', 400);
    }

    const batch = await getBulkImportBatch(batchId);
    if (!batch) {
      return error(ErrorCodes.NOT_FOUND, 'Batch not found', 404);
    }

    return success({
      batchId: batch.batch_id,
      status: batch.status,
      totalFiles: batch.total_files,
      completedCount: batch.completed_count,
      failedCount: batch.failed_count,
      createdAt: batch.created_at,
      updatedAt: batch.updated_at,
      files: batch.files.map(f => ({
        fileName: f.file_name,
        status: f.status,
        candidateId: f.candidate_id,
        candidateName: f.candidate_name,
        confidence: f.confidence,
        isUpdate: f.is_update,
        error: f.error,
        processedAt: f.processed_at,
      })),
    });
  } catch (err) {
    console.error('Error fetching bulk import status:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch bulk import status', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
