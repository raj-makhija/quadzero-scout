import { describe, it, expect, vi } from 'vitest';
import { extractFileNameFromKey, generateAttachmentUploadUrl } from '../s3.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://example.com/presigned'),
}));

// ---------------------------------------------------------------------------
// TC-UPLOAD-011, TC-DOWNLOAD-004: S3 Key & Filename Operations
// ---------------------------------------------------------------------------

describe('extractFileNameFromKey()', () => {
  // TC-DOWNLOAD-004
  it('extracts filename from S3 key with UUID prefix', () => {
    const result = extractFileNameFromKey(
      'resumes/2024/01/abc123de-f456-7890-abcd-ef1234567890-john_doe_resume.pdf'
    );
    expect(result).toBe('john_doe_resume.pdf');
  });

  it('extracts filename from key with simple UUID prefix', () => {
    const result = extractFileNameFromKey(
      'resumes/2024/01/a1b2c3d4-resume.pdf'
    );
    expect(result).toBe('resume.pdf');
  });

  it('returns full last segment when no UUID prefix match', () => {
    const result = extractFileNameFromKey('resumes/2024/01/resume.pdf');
    expect(result).toBe('resume.pdf');
  });

  it('handles deeply nested paths', () => {
    const result = extractFileNameFromKey(
      'a/b/c/d/e/abc123-filename.docx'
    );
    expect(result).toBe('filename.docx');
  });

  it('handles filename with multiple dots', () => {
    const result = extractFileNameFromKey(
      'resumes/2024/01/abc123-my.resume.v2.pdf'
    );
    expect(result).toBe('my.resume.v2.pdf');
  });

  it('handles filename with hyphens', () => {
    const result = extractFileNameFromKey(
      'resumes/2024/01/a1b2c3d4-my-resume-file.pdf'
    );
    expect(result).toBe('my-resume-file.pdf');
  });

  it('handles single-segment key (no slashes)', () => {
    const result = extractFileNameFromKey('abc123-resume.pdf');
    expect(result).toBe('resume.pdf');
  });
});

// ---------------------------------------------------------------------------
// Ticket #103: attachment upload URL must return a full UUID attachmentId.
// Regression: the handler previously derived attachmentId from
// `key.split('-')[0]`, yielding only the first UUID segment, which failed
// SaveAttachmentRequestSchema's `z.string().uuid()` validation. The save then
// 400'd and the upload was silently dropped, so documents never appeared.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('generateAttachmentUploadUrl()', () => {
  const candidateId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('returns a full UUID attachmentId (not a truncated segment)', async () => {
    const result = await generateAttachmentUploadUrl(
      candidateId,
      'salary-slip-march.pdf',
      'application/pdf'
    );
    expect(result.attachmentId).toMatch(UUID_RE);
  });

  it('embeds the attachmentId in the generated S3 key', async () => {
    const result = await generateAttachmentUploadUrl(
      candidateId,
      'appraisal.pdf',
      'application/pdf'
    );
    expect(result.key).toContain(`candidate-attachments/${candidateId}/${result.attachmentId}-`);
  });
});
