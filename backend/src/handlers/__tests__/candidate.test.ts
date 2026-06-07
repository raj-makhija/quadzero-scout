import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks - must be declared before handler imports
// ---------------------------------------------------------------------------

vi.mock('../../lib/s3.js', () => ({
  generateUploadUrl: vi.fn().mockResolvedValue({
    url: 'https://s3.amazonaws.com/presigned-upload',
    key: 'resumes/2024/01/uuid-resume.pdf',
    expiresIn: 300,
  }),
  generateDownloadUrl: vi.fn().mockResolvedValue({
    url: 'https://s3.amazonaws.com/presigned-download',
    key: 'resumes/2024/01/uuid-resume.pdf',
    expiresIn: 300,
  }),
  getObject: vi.fn().mockResolvedValue(Buffer.from('fake pdf content')),
  extractFileNameFromKey: vi.fn().mockReturnValue('resume.pdf'),
  deleteObject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/textract.js', () => ({
  extractTextFromResume: vi.fn().mockResolvedValue({
    text: 'John Doe\nSoftware Engineer\nReact, Node.js, TypeScript\n5 years experience\n' + 'x'.repeat(50),
    confidence: 0.95,
    pageCount: 2,
  }),
}));

vi.mock('../../lib/llm/index.js', () => ({
  parseResume: vi.fn().mockResolvedValue({
    output: {
      fullName: 'John Doe',
      email: 'john@example.com',
      phone: '+91-9876543210',
      location: 'Bangalore, India',
      primarySkills: ['react', 'nodejs', 'typescript'],
      primarySkillYears: { react: 4, nodejs: 3, typescript: 3 },
      secondarySkills: ['aws', 'docker'],
      totalExperience: 5,
      seniority: 'senior',
      availability: 'immediate',
      industries: ['fintech'],
      roles: ['Full Stack Developer'],
      education: [{ degree: 'B.Tech CS', institution: 'IIT Delhi', year: 2018 }],
      certifications: ['AWS SA'],
      summary: 'Experienced developer.',
    },
    confidence: 0.9,
  }),
}));

vi.mock('../../lib/dynamodb.js', () => ({
  saveCandidateProfile: vi.fn().mockResolvedValue(undefined),
  getCandidateById: vi.fn(),
  getCandidateByEmail: vi.fn().mockResolvedValue(null),
  getExperienceBucket: vi.fn((years: number) => {
    if (years <= 2) return '0-2';
    if (years <= 5) return '3-5';
    if (years <= 10) return '6-10';
    if (years <= 15) return '11-15';
    return '16+';
  }),
}));

vi.mock('../../lib/lambdaInvoke.js', () => ({
  invokeLambdaAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/config.js', () => ({
  config: {
    lambda: {
      formatResumeWorkerName: '',
      notifyWorkerName: '',
    },
  },
}));

vi.mock('../../lib/skillNormalizer.js', () => ({
  // Lowercasing stand-in for the real ontology normalizer — enough to assert
  // that saveProfile routes synonym keys/values through normalization (#281).
  normalizeSkill: vi.fn((skill: string) => skill.toLowerCase()),
  normalizeSkills: vi.fn((skills: string[]) => skills.map((s) => s.toLowerCase())),
  normalizeSkillYears: vi.fn((years: Record<string, number>) => years),
}));

// Import handlers after mocks
import { handler as uploadUrlHandler } from '../candidate/uploadUrl.js';
import { handler as analyzeHandler } from '../candidate/analyze.js';
import { handler as saveProfileHandler } from '../candidate/saveProfile.js';
import { handler as getProfileHandler } from '../candidate/getProfile.js';
import { getCandidateById, saveCandidateProfile, getCandidateByEmail } from '../../lib/dynamodb.js';
import { extractTextFromResume } from '../../lib/textract.js';
import { parseResume } from '../../lib/llm/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'localhost',
      domainPrefix: '',
      http: { method: 'POST', path: '/', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '',
      timeEpoch: 0,
    },
    isBase64Encoded: false,
    ...overrides,
  } as APIGatewayProxyEventV2;
}

function parseBody(result: { body?: string }) {
  return JSON.parse(result.body || '{}');
}

// ---------------------------------------------------------------------------
// POST /candidate/upload-url
// TC-UPLOAD-001 through TC-UPLOAD-017
// ---------------------------------------------------------------------------

describe('POST /candidate/upload-url', () => {
  // TC-UPLOAD-001
  it('generates pre-signed URL for PDF', async () => {
    const event = makeEvent({
      body: JSON.stringify({ fileName: 'resume.pdf', contentType: 'application/pdf' }),
    });
    const result = await uploadUrlHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.uploadUrl).toContain('https://');
    expect(body.data.s3Key).toContain('resumes/');
    expect(body.data.expiresIn).toBe(300);
  });

  // TC-UPLOAD-006
  it('rejects empty request body', async () => {
    const event = makeEvent({ body: undefined });
    const result = await uploadUrlHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Request body is required');
  });

  // TC-UPLOAD-007
  it('rejects invalid JSON body', async () => {
    const event = makeEvent({ body: '{invalid json' });
    const result = await uploadUrlHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.error.message).toBe('Invalid JSON in request body');
  });

  // TC-UPLOAD-004
  it('rejects unsupported content type', async () => {
    const event = makeEvent({
      body: JSON.stringify({ fileName: 'data.xlsx', contentType: 'application/vnd.ms-excel' }),
    });
    const result = await uploadUrlHandler(event);
    expect(result.statusCode).toBe(400);
  });

  // TC-UPLOAD-008
  it('rejects missing fileName', async () => {
    const event = makeEvent({
      body: JSON.stringify({ contentType: 'application/pdf' }),
    });
    const result = await uploadUrlHandler(event);
    expect(result.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /candidate/analyze
// TC-ANALYZE-001 through TC-ANALYZE-013
// ---------------------------------------------------------------------------

describe('POST /candidate/analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-ANALYZE-001
  it('analyzes uploaded PDF resume via S3 key', async () => {
    const event = makeEvent({
      body: JSON.stringify({ s3Key: 'resumes/2024/01/abc-resume.pdf' }),
    });
    const result = await analyzeHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.extractedProfile).toBeDefined();
    expect(body.data.extractedProfile.fullName).toBe('John Doe');
    expect(body.data.extractedProfile.primarySkills).toContain('react');
    expect(body.data.confidence).toBeGreaterThan(0);
    expect(body.data.confidence).toBeLessThanOrEqual(1);
    expect(body.data.rawTextLength).toBeGreaterThan(0);
  });

  // TC-ANALYZE-004
  it('rejects empty s3Key', async () => {
    const event = makeEvent({
      body: JSON.stringify({ s3Key: '' }),
    });
    const result = await analyzeHandler(event);
    expect(result.statusCode).toBe(400);
  });

  // TC-ANALYZE-012
  it('returns TEXTRACT_ERROR when Textract fails', async () => {
    vi.mocked(extractTextFromResume).mockRejectedValueOnce(new Error('Textract service unavailable'));

    const event = makeEvent({
      body: JSON.stringify({ s3Key: 'resumes/2024/01/abc.pdf' }),
    });
    const result = await analyzeHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(500);
    expect(body.error.code).toBe('TEXTRACT_ERROR');
  });

  // TC-ANALYZE-013
  it('returns TEXTRACT_ERROR when extracted text is too short', async () => {
    vi.mocked(extractTextFromResume).mockResolvedValueOnce({
      text: 'Short',
      confidence: 0.5,
      pageCount: 1,
    });

    const event = makeEvent({
      body: JSON.stringify({ s3Key: 'resumes/2024/01/empty.pdf' }),
    });
    const result = await analyzeHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(422);
    expect(body.error.code).toBe('TEXTRACT_ERROR');
    expect(body.error.message).toContain('sufficient text');
  });

  // TC-ANALYZE-008
  it('returns LLM_PARSE_ERROR when LLM parsing fails', async () => {
    vi.mocked(parseResume).mockRejectedValueOnce(new Error('Invalid LLM output'));

    const event = makeEvent({
      body: JSON.stringify({ s3Key: 'resumes/2024/01/abc.pdf' }),
    });
    const result = await analyzeHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(422);
    expect(body.error.code).toBe('LLM_PARSE_ERROR');
  });

  it('rejects empty body', async () => {
    const event = makeEvent({ body: undefined });
    const result = await analyzeHandler(event);
    expect(result.statusCode).toBe(400);
  });

  it('takes minimum of Textract and LLM confidence', async () => {
    vi.mocked(extractTextFromResume).mockResolvedValueOnce({
      text: 'A'.repeat(100),
      confidence: 0.7,
      pageCount: 1,
    });
    vi.mocked(parseResume).mockResolvedValueOnce({
      output: {
        fullName: 'Test',
        email: null,
        phone: null,
        location: null,
        primarySkills: ['react'],
        primarySkillYears: { react: 2 },
        secondarySkills: [],
        totalExperience: 2,
        seniority: 'junior',
        availability: 'negotiable',
        industries: [],
        roles: [],
        education: [],
        certifications: [],
        summary: null,
      },
      confidence: 0.5,
    });

    const event = makeEvent({
      body: JSON.stringify({ s3Key: 'resumes/2024/01/test.pdf' }),
    });
    const result = await analyzeHandler(event);
    const body = parseBody(result);

    expect(body.data.confidence).toBe(0.5); // min(0.7, 0.5)
  });
});

// ---------------------------------------------------------------------------
// POST /candidate/save-profile
// TC-PROFILE-001 through TC-PROFILE-026
// ---------------------------------------------------------------------------

describe('POST /candidate/save-profile', () => {
  const validRequest = {
    profile: {
      fullName: 'John Doe',
      email: 'john@example.com',
      primarySkills: ['javascript', 'react'],
      primarySkillYears: { javascript: 5, react: 4 },
      totalExperience: 6,
      seniority: 'senior',
      availability: 'immediate',
    },
    resumeS3Key: 'resumes/2024/01/abc.pdf',
  };

  // TC-PROFILE-001
  it('saves new candidate profile successfully', async () => {
    const event = makeEvent({ body: JSON.stringify(validRequest) });
    const result = await saveProfileHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.candidateId).toMatch(/^cand_/);
    expect(body.data.lastUpdated).toBeDefined();
  });

  // TC-PROFILE-002
  it('auto-generates candidateId when omitted', async () => {
    const event = makeEvent({ body: JSON.stringify(validRequest) });
    const result = await saveProfileHandler(event);
    const body = parseBody(result);

    expect(body.data.candidateId).toMatch(/^cand_/);
  });

  // TC-PROFILE-003
  it('uses provided candidateId', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        ...validRequest,
        candidateId: '550e8400-e29b-41d4-a716-446655440000',
      }),
    });
    const result = await saveProfileHandler(event);
    const body = parseBody(result);

    expect(body.data.candidateId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  // TC-PROFILE-012
  it('rejects missing fullName', async () => {
    const { fullName, ...noName } = validRequest.profile;
    const event = makeEvent({
      body: JSON.stringify({ profile: noName, resumeS3Key: validRequest.resumeS3Key }),
    });
    const result = await saveProfileHandler(event);
    expect(result.statusCode).toBe(400);
  });

  // TC-PROFILE-013
  it('rejects empty primarySkills', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        profile: { ...validRequest.profile, primarySkills: [] },
        resumeS3Key: validRequest.resumeS3Key,
      }),
    });
    const result = await saveProfileHandler(event);
    expect(result.statusCode).toBe(400);
  });

  it('rejects empty body', async () => {
    const event = makeEvent({ body: undefined });
    const result = await saveProfileHandler(event);
    expect(result.statusCode).toBe(400);
    const body = parseBody(result);
    expect(body.error.message).toBe('Request body is required');
  });

  it('rejects invalid JSON body', async () => {
    const event = makeEvent({ body: 'not json' });
    const result = await saveProfileHandler(event);
    expect(result.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /candidate/save-profile — skillSynonyms persistence (ticket #281)
// ---------------------------------------------------------------------------

describe('POST /candidate/save-profile — skillSynonyms (#281)', () => {
  const baseProfile = {
    fullName: 'John Doe',
    email: 'john@example.com',
    primarySkills: ['react'],
    primarySkillYears: { react: 4 },
    totalExperience: 6,
    seniority: 'senior',
    availability: 'immediate',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Force the DynamoDB write path (setup.ts sets IS_OFFLINE=true, which skips it).
    process.env.IS_OFFLINE = 'false';
    vi.mocked(getCandidateByEmail).mockResolvedValue(null);
  });

  afterEach(() => {
    process.env.IS_OFFLINE = 'true';
  });

  it('persists a non-empty skill_synonyms map when skillSynonyms is provided', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        profile: { ...baseProfile, skillSynonyms: { react: ['reactjs', 'react.js'] } },
        resumeS3Key: 'resumes/2024/01/abc.pdf',
      }),
    });
    const result = await saveProfileHandler(event);

    expect(result.statusCode).toBe(200);
    expect(saveCandidateProfile).toHaveBeenCalledOnce();
    const savedItem = vi.mocked(saveCandidateProfile).mock.calls[0][0];
    expect(savedItem.skill_synonyms).toEqual({ react: ['reactjs', 'react.js'] });
  });

  // Edge case C — synonym keys (and values) go through normalization before write.
  it('normalizes mixed-case synonym keys before persisting', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        profile: { ...baseProfile, skillSynonyms: { React: ['ReactJS'] } },
        resumeS3Key: 'resumes/2024/01/abc.pdf',
      }),
    });
    const result = await saveProfileHandler(event);

    expect(result.statusCode).toBe(200);
    const savedItem = vi.mocked(saveCandidateProfile).mock.calls[0][0];
    // Key normalized from "React" → "react"; value normalized from "ReactJS" → "reactjs".
    expect(savedItem.skill_synonyms).toEqual({ react: ['reactjs'] });
    expect(savedItem.skill_synonyms).not.toHaveProperty('React');
  });

  // Edge case B — re-save without synonyms must preserve the stored map.
  it('preserves existing skill_synonyms on re-save when skillSynonyms is omitted', async () => {
    vi.mocked(getCandidateByEmail).mockResolvedValue({
      candidate_id: 'cand_existing',
      email: 'john@example.com',
      skill_synonyms: { react: ['reactjs'] },
    } as never);

    const event = makeEvent({
      body: JSON.stringify({
        profile: { ...baseProfile },
        resumeS3Key: 'resumes/2024/01/abc.pdf',
      }),
    });
    const result = await saveProfileHandler(event);

    expect(result.statusCode).toBe(200);
    const savedItem = vi.mocked(saveCandidateProfile).mock.calls[0][0];
    expect(savedItem.skill_synonyms).toEqual({ react: ['reactjs'] });
  });
});

// ---------------------------------------------------------------------------
// GET /candidate/profile/{candidateId}
// TC-PROFILE-022 through TC-PROFILE-024
// ---------------------------------------------------------------------------

describe('GET /candidate/profile/{candidateId}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-PROFILE-022
  it('returns candidate profile with camelCase fields', async () => {
    vi.mocked(getCandidateById).mockResolvedValueOnce({
      candidate_id: 'cand_123',
      user_id: 'user_456',
      full_name: 'John Doe',
      email: 'john@example.com',
      phone: '+91-9876543210',
      location: 'Bangalore, India',
      primary_skills: ['react', 'nodejs'],
      primary_skill_years: { react: 4, nodejs: 3 },
      secondary_skills: ['aws'],
      total_experience: 6,
      seniority: 'senior',
      availability: 'immediate',
      industries: ['fintech'],
      roles: ['Developer'],
      education: [{ degree: 'B.Tech', institution: 'IIT', year: 2018 }],
      certifications: ['AWS SA'],
      summary: 'Senior dev',
      experience_bucket: '6-10',
      resume_s3_key: 'resumes/2024/01/abc.pdf',
      created_at: '2024-01-10T08:00:00Z',
      last_updated: '2024-01-15T10:30:00Z',
    });

    const event = makeEvent({
      pathParameters: { candidateId: 'cand_123' },
    });
    const result = await getProfileHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    // TC-PROFILE-024: verify camelCase transformation
    expect(body.data.candidateId).toBe('cand_123');
    expect(body.data.fullName).toBe('John Doe');
    expect(body.data.primarySkills).toEqual(['react', 'nodejs']);
    expect(body.data.totalExperience).toBe(6);
    expect(body.data.resumeS3Key).toBe('resumes/2024/01/abc.pdf');
    expect(body.data.createdAt).toBe('2024-01-10T08:00:00Z');
    expect(body.data.lastUpdated).toBe('2024-01-15T10:30:00Z');
  });

  // TC-PROFILE-023
  it('returns 404 for non-existent candidate', async () => {
    vi.mocked(getCandidateById).mockResolvedValueOnce(null);

    const event = makeEvent({
      pathParameters: { candidateId: 'nonexistent' },
    });
    const result = await getProfileHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when candidateId missing', async () => {
    const event = makeEvent({ pathParameters: {} });
    const result = await getProfileHandler(event);
    expect(result.statusCode).toBe(400);
  });

  it('returns lastWorkingDay as date string when set', async () => {
    vi.mocked(getCandidateById).mockResolvedValueOnce({
      candidate_id: 'cand_lwd',
      user_id: 'user_1',
      full_name: 'Jane Doe',
      last_working_day: '2025-06-15',
      experience_bucket: '3-5',
    });

    const event = makeEvent({ pathParameters: { candidateId: 'cand_lwd' } });
    const result = await getProfileHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.data.lastWorkingDay).toBe('2025-06-15');
  });

  it('returns lastWorkingDay as null when attribute absent (still on job)', async () => {
    vi.mocked(getCandidateById).mockResolvedValueOnce({
      candidate_id: 'cand_soj',
      user_id: 'user_1',
      full_name: 'Bob Smith',
      experience_bucket: '6-10',
    });

    const event = makeEvent({ pathParameters: { candidateId: 'cand_soj' } });
    const result = await getProfileHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.data.lastWorkingDay).toBeNull();
  });
});
