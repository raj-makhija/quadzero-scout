import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../config.js', () => ({
  config: {
    region: 'ap-south-1',
    graph: {
      tenantId: 'test-tenant',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      mailboxAddress: 'scout-ingest@test.com',
      enabled: true,
    },
    s3: { resumesBucket: 'test-bucket' },
    lambda: { formatResumeWorkerName: 'test-formatWorker' },
    email: { senderEmail: 'notify@test.com', ingestNotifyAddress: 'admin@test.com' },
    dynamodb: { emailIngestLogTable: 'EmailIngestLog-test', talentProfilesTable: 'TalentProfiles-test' },
  },
}));

const mockGetUnreadMessages = vi.fn();
const mockGetResumeAttachments = vi.fn();
const mockMarkMessageAsRead = vi.fn();
const mockMoveMessageToFolder = vi.fn();
const mockGetMailFolderByName = vi.fn();
const mockInvalidateTokenCache = vi.fn();

vi.mock('../graphClient.js', () => ({
  getUnreadMessages: (...args: unknown[]) => mockGetUnreadMessages(...args),
  getResumeAttachments: (...args: unknown[]) => mockGetResumeAttachments(...args),
  markMessageAsRead: (...args: unknown[]) => mockMarkMessageAsRead(...args),
  moveMessageToFolder: (...args: unknown[]) => mockMoveMessageToFolder(...args),
  getMailFolderByName: (...args: unknown[]) => mockGetMailFolderByName(...args),
  invalidateTokenCache: (...args: unknown[]) => mockInvalidateTokenCache(...args),
}));

const mockGetIngestLogEntry = vi.fn();
const mockPutIngestLogEntry = vi.fn();
const mockUpdateIngestLogStatus = vi.fn();

vi.mock('../emailIngestLog.js', () => ({
  getIngestLogEntry: (...args: unknown[]) => mockGetIngestLogEntry(...args),
  putIngestLogEntry: (...args: unknown[]) => mockPutIngestLogEntry(...args),
  updateIngestLogStatus: (...args: unknown[]) => mockUpdateIngestLogStatus(...args),
}));

const mockSendIngestDigestEmail = vi.fn();
vi.mock('../emailIngestNotifier.js', () => ({
  sendIngestDigestEmail: (...args: unknown[]) => mockSendIngestDigestEmail(...args),
}));

const mockPutObject = vi.fn();
const mockDeleteObject = vi.fn();
vi.mock('../s3.js', () => ({
  putObject: (...args: unknown[]) => mockPutObject(...args),
  deleteObject: (...args: unknown[]) => mockDeleteObject(...args),
}));

const mockExtractTextFromResume = vi.fn();
vi.mock('../textract.js', () => ({
  extractTextFromResume: (...args: unknown[]) => mockExtractTextFromResume(...args),
}));

const mockParseResume = vi.fn();
vi.mock('../llm/index.js', () => ({
  parseResume: (...args: unknown[]) => mockParseResume(...args),
}));

vi.mock('../skillNormalizer.js', () => ({
  normalizeSkills: (skills: string[]) => skills.map((s) => s.toLowerCase()),
  normalizeSkillYears: (years: Record<string, number>) => years,
}));

const mockGetCandidateByEmail = vi.fn();
const mockSaveCandidateProfile = vi.fn();
const mockGetRequirementById = vi.fn();
const mockSaveSubVendor = vi.fn();
vi.mock('../dynamodb.js', () => ({
  getLlmRerank: vi.fn().mockResolvedValue(null),
  putLlmRerank: vi.fn().mockResolvedValue(undefined),
  deleteLlmRerank: vi.fn().mockResolvedValue(undefined),
  getCandidateByEmail: (...args: unknown[]) => mockGetCandidateByEmail(...args),
  saveCandidateProfile: (...args: unknown[]) => mockSaveCandidateProfile(...args),
  getExperienceBucket: (years: number) => (years <= 5 ? '3-5' : '6-10'),
  getRequirementById: (...args: unknown[]) => mockGetRequirementById(...args),
  saveSubVendor: (...args: unknown[]) => mockSaveSubVendor(...args),
  saveLinkedInToken: vi.fn().mockResolvedValue(undefined),
  getLinkedInToken: vi.fn().mockResolvedValue(null),
  savePendingLinkedInState: vi.fn().mockResolvedValue(undefined),
  markLinkedInTokenExpired: vi.fn().mockResolvedValue(undefined),
  writeLinkedInPost: vi.fn().mockResolvedValue(undefined),
}));

const mockResolveSubVendor = vi.fn();
vi.mock('../subVendorResolver.js', () => ({
  resolveSubVendor: (...args: unknown[]) => mockResolveSubVendor(...args),
}));

const mockInvokeLambdaAsync = vi.fn();
vi.mock('../lambdaInvoke.js', () => ({
  invokeLambdaAsync: (...args: unknown[]) => mockInvokeLambdaAsync(...args),
}));

const mockNotifyMatchingRecruiters = vi.fn();
vi.mock('../notificationService.js', () => ({
  notifyMatchingRecruiters: (...args: unknown[]) => mockNotifyMatchingRecruiters(...args),
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { handler } from '../../handlers/worker/emailIngestWorker.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'graph-msg-1',
    subject: 'Resume for review',
    from: { emailAddress: { name: 'John Doe', address: 'john@recruiter.com' } },
    receivedDateTime: '2026-03-10T10:00:00Z',
    hasAttachments: true,
    internetMessageId: '<unique-msg-id@recruiter.com>',
    body: { contentType: 'text', content: 'Please review the attached resume. CTC: 12 LPA, Expected: 15 LPA, Notice: 30 days.' },
    attachments: [
      {
        id: 'att-1',
        name: 'resume.pdf',
        contentType: 'application/pdf',
        contentBytes: Buffer.from('fake-pdf-content').toString('base64'),
        size: 1024,
      },
    ],
    ...overrides,
  };
}

function setupSuccessfulProcessing() {
  mockExtractTextFromResume.mockResolvedValue({
    text: 'A'.repeat(100),
    confidence: 0.9,
  });
  mockParseResume.mockResolvedValue({
    output: {
      fullName: 'Jane Smith',
      email: 'jane@candidate.com',
      phone: '+91-9999999999',
      primarySkills: ['React', 'TypeScript'],
      primarySkillYears: { react: 3, typescript: 2 },
      secondarySkills: ['Node.js'],
      totalExperience: 5,
      seniority: 'mid',
      availability: 'immediate',
      engagementModel: 'full_time',
      industries: ['IT'],
      roles: ['Frontend Developer'],
      education: [{ degree: 'B.Tech', institution: 'IIT', year: 2020 }],
      certifications: [],
      summary: 'Experienced frontend developer',
    },
    confidence: 0.85,
  });
  mockGetCandidateByEmail.mockResolvedValue(null);
  mockSaveCandidateProfile.mockResolvedValue(undefined);
  mockInvokeLambdaAsync.mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('emailIngestWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMailFolderByName.mockResolvedValue('folder-processed-id');
    mockMarkMessageAsRead.mockResolvedValue(undefined);
    mockMoveMessageToFolder.mockResolvedValue(undefined);
    mockGetIngestLogEntry.mockResolvedValue(null);
    mockPutIngestLogEntry.mockResolvedValue(undefined);
    mockUpdateIngestLogStatus.mockResolvedValue(undefined);
    mockPutObject.mockResolvedValue(undefined);
    mockSendIngestDigestEmail.mockResolvedValue(undefined);
    mockNotifyMatchingRecruiters.mockResolvedValue(undefined);
    mockResolveSubVendor.mockResolvedValue({ method: 'none' });
    mockGetRequirementById.mockResolvedValue(null);
  });

  it('returns immediately when disabled', async () => {
    const { config } = await import('../config.js');
    const originalEnabled = config.graph.enabled;
    config.graph.enabled = false;

    await handler();

    expect(mockGetUnreadMessages).not.toHaveBeenCalled();
    config.graph.enabled = originalEnabled;
  });

  it('does nothing when inbox is empty', async () => {
    mockGetUnreadMessages.mockResolvedValue([]);

    await handler();

    expect(mockPutIngestLogEntry).not.toHaveBeenCalled();
    expect(mockSendIngestDigestEmail).not.toHaveBeenCalled();
  });

  it('processes a single email with a PDF attachment (happy path)', async () => {
    const message = makeMessage();
    mockGetUnreadMessages.mockResolvedValue([message]);
    mockGetResumeAttachments.mockResolvedValue(message.attachments);
    setupSuccessfulProcessing();

    await handler();

    // Uploaded to S3
    expect(mockPutObject).toHaveBeenCalledTimes(1);
    const [s3Key] = mockPutObject.mock.calls[0];
    expect(s3Key).toMatch(/^email-resumes\/\d{4}\/\d{2}\/.+-resume\.pdf$/);

    // Extracted and parsed with email body as supplementary text
    expect(mockExtractTextFromResume).toHaveBeenCalledTimes(1);
    expect(mockParseResume).toHaveBeenCalledTimes(1);
    expect(mockParseResume).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('CTC: 12 LPA')
    );

    // Saved candidate profile with cover_letter
    expect(mockSaveCandidateProfile).toHaveBeenCalledTimes(1);
    const savedProfile = mockSaveCandidateProfile.mock.calls[0][0];
    expect(savedProfile.user_id).toBe('email_ingest');
    expect(savedProfile.full_name).toBe('Jane Smith');
    expect(savedProfile.email).toBe('jane@candidate.com');
    expect(savedProfile.cover_letter).toContain('CTC: 12 LPA');

    // Triggered format worker
    expect(mockInvokeLambdaAsync).toHaveBeenCalledWith('test-formatWorker', expect.objectContaining({ candidateId: expect.any(String) }));

    // Idempotency log updated
    expect(mockPutIngestLogEntry).toHaveBeenCalledTimes(1);
    expect(mockUpdateIngestLogStatus).toHaveBeenCalledWith(
      '<unique-msg-id@recruiter.com>',
      'completed',
      expect.arrayContaining([expect.any(String)]),
      undefined,
      expect.objectContaining({ subVendorMatchMethod: 'none' })
    );

    // No SubVendors record is ever written from ingest — resolution is read-only
    expect(mockSaveSubVendor).not.toHaveBeenCalled();

    // Email marked as read and moved
    expect(mockMarkMessageAsRead).toHaveBeenCalledTimes(1);
    expect(mockMoveMessageToFolder).toHaveBeenCalledWith(expect.anything(), 'graph-msg-1', 'folder-processed-id');

    // Recruiter notifications sent
    expect(mockNotifyMatchingRecruiters).toHaveBeenCalledTimes(1);

    // Digest email sent
    expect(mockSendIngestDigestEmail).toHaveBeenCalledTimes(1);
    const digestResults = mockSendIngestDigestEmail.mock.calls[0][0];
    expect(digestResults).toHaveLength(1);
    expect(digestResults[0].status).toBe('success');
    expect(digestResults[0].candidateName).toBe('Jane Smith');
  });

  it('skips already processed messages (idempotency)', async () => {
    const message = makeMessage();
    mockGetUnreadMessages.mockResolvedValue([message]);
    mockGetResumeAttachments.mockResolvedValue(message.attachments);
    mockGetIngestLogEntry.mockResolvedValue({ status: 'completed' });

    await handler();

    // Should not process
    expect(mockExtractTextFromResume).not.toHaveBeenCalled();
    expect(mockSaveCandidateProfile).not.toHaveBeenCalled();

    // Should still mark as read
    expect(mockMarkMessageAsRead).toHaveBeenCalledTimes(1);

    // Digest should report as skipped
    expect(mockSendIngestDigestEmail).toHaveBeenCalledTimes(1);
    const results = mockSendIngestDigestEmail.mock.calls[0][0];
    expect(results[0].status).toBe('skipped');
    expect(results[0].reason).toBe('already processed');
  });

  it('skips emails with no qualifying attachments', async () => {
    const message = makeMessage();
    mockGetUnreadMessages.mockResolvedValue([message]);
    mockGetResumeAttachments.mockResolvedValue([]); // No PDF/DOCX

    await handler();

    expect(mockExtractTextFromResume).not.toHaveBeenCalled();
    expect(mockMarkMessageAsRead).toHaveBeenCalledTimes(1);
    expect(mockMoveMessageToFolder).toHaveBeenCalledTimes(1);

    const results = mockSendIngestDigestEmail.mock.calls[0][0];
    expect(results[0].status).toBe('skipped');
    expect(results[0].reason).toBe('no PDF/DOCX attachments found');
  });

  it('handles text extraction failure with error digest', async () => {
    const message = makeMessage();
    mockGetUnreadMessages.mockResolvedValue([message]);
    mockGetResumeAttachments.mockResolvedValue(message.attachments);
    mockExtractTextFromResume.mockResolvedValue({ text: 'short', confidence: 0.5 });

    await handler();

    // Should not save profile
    expect(mockSaveCandidateProfile).not.toHaveBeenCalled();

    // Idempotency log should be marked as failed
    expect(mockUpdateIngestLogStatus).toHaveBeenCalledWith(
      '<unique-msg-id@recruiter.com>',
      'failed',
      [],
      'All attachments failed',
      expect.objectContaining({ subVendorMatchMethod: 'none' })
    );

    // Digest should report error
    const results = mockSendIngestDigestEmail.mock.calls[0][0];
    expect(results[0].status).toBe('error');
    expect(results[0].errorType).toBe('text extraction failed');
  });

  it('handles ConditionalCheckFailedException (race condition)', async () => {
    const message = makeMessage();
    mockGetUnreadMessages.mockResolvedValue([message]);
    mockGetResumeAttachments.mockResolvedValue(message.attachments);
    const condErr = new Error('Condition not met');
    condErr.name = 'ConditionalCheckFailedException';
    mockPutIngestLogEntry.mockRejectedValue(condErr);

    await handler();

    // Should not process
    expect(mockExtractTextFromResume).not.toHaveBeenCalled();

    // Should report as skipped
    const results = mockSendIngestDigestEmail.mock.calls[0][0];
    expect(results[0].status).toBe('skipped');
  });

  it('updates existing candidate (dedup by email)', async () => {
    const message = makeMessage();
    mockGetUnreadMessages.mockResolvedValue([message]);
    mockGetResumeAttachments.mockResolvedValue(message.attachments);
    setupSuccessfulProcessing();
    mockGetCandidateByEmail.mockResolvedValue({
      candidate_id: 'existing-cand-123',
      email: 'jane@candidate.com',
      resume_s3_key: 'old-resume-key',
      formatted_resume_s3_key: 'old-formatted-key',
      created_at: '2026-01-01T00:00:00Z',
    });

    await handler();

    const savedProfile = mockSaveCandidateProfile.mock.calls[0][0];
    expect(savedProfile.candidate_id).toBe('existing-cand-123');
    expect(savedProfile.created_at).toBe('2026-01-01T00:00:00Z'); // Preserved

    // Old formatted resume should be deleted
    expect(mockDeleteObject).toHaveBeenCalledWith('old-formatted-key');

    // Digest should show as update
    const results = mockSendIngestDigestEmail.mock.calls[0][0];
    expect(results[0].isUpdate).toBe(true);
  });

  it('continues processing next email if one fails unexpectedly', async () => {
    const msg1 = makeMessage({ id: 'msg-1', internetMessageId: '<msg-1@test.com>' });
    const msg2 = makeMessage({ id: 'msg-2', internetMessageId: '<msg-2@test.com>' });
    mockGetUnreadMessages.mockResolvedValue([msg1, msg2]);
    mockGetResumeAttachments.mockResolvedValue([msg1.attachments![0]]);

    // First message fails unexpectedly
    mockGetIngestLogEntry
      .mockResolvedValueOnce(null) // msg1
      .mockResolvedValueOnce(null); // msg2
    mockPutIngestLogEntry
      .mockRejectedValueOnce(new Error('Unexpected DB error')) // msg1 — throws after idempotency check
      .mockResolvedValueOnce(undefined); // msg2

    setupSuccessfulProcessing();

    await handler();

    // Second message should still be processed
    // (first fails at putIngestLogEntry, second goes through)
    expect(mockExtractTextFromResume).toHaveBeenCalledTimes(1);
  });

  it('strips HTML from email body before passing to parseResume', async () => {
    const message = makeMessage({
      body: {
        contentType: 'html',
        content: '<html><body><p>CTC: <b>12 LPA</b></p><br/>Notice: 30 days</body></html>',
      },
    });
    mockGetUnreadMessages.mockResolvedValue([message]);
    mockGetResumeAttachments.mockResolvedValue(message.attachments);
    setupSuccessfulProcessing();

    await handler();

    // Should strip HTML and pass plain text
    const supplementaryArg = mockParseResume.mock.calls[0][1];
    expect(supplementaryArg).not.toContain('<b>');
    expect(supplementaryArg).not.toContain('<p>');
    expect(supplementaryArg).toContain('CTC:');
    expect(supplementaryArg).toContain('12 LPA');
  });

  it('handles email with no body gracefully', async () => {
    const message = makeMessage({ body: undefined });
    mockGetUnreadMessages.mockResolvedValue([message]);
    mockGetResumeAttachments.mockResolvedValue(message.attachments);
    setupSuccessfulProcessing();

    await handler();

    // Should call parseResume with undefined supplementary text
    expect(mockParseResume).toHaveBeenCalledWith(expect.any(String), undefined);

    // cover_letter should not be set
    const savedProfile = mockSaveCandidateProfile.mock.calls[0][0];
    expect(savedProfile.cover_letter).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Sub-vendor & requirement attribution
  // -------------------------------------------------------------------------

  it('populates sub_vendor fields from master data on an exact-email match', async () => {
    const message = makeMessage();
    mockGetUnreadMessages.mockResolvedValue([message]);
    mockGetResumeAttachments.mockResolvedValue(message.attachments);
    setupSuccessfulProcessing();
    mockResolveSubVendor.mockResolvedValue({
      method: 'exact_email',
      subVendorId: 'sv_001',
      subVendorName: 'TechStaff Solutions',
      subVendorContactPerson: 'Ravi Kumar',
      subVendorContactPhone: '+91-9000000000',
      subVendorContactEmail: 'ravi@techstaff.com',
    });

    await handler();

    const savedProfile = mockSaveCandidateProfile.mock.calls[0][0];
    expect(savedProfile.sub_vendor_id).toBe('sv_001');
    expect(savedProfile.sub_vendor_name).toBe('TechStaff Solutions');
    expect(savedProfile.sub_vendor_contact_person).toBe('Ravi Kumar');
    expect(savedProfile.sub_vendor_contact_phone).toBe('+91-9000000000');
    expect(savedProfile.sub_vendor_contact_email).toBe('ravi@techstaff.com');
  });

  it('lets master data win over LLM-extracted vendor contacts on a resolved match', async () => {
    const message = makeMessage();
    mockGetUnreadMessages.mockResolvedValue([message]);
    mockGetResumeAttachments.mockResolvedValue(message.attachments);
    mockExtractTextFromResume.mockResolvedValue({ text: 'A'.repeat(100), confidence: 0.9 });
    mockParseResume.mockResolvedValue({
      output: {
        fullName: 'Jane Smith',
        email: 'jane@candidate.com',
        primarySkills: [],
        // Conflicting LLM-extracted vendor signature
        vendorCompany: 'WrongCorp',
        vendorContactName: 'Wrong Person',
        vendorContactEmail: 'wrong@wrongcorp.com',
        vendorContactPhone: '+91-1111111111',
      },
      confidence: 0.85,
    });
    mockGetCandidateByEmail.mockResolvedValue(null);
    mockResolveSubVendor.mockResolvedValue({
      method: 'domain',
      subVendorId: 'sv_002',
      subVendorName: 'RightCorp',
      subVendorContactPerson: 'Right Person',
      subVendorContactPhone: '+91-2222222222',
      subVendorContactEmail: 'right@rightcorp.com',
    });

    await handler();

    const savedProfile = mockSaveCandidateProfile.mock.calls[0][0];
    expect(savedProfile.sub_vendor_id).toBe('sv_002');
    expect(savedProfile.sub_vendor_name).toBe('RightCorp');
    expect(savedProfile.sub_vendor_contact_person).toBe('Right Person');
    expect(savedProfile.sub_vendor_contact_email).toBe('right@rightcorp.com');
  });

  it('falls back to LLM-extracted vendor contacts when no sub-vendor match', async () => {
    const message = makeMessage();
    mockGetUnreadMessages.mockResolvedValue([message]);
    mockGetResumeAttachments.mockResolvedValue(message.attachments);
    mockExtractTextFromResume.mockResolvedValue({ text: 'A'.repeat(100), confidence: 0.9 });
    mockParseResume.mockResolvedValue({
      output: {
        fullName: 'Jane Smith',
        email: 'jane@candidate.com',
        primarySkills: [],
        vendorCompany: 'SigCorp',
        vendorContactName: 'Sig Person',
        vendorContactEmail: 'sig@sigcorp.com',
        vendorContactPhone: '+91-3333333333',
      },
      confidence: 0.85,
    });
    mockGetCandidateByEmail.mockResolvedValue(null);
    mockResolveSubVendor.mockResolvedValue({ method: 'none' });

    await handler();

    const savedProfile = mockSaveCandidateProfile.mock.calls[0][0];
    expect(savedProfile.sub_vendor_id).toBeUndefined();
    expect(savedProfile.sub_vendor_name).toBe('SigCorp');
    expect(savedProfile.sub_vendor_contact_person).toBe('Sig Person');
    expect(savedProfile.sub_vendor_contact_phone).toBe('+91-3333333333');
    expect(savedProfile.sub_vendor_contact_email).toBe('sig@sigcorp.com');
  });

  it('writes sub_vendor_match_method and sub_vendor_id to the ingest log', async () => {
    const message = makeMessage();
    mockGetUnreadMessages.mockResolvedValue([message]);
    mockGetResumeAttachments.mockResolvedValue(message.attachments);
    setupSuccessfulProcessing();
    mockResolveSubVendor.mockResolvedValue({
      method: 'exact_email',
      subVendorId: 'sv_001',
      subVendorName: 'TechStaff Solutions',
    });

    await handler();

    expect(mockUpdateIngestLogStatus).toHaveBeenCalledWith(
      '<unique-msg-id@recruiter.com>',
      'completed',
      expect.arrayContaining([expect.any(String)]),
      undefined,
      expect.objectContaining({ subVendorMatchMethod: 'exact_email', subVendorId: 'sv_001' })
    );
  });

  it('stores requirement_id when the subject bracket matches an existing requirement', async () => {
    const message = makeMessage({ subject: 'Candidate Submission - Senior Dev [req_abc123]' });
    mockGetUnreadMessages.mockResolvedValue([message]);
    mockGetResumeAttachments.mockResolvedValue(message.attachments);
    setupSuccessfulProcessing();
    mockGetRequirementById.mockResolvedValue({ requirement_id: 'req_abc123', job_title: 'Senior Dev' });

    await handler();

    expect(mockGetRequirementById).toHaveBeenCalledWith('req_abc123');
    const savedProfile = mockSaveCandidateProfile.mock.calls[0][0];
    expect(savedProfile.requirement_id).toBe('req_abc123');
  });

  it('ignores an unknown requirement id in the subject bracket', async () => {
    const message = makeMessage({ subject: 'Submission [req_DELETED]' });
    mockGetUnreadMessages.mockResolvedValue([message]);
    mockGetResumeAttachments.mockResolvedValue(message.attachments);
    setupSuccessfulProcessing();
    mockGetRequirementById.mockResolvedValue(null);

    await handler();

    expect(mockGetRequirementById).toHaveBeenCalledWith('req_DELETED');
    const savedProfile = mockSaveCandidateProfile.mock.calls[0][0];
    expect(savedProfile.requirement_id).toBeUndefined();
  });

  it('ignores the requirement lookup when the subject has no bracket', async () => {
    const message = makeMessage({ subject: 'Resume for review' });
    mockGetUnreadMessages.mockResolvedValue([message]);
    mockGetResumeAttachments.mockResolvedValue(message.attachments);
    setupSuccessfulProcessing();

    await handler();

    expect(mockGetRequirementById).not.toHaveBeenCalled();
    const savedProfile = mockSaveCandidateProfile.mock.calls[0][0];
    expect(savedProfile.requirement_id).toBeUndefined();
  });

  it('ignores a whitespace-only subject bracket', async () => {
    const message = makeMessage({ subject: 'Resume [  ]' });
    mockGetUnreadMessages.mockResolvedValue([message]);
    mockGetResumeAttachments.mockResolvedValue(message.attachments);
    setupSuccessfulProcessing();

    await handler();

    expect(mockGetRequirementById).not.toHaveBeenCalled();
  });

  it('includes subVendorMatchMethod and requirementId in the digest success result', async () => {
    const message = makeMessage({ subject: 'Submission [req_abc123]' });
    mockGetUnreadMessages.mockResolvedValue([message]);
    mockGetResumeAttachments.mockResolvedValue(message.attachments);
    setupSuccessfulProcessing();
    mockResolveSubVendor.mockResolvedValue({
      method: 'exact_email',
      subVendorId: 'sv_001',
      subVendorName: 'TechStaff Solutions',
    });
    mockGetRequirementById.mockResolvedValue({ requirement_id: 'req_abc123' });

    await handler();

    const results = mockSendIngestDigestEmail.mock.calls[0][0];
    expect(results[0].subVendorMatchMethod).toBe('exact_email');
    expect(results[0].subVendorName).toBe('TechStaff Solutions');
    expect(results[0].requirementId).toBe('req_abc123');
  });
});
