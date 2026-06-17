import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before importing the worker.
// ---------------------------------------------------------------------------

const mockGetAllActiveRequirements = vi.fn();
const mockGetShortlistsForRequirement = vi.fn();
const mockGetCandidateById = vi.fn();
const mockGetMatchCache = vi.fn();
const mockGetCandidatesByIds = vi.fn();

vi.mock('../../../lib/dynamodb.js', () => ({
  getAllActiveRequirements: (...a: unknown[]) => mockGetAllActiveRequirements(...a),
  getShortlistsForRequirement: (...a: unknown[]) => mockGetShortlistsForRequirement(...a),
  getCandidateById: (...a: unknown[]) => mockGetCandidateById(...a),
  getMatchCache: (...a: unknown[]) => mockGetMatchCache(...a),
  getCandidatesByIds: (...a: unknown[]) => mockGetCandidatesByIds(...a),
}));

const mockBuildSweepTasks = vi.fn();
const mockCreateTaskIfAbsent = vi.fn();
const mockExpireStaleTasks = vi.fn();
const mockFetchLowConfidenceImports = vi.fn();
const mockFetchUnscreenedCandidates = vi.fn();

vi.mock('../../../lib/recruiterTasks.js', () => ({
  buildSweepTasks: (...a: unknown[]) => mockBuildSweepTasks(...a),
  createTaskIfAbsent: (...a: unknown[]) => mockCreateTaskIfAbsent(...a),
  expireStaleTasks: (...a: unknown[]) => mockExpireStaleTasks(...a),
  fetchLowConfidenceImports: (...a: unknown[]) => mockFetchLowConfidenceImports(...a),
  fetchUnscreenedCandidates: (...a: unknown[]) => mockFetchUnscreenedCandidates(...a),
  MATCH_TASK_THRESHOLD: 70,
  STALE_REQUIREMENT_DAYS: 7,
  SCREENING_MAX_AGE_DAYS: 15,
  FOUND_MATCHES_PER_REQ: 10,
}));

import { handler } from '../taskGeneratorWorker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(id: string) {
  return {
    requirement_id: id,
    job_title: `Job ${id}`,
    client_name: `Client ${id}`,
    // created_at close to now so it is never stale in tests
    created_at: new Date().toISOString(),
  };
}

function cacheEntry(candidateId: string, score: number) {
  return { candidate_id: candidateId, rank: 1, score };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults: no requirements, no shortlists, no extra data
  mockGetAllActiveRequirements.mockResolvedValue([]);
  mockGetShortlistsForRequirement.mockResolvedValue([]);
  mockGetMatchCache.mockResolvedValue([]);
  mockGetCandidatesByIds.mockResolvedValue([]);
  mockBuildSweepTasks.mockReturnValue([]);
  mockExpireStaleTasks.mockResolvedValue(0);
  mockFetchLowConfidenceImports.mockResolvedValue([]);
  mockFetchUnscreenedCandidates.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('taskGeneratorWorker match cache sweep', () => {
  it('calls getMatchCache once per active requirement', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([makeReq('r1'), makeReq('r2')]);

    await handler();

    expect(mockGetMatchCache).toHaveBeenCalledTimes(2);
    expect(mockGetMatchCache).toHaveBeenCalledWith('r1');
    expect(mockGetMatchCache).toHaveBeenCalledWith('r2');
  });

  it('does not call getRecentProfiles', async () => {
    // getRecentProfiles is not exported from the dynamodb mock; if the handler
    // tried to call it, it would throw "is not a function".
    mockGetAllActiveRequirements.mockResolvedValue([makeReq('r1')]);
    mockGetMatchCache.mockResolvedValue([cacheEntry('c1', 80)]);
    mockGetCandidatesByIds.mockResolvedValue([]);

    await expect(handler()).resolves.not.toThrow();
    // Confirms the handler never attempted getRecentProfiles
  });

  it('includes cache entries with score exactly 70', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([makeReq('r1')]);
    mockGetMatchCache.mockResolvedValue([cacheEntry('c1', 70)]);
    mockGetCandidatesByIds.mockResolvedValue([]);

    await handler();

    const [input] = mockBuildSweepTasks.mock.calls[0];
    expect(input.newMatches).toHaveLength(1);
    expect(input.newMatches[0]).toMatchObject({ requirementId: 'r1', candidateId: 'c1', matchScore: 70 });
  });

  it('excludes cache entries with score 69', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([makeReq('r1')]);
    mockGetMatchCache.mockResolvedValue([cacheEntry('c1', 69)]);

    await handler();

    const [input] = mockBuildSweepTasks.mock.calls[0];
    expect(input.newMatches).toHaveLength(0);
  });

  it('excludes already-shortlisted candidates', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([makeReq('r1')]);
    mockGetShortlistsForRequirement.mockResolvedValue([
      { candidate_id: 'c1', status: 'active', pipeline_stage: 'shortlisted' },
    ]);
    mockGetMatchCache.mockResolvedValue([cacheEntry('c1', 85)]);

    await handler();

    const [input] = mockBuildSweepTasks.mock.calls[0];
    expect(input.newMatches).toHaveLength(0);
  });

  it('excludes candidates with pipeline_stage === joined (they are in the shortlist)', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([makeReq('r1')]);
    mockGetShortlistsForRequirement.mockResolvedValue([
      { candidate_id: 'c1', status: 'active', pipeline_stage: 'joined' },
    ]);
    mockGetMatchCache.mockResolvedValue([cacheEntry('c1', 90)]);

    await handler();

    const [input] = mockBuildSweepTasks.mock.calls[0];
    expect(input.newMatches).toHaveLength(0);
  });

  it('emits exactly FOUND_MATCHES_PER_REQ tasks when the cache has exactly that many qualifying entries', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([makeReq('r1')]);
    const entries = Array.from({ length: 10 }, (_, i) => cacheEntry(`c${i}`, 75));
    mockGetMatchCache.mockResolvedValue(entries);
    mockGetCandidatesByIds.mockResolvedValue([]);

    await handler();

    const [input] = mockBuildSweepTasks.mock.calls[0];
    expect(input.newMatches).toHaveLength(10);
  });

  it('caps at FOUND_MATCHES_PER_REQ and logs the skipped count', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([makeReq('r1')]);
    const entries = Array.from({ length: 11 }, (_, i) => cacheEntry(`c${i}`, 75));
    mockGetMatchCache.mockResolvedValue(entries);
    mockGetCandidatesByIds.mockResolvedValue([]);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handler();

    const [input] = mockBuildSweepTasks.mock.calls[0];
    const logCalls = consoleSpy.mock.calls.map((c) => c[0] as string);
    consoleSpy.mockRestore();

    expect(input.newMatches).toHaveLength(10);
    expect(logCalls.some((m) => m.includes('r1') && m.includes('skipping 1'))).toBe(true);
  });

  it('does not log a skipped count when exactly at the cap', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([makeReq('r1')]);
    const entries = Array.from({ length: 10 }, (_, i) => cacheEntry(`c${i}`, 75));
    mockGetMatchCache.mockResolvedValue(entries);
    mockGetCandidatesByIds.mockResolvedValue([]);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handler();

    const logCalls = consoleSpy.mock.calls.map((c) => c[0] as string);
    consoleSpy.mockRestore();

    expect(logCalls.some((m) => m.includes('skipping'))).toBe(false);
  });

  it('skips cold-cache requirements with a log line', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([makeReq('r1')]);
    mockGetMatchCache.mockResolvedValue(null);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handler();

    const [input] = mockBuildSweepTasks.mock.calls[0];
    const logCalls = consoleSpy.mock.calls.map((c) => c[0] as string);
    consoleSpy.mockRestore();

    expect(input.newMatches).toHaveLength(0);
    expect(logCalls.some((m) => m.includes('cold cache') && m.includes('r1'))).toBe(true);
  });

  it('cold cache on one requirement does not abort the rest', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([makeReq('r1'), makeReq('r2')]);
    mockGetMatchCache
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([cacheEntry('c2', 80)]);
    mockGetCandidatesByIds.mockResolvedValue([]);

    await handler();

    const [input] = mockBuildSweepTasks.mock.calls[0];
    expect(input.newMatches).toHaveLength(1);
    expect(input.newMatches[0].candidateId).toBe('c2');
  });

  it('enriches candidate names via getCandidatesByIds for the capped set', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([makeReq('r1')]);
    mockGetMatchCache.mockResolvedValue([cacheEntry('c1', 80)]);
    mockGetCandidatesByIds.mockResolvedValue([{ candidate_id: 'c1', full_name: 'Asha Rao' }]);

    await handler();

    const [input] = mockBuildSweepTasks.mock.calls[0];
    expect(input.newMatches[0].candidateName).toBe('Asha Rao');
  });

  it('still emits tasks when getCandidatesByIds throws', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([makeReq('r1')]);
    mockGetMatchCache.mockResolvedValue([cacheEntry('c1', 80)]);
    mockGetCandidatesByIds.mockRejectedValue(new Error('DynamoDB timeout'));

    await expect(handler()).resolves.not.toThrow();

    const [input] = mockBuildSweepTasks.mock.calls[0];
    expect(input.newMatches).toHaveLength(1);
    expect(input.newMatches[0].candidateName).toBeUndefined();
  });

  it('emits matches with correct entity fields', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([makeReq('r1')]);
    mockGetMatchCache.mockResolvedValue([cacheEntry('c1', 82)]);
    mockGetCandidatesByIds.mockResolvedValue([]);

    await handler();

    const [input] = mockBuildSweepTasks.mock.calls[0];
    expect(input.newMatches[0]).toMatchObject({
      requirementId: 'r1',
      candidateId: 'c1',
      requirementTitle: 'Job r1',
      clientName: 'Client r1',
      matchScore: 82,
    });
  });

  it('per-requirement caps and exclusions are independent across requirements', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([makeReq('r1'), makeReq('r2')]);
    // r1: shortlist c1; r2: no shortlist but c1 is in cache
    mockGetShortlistsForRequirement.mockImplementation((reqId: string) =>
      reqId === 'r1'
        ? Promise.resolve([{ candidate_id: 'c1', status: 'active', pipeline_stage: 'shortlisted' }])
        : Promise.resolve([])
    );
    mockGetMatchCache.mockImplementation((reqId: string) =>
      reqId === 'r1'
        ? Promise.resolve([cacheEntry('c1', 90), cacheEntry('c2', 75)])
        : Promise.resolve([cacheEntry('c1', 80)])
    );
    mockGetCandidatesByIds.mockResolvedValue([]);

    await handler();

    const [input] = mockBuildSweepTasks.mock.calls[0];
    // r1: c1 is shortlisted, only c2 passes
    // r2: c1 is not shortlisted for r2, so it passes
    const byReq = (id: string) => input.newMatches.filter((m: { requirementId: string }) => m.requirementId === id);
    expect(byReq('r1').map((m: { candidateId: string }) => m.candidateId)).toEqual(['c2']);
    expect(byReq('r2').map((m: { candidateId: string }) => m.candidateId)).toEqual(['c1']);
  });

  it('empty ranked list in cache produces no matches and no error', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([makeReq('r1')]);
    mockGetMatchCache.mockResolvedValue([]);

    await expect(handler()).resolves.not.toThrow();

    const [input] = mockBuildSweepTasks.mock.calls[0];
    expect(input.newMatches).toHaveLength(0);
  });

  it('idempotency: passes matches through createTaskIfAbsent by using buildSweepTasks output', async () => {
    mockGetAllActiveRequirements.mockResolvedValue([makeReq('r1')]);
    mockGetMatchCache.mockResolvedValue([cacheEntry('c1', 80)]);
    mockGetCandidatesByIds.mockResolvedValue([]);
    mockBuildSweepTasks.mockReturnValue([{ type: 'found_candidate_for_requirement', entity_ref: 'REQ#r1#CAND#c1' }]);
    mockCreateTaskIfAbsent.mockResolvedValue(null); // simulate duplicate — already exists

    await handler();

    expect(mockCreateTaskIfAbsent).toHaveBeenCalledTimes(1);
  });
});
