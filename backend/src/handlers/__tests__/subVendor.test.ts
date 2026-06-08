import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks - must be declared before handler imports
// ---------------------------------------------------------------------------

const mockSaveSubVendor = vi.fn().mockResolvedValue(undefined);
const mockGetSubVendorByName = vi.fn().mockResolvedValue(null);
const mockGetSubVendorById = vi.fn().mockResolvedValue(null);
const mockListSubVendors = vi.fn().mockResolvedValue([]);
const mockUpdateSubVendor = vi.fn().mockResolvedValue(undefined);
const mockSaveCandidateProfile = vi.fn().mockResolvedValue(undefined);
const mockGetCandidateByEmail = vi.fn().mockResolvedValue(null);
const mockGetExperienceBucket = vi.fn((years: number) => {
  if (years <= 2) return '0-2';
  if (years <= 5) return '3-5';
  if (years <= 10) return '6-10';
  if (years <= 15) return '11-15';
  return '16+';
});
const mockGetCandidateById = vi.fn().mockResolvedValue(null);

vi.mock('../../lib/dynamodb.js', () => ({
  getLlmRerank: vi.fn().mockResolvedValue(null),
  putLlmRerank: vi.fn().mockResolvedValue(undefined),
  deleteLlmRerank: vi.fn().mockResolvedValue(undefined),
  saveSubVendor: (...args: unknown[]) => mockSaveSubVendor(...args),
  getSubVendorByName: (...args: unknown[]) => mockGetSubVendorByName(...args),
  getSubVendorById: (...args: unknown[]) => mockGetSubVendorById(...args),
  listSubVendors: (...args: unknown[]) => mockListSubVendors(...args),
  updateSubVendor: (...args: unknown[]) => mockUpdateSubVendor(...args),
  saveCandidateProfile: (...args: unknown[]) => mockSaveCandidateProfile(...args),
  getCandidateByEmail: (...args: unknown[]) => mockGetCandidateByEmail(...args),
  getExperienceBucket: (...args: unknown[]) => mockGetExperienceBucket(...args),
  getCandidateById: (...args: unknown[]) => mockGetCandidateById(...args),
}));

vi.mock('../../lib/auth.js', () => ({
  withAuth: (_roles: string[], handler: Function) => handler,
}));

vi.mock('../../lib/audit.js', () => ({
  logAuditEvent: vi.fn(),
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
  normalizeSkills: vi.fn((skills: string[]) => skills),
  normalizeSkillYears: vi.fn((years: Record<string, number>) => years),
}));

vi.mock('../../lib/s3.js', () => ({
  generateUploadUrl: vi.fn(),
  generateDownloadUrl: vi.fn(),
  getObject: vi.fn(),
  extractFileNameFromKey: vi.fn(),
  deleteObject: vi.fn(),
}));

// Import handlers after mocks
import { handler as saveSubVendorHandler } from '../recruiter/saveSubVendor.js';
import { handler as listSubVendorsHandler } from '../recruiter/listSubVendors.js';
import { handler as updateSubVendorHandler } from '../recruiter/updateSubVendor.js';
import { handler as getSubVendorNamesHandler } from '../recruiter/getSubVendorNames.js';
import { handler as saveProfileHandler } from '../candidate/saveProfile.js';

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
    auth: {
      userId: 'user_recruiter_1',
      email: 'recruiter@quadzero.com',
      role: 'recruiter',
      name: 'Test Recruiter',
      isInternal: true,
    },
    ...overrides,
  } as APIGatewayProxyEventV2;
}

function parseBody(result: { body?: string }) {
  return JSON.parse(result.body || '{}');
}

// ---------------------------------------------------------------------------
// POST /recruiter/sub-vendors
// TC-SV-001 through TC-SV-003
// ---------------------------------------------------------------------------

describe('POST /recruiter/sub-vendors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSubVendorByName.mockResolvedValue(null);
  });

  // TC-SV-001
  it('creates sub-vendor with valid data', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        subVendorName: 'TechStaff Solutions',
        contactPersonName: 'Ravi Kumar',
        contactPersonPhone: '+91-9876543210',
        contactPersonEmail: 'ravi@techstaff.com',
        notes: 'Java specialists',
      }),
    });
    const result = await saveSubVendorHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.subVendorId).toBeDefined();
    expect(body.data.subVendorName).toBe('TechStaff Solutions');
    expect(body.data.contactPersonName).toBe('Ravi Kumar');
    expect(body.data.contactPersonPhone).toBe('+91-9876543210');
    expect(body.data.contactPersonEmail).toBe('ravi@techstaff.com');
    expect(body.data.notes).toBe('Java specialists');
    expect(body.data.createdAt).toBeDefined();
    expect(body.data.lastUpdated).toBeDefined();
    expect(mockSaveSubVendor).toHaveBeenCalledTimes(1);
  });

  // TC-SV-002
  it('rejects duplicate sub-vendor name (case-insensitive)', async () => {
    mockGetSubVendorByName.mockResolvedValueOnce({
      sub_vendor_id: 'existing-id',
      sub_vendor_name: 'TechStaff Solutions',
      sub_vendor_name_lower: 'techstaff solutions',
      created_by: 'user_1',
      created_at: '2024-01-10T08:00:00Z',
      last_updated: '2024-01-10T08:00:00Z',
    });

    const event = makeEvent({
      body: JSON.stringify({
        subVendorName: 'techstaff solutions',
      }),
    });
    const result = await saveSubVendorHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('already exists');
    expect(mockSaveSubVendor).not.toHaveBeenCalled();
  });

  // TC-SV-003
  it('rejects create with missing sub-vendor name', async () => {
    const event = makeEvent({
      body: JSON.stringify({}),
    });
    const result = await saveSubVendorHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects empty request body', async () => {
    const event = makeEvent({ body: undefined });
    const result = await saveSubVendorHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.error.message).toBe('Request body is required');
  });

  it('rejects invalid JSON body', async () => {
    const event = makeEvent({ body: '{invalid json' });
    const result = await saveSubVendorHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.error.message).toBe('Invalid JSON in request body');
  });
});

// ---------------------------------------------------------------------------
// GET /recruiter/sub-vendors
// TC-SV-004
// ---------------------------------------------------------------------------

describe('GET /recruiter/sub-vendors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-SV-004
  it('lists all sub-vendors', async () => {
    mockListSubVendors.mockResolvedValueOnce([
      {
        sub_vendor_id: 'sv_1',
        sub_vendor_name: 'TechStaff Solutions',
        sub_vendor_name_lower: 'techstaff solutions',
        contact_person_name: 'Ravi Kumar',
        contact_person_phone: '+91-9876543210',
        contact_person_email: 'ravi@techstaff.com',
        notes: 'Java specialists',
        created_by: 'user_1',
        created_at: '2024-01-10T08:00:00Z',
        last_updated: '2024-01-15T10:30:00Z',
      },
      {
        sub_vendor_id: 'sv_2',
        sub_vendor_name: 'CodeBridge',
        sub_vendor_name_lower: 'codebridge',
        contact_person_name: null,
        contact_person_phone: null,
        contact_person_email: null,
        notes: null,
        created_by: 'user_1',
        created_at: '2024-01-12T09:00:00Z',
        last_updated: '2024-01-12T09:00:00Z',
      },
    ]);

    const event = makeEvent();
    const result = await listSubVendorsHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.subVendors).toHaveLength(2);
    expect(body.data.subVendors[0].subVendorId).toBe('sv_1');
    expect(body.data.subVendors[0].subVendorName).toBe('TechStaff Solutions');
    expect(body.data.subVendors[0].contactPersonName).toBe('Ravi Kumar');
    expect(body.data.subVendors[1].subVendorId).toBe('sv_2');
    expect(body.data.subVendors[1].subVendorName).toBe('CodeBridge');
  });

  it('returns empty array when no sub-vendors exist', async () => {
    mockListSubVendors.mockResolvedValueOnce([]);

    const event = makeEvent();
    const result = await listSubVendorsHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.data.subVendors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PUT /recruiter/sub-vendors/{subVendorId}
// TC-SV-005, TC-SV-006
// ---------------------------------------------------------------------------

describe('PUT /recruiter/sub-vendors/{subVendorId}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-SV-005
  it('updates sub-vendor with valid data', async () => {
    const event = makeEvent({
      pathParameters: { subVendorId: 'sv_1' },
      body: JSON.stringify({
        contactPersonName: 'Priya Sharma',
        contactPersonPhone: '+91-9876543211',
        notes: 'Updated contact',
      }),
    });
    const result = await updateSubVendorHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.updated).toBe(true);
    expect(mockUpdateSubVendor).toHaveBeenCalledWith('sv_1', {
      contactPersonName: 'Priya Sharma',
      contactPersonPhone: '+91-9876543211',
      contactPersonEmail: undefined,
      notes: 'Updated contact',
    });
  });

  // TC-SV-006
  it('returns 404 for non-existent sub-vendor', async () => {
    const conditionalError = new Error('ConditionalCheckFailedException');
    conditionalError.name = 'ConditionalCheckFailedException';
    mockUpdateSubVendor.mockRejectedValueOnce(conditionalError);

    const event = makeEvent({
      pathParameters: { subVendorId: 'nonexistent-id' },
      body: JSON.stringify({ notes: 'test' }),
    });
    const result = await updateSubVendorHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when subVendorId missing from path', async () => {
    const event = makeEvent({
      pathParameters: {},
      body: JSON.stringify({ notes: 'test' }),
    });
    const result = await updateSubVendorHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.error.message).toBe('subVendorId is required');
  });

  it('returns 400 when body is missing', async () => {
    const event = makeEvent({
      pathParameters: { subVendorId: 'sv_1' },
      body: undefined,
    });
    const result = await updateSubVendorHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.error.message).toBe('Request body is required');
  });
});

// ---------------------------------------------------------------------------
// GET /recruiter/sub-vendor-names
// TC-SV-007
// ---------------------------------------------------------------------------

describe('GET /recruiter/sub-vendor-names', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-SV-007
  it('returns sub-vendor names for dropdown', async () => {
    mockListSubVendors.mockResolvedValueOnce([
      {
        sub_vendor_id: 'sv_1',
        sub_vendor_name: 'TechStaff Solutions',
        sub_vendor_name_lower: 'techstaff solutions',
        contact_person_name: 'Ravi Kumar',
        contact_person_phone: '+91-9876543210',
        contact_person_email: 'ravi@techstaff.com',
        notes: 'Java specialists',
        created_by: 'user_1',
        created_at: '2024-01-10T08:00:00Z',
        last_updated: '2024-01-15T10:30:00Z',
      },
    ]);

    const event = makeEvent();
    const result = await getSubVendorNamesHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.subVendors).toHaveLength(1);
    expect(body.data.subVendors[0].subVendorId).toBe('sv_1');
    expect(body.data.subVendors[0].subVendorName).toBe('TechStaff Solutions');
    // Should NOT include contact details
    expect(body.data.subVendors[0].contactPersonName).toBeUndefined();
    expect(body.data.subVendors[0].contactPersonPhone).toBeUndefined();
    expect(body.data.subVendors[0].notes).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// POST /candidate/save-profile — sub-vendor integration
// TC-SV-008, TC-SV-009
// ---------------------------------------------------------------------------

describe('POST /candidate/save-profile (sub-vendor)', () => {
  const baseProfile = {
    fullName: 'John Doe',
    primarySkills: ['javascript', 'react'],
    primarySkillYears: { javascript: 5, react: 4 },
    totalExperience: 6,
    seniority: 'senior',
    availability: 'immediate',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCandidateByEmail.mockResolvedValue(null);
    mockGetCandidateById.mockResolvedValue(null);
    mockGetSubVendorById.mockResolvedValue(null);
  });

  // TC-SV-008
  it('saves profile with subVendorId and no email', async () => {
    mockGetSubVendorById.mockResolvedValueOnce({
      sub_vendor_id: 'sv_1',
      sub_vendor_name: 'TechStaff Solutions',
      sub_vendor_name_lower: 'techstaff solutions',
      contact_person_name: 'Ravi Kumar',
      contact_person_phone: '+91-9876543210',
      contact_person_email: 'ravi@techstaff.com',
      notes: 'Java specialists',
      created_by: 'user_1',
      created_at: '2024-01-10T08:00:00Z',
      last_updated: '2024-01-15T10:30:00Z',
    });

    const event = makeEvent({
      body: JSON.stringify({
        profile: {
          ...baseProfile,
          subVendorId: 'sv_1',
          // no email provided
        },
        resumeS3Key: 'resumes/2024/01/abc.pdf',
      }),
    });
    const result = await saveProfileHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.candidateId).toBeDefined();
  });

  // TC-SV-009
  it('rejects profile without subVendorId and without email', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        profile: {
          ...baseProfile,
          // no email, no subVendorId
        },
        resumeS3Key: 'resumes/2024/01/abc.pdf',
      }),
    });
    const result = await saveProfileHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('saves profile with both subVendorId and email', async () => {
    mockGetSubVendorById.mockResolvedValueOnce({
      sub_vendor_id: 'sv_1',
      sub_vendor_name: 'TechStaff Solutions',
      sub_vendor_name_lower: 'techstaff solutions',
      contact_person_name: 'Ravi Kumar',
      contact_person_phone: '+91-9876543210',
      contact_person_email: 'ravi@techstaff.com',
      notes: null,
      created_by: 'user_1',
      created_at: '2024-01-10T08:00:00Z',
      last_updated: '2024-01-15T10:30:00Z',
    });

    const event = makeEvent({
      body: JSON.stringify({
        profile: {
          ...baseProfile,
          email: 'john@example.com',
          subVendorId: 'sv_1',
        },
        resumeS3Key: 'resumes/2024/01/abc.pdf',
      }),
    });
    const result = await saveProfileHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
  });

  it('rejects profile with invalid subVendorId (not found)', async () => {
    mockGetSubVendorById.mockResolvedValueOnce(null);

    const event = makeEvent({
      body: JSON.stringify({
        profile: {
          ...baseProfile,
          subVendorId: 'sv_nonexistent',
        },
        resumeS3Key: 'resumes/2024/01/abc.pdf',
      }),
    });
    const result = await saveProfileHandler(event);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.error.message).toContain('Sub-vendor not found');
  });
});
