import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSaveAttachment = vi.fn().mockResolvedValue(undefined);
const mockListAttachments = vi.fn().mockResolvedValue([]);
const mockSafeResolveMandatoryDocsTasks = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../lib/dynamodb.js', () => ({
  saveAttachment: (...args: unknown[]) => mockSaveAttachment(...args),
  listAttachments: (...args: unknown[]) => mockListAttachments(...args),
}));

vi.mock('../../../lib/recruiterTasks.js', () => ({
  safeResolveMandatoryDocsTasks: (...args: unknown[]) => mockSafeResolveMandatoryDocsTasks(...args),
}));

vi.mock('../../../lib/auth.js', () => ({
  withAuth: (_roles: string[], handler: Function) => handler,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAttachment(tag: string) {
  return {
    candidate_id: 'cand_1',
    attachment_id: '11111111-1111-1111-1111-111111111111',
    s3_key: 'attachments/cand_1/file',
    filename: 'doc.pdf',
    content_type: 'application/pdf',
    file_size: 1234,
    tag,
    uploaded_by: 'rec-1',
    uploaded_by_email: 'rec@quadzero.com',
    uploaded_at: '2026-06-01T00:00:00.000Z',
  };
}

function makeEvent(tag: string): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify({
      candidateId: 'cand_1',
      attachmentId: '11111111-1111-1111-1111-111111111111',
      s3Key: 'attachments/cand_1/file',
      fileName: 'doc.pdf',
      contentType: 'application/pdf',
      fileSize: 1234,
      tag,
    }),
    headers: { authorization: 'Bearer test-token' },
    requestContext: {} as any,
    routeKey: '',
    rawPath: '',
    rawQueryString: '',
    isBase64Encoded: false,
    auth: { userId: 'rec-1', email: 'rec@quadzero.com', role: 'recruiter', isInternal: true },
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('saveAttachment handler — mandatory-docs task auto-resolution', () => {
  let handler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSaveAttachment.mockResolvedValue(undefined);
    mockListAttachments.mockResolvedValue([]);
    mockSafeResolveMandatoryDocsTasks.mockResolvedValue(undefined);
    const mod = await import('../saveAttachment.js');
    handler = mod.handler;
  });

  // AC1 — both docs present after upload → resolve
  it('resolves the task when PAN is uploaded last and Aadhaar already present', async () => {
    mockListAttachments.mockResolvedValue([makeAttachment('Aadhaar'), makeAttachment('PAN')]);
    const res = (await handler(makeEvent('PAN'))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toMatchObject({ saved: true });
    expect(mockSafeResolveMandatoryDocsTasks).toHaveBeenCalledWith({
      candidateId: 'cand_1',
      completedBy: 'rec-1',
    });
  });

  it('resolves the task when Aadhaar is uploaded last and PAN already present', async () => {
    mockListAttachments.mockResolvedValue([makeAttachment('PAN'), makeAttachment('Aadhaar')]);
    const res = (await handler(makeEvent('Aadhaar'))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    expect(mockSafeResolveMandatoryDocsTasks).toHaveBeenCalledTimes(1);
  });

  // AC2 — one doc still missing → task stays active
  it('does not resolve when only PAN is present after upload', async () => {
    mockListAttachments.mockResolvedValue([makeAttachment('PAN')]);
    const res = (await handler(makeEvent('PAN'))) as { statusCode: number };
    expect(res.statusCode).toBe(200);
    expect(mockSafeResolveMandatoryDocsTasks).not.toHaveBeenCalled();
  });

  it('does not resolve when two PANs are present but Aadhaar is still missing', async () => {
    mockListAttachments.mockResolvedValue([makeAttachment('PAN'), makeAttachment('PAN')]);
    const res = (await handler(makeEvent('PAN'))) as { statusCode: number };
    expect(res.statusCode).toBe(200);
    expect(mockSafeResolveMandatoryDocsTasks).not.toHaveBeenCalled();
  });

  // AC3 — non-mandatory tag → never check or resolve
  it('does not list attachments or resolve for a non-mandatory tag even if both docs exist', async () => {
    mockListAttachments.mockResolvedValue([makeAttachment('PAN'), makeAttachment('Aadhaar')]);
    const res = (await handler(makeEvent('offer_letter'))) as { statusCode: number };
    expect(res.statusCode).toBe(200);
    expect(mockListAttachments).not.toHaveBeenCalled();
    expect(mockSafeResolveMandatoryDocsTasks).not.toHaveBeenCalled();
  });

  it('does not list attachments or resolve for an untagged (empty) upload', async () => {
    const res = (await handler(makeEvent(''))) as { statusCode: number };
    expect(res.statusCode).toBe(200);
    expect(mockListAttachments).not.toHaveBeenCalled();
    expect(mockSafeResolveMandatoryDocsTasks).not.toHaveBeenCalled();
  });

  // AC5 — no active task / resolve is a no-op → still 200
  it('returns 200 when both docs present and resolution finds no task to complete', async () => {
    mockListAttachments.mockResolvedValue([makeAttachment('PAN'), makeAttachment('Aadhaar')]);
    mockSafeResolveMandatoryDocsTasks.mockResolvedValue(undefined);
    const res = (await handler(makeEvent('PAN'))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toMatchObject({ saved: true });
  });

  // AC6 — resolve call throws → attachment still saved, 200 returned
  it('still saves the attachment and returns 200 when task resolution throws', async () => {
    mockListAttachments.mockResolvedValue([makeAttachment('PAN'), makeAttachment('Aadhaar')]);
    mockSafeResolveMandatoryDocsTasks.mockRejectedValue(new Error('resolve fail'));
    const res = (await handler(makeEvent('PAN'))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toMatchObject({ saved: true });
    expect(mockSaveAttachment).toHaveBeenCalledTimes(1);
  });

  // Resilience — listAttachments throwing must not break the save either
  it('still returns 200 when the post-save mandatory-doc check (listAttachments) throws', async () => {
    mockListAttachments.mockRejectedValue(new Error('list fail'));
    const res = (await handler(makeEvent('PAN'))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toMatchObject({ saved: true });
    expect(mockSafeResolveMandatoryDocsTasks).not.toHaveBeenCalled();
  });

  // Save failure path is unchanged — 500 and no resolution attempt.
  it('returns 500 and does not attempt resolution when saveAttachment fails', async () => {
    mockSaveAttachment.mockRejectedValue(new Error('dynamo down'));
    const res = (await handler(makeEvent('PAN'))) as { statusCode: number };
    expect(res.statusCode).toBe(500);
    expect(mockListAttachments).not.toHaveBeenCalled();
    expect(mockSafeResolveMandatoryDocsTasks).not.toHaveBeenCalled();
  });
});
