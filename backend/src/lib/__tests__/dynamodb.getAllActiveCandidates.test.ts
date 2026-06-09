import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CandidateItem } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Mocks — a Scan stand-in that models DynamoDB's *server-side* FilterExpression
// so we exercise the real failure: candidates carry no `is_active` attribute,
// so a Scan that filters on `is_active = true` returns nothing.
// ---------------------------------------------------------------------------

const { mockSend, dataset } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  // Real-shaped candidates: none carry an `is_active` attribute (matches prod/qa
  // data — candidates are never written with that field).
  dataset: [
    { candidate_id: 'cand_1', full_name: 'A' },
    { candidate_id: 'cand_2', full_name: 'B' },
    { candidate_id: 'cand_3', full_name: 'C' },
  ] as unknown as CandidateItem[],
}));

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

import { getAllActiveCandidates } from '../dynamodb.js';

interface ScanInput {
  TableName: string;
  FilterExpression?: string;
  ExpressionAttributeValues?: Record<string, unknown>;
}

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockImplementation(async (command: { __type: string; input: ScanInput }) => {
    if (command.__type !== 'Scan') return {};
    let items = dataset as Array<Record<string, unknown>>;
    // Model DynamoDB applying the FilterExpression server-side.
    if (command.input.FilterExpression === 'is_active = :active') {
      const want = command.input.ExpressionAttributeValues?.[':active'];
      items = items.filter((it) => it.is_active === want);
    }
    return { Items: items }; // single page (no LastEvaluatedKey)
  });
});

describe('getAllActiveCandidates', () => {
  it('returns candidates that carry no is_active attribute (no is_active filter)', async () => {
    const result = await getAllActiveCandidates();
    expect(result.map((c) => c.candidate_id)).toEqual(['cand_1', 'cand_2', 'cand_3']);
  });
});
