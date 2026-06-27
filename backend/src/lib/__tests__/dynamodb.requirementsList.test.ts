import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RequirementItem } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Mocks — an in-memory DynamoDB stand-in keyed by requirement_id. The Scan
// handler evaluates the FilterExpression the access layer builds so that the
// status-gating behaviour (ticket #499) is exercised end to end, not just
// asserted against the constructed query.
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
    dynamodb: { requirementsTable: 'Requirements-test' },
  },
}));

import {
  getAllRequirementsPaginated,
  getAllActiveRequirements,
  saveRequirement,
  getRequirementById,
} from '../dynamodb.js';

// Minimal DynamoDB FilterExpression evaluator covering the operators the
// requirements access layer emits: =, <>, >=, <= joined by AND.
function matchesFilter(
  item: Record<string, unknown>,
  expr: string | undefined,
  names: Record<string, string>,
  values: Record<string, unknown>
): boolean {
  if (!expr) return true;
  return expr.split(' AND ').every((clauseRaw) => {
    const clause = clauseRaw.trim();
    const m = clause.match(/^(\S+)\s*(<=|>=|<>|=)\s*(\S+)$/);
    if (!m) return true;
    const [, lhs, op, rhs] = m;
    const attr = lhs.startsWith('#') ? names[lhs] : lhs;
    const left = item[attr] as string | number;
    const right = values[rhs] as string | number;
    switch (op) {
      case '=':
        return left === right;
      case '<>':
        return left !== right;
      case '>=':
        return left >= right;
      case '<=':
        return left <= right;
      default:
        return true;
    }
  });
}

interface MockCommand {
  __type: string;
  input: {
    TableName: string;
    Key?: { requirement_id: string };
    Item?: Record<string, unknown> & { requirement_id: string };
    FilterExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  };
}

function makeRequirement(
  id: string,
  status: string,
  createdAt: string,
  extra: Partial<RequirementItem> = {}
): Record<string, unknown> {
  return {
    requirement_id: id,
    recruiter_id: 'rec-1',
    client_name: 'Acme Corp',
    client_name_lower: 'acme corp',
    status,
    created_at: createdAt,
    last_updated: createdAt,
    ...extra,
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
      case 'Scan': {
        const items = [...store.values()].filter((it) =>
          matchesFilter(
            it,
            input.FilterExpression,
            input.ExpressionAttributeNames || {},
            input.ExpressionAttributeValues || {}
          )
        );
        return { Items: items };
      }
      default:
        return {};
    }
  });
});

describe('getAllRequirementsPaginated — discovered exclusion (ticket #499)', () => {
  beforeEach(() => {
    store.set('req-active', makeRequirement('req-active', 'active', '2026-01-03T00:00:00.000Z'));
    store.set('req-discovered', makeRequirement('req-discovered', 'discovered', '2026-01-02T00:00:00.000Z'));
    store.set('req-hold', makeRequirement('req-hold', 'closed_on_hold', '2026-01-01T00:00:00.000Z'));
  });

  it('excludes discovered requirements from the default (no statusFilter) result', async () => {
    const result = await getAllRequirementsPaginated();
    const ids = result.items.map((r) => r.requirement_id);
    expect(ids).toContain('req-active');
    expect(ids).toContain('req-hold');
    expect(ids).not.toContain('req-discovered');
  });

  it('returns only discovered requirements when statusFilter is "discovered"', async () => {
    const result = await getAllRequirementsPaginated(20, 0, 'discovered');
    const ids = result.items.map((r) => r.requirement_id);
    expect(ids).toEqual(['req-discovered']);
  });

  it('does not return discovered requirements when statusFilter is "active"', async () => {
    const result = await getAllRequirementsPaginated(20, 0, 'active');
    const ids = result.items.map((r) => r.requirement_id);
    expect(ids).toEqual(['req-active']);
    expect(ids).not.toContain('req-discovered');
  });
});

describe('getAllActiveRequirements — discovered exclusion (ticket #499)', () => {
  it('returns only active requirements, never discovered ones', async () => {
    store.set('req-active', makeRequirement('req-active', 'active', '2026-01-03T00:00:00.000Z'));
    store.set('req-discovered', makeRequirement('req-discovered', 'discovered', '2026-01-02T00:00:00.000Z'));
    store.set('req-hold', makeRequirement('req-hold', 'closed_on_hold', '2026-01-01T00:00:00.000Z'));

    const result = await getAllActiveRequirements();
    const ids = result.map((r) => r.requirement_id);
    expect(ids).toEqual(['req-active']);
    expect(ids).not.toContain('req-discovered');
  });
});

describe('provenance fields round-trip (ticket #499)', () => {
  it('persists and reads back origin and source_* fields', async () => {
    const item = makeRequirement('req-portal', 'discovered', '2026-01-04T00:00:00.000Z', {
      origin: 'portal-scan',
      source_id: 'src-42',
      source_url: 'https://jobs.example.com/posting/42',
      source_company: 'External Co',
    }) as unknown as RequirementItem;

    await saveRequirement(item);
    const readBack = await getRequirementById('req-portal');

    expect(readBack).not.toBeNull();
    expect(readBack!.origin).toBe('portal-scan');
    expect(readBack!.source_id).toBe('src-42');
    expect(readBack!.source_url).toBe('https://jobs.example.com/posting/42');
    expect(readBack!.source_company).toBe('External Co');
  });
});
