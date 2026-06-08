import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequirementLlmRerankItem } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Mocks — a tiny in-memory DynamoDB stand-in keyed by (table, requirement_id)
// so the LLM re-rank access layer can be round-tripped end to end, and the
// rerank/match-cache tables can be shown to be independent.
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
    dynamodb: {
      requirementLlmRerankTable: 'RequirementLlmRerank-test',
      requirementMatchCacheTable: 'RequirementMatchCache-test',
    },
  },
}));

import {
  getLlmRerank,
  putLlmRerank,
  deleteLlmRerank,
  putMatchCache,
  getMatchCache,
  deleteMatchCache,
} from '../dynamodb.js';

interface MockCommand {
  __type: string;
  input: {
    TableName: string;
    Key?: { requirement_id: string };
    Item?: Record<string, unknown> & { requirement_id: string };
  };
}

// Key the in-memory store by table so the two tables never collide.
const keyFor = (table: string, id: string) => `${table}#${id}`;

beforeEach(() => {
  store.clear();
  mockSend.mockReset();
  mockSend.mockImplementation(async (command: MockCommand) => {
    const { __type, input } = command;
    switch (__type) {
      case 'Put':
        store.set(keyFor(input.TableName, input.Item!.requirement_id), input.Item!);
        return {};
      case 'Get':
        return { Item: store.get(keyFor(input.TableName, input.Key!.requirement_id)) };
      case 'Delete':
        store.delete(keyFor(input.TableName, input.Key!.requirement_id));
        return {};
      default:
        return {};
    }
  });
});

const sampleRerank: Omit<RequirementLlmRerankItem, 'requirement_id'> = {
  entries: [
    { candidate_id: 'cand_1', llmScore: 92, rationale: 'Strong React and TypeScript depth.' },
    { candidate_id: 'cand_2', llmScore: 78, rationale: 'Good fit but lighter AWS experience.' },
  ],
  top_n_hash: 'hash_abc123',
  model: 'gemini-2.0-flash',
  prompt_version: 3,
  computed_at: '2026-06-08T00:00:00.000Z',
};

describe('LLM re-rank access layer', () => {
  it('getLlmRerank returns the stored entry with all fields round-tripped intact', async () => {
    await putLlmRerank('req_1', sampleRerank);
    const result = await getLlmRerank('req_1');
    expect(result).toEqual({ requirement_id: 'req_1', ...sampleRerank });
    // Spot-check each field the test plan calls out.
    expect(result!.entries[0]).toEqual({
      candidate_id: 'cand_1',
      llmScore: 92,
      rationale: 'Strong React and TypeScript depth.',
    });
    expect(result!.top_n_hash).toBe('hash_abc123');
    expect(result!.model).toBe('gemini-2.0-flash');
    expect(result!.prompt_version).toBe(3);
    expect(result!.computed_at).toBe('2026-06-08T00:00:00.000Z');
  });

  it('getLlmRerank returns null for an unknown requirement ID', async () => {
    const result = await getLlmRerank('req_never_written');
    expect(result).toBeNull();
  });

  it('putLlmRerank replaces (not appends to) an existing entry', async () => {
    await putLlmRerank('req_1', sampleRerank);
    const second: Omit<RequirementLlmRerankItem, 'requirement_id'> = {
      entries: [{ candidate_id: 'cand_9', llmScore: 99, rationale: 'Top pick.' }],
      top_n_hash: 'hash_def456',
      model: 'gemini-2.0-flash',
      prompt_version: 4,
      computed_at: '2026-06-08T01:00:00.000Z',
    };
    await putLlmRerank('req_1', second);
    const result = await getLlmRerank('req_1');
    expect(result).toEqual({ requirement_id: 'req_1', ...second });
    expect(result!.entries).toHaveLength(1);
  });

  it('deleteLlmRerank removes the entry; a second delete is idempotent', async () => {
    await putLlmRerank('req_1', sampleRerank);
    await deleteLlmRerank('req_1');
    expect(await getLlmRerank('req_1')).toBeNull();
    // Second delete on the same (now-empty) key must not throw.
    await expect(deleteLlmRerank('req_1')).resolves.toBeUndefined();
  });

  it('every access function targets the RequirementLlmRerank table exclusively', async () => {
    await putLlmRerank('req_1', sampleRerank);
    await getLlmRerank('req_1');
    await deleteLlmRerank('req_1');
    for (const call of mockSend.mock.calls) {
      expect((call[0] as MockCommand).input.TableName).toBe('RequirementLlmRerank-test');
    }
  });

  it('round-trips a large top-N (50 multi-sentence rationales) without truncation', async () => {
    const large: Omit<RequirementLlmRerankItem, 'requirement_id'> = {
      entries: Array.from({ length: 50 }, (_, i) => ({
        candidate_id: `cand_${i}`,
        llmScore: 100 - i,
        rationale: `Candidate ${i} brings deep expertise. Strong on core skills. Some gaps remain in secondary areas.`,
      })),
      top_n_hash: 'hash_large',
      model: 'gemini-2.0-flash',
      prompt_version: 1,
      computed_at: '2026-06-08T02:00:00.000Z',
    };
    await putLlmRerank('req_large', large);
    const result = await getLlmRerank('req_large');
    expect(result!.entries).toHaveLength(50);
    expect(result!.entries[49]).toEqual(large.entries[49]);
  });

  it('deleteLlmRerank and deleteMatchCache are independent across the two tables', async () => {
    await putLlmRerank('req_1', sampleRerank);
    await putMatchCache('req_1', [{ candidate_id: 'cand_1', rank: 1, score: 0.9 }]);

    // Deleting the re-rank entry must not touch the match-cache entry.
    await deleteLlmRerank('req_1');
    expect(await getLlmRerank('req_1')).toBeNull();
    expect(await getMatchCache('req_1')).toEqual([{ candidate_id: 'cand_1', rank: 1, score: 0.9 }]);

    // And the reverse: deleting the match-cache entry leaves a fresh re-rank intact.
    await putLlmRerank('req_1', sampleRerank);
    await deleteMatchCache('req_1');
    expect(await getMatchCache('req_1')).toBeNull();
    expect(await getLlmRerank('req_1')).toEqual({ requirement_id: 'req_1', ...sampleRerank });
  });
});
