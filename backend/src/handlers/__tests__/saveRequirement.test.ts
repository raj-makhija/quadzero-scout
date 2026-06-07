import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSaveRequirement = vi.fn();

vi.mock('../../lib/dynamodb.js', () => ({
  saveRequirement: (...args: unknown[]) => mockSaveRequirement(...args),
}));

vi.mock('../../lib/auth.js', () => ({
  withAuth: (
    _roles: string[],
    handler: (event: unknown) => Promise<unknown>
  ) => handler,
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { handler } from '../recruiter/saveRequirement.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validBody = {
  clientName: 'Acme Corp',
  engagementModel: 'full_time_contract',
  payroll: 'quadzero',
  jdText: 'Looking for a React developer with 3+ years experience.',
  parsedCriteria: {
    mustHaveSkills: ['react'],
    goodToHaveSkills: ['typescript'],
    minExperience: 3,
    maxExperience: null,
    seniority: ['mid'],
    availability: ['immediate'],
    location: null,
    remote: false,
    industries: [],
    roles: ['Frontend Developer'],
    rateRaw: null,
    rateUnit: null,
    rateLpa: null,
    clientName: null,
    endClient: null,
    engagementModel: null,
    payroll: null,
    budgetMinLpa: null,
    budgetMaxLpa: null,
    coreSkill: 'react',
    contractDurationMonths: null,
    paymentTermsDays: null,
    confidence: 0.9,
    suggestions: [],
  },
};

function makeEvent(
  body: unknown,
  userId = 'rec_creator'
): APIGatewayProxyEventV2 & { auth: { userId: string; role: string; isInternal: boolean } } {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/recruiter/requirements',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'localhost',
      domainPrefix: '',
      http: { method: 'POST', path: '/recruiter/requirements', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '',
      timeEpoch: 0,
    },
    isBase64Encoded: false,
    body: JSON.stringify(body),
    auth: { userId, role: 'recruiter', isInternal: false },
  } as never;
}

function parseBody(result: { body?: string }) {
  return JSON.parse(result.body || '{}');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('saveRequirement handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveRequirement.mockResolvedValue(undefined);
  });

  it('TC-SAVEREQ-001: sets notify_recruiter_ids to [recruiterId] by default on new requirement', async () => {
    const event = makeEvent(validBody, 'rec_creator');
    const result = await handler(event as never);
    const body = parseBody(result as { body?: string });

    expect(body.success).toBe(true);
    expect(mockSaveRequirement).toHaveBeenCalledOnce();

    const savedItem = mockSaveRequirement.mock.calls[0][0];
    expect(savedItem.notify_recruiter_ids).toEqual(['rec_creator']);
  });

  it('TC-SAVEREQ-002: returns requirementId and createdAt on success', async () => {
    const event = makeEvent(validBody, 'rec_creator');
    const result = await handler(event as never);
    const body = parseBody(result as { body?: string });

    expect(body.success).toBe(true);
    expect(body.data.requirementId).toBeDefined();
    expect(body.data.createdAt).toBeDefined();
  });

  it('TC-SAVEREQ-003: sets recruiter_id to the authenticated user ID', async () => {
    const event = makeEvent(validBody, 'rec_xyz');
    await handler(event as never);

    const savedItem = mockSaveRequirement.mock.calls[0][0];
    expect(savedItem.recruiter_id).toBe('rec_xyz');
    expect(savedItem.notify_recruiter_ids).toEqual(['rec_xyz']);
  });

  it('TC-SAVEREQ-004: normalizes parsed_criteria.location to city-only', async () => {
    const bodyWithCity = {
      ...validBody,
      parsedCriteria: { ...validBody.parsedCriteria, location: 'Mumbai, India' },
    };
    const event = makeEvent(bodyWithCity, 'rec_creator');
    await handler(event as never);

    const savedItem = mockSaveRequirement.mock.calls[0][0];
    expect(savedItem.parsed_criteria.location).toBe('Mumbai');
  });

  it('TC-SAVEREQ-005: preserves null location in parsed_criteria', async () => {
    const event = makeEvent(validBody, 'rec_creator');
    await handler(event as never);

    const savedItem = mockSaveRequirement.mock.calls[0][0];
    expect(savedItem.parsed_criteria.location).toBeNull();
  });

  // ticket #281 — JD synonyms must survive into the persisted parsed_criteria
  it('TC-SAVEREQ-281: persists a non-empty skillSynonyms map under parsed_criteria', async () => {
    const bodyWithSynonyms = {
      ...validBody,
      parsedCriteria: {
        ...validBody.parsedCriteria,
        skillSynonyms: { react: ['reactjs', 'react.js'], typescript: ['ts'] },
      },
    };
    const event = makeEvent(bodyWithSynonyms, 'rec_creator');
    await handler(event as never);

    const savedItem = mockSaveRequirement.mock.calls[0][0];
    expect(savedItem.parsed_criteria.skillSynonyms).toEqual({
      react: ['reactjs', 'react.js'],
      typescript: ['ts'],
    });
  });
});
