import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../config.js', () => ({
  config: {
    stage: 'dev',
    region: 'ap-south-1',
    dynamodb: {
      linkedInTokensTable: 'LinkedInTokens-dev',
      linkedInPostJobsTable: 'LinkedInPostJobs-dev',
      requirementsTable: 'Requirements-dev',
      promptsTable: 'Prompts-dev',
      talentProfilesTable: 'TalentProfiles-dev',
      usersTable: 'Users-dev',
      savedSearchesTable: 'SavedSearches-dev',
      bulkImportBatchesTable: 'BulkImportBatches-dev',
      pricingConfigTable: 'PricingConfig-dev',
      shortlistsTable: 'Shortlists-dev',
      clientsTable: 'Clients-dev',
      candidateScreeningsTable: 'CandidateScreenings-dev',
      emailIngestLogTable: 'EmailIngestLog-dev',
      auditLogTable: 'AuditLog-dev',
      screeningLocksTable: 'ScreeningLocks-dev',
      subVendorsTable: 'SubVendors-dev',
      pipelineActivityTable: 'PipelineActivity-dev',
      candidateAttachmentsTable: 'CandidateAttachments-dev',
      recruiterTasksTable: 'RecruiterTasks-dev',
      requirementMatchCacheTable: 'RequirementMatchCache-dev',
      requirementLlmRerankTable: 'RequirementLlmRerank-dev',
      cloneJobsTable: 'CloneJobs-dev',
    },
    linkedin: {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'https://dev.scout.quadzero.com/recruiter/linkedin/callback',
      apiVersion: '202505',
    },
    imageGen: {
      model: 'gemini-3-pro-image',
      size: '1024x1024',
    },
    llm: {
      provider: 'claude',
      openaiApiKey: 'test-openai-key',
      anthropicApiKey: 'test-anthropic-key',
      openrouterApiKey: '',
      openrouterModel: '',
      openrouterReferer: '',
      geminiApiKey: 'test-gemini-key',
      geminiModel: '',
      maxRetries: 1,
      fallbackProvider: '',
    },
    s3: { resumesBucket: 'bucket', presignedUrlExpiry: 300 },
    auth: { nextAuthSecret: 'secret' },
    email: { senderEmail: '', frontendBaseUrl: '', ingestNotifyAddress: '' },
    graph: { tenantId: '', clientId: '', clientSecret: '', mailboxAddress: '', enabled: false },
    lambda: { formatResumeWorkerName: '', bulkImportWorkerName: '', notifyWorkerName: '', llmRerankWorkerName: '', cloneDataWorkerName: '', linkedinGenerateWorkerName: 'gen-worker' },
    featureFlags: { llmRerankEnabled: false, recruiterMatchEmailEnabled: false },
  },
}));

const mockGetLinkedInToken = vi.fn();
const mockSaveLinkedInToken = vi.fn();
const mockSavePendingLinkedInState = vi.fn();
const mockMarkLinkedInTokenExpired = vi.fn();
const mockWriteLinkedInPost = vi.fn();
const mockGetRequirementById = vi.fn();
const mockGetActivePrompt = vi.fn();
const mockCreateLinkedInPostJob = vi.fn();
const mockGetLinkedInPostJob = vi.fn();
const mockUpdateLinkedInPostJob = vi.fn();

vi.mock('../dynamodb.js', () => ({
  getLinkedInToken: (...args: unknown[]) => mockGetLinkedInToken(...args),
  saveLinkedInToken: (...args: unknown[]) => mockSaveLinkedInToken(...args),
  savePendingLinkedInState: (...args: unknown[]) => mockSavePendingLinkedInState(...args),
  markLinkedInTokenExpired: (...args: unknown[]) => mockMarkLinkedInTokenExpired(...args),
  writeLinkedInPost: (...args: unknown[]) => mockWriteLinkedInPost(...args),
  getRequirementById: (...args: unknown[]) => mockGetRequirementById(...args),
  getActivePrompt: (...args: unknown[]) => mockGetActivePrompt(...args),
  createLinkedInPostJob: (...args: unknown[]) => mockCreateLinkedInPostJob(...args),
  getLinkedInPostJob: (...args: unknown[]) => mockGetLinkedInPostJob(...args),
  updateLinkedInPostJob: (...args: unknown[]) => mockUpdateLinkedInPostJob(...args),
  getLlmRerank: vi.fn().mockResolvedValue(null),
  putLlmRerank: vi.fn().mockResolvedValue(undefined),
  deleteLlmRerank: vi.fn().mockResolvedValue(undefined),
}));

const mockInvokeLambdaAsync = vi.fn();
vi.mock('../lambdaInvoke.js', () => ({
  invokeLambdaAsync: (...args: unknown[]) => mockInvokeLambdaAsync(...args),
}));

const mockGetObject = vi.fn();
const mockPutObject = vi.fn();
const mockGenerateDownloadUrl = vi.fn();
vi.mock('../s3.js', () => ({
  getObject: (...args: unknown[]) => mockGetObject(...args),
  putObject: (...args: unknown[]) => mockPutObject(...args),
  generateDownloadUrl: (...args: unknown[]) => mockGenerateDownloadUrl(...args),
}));

vi.mock('../auth.js', () => ({
  withAuth: (_roles: string[], handler: (event: unknown) => Promise<unknown>) => {
    return (event: unknown, _ctx: unknown) => {
      (event as Record<string, unknown>).auth = { userId: 'rec-1', email: 'test@quadzero.com', role: 'recruiter', isInternal: true };
      return handler(event);
    };
  },
}));

// Mock the LLM provider with a stable spy so call options can be asserted.
const { mockCompleteWithRetry } = vi.hoisted(() => ({ mockCompleteWithRetry: vi.fn() }));
vi.mock('../llm/index.js', () => ({
  getLLMProvider: () => ({
    completeWithRetry: mockCompleteWithRetry,
    parseJsonResponse: (raw: string) => JSON.parse(raw),
  }),
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-csrf-state-uuid' });

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /test',
    rawPath: '/test',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '',
      apiId: '',
      domainName: '',
      domainPrefix: '',
      http: { method: 'GET', path: '/test', protocol: 'HTTP/1.1', sourceIp: '', userAgent: '' },
      requestId: '',
      routeKey: '',
      stage: '',
      time: '',
      timeEpoch: 0,
    },
    isBase64Encoded: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// auth-url handler
// ---------------------------------------------------------------------------

describe('linkedinAuthUrl handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSavePendingLinkedInState.mockResolvedValue(undefined);
  });

  it('stores state and returns authUrl with required params', async () => {
    const { handler } = await import('../../handlers/recruiter/linkedinAuthUrl.js');
    const event = makeEvent({ rawPath: '/recruiter/linkedin/auth-url' });
    const result = await handler(event as APIGatewayProxyEventV2, {} as never);
    const body = JSON.parse((result as { body: string }).body);
    expect(body.success).toBe(true);
    const url = new URL(body.data.authUrl);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('state')).toBe('test-csrf-state-uuid');
    expect(url.searchParams.get('scope')).toContain('w_member_social');
    expect(mockSavePendingLinkedInState).toHaveBeenCalledWith('rec-1', 'test-csrf-state-uuid');
  });

  it('returns a 503 configuration error and stores no state when client_id is not configured', async () => {
    const { config } = await import('../config.js');
    const originalClientId = config.linkedin.clientId;
    config.linkedin.clientId = '';
    try {
      const { handler } = await import('../../handlers/recruiter/linkedinAuthUrl.js');
      const event = makeEvent({ rawPath: '/recruiter/linkedin/auth-url' });
      const result = await handler(event as APIGatewayProxyEventV2, {} as never);
      expect((result as { statusCode: number }).statusCode).toBe(503);
      const body = JSON.parse((result as { body: string }).body);
      expect(body.success).toBe(false);
      expect(mockSavePendingLinkedInState).not.toHaveBeenCalled();
    } finally {
      config.linkedin.clientId = originalClientId;
    }
  });
});

// ---------------------------------------------------------------------------
// exchange handler
// ---------------------------------------------------------------------------

describe('linkedinExchange handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects missing code or state', async () => {
    const { handler } = await import('../../handlers/recruiter/linkedinExchange.js');
    const event = makeEvent({ rawPath: '/recruiter/linkedin/exchange', body: JSON.stringify({ code: 'abc' }) });
    const result = await handler(event as APIGatewayProxyEventV2, {} as never);
    expect((result as { statusCode: number }).statusCode).toBe(400);
  });

  it('rejects invalid state (no pending_state)', async () => {
    mockGetLinkedInToken.mockResolvedValue({ recruiter_id: 'rec-1' }); // no pending_state
    const { handler } = await import('../../handlers/recruiter/linkedinExchange.js');
    const event = makeEvent({
      rawPath: '/recruiter/linkedin/exchange',
      body: JSON.stringify({ code: 'abc', state: 'wrong-state' }),
    });
    const result = await handler(event as APIGatewayProxyEventV2, {} as never);
    expect((result as { statusCode: number }).statusCode).toBe(400);
  });

  it('rejects replayed state (mismatch)', async () => {
    mockGetLinkedInToken.mockResolvedValue({ recruiter_id: 'rec-1', pending_state: 'correct-state' });
    const { handler } = await import('../../handlers/recruiter/linkedinExchange.js');
    const event = makeEvent({
      rawPath: '/recruiter/linkedin/exchange',
      body: JSON.stringify({ code: 'abc', state: 'wrong-state' }),
    });
    const result = await handler(event as APIGatewayProxyEventV2, {} as never);
    expect((result as { statusCode: number }).statusCode).toBe(400);
    expect(mockSaveLinkedInToken).not.toHaveBeenCalled();
  });

  it('exchanges code successfully, saves token without logging access_token', async () => {
    mockGetLinkedInToken.mockResolvedValue({ recruiter_id: 'rec-1', pending_state: 'valid-state' });
    mockSaveLinkedInToken.mockResolvedValue(undefined);

    // Mock LinkedIn token endpoint
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'my-access-token', expires_in: 5184000, scope: 'openid profile w_member_social' }),
      })
      // Mock userinfo endpoint
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sub: 'person123' }),
      });

    const { handler } = await import('../../handlers/recruiter/linkedinExchange.js');
    const event = makeEvent({
      rawPath: '/recruiter/linkedin/exchange',
      body: JSON.stringify({ code: 'valid-code', state: 'valid-state' }),
    });
    const result = await handler(event as APIGatewayProxyEventV2, {} as never);
    const body = JSON.parse((result as { body: string }).body);

    expect(body.success).toBe(true);
    expect(body.data.connected).toBe(true);
    // Token must NOT appear in the response
    expect(JSON.stringify(body)).not.toContain('my-access-token');

    expect(mockSaveLinkedInToken).toHaveBeenCalledWith(
      expect.objectContaining({
        recruiter_id: 'rec-1',
        member_urn: 'urn:li:person:person123',
        access_token: 'my-access-token',
      })
    );
  });
});

// ---------------------------------------------------------------------------
// status handler
// ---------------------------------------------------------------------------

describe('linkedinStatus handler', () => {
  beforeEach(() => vi.clearAllMocks());

  const nowSeconds = () => Math.floor(Date.now() / 1000);

  it('returns connected: false when no token exists', async () => {
    mockGetLinkedInToken.mockResolvedValue(null);
    const { handler } = await import('../../handlers/recruiter/linkedinStatus.js');
    const result = await handler(makeEvent() as APIGatewayProxyEventV2, {} as never);
    const body = JSON.parse((result as { body: string }).body);
    expect(body.data.connected).toBe(false);
    expect(body.data.needsReconnect).toBe(false);
  });

  it('returns connected: false, needsReconnect: true for expired token', async () => {
    mockGetLinkedInToken.mockResolvedValue({ access_token: 'tok', expires_at: nowSeconds() - 100 });
    const { handler } = await import('../../handlers/recruiter/linkedinStatus.js');
    const result = await handler(makeEvent() as APIGatewayProxyEventV2, {} as never);
    const body = JSON.parse((result as { body: string }).body);
    expect(body.data.connected).toBe(false);
    expect(body.data.needsReconnect).toBe(true);
  });

  it('returns connected: true, needsReconnect: false for healthy token', async () => {
    mockGetLinkedInToken.mockResolvedValue({ access_token: 'tok', expires_at: nowSeconds() + 60 * 60 * 24 * 30 });
    const { handler } = await import('../../handlers/recruiter/linkedinStatus.js');
    const result = await handler(makeEvent() as APIGatewayProxyEventV2, {} as never);
    const body = JSON.parse((result as { body: string }).body);
    expect(body.data.connected).toBe(true);
    expect(body.data.needsReconnect).toBe(false);
  });

  it('returns connected:true, needsReconnect:false, refreshSoon:true within 7-day refresh window', async () => {
    mockGetLinkedInToken.mockResolvedValue({ access_token: 'tok', expires_at: nowSeconds() + 60 * 60 * 24 * 5 });
    const { handler } = await import('../../handlers/recruiter/linkedinStatus.js');
    const result = await handler(makeEvent() as APIGatewayProxyEventV2, {} as never);
    const body = JSON.parse((result as { body: string }).body);
    // Within the window the token is still valid: connected stays true and the
    // recruiter is NOT shown a reconnect prompt; refreshSoon drives silent re-auth.
    expect(body.data.connected).toBe(true);
    expect(body.data.needsReconnect).toBe(false);
    expect(body.data.refreshSoon).toBe(true);
  });

  it('returns refreshSoon:false for a healthy (far-from-expiry) token', async () => {
    mockGetLinkedInToken.mockResolvedValue({ access_token: 'tok', expires_at: nowSeconds() + 60 * 60 * 24 * 30 });
    const { handler } = await import('../../handlers/recruiter/linkedinStatus.js');
    const result = await handler(makeEvent() as APIGatewayProxyEventV2, {} as never);
    const body = JSON.parse((result as { body: string }).body);
    expect(body.data.refreshSoon).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generate handler
// ---------------------------------------------------------------------------

const baseRequirement = {
  requirement_id: 'req-1',
  recruiter_id: 'rec-1',
  client_name: 'Acme Corp',
  jd_text: 'Looking for a React developer...',
  parsed_criteria: {
    coreSkill: 'React',
    roles: ['Frontend Developer'],
    mustHaveSkills: ['react', 'typescript'],
    minExperience: 4,
  },
};

describe('linkedinGenerate kickoff handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLinkedInToken.mockResolvedValue({ access_token: 'tok', member_urn: 'urn:li:person:x' });
    mockGetRequirementById.mockResolvedValue(baseRequirement);
    mockCreateLinkedInPostJob.mockResolvedValue(undefined);
    mockInvokeLambdaAsync.mockResolvedValue(undefined);
  });

  it('creates a job, invokes the worker, and returns a jobId', async () => {
    const { handler } = await import('../../handlers/recruiter/linkedinGenerate.js');
    const event = makeEvent({ rawPath: '/recruiter/requirements/req-1/linkedin/generate', pathParameters: { requirementId: 'req-1' } });
    const result = await handler(event as APIGatewayProxyEventV2, {} as never);
    const body = JSON.parse((result as { body: string }).body);

    expect(body.success).toBe(true);
    expect(body.data.jobId).toBeTruthy();
    expect(mockCreateLinkedInPostJob).toHaveBeenCalledWith(
      expect.objectContaining({ requirement_id: 'req-1', recruiter_id: 'rec-1', status: 'pending' })
    );
    expect(mockInvokeLambdaAsync).toHaveBeenCalledWith('gen-worker', { jobId: body.data.jobId });
    // The worker name in the job and the invoke must match; no token must leak.
    expect(JSON.stringify(body)).not.toContain('tok');
  });

  it('returns 404 if requirement not found', async () => {
    mockGetRequirementById.mockResolvedValue(null);
    const { handler } = await import('../../handlers/recruiter/linkedinGenerate.js');
    const event = makeEvent({ rawPath: '/recruiter/requirements/req-1/linkedin/generate', pathParameters: { requirementId: 'req-1' } });
    const result = await handler(event as APIGatewayProxyEventV2, {} as never);
    expect((result as { statusCode: number }).statusCode).toBe(404);
    expect(mockInvokeLambdaAsync).not.toHaveBeenCalled();
  });

  it('returns 400 if LinkedIn not connected', async () => {
    mockGetLinkedInToken.mockResolvedValue(null);
    const { handler } = await import('../../handlers/recruiter/linkedinGenerate.js');
    const event = makeEvent({ rawPath: '/recruiter/requirements/req-1/linkedin/generate', pathParameters: { requirementId: 'req-1' } });
    const result = await handler(event as APIGatewayProxyEventV2, {} as never);
    expect((result as { statusCode: number }).statusCode).toBe(400);
    expect(mockCreateLinkedInPostJob).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// generation worker
// ---------------------------------------------------------------------------

describe('linkedinGenerateWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLinkedInPostJob.mockResolvedValue({ job_id: 'job-1', recruiter_id: 'rec-1', requirement_id: 'req-1', status: 'pending' });
    mockGetRequirementById.mockResolvedValue(baseRequirement);
    mockGetActivePrompt.mockResolvedValue(null);
    mockCompleteWithRetry.mockResolvedValue({ content: '🚀 Hiring: React Developer\nJoin our team. #React #Hiring' });
    mockPutObject.mockResolvedValue(undefined);
    mockUpdateLinkedInPostJob.mockResolvedValue(undefined);
  });

  it('generates text + image, uploads the image to S3, and marks the job done', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: 'base64imagedata' } }] } }] }),
    });

    const { handler } = await import('../../handlers/worker/linkedinGenerateWorker.js');
    await handler({ jobId: 'job-1' });

    // Text must be requested as plain text, or Gemini wraps the post in JSON
    expect(mockCompleteWithRetry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ responseFormat: 'text' }),
      expect.anything()
    );
    // Image uploaded to S3 under the job key
    expect(mockPutObject).toHaveBeenCalledWith('linkedin-posts/job-1.png', expect.any(Buffer), 'image/png');
    // Job finalized with the post text + image key
    expect(mockUpdateLinkedInPostJob).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: 'done', image_s3_key: 'linkedin-posts/job-1.png', text: expect.stringContaining('Hiring: React Developer') })
    );
  });

  it('substitutes {{raw_job_description}} in the image prompt with the JD', async () => {
    mockGetActivePrompt.mockImplementation((key: string) =>
      key === 'linkedin_image_generator'
        ? Promise.resolve({ content: 'Infographic. JD: {{raw_job_description}} END', version: 1 })
        : Promise.resolve(null)
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: 'base64imagedata' } }] } }] }),
    });

    const { handler } = await import('../../handlers/worker/linkedinGenerateWorker.js');
    await handler({ jobId: 'job-1' });

    const sentPrompt = JSON.parse(mockFetch.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(sentPrompt).not.toContain('{{raw_job_description}}');
    expect(sentPrompt).toContain('JD: Looking for a React developer');
  });

  it('retries image generation when the model returns text instead of an image', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"job_title":"x"}' }] } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: 'realimage' } }] } }] }) });

    const { handler } = await import('../../handlers/worker/linkedinGenerateWorker.js');
    await handler({ jobId: 'job-1' });

    expect(mockFetch).toHaveBeenCalledTimes(2); // retried once after the no-image response
    expect(mockUpdateLinkedInPostJob).toHaveBeenCalledWith('job-1', expect.objectContaining({ status: 'done' }));
  });

  it('marks the job failed when image generation never returns an image', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'no image' }] } }] }) });

    const { handler } = await import('../../handlers/worker/linkedinGenerateWorker.js');
    await handler({ jobId: 'job-1' });

    expect(mockPutObject).not.toHaveBeenCalled();
    expect(mockUpdateLinkedInPostJob).toHaveBeenCalledWith('job-1', expect.objectContaining({ status: 'failed' }));
  });
});

// ---------------------------------------------------------------------------
// generation status handler
// ---------------------------------------------------------------------------

describe('linkedinGenerateStatus handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns pending while the job is processing', async () => {
    mockGetLinkedInPostJob.mockResolvedValue({ job_id: 'job-1', recruiter_id: 'rec-1', status: 'processing' });
    const { handler } = await import('../../handlers/recruiter/linkedinGenerateStatus.js');
    const event = makeEvent({ rawPath: '/recruiter/requirements/req-1/linkedin/generate/job-1', pathParameters: { requirementId: 'req-1', jobId: 'job-1' } });
    const body = JSON.parse((await handler(event as APIGatewayProxyEventV2, {} as never) as { body: string }).body);
    expect(body.data.status).toBe('processing');
  });

  it('returns text + a presigned image URL when done', async () => {
    mockGetLinkedInPostJob.mockResolvedValue({ job_id: 'job-1', recruiter_id: 'rec-1', status: 'done', text: 'My post', hashtags: '', image_s3_key: 'linkedin-posts/job-1.png' });
    mockGenerateDownloadUrl.mockResolvedValue({ url: 'https://signed-url', key: 'linkedin-posts/job-1.png', expiresIn: 300 });
    const { handler } = await import('../../handlers/recruiter/linkedinGenerateStatus.js');
    const event = makeEvent({ rawPath: '/recruiter/requirements/req-1/linkedin/generate/job-1', pathParameters: { requirementId: 'req-1', jobId: 'job-1' } });
    const body = JSON.parse((await handler(event as APIGatewayProxyEventV2, {} as never) as { body: string }).body);
    expect(body.data.status).toBe('done');
    expect(body.data.text).toBe('My post');
    expect(body.data.imageUrl).toBe('https://signed-url');
  });

  it('returns 404 for a job owned by another recruiter', async () => {
    mockGetLinkedInPostJob.mockResolvedValue({ job_id: 'job-1', recruiter_id: 'rec-2', status: 'done' });
    const { handler } = await import('../../handlers/recruiter/linkedinGenerateStatus.js');
    const event = makeEvent({ rawPath: '/recruiter/requirements/req-1/linkedin/generate/job-1', pathParameters: { requirementId: 'req-1', jobId: 'job-1' } });
    const result = await handler(event as APIGatewayProxyEventV2, {} as never);
    expect((result as { statusCode: number }).statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// escapeLinkedInCommentary helper
// ---------------------------------------------------------------------------

describe('escapeLinkedInCommentary', () => {
  it('is a no-op when text contains no reserved characters', async () => {
    const { escapeLinkedInCommentary } = await import('../../handlers/recruiter/linkedinPublish.js');
    expect(escapeLinkedInCommentary('Hello World! No reserved chars here.')).toBe('Hello World! No reserved chars here.');
  });

  it('escapes all 14 LinkedIn reserved characters', async () => {
    const { escapeLinkedInCommentary } = await import('../../handlers/recruiter/linkedinPublish.js');
    expect(escapeLinkedInCommentary('(')).toBe('\\(');
    expect(escapeLinkedInCommentary(')')).toBe('\\)');
    expect(escapeLinkedInCommentary('[')).toBe('\\[');
    expect(escapeLinkedInCommentary(']')).toBe('\\]');
    expect(escapeLinkedInCommentary('{')).toBe('\\{');
    expect(escapeLinkedInCommentary('}')).toBe('\\}');
    expect(escapeLinkedInCommentary('<')).toBe('\\<');
    expect(escapeLinkedInCommentary('>')).toBe('\\>');
    expect(escapeLinkedInCommentary('@')).toBe('\\@');
    expect(escapeLinkedInCommentary('#')).toBe('\\#');
    expect(escapeLinkedInCommentary('*')).toBe('\\*');
    expect(escapeLinkedInCommentary('_')).toBe('\\_');
    expect(escapeLinkedInCommentary('~')).toBe('\\~');
    expect(escapeLinkedInCommentary('\\')).toBe('\\\\');
    expect(escapeLinkedInCommentary('|')).toBe('\\|');
  });

  it('escapes \\ before other chars so a literal backslash is not double-escaped', async () => {
    const { escapeLinkedInCommentary } = await import('../../handlers/recruiter/linkedinPublish.js');
    // input in memory: foo\(bar  — one backslash + one paren
    // expected in memory: foo\\\(bar — backslash escaped to \\, paren escaped to \(
    expect(escapeLinkedInCommentary('foo\\(bar')).toBe('foo\\\\\\(bar');
    // input: single backslash → double backslash
    expect(escapeLinkedInCommentary('\\')).toBe('\\\\');
    // input: a\b(c — backslash between letters, paren at end
    expect(escapeLinkedInCommentary('a\\b(c')).toBe('a\\\\b\\(c');
  });

  it('escapes reserved chars at the start and end of the string', async () => {
    const { escapeLinkedInCommentary } = await import('../../handlers/recruiter/linkedinPublish.js');
    expect(escapeLinkedInCommentary('(Senior Developer)')).toBe('\\(Senior Developer\\)');
  });

  it('escapes consecutive reserved characters', async () => {
    const { escapeLinkedInCommentary } = await import('../../handlers/recruiter/linkedinPublish.js');
    expect(escapeLinkedInCommentary('()')).toBe('\\(\\)');
    expect(escapeLinkedInCommentary('()*@#')).toBe('\\(\\)\\*\\@\\#');
  });

  it('escapes every occurrence in a realistic post text', async () => {
    const { escapeLinkedInCommentary } = await import('../../handlers/recruiter/linkedinPublish.js');
    const raw = 'Senior Developer (5 years) with *expertise* needed @corp #hiring';
    const escaped = escapeLinkedInCommentary(raw);
    expect(escaped).toBe('Senior Developer \\(5 years\\) with \\*expertise\\* needed \\@corp \\#hiring');
  });
});

// ---------------------------------------------------------------------------
// publish handler
// ---------------------------------------------------------------------------

describe('linkedinPublish handler', () => {
  const baseRequirement = {
    requirement_id: 'req-1',
    recruiter_id: 'rec-1',
    client_name: 'Acme Corp',
    jd_text: 'Some JD',
    parsed_criteria: { coreSkill: 'React' },
  };

  const tokenA = { access_token: 'token-a', member_urn: 'urn:li:person:personA', expires_at: 9999999999 };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRequirementById.mockResolvedValue(baseRequirement);
    mockGetLinkedInToken.mockResolvedValue(tokenA);
    mockWriteLinkedInPost.mockResolvedValue(undefined);
    mockGetLinkedInPostJob.mockResolvedValue({ job_id: 'job-1', recruiter_id: 'rec-1', status: 'done', image_s3_key: 'linkedin-posts/job-1.png' });
    mockGetObject.mockResolvedValue(Buffer.from('imagebytes'));
  });

  it('returns 409 if requirement already has linkedin_post', async () => {
    mockGetRequirementById.mockResolvedValue({
      ...baseRequirement,
      linkedin_post: { post_url: 'https://linkedin.com/feed/update/urn:x', post_urn: 'urn:x', posted_at: '', posted_by_recruiter_id: '' },
    });
    const { handler } = await import('../../handlers/recruiter/linkedinPublish.js');
    const event = makeEvent({
      rawPath: '/recruiter/requirements/req-1/linkedin/post',
      pathParameters: { requirementId: 'req-1' },
      body: JSON.stringify({ text: 'hello', jobId: 'job-1' }),
    });
    const result = await handler(event as APIGatewayProxyEventV2, {} as never);
    expect((result as { statusCode: number }).statusCode).toBe(409);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('publishes post and writes linkedin_post to requirement', async () => {
    // Mock image init upload
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: { uploadUrl: 'https://upload.url', image: 'urn:li:image:xxx' } }),
        headers: new Headers(),
      })
      // Mock PUT image upload
      .mockResolvedValueOnce({ ok: true })
      // Mock POST create post
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'x-restli-id': 'urn:li:ugcPost:123' }),
      });

    const { handler } = await import('../../handlers/recruiter/linkedinPublish.js');
    const event = makeEvent({
      rawPath: '/recruiter/requirements/req-1/linkedin/post',
      pathParameters: { requirementId: 'req-1' },
      body: JSON.stringify({ text: 'Great opportunity!', jobId: 'job-1' }),
    });
    const result = await handler(event as APIGatewayProxyEventV2, {} as never);
    const body = JSON.parse((result as { body: string }).body);

    expect(body.success).toBe(true);
    expect(body.data.postUrl).toContain('linkedin.com/feed/update/');
    // Must not return access_token in response
    expect(JSON.stringify(body)).not.toContain('token-a');
    expect(mockWriteLinkedInPost).toHaveBeenCalledWith('req-1', expect.objectContaining({
      post_urn: 'urn:li:ugcPost:123',
      posted_by_recruiter_id: 'rec-1',
    }));
  });

  it('escapes reserved chars in commentary sent to LinkedIn but does not mutate the stored requirement', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ value: { uploadUrl: 'https://u', image: 'urn:li:image:y' } }), headers: new Headers() })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, headers: new Headers({ 'x-restli-id': 'urn:post:esc' }) });

    const rawText = 'GCP Data Engineer (Advanced/Next) — 99.99% SLA *required* @corp';
    const { handler } = await import('../../handlers/recruiter/linkedinPublish.js');
    const event = makeEvent({
      rawPath: '/recruiter/requirements/req-1/linkedin/post',
      pathParameters: { requirementId: 'req-1' },
      body: JSON.stringify({ text: rawText, jobId: 'job-1' }),
    });
    await handler(event as APIGatewayProxyEventV2, {} as never);

    // Third fetch is POST /rest/posts — commentary must have reserved chars escaped
    const postBody = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(postBody.commentary).toBe(
      'GCP Data Engineer \\(Advanced/Next\\) — 99.99% SLA \\*required\\* \\@corp'
    );
    // The original text must not appear in commentary
    expect(postBody.commentary).not.toContain('(Advanced/Next)');

    // writeLinkedInPost stores post URL/URN for the requirement — it never receives the text
    expect(mockWriteLinkedInPost).toHaveBeenCalledWith('req-1', expect.objectContaining({
      post_urn: 'urn:post:esc',
      posted_by_recruiter_id: 'rec-1',
    }));
  });

  it('sends commentary unchanged when text contains no reserved characters', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ value: { uploadUrl: 'https://u', image: 'urn:li:image:y' } }), headers: new Headers() })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, headers: new Headers({ 'x-restli-id': 'urn:post:plain' }) });

    const plainText = 'Hiring a Senior Engineer. Join us today and grow your career.';
    const { handler } = await import('../../handlers/recruiter/linkedinPublish.js');
    const event = makeEvent({
      rawPath: '/recruiter/requirements/req-1/linkedin/post',
      pathParameters: { requirementId: 'req-1' },
      body: JSON.stringify({ text: plainText, jobId: 'job-1' }),
    });
    await handler(event as APIGatewayProxyEventV2, {} as never);

    const postBody = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(postBody.commentary).toBe(plainText);
  });

  it('uses token of authenticated recruiter (recruiter A never uses recruiter B token)', async () => {
    const tokenB = { access_token: 'token-b', member_urn: 'urn:li:person:personB', expires_at: 9999999999 };
    // getLinkedInToken is called with the authenticated recruiter's id (rec-1), not rec-2
    mockGetLinkedInToken.mockImplementation((id: string) =>
      id === 'rec-1' ? Promise.resolve(tokenA) : Promise.resolve(tokenB)
    );

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ value: { uploadUrl: 'https://u', image: 'urn:li:image:y' } }), headers: new Headers() })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, headers: new Headers({ 'x-restli-id': 'urn:post' }) });

    const { handler } = await import('../../handlers/recruiter/linkedinPublish.js');
    const event = makeEvent({
      rawPath: '/recruiter/requirements/req-1/linkedin/post',
      pathParameters: { requirementId: 'req-1' },
      body: JSON.stringify({ text: 'Test', jobId: 'job-1' }),
    });
    await handler(event as APIGatewayProxyEventV2, {} as never);

    // Verify the auth header used token-a (recruiter A's token)
    const initCall = mockFetch.mock.calls[0];
    expect(initCall[1].headers['Authorization']).toContain('token-a');
  });

  it('marks token expired and returns 401 when LinkedIn returns 401 on post', async () => {
    mockMarkLinkedInTokenExpired.mockResolvedValue(undefined);
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ value: { uploadUrl: 'https://u', image: 'urn:li:image:y' } }), headers: new Headers() })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, status: 401, headers: new Headers() });

    const { handler } = await import('../../handlers/recruiter/linkedinPublish.js');
    const event = makeEvent({
      rawPath: '/recruiter/requirements/req-1/linkedin/post',
      pathParameters: { requirementId: 'req-1' },
      body: JSON.stringify({ text: 'Test', jobId: 'job-1' }),
    });
    const result = await handler(event as APIGatewayProxyEventV2, {} as never);
    expect((result as { statusCode: number }).statusCode).toBe(401);
    expect(mockMarkLinkedInTokenExpired).toHaveBeenCalledWith('rec-1');
    expect(mockWriteLinkedInPost).not.toHaveBeenCalled();
  });

  it('handles concurrent post race via conditional write — second call gets 409', async () => {
    const conditionalError = Object.assign(new Error('ConditionalCheckFailed'), { name: 'ConditionalCheckFailedException' });
    mockWriteLinkedInPost.mockRejectedValue(conditionalError);

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ value: { uploadUrl: 'https://u', image: 'urn:li:image:y' } }), headers: new Headers() })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, headers: new Headers({ 'x-restli-id': 'urn:post' }) });

    const { handler } = await import('../../handlers/recruiter/linkedinPublish.js');
    const event = makeEvent({
      rawPath: '/recruiter/requirements/req-1/linkedin/post',
      pathParameters: { requirementId: 'req-1' },
      body: JSON.stringify({ text: 'Test', jobId: 'job-1' }),
    });
    const result = await handler(event as APIGatewayProxyEventV2, {} as never);
    expect((result as { statusCode: number }).statusCode).toBe(409);
  });
});
