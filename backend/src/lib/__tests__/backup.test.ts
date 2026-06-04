import { describe, it, expect } from 'vitest';
import {
  listBackupTables,
  buildSnapshotId,
  chunk,
  manifestKey,
  tableBackupKey,
  s3BackupKey,
  originalKeyFromBackup,
  BACKUP_S3_PREFIXES,
} from '../backup.js';

describe('listBackupTables', () => {
  it('captures every configured DynamoDB table with no duplicates', () => {
    const tables = listBackupTables();
    expect(tables.length).toBeGreaterThan(0);
    expect(new Set(tables).size).toBe(tables.length);
  });
});

describe('buildSnapshotId', () => {
  it('produces an S3-safe id (no colons or dots) from the run timestamp', () => {
    const id = buildSnapshotId(new Date('2026-06-04T20:30:00.000Z'));
    expect(id).toBe('2026-06-04T20-30-00-000Z');
    expect(id).not.toMatch(/[:.]/);
  });
});

describe('chunk', () => {
  it('splits into groups of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns an empty array for empty input', () => {
    expect(chunk([], 25)).toEqual([]);
  });
});

describe('snapshot key helpers', () => {
  const snapshotId = '2026-06-04T20-30-00-000Z';

  it('builds nested keys under the snapshot prefix', () => {
    expect(manifestKey(snapshotId)).toBe(`snapshots/${snapshotId}/manifest.json`);
    expect(tableBackupKey(snapshotId, 'Users-prod')).toBe(
      `snapshots/${snapshotId}/dynamodb/Users-prod.json`
    );
    expect(s3BackupKey(snapshotId, 'resumes/2026/05/abc.pdf')).toBe(
      `snapshots/${snapshotId}/s3/resumes/2026/05/abc.pdf`
    );
  });

  it('round-trips an S3 object key through backup and restore', () => {
    const original = 'formatted-resumes/2026/05/abc-def.pdf';
    const backupKey = s3BackupKey(snapshotId, original);
    expect(originalKeyFromBackup(snapshotId, backupKey)).toBe(original);
  });
});

describe('BACKUP_S3_PREFIXES', () => {
  it('covers the resume data prefixes from the acceptance criteria', () => {
    expect(BACKUP_S3_PREFIXES).toContain('resumes/');
    expect(BACKUP_S3_PREFIXES).toContain('formatted-resumes/');
    expect(BACKUP_S3_PREFIXES).toContain('email-resumes/');
  });
});
