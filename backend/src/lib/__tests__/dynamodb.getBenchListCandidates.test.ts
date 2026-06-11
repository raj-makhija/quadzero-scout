import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — capture the Scan input so we can assert the ProjectionExpression
// requests `expected_ctc` (needed for indicative billing-rate computation).
// ---------------------------------------------------------------------------

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  GetCommand: vi.fn((input: unknown) => ({ __type: 'Get', input })),
  PutCommand: vi.fn((input: unknown) => ({ __type: 'Put', input })),
  DeleteCommand: vi.fn((input: unknown) => ({ __type: 'Delete', input })),
  QueryCommand: vi.fn((input: unknown) => ({ __type: 'Query', input })),
  ScanCommand: vi.fn((input: unknown) => ({ __type: 'Scan', input })),
  UpdateCommand: vi.fn((input: unknown) => ({ __type: 'Update', input })),
}));

vi.mock('../config.js', () => ({
  config: {
    region: 'ap-south-1',
    dynamodb: { talentProfilesTable: 'TalentProfiles-test' },
  },
}));

import { getBenchListCandidates } from '../dynamodb.js';

interface ScanInput {
  ProjectionExpression: string;
}

let lastScanInput: ScanInput | undefined;

beforeEach(() => {
  mockSend.mockReset();
  lastScanInput = undefined;
  mockSend.mockImplementation(async (command: { __type: string; input: ScanInput }) => {
    if (command.__type !== 'Scan') return {};
    lastScanInput = command.input;
    return { Items: [] }; // single empty page
  });
});

describe('getBenchListCandidates', () => {
  it('requests expected_ctc in the Scan ProjectionExpression', async () => {
    await getBenchListCandidates();
    expect(lastScanInput?.ProjectionExpression).toContain('expected_ctc');
  });
});
