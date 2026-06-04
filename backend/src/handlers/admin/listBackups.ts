import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, ErrorCodes } from '../../lib/response.js';
import { withAuth, type AuthenticatedEvent } from '../../lib/auth.js';
import { listSnapshots } from '../../lib/backup.js';

async function handleRequest(_event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> {
  try {
    const snapshots = await listSnapshots();
    return success({
      snapshots: snapshots.map(s => ({
        snapshotId: s.snapshotId,
        status: s.status,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        tableCount: s.tables.length,
        itemCount: s.tables.reduce((sum, t) => sum + t.itemCount, 0),
        s3ObjectCount: s.s3ObjectCount,
      })),
    });
  } catch (err) {
    console.error('Error listing backups:', err);
    return error(ErrorCodes.INTERNAL_ERROR, 'Failed to list backups', 500);
  }
}

export const handler = withAuth(['admin'], handleRequest);
