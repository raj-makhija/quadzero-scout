import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetAllActiveRequirements = vi.fn();
const mockGetShortlistsForRequirement = vi.fn();
const mockGetMatchCache = vi.fn();
const mockGetCandidatesByIds = vi.fn();

vi.mock('../../lib/dynamodb.js', () => ({
  getAllActiveRequirements: (...args: unknown[]) => mockGetAllActiveRequirements(...args),
  getShortlistsForRequirement: (...args: unknown[]) => mockGetShortlistsForRequirement(...args),
  getMatchCache: (...args: unknown[]) => mockGetMatchCache(...args),
  getCandidatesByIds: (...args: unknown[]) => mockGetCandidatesByIds(...args),
}));

const mockCreateTaskIfAbsent = vi.fn();
const mockExpireStaleTasks = vi.fn();
const mockBuildSweepTasks = vi.fn();
const mockSelectMatchTasksFromCache = vi.fn();
const mockFetchLowConfidenceImports = vi.fn();
const mockFetchUnscreenedCandidates = vi.fn();
const mockFetchStaleScreenedCandidates = vi.fn();

vi.mock('../../lib/recruiterTasks.js', () => ({
  buildSweepTasks: (...args: unknown[]) => mockBuildSweepTasks(...args),
  createTaskIfAbsent: (...args: unknown[]) => mockCreateTaskIfAbsent(...args),
  expireStaleTasks: (...args: unknown[]) => mockExpireStaleTasks(...args),
  fetchLowConfidenceImports: (...args: unknown[]) => mockFetchLowConfidenceImports(...args),
  fetchUnscreenedCandidates: (...args: unknown[]) => mockFetchUnscreenedCandidates(...args),
  fetchStaleScreenedCandidates: (...args: unknown[]) => mockFetchStaleScreenedCandidates(...args),
  selectMatchTasksFromCache: (...args: unknown[]) => mockSelectMatchTasksFromCache(...args),
  STALE_REQUIREMENT_DAYS: 7,
  FOUND_MATCHES_PER_REQ: 10,
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { handler } from '../worker/taskGeneratorWorker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequirement(id: string, status = 'active') {
  return {
    requirement_id: id,
    job_title: 'Software Engineer',
    client_name: 'Acme',
    status,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('taskGeneratorWorker sweep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllActiveRequirements.mockResolvedValue([]);
    mockGetShortlistsForRequirement.mockResolvedValue([]);
    mockGetMatchCache.mockResolvedValue(null);
    mockGetCandidatesByIds.mockResolvedValue([]);
    mockBuildSweepTasks.mockReturnValue([]);
    mockCreateTaskIfAbsent.mockResolvedValue(null);
    mockExpireStaleTasks.mockResolvedValue(0);
    mockFetchLowConfidenceImports.mockResolvedValue([]);
    mockFetchUnscreenedCandidates.mockResolvedValue([]);
    mockFetchStaleScreenedCandidates.mockResolvedValue([]);
    mockSelectMatchTasksFromCache.mockReturnValue({ matches: [], skipped: 0 });
  });

  it('does not query match cache or create found_candidate tasks for closed/on-hold requirements', async () => {
    // getAllActiveRequirements only returns active requirements — closed/on-hold are filtered at DB level.
    const activeReq = makeRequirement('req-active');
    mockGetAllActiveRequirements.mockResolvedValue([activeReq]);
    mockGetMatchCache.mockResolvedValue(null); // cold cache for active req

    await handler();

    // Match cache queried only for the active requirement
    expect(mockGetMatchCache).toHaveBeenCalledWith('req-active');
    expect(mockGetMatchCache).toHaveBeenCalledTimes(1);
    // No match-cache entries → no tasks created
    expect(mockCreateTaskIfAbsent).not.toHaveBeenCalled();
  });

  it('creates found_candidate_for_requirement tasks for active requirements with qualifying matches', async () => {
    const activeReq = makeRequirement('req-1');
    mockGetAllActiveRequirements.mockResolvedValue([activeReq]);
    mockGetShortlistsForRequirement.mockResolvedValue([]);
    mockGetMatchCache.mockResolvedValue([{ candidate_id: 'c1', score: 85, rank: 1 }]);
    mockSelectMatchTasksFromCache.mockReturnValue({ matches: [{ candidateId: 'c1', score: 85 }], skipped: 0 });
    mockGetCandidatesByIds.mockResolvedValue([{ candidate_id: 'c1', full_name: 'Asha' }]);

    const foundSpec = {
      owner_id: 'POOL',
      type: 'found_candidate_for_requirement',
      entity_ref: 'REQ#req-1#CAND#c1',
      priority: 1,
      context: { candidate_name: 'Asha', match_score: 85 },
      action_url: '/recruiter/locate/c1',
      due_date: '2026-06-03T00:00:00.000Z',
    };
    mockBuildSweepTasks.mockReturnValue([foundSpec]);
    mockCreateTaskIfAbsent.mockResolvedValue(foundSpec);

    await handler();

    expect(mockGetMatchCache).toHaveBeenCalledWith('req-1');
    expect(mockBuildSweepTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        newMatches: expect.arrayContaining([
          expect.objectContaining({ requirementId: 'req-1', candidateId: 'c1', matchScore: 85 }),
        ]),
      })
    );
    expect(mockCreateTaskIfAbsent).toHaveBeenCalledWith(foundSpec, expect.any(Date));
  });

  it('processes only active requirements when both active and hypothetical closed ones have match cache entries', async () => {
    // Only the active requirement is returned — the closed one was filtered by getAllActiveRequirements
    const activeReq = makeRequirement('req-active');
    mockGetAllActiveRequirements.mockResolvedValue([activeReq]);
    mockGetMatchCache.mockImplementation((id: string) => {
      // Hypothetically, closed-req has matches in cache, but the worker never asks for it
      if (id === 'req-active') return Promise.resolve([{ candidate_id: 'c1', score: 80, rank: 1 }]);
      return Promise.resolve([{ candidate_id: 'c2', score: 90, rank: 1 }]);
    });
    mockSelectMatchTasksFromCache.mockReturnValue({ matches: [{ candidateId: 'c1', score: 80 }], skipped: 0 });
    mockGetCandidatesByIds.mockResolvedValue([]);
    mockBuildSweepTasks.mockReturnValue([]);

    await handler();

    // Worker only fetches match cache for the active requirement
    expect(mockGetMatchCache).toHaveBeenCalledTimes(1);
    expect(mockGetMatchCache).toHaveBeenCalledWith('req-active');
    expect(mockGetMatchCache).not.toHaveBeenCalledWith('req-closed');
  });
});
