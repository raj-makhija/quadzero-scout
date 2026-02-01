import { describe, it, expect } from 'vitest';
import { extractFileNameFromKey } from '../s3.js';

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
