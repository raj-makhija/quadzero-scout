import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCalculateMatchScore = vi.fn();

vi.mock('../matchScoring.js', () => {
  const compatMap: Record<string, string[]> = {
    full_time_regular: ['full_time'],
    full_time_contract: ['full_time', 'contract'],
    part_time_contract: ['contract'],
    full_time: ['full_time'],
    contract: ['contract'],
  };
  return {
    calculateMatchScore: (...args: unknown[]) => mockCalculateMatchScore(...args),
    MIN_MUST_HAVE_MATCH_RATIO: 0.40,
    FUZZY_MATCH_WEIGHT: 0.85,
    MUST_HAVE_SECONDARY_WEIGHT: 0.5,
    parseSearchLocations: (loc?: string) =>
      loc ? loc.split(/[,;]/).map((s: string) => s.trim().toLowerCase()).filter(Boolean) : [],
    isEngagementModelCompatible: (reqModel: string, candModel: string) => {
      if (!reqModel || reqModel === 'either' || candModel === 'either') return true;
      return compatMap[reqModel]?.includes(candModel) ?? true;
    },
  };
});

vi.mock('../skillNormalizer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../skillNormalizer.js')>();
  return {
    normalizeSkill: (s: string) => s.toLowerCase(),
    normalizeSkills: (ss: string[]) => ss.map((s: string) => s.toLowerCase()),
    coreSkillSatisfiedBy: actual.coreSkillSatisfiedBy,
  };
});

vi.mock('../ctcConversion.js', () => ({
  isCandidateWithinBudget: vi.fn().mockReturnValue(true),
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { normalizeSynonymMap, matchAndRankCandidates } from '../candidateMatching.js';
import { isCandidateWithinBudget } from '../ctcConversion.js';
import type { CandidateItem } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseCandidate: CandidateItem = {
  candidate_id: 'cand_1',
  user_id: 'user_1',
  full_name: 'Alice Smith',
  email: 'alice@example.com',
  location: 'Bangalore',
  primary_skills: ['react', 'typescript'],
  primary_skill_years: { react: 4, typescript: 3 },
  secondary_skills: ['nodejs'],
  total_experience: 5,
  seniority: 'mid',
  availability: 'immediate',
  engagement_model: 'either',
  industries: [],
  roles: [],
  experience_bucket: '3-5',
  resume_s3_key: 'r/alice.pdf',
  created_at: '2024-01-01T00:00:00Z',
  last_updated: '2024-06-01T00:00:00Z',
};

const goodDetails = {
  mustHaveMatched: ['react'],
  mustHaveFuzzy: [],
  mustHaveSecondary: [],
  mustHaveRelated: [],
  mustHaveMissing: [],
  goodToHaveMatched: [],
  goodToHaveFuzzy: [],
  goodToHaveRelated: [],
  experienceMatch: 'full' as const,
  seniorityMatch: true,
  ctcMatch: true,
  locationMatch: 'full' as const,
  availabilityMatch: 'full' as const,
  roleMatch: 'none' as const,
};

// ---------------------------------------------------------------------------
// normalizeSynonymMap
// ---------------------------------------------------------------------------

describe('normalizeSynonymMap', () => {
  it('returns undefined for null input', () => {
    expect(normalizeSynonymMap(null)).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(normalizeSynonymMap(undefined)).toBeUndefined();
  });

  it('normalizes keys and values to lowercase', () => {
    const result = normalizeSynonymMap({ ReactJS: ['React.js', 'REACT'] });
    expect(result).toEqual({ reactjs: ['react.js', 'react'] });
  });

  it('normalizes mixed-case keys and values consistently', () => {
    const result = normalizeSynonymMap({
      JavaScript: ['JS', 'ECMAScript'],
      'Node.JS': ['NodeJS', 'node'],
    });
    expect(result).toEqual({
      javascript: ['js', 'ecmascript'],
      'node.js': ['nodejs', 'node'],
    });
  });
});

// ---------------------------------------------------------------------------
// matchAndRankCandidates
// ---------------------------------------------------------------------------

describe('matchAndRankCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isCandidateWithinBudget as ReturnType<typeof vi.fn>).mockReturnValue(true);
  });

  it('returns empty array when candidates list is empty', () => {
    const result = matchAndRankCandidates([], { mustHaveSkills: ['react'] });
    expect(result).toEqual([]);
    expect(mockCalculateMatchScore).not.toHaveBeenCalled();
  });

  it('parity: score and matchDetails are identical for both search and notify paths when score > 0', () => {
    mockCalculateMatchScore.mockReturnValue({ score: 75, details: goodDetails });

    const searchResult = matchAndRankCandidates(
      [baseCandidate],
      { mustHaveSkills: ['react'] },
      { notifyInclusion: false }
    );
    const notifyResult = matchAndRankCandidates(
      [baseCandidate],
      { mustHaveSkills: ['react'] },
      { notifyInclusion: true }
    );

    expect(searchResult).toHaveLength(1);
    expect(notifyResult).toHaveLength(1);
    expect(searchResult[0].score).toBe(notifyResult[0].score);
    expect(searchResult[0].details).toEqual(notifyResult[0].details);
  });

  // ---------------------------------------------------------------------------
  // Must-have ratio gate
  // ---------------------------------------------------------------------------

  it('includes candidate whose effectiveRatio lands exactly at the 0.40 boundary (boundary is >=)', () => {
    // 5 must-haves, 2 exact matches → effectiveRatio = 2/5 = 0.40 exactly
    mockCalculateMatchScore.mockReturnValue({
      score: 50,
      details: {
        ...goodDetails,
        mustHaveMatched: ['react', 'typescript'],
        mustHaveFuzzy: [],
        mustHaveSecondary: [],
        mustHaveMissing: ['nodejs', 'aws', 'docker'],
      },
    });

    const result = matchAndRankCandidates(
      [baseCandidate],
      { mustHaveSkills: ['react', 'typescript', 'nodejs', 'aws', 'docker'] }
    );

    expect(result).toHaveLength(1);
  });

  it('skips ratio gate when criteria has zero must-have skills', () => {
    mockCalculateMatchScore.mockReturnValue({ score: 40, details: goodDetails });

    const result = matchAndRankCandidates([baseCandidate], { mustHaveSkills: [] });

    expect(result).toHaveLength(1);
  });

  it('excludes candidate with non-zero score below the ratio gate even when notifyInclusion=true and budgetFit=true', () => {
    // ratio gate is a hard prerequisite — notifyInclusion does not bypass it
    mockCalculateMatchScore.mockReturnValue({
      score: 30,
      details: {
        ...goodDetails,
        mustHaveMatched: [],
        mustHaveFuzzy: [],
        mustHaveSecondary: [],
        mustHaveMissing: ['react'],
      },
    });
    (isCandidateWithinBudget as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = matchAndRankCandidates(
      [baseCandidate],
      { mustHaveSkills: ['react'] },
      { notifyInclusion: true }
    );

    expect(result).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Inclusion rules (notifyInclusion option)
  // ---------------------------------------------------------------------------

  it('includes score=0, budgetFit=true candidate when notifyInclusion=true (notify semantics)', () => {
    mockCalculateMatchScore.mockReturnValue({
      score: 0,
      details: { ...goodDetails, mustHaveMatched: ['react'], mustHaveMissing: [] },
    });
    (isCandidateWithinBudget as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = matchAndRankCandidates(
      [baseCandidate],
      { mustHaveSkills: ['react'] },
      { notifyInclusion: true }
    );

    expect(result).toHaveLength(1);
  });

  it('excludes score=0, budgetFit=true candidate when notifyInclusion=false (search semantics)', () => {
    mockCalculateMatchScore.mockReturnValue({
      score: 0,
      details: { ...goodDetails, mustHaveMatched: ['react'], mustHaveMissing: [] },
    });
    (isCandidateWithinBudget as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = matchAndRankCandidates(
      [baseCandidate],
      { mustHaveSkills: ['react'] }
      // notifyInclusion defaults to false
    );

    expect(result).toHaveLength(0);
  });

  it('excludes score=0, budgetFit=false candidate even when notifyInclusion=true', () => {
    mockCalculateMatchScore.mockReturnValue({
      score: 0,
      details: { ...goodDetails, mustHaveMatched: ['react'], mustHaveMissing: [] },
    });
    (isCandidateWithinBudget as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = matchAndRankCandidates(
      [baseCandidate],
      { mustHaveSkills: ['react'] },
      { notifyInclusion: true }
    );

    expect(result).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // coreSkill filter
  // ---------------------------------------------------------------------------

  it('excludes MERN candidate missing expressjs in primary skills (only 3 of 4 components)', () => {
    const partialMernCandidate: CandidateItem = {
      ...baseCandidate,
      primary_skills: ['mongodb', 'react', 'nodejs'],
      secondary_skills: ['expressjs'], // expressjs only in secondary
    };
    mockCalculateMatchScore.mockReturnValue({ score: 80, details: goodDetails });

    const result = matchAndRankCandidates(
      [partialMernCandidate],
      { coreSkill: 'mern stack', mustHaveSkills: [] }
    );

    expect(result).toHaveLength(0);
    expect(mockCalculateMatchScore).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Engagement model filter
  // ---------------------------------------------------------------------------

  it('does not apply engagement filter when engagementModel is "either"', () => {
    const contractCandidate: CandidateItem = { ...baseCandidate, engagement_model: 'contract' };
    const fullTimeCandidate: CandidateItem = { ...baseCandidate, candidate_id: 'cand_2', engagement_model: 'full_time' };
    mockCalculateMatchScore.mockReturnValue({ score: 70, details: goodDetails });

    const result = matchAndRankCandidates(
      [contractCandidate, fullTimeCandidate],
      { mustHaveSkills: [], engagementModel: 'either' }
    );

    expect(result).toHaveLength(2);
  });

  it('filters out candidates with engagement model incompatible with the requirement', () => {
    const contractCandidate: CandidateItem = { ...baseCandidate, engagement_model: 'contract' };
    const fullTimeCandidate: CandidateItem = { ...baseCandidate, candidate_id: 'cand_2', engagement_model: 'full_time' };
    mockCalculateMatchScore.mockReturnValue({ score: 70, details: goodDetails });

    // full_time_regular is compatible only with full_time candidates
    const result = matchAndRankCandidates(
      [contractCandidate, fullTimeCandidate],
      { mustHaveSkills: [], engagementModel: 'full_time_regular' }
    );

    expect(result).toHaveLength(1);
    expect(result[0].candidate.candidate_id).toBe('cand_2');
  });
});
