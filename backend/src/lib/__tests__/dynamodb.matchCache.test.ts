import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RankedMatchEntry } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Mocks — a tiny in-memory DynamoDB stand-in keyed by requirement_id so the
// match-cache access layer can be round-tripped end to end.
// ---------------------------------------------------------------------------

const { mockSend, store } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  store: new Map<string, Record<string, unknown>>(),
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
    dynamodb: { requirementMatchCacheTable: 'RequirementMatchCache-test' },
  },
}));

import { getMatchCache, putMatchCache, deleteMatchCache } from '../dynamodb.js';

interface MockCommand {
  __type: string;
  input: {
    TableName: string;
    Key?: { requirement_id: string };
    Item?: Record<string, unknown> & { requirement_id: string };
  };
}

beforeEach(() => {
  store.clear();
  mockSend.mockReset();
  mockSend.mockImplementation(async (command: MockCommand) => {
    const { __type, input } = command;
    switch (__type) {
      case 'Put':
        store.set(input.Item!.requirement_id, input.Item!);
        return {};
      case 'Get':
        return { Item: store.get(input.Key!.requirement_id) };
      case 'Delete':
        store.delete(input.Key!.requirement_id);
        return {};
      default:
        return {};
    }
  });
});

const sampleList: RankedMatchEntry[] = [
  { candidate_id: 'cand_1', rank: 1, score: 0.95 },
  { candidate_id: 'cand_2', rank: 2, score: 0.81 },
  { candidate_id: 'cand_3', rank: 3, score: 0.74 },
];

describe('match cache access layer', () => {
  it('getMatchCache returns the stored ranked list when an entry exists', async () => {
    await putMatchCache('req_1', sampleList);
    const result = await getMatchCache('req_1');
    expect(result).toEqual(sampleList);
  });

  it('getMatchCache returns null when no entry exists', async () => {
    const result = await getMatchCache('req_missing');
    expect(result).toBeNull();
  });

  it('putMatchCache stores the ranked list atomically and round-trips intact', async () => {
    await putMatchCache('req_1', sampleList);
    const result = await getMatchCache('req_1');
    expect(result).toHaveLength(3);
    expect(result).toEqual([
      { candidate_id: 'cand_1', rank: 1, score: 0.95 },
      { candidate_id: 'cand_2', rank: 2, score: 0.81 },
      { candidate_id: 'cand_3', rank: 3, score: 0.74 },
    ]);
  });

  it('putMatchCache replaces (not appends to) an existing entry', async () => {
    await putMatchCache('req_1', sampleList);
    const secondList: RankedMatchEntry[] = [
      { candidate_id: 'cand_9', rank: 1, score: 0.99 },
    ];
    await putMatchCache('req_1', secondList);
    const result = await getMatchCache('req_1');
    expect(result).toEqual(secondList);
  });

  it('deleteMatchCache removes the entry for the given requirement ID', async () => {
    await putMatchCache('req_1', sampleList);
    await deleteMatchCache('req_1');
    const result = await getMatchCache('req_1');
    expect(result).toBeNull();
  });

  it('deleteMatchCache is idempotent on a non-existent requirement ID', async () => {
    await expect(deleteMatchCache('req_never_written')).resolves.toBeUndefined();
  });

  it('round-trips an empty ranked list without error', async () => {
    await putMatchCache('req_empty', []);
    const result = await getMatchCache('req_empty');
    expect(result).toEqual([]);
  });

  it('preserves ranked order through storage and retrieval', async () => {
    const ordered: RankedMatchEntry[] = Array.from({ length: 50 }, (_, i) => ({
      candidate_id: `cand_${i}`,
      rank: i + 1,
      score: 1 - i / 100,
    }));
    await putMatchCache('req_ordered', ordered);
    const result = await getMatchCache('req_ordered');
    expect(result!.map((e) => e.candidate_id)).toEqual(ordered.map((e) => e.candidate_id));
  });

  it('round-trips a large ranked list (~3,500 entries) without truncation', async () => {
    const large: RankedMatchEntry[] = Array.from({ length: 3500 }, (_, i) => ({
      candidate_id: `cand_${i}`,
      rank: i + 1,
      score: Math.max(0, 1 - i / 3500),
    }));
    await putMatchCache('req_large', large);
    const result = await getMatchCache('req_large');
    expect(result).toHaveLength(3500);
    expect(result![0]).toEqual(large[0]);
    expect(result![3499]).toEqual(large[3499]);
  });

  it('reads and writes use the match-cache table (not requirements/shortlists)', async () => {
    await putMatchCache('req_1', sampleList);
    await getMatchCache('req_1');
    await deleteMatchCache('req_1');
    for (const call of mockSend.mock.calls) {
      expect((call[0] as MockCommand).input.TableName).toBe('RequirementMatchCache-test');
    }
  });
});
