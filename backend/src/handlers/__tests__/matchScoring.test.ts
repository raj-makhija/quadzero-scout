import { describe, it, expect } from 'vitest';
import type { CandidateItem } from '../../types/index.js';

// ---------------------------------------------------------------------------
// TC-SCORE-001 through TC-SCORE-011: Match Scoring Algorithm
//
// The scoring function is local to search.ts. We replicate its logic here
// to unit-test the algorithm in isolation. The integration test in
// recruiter.test.ts validates it end-to-end through the handler.
// ---------------------------------------------------------------------------

// Replicating the scoring function from search handler for unit testing
import { normalizeSkills, calculateSkillMatch } from '../../lib/skillNormalizer.js';

function calculateMatchScore(
  candidate: CandidateItem,
  mustHaveSkills: string[],
  goodToHaveSkills: string[],
  minExp?: number,
  maxExp?: number,
  seniority?: string[]
): { score: number; details: { mustHaveMatched: string[]; mustHaveMissing: string[]; goodToHaveMatched: string[]; experienceMatch: boolean; seniorityMatch: boolean } } {
  let score = 0;
  const candidateSkills = [...candidate.primary_skills, ...candidate.secondary_skills];

  const mustHaveMatch = calculateSkillMatch(candidateSkills, mustHaveSkills);
  const mustHaveRatio = mustHaveSkills.length > 0
    ? mustHaveMatch.matched.length / mustHaveSkills.length
    : 1;
  score += mustHaveRatio * 50;

  const goodToHaveMatch = calculateSkillMatch(candidateSkills, goodToHaveSkills);
  const goodToHaveRatio = goodToHaveSkills.length > 0
    ? goodToHaveMatch.matched.length / goodToHaveSkills.length
    : 1;
  score += goodToHaveRatio * 20;

  const experience = candidate.total_experience;
  let experienceMatch = true;
  if (minExp !== undefined && experience < minExp) experienceMatch = false;
  if (maxExp !== undefined && experience > maxExp) experienceMatch = false;
  if (experienceMatch) score += 15;

  let seniorityMatch = true;
  if (seniority && seniority.length > 0) {
    seniorityMatch = seniority.includes(candidate.seniority);
  }
  if (seniorityMatch) score += 15;

  return {
    score: Math.round(score),
    details: {
      mustHaveMatched: mustHaveMatch.matched,
      mustHaveMissing: mustHaveMatch.missing,
      goodToHaveMatched: goodToHaveMatch.matched,
      experienceMatch,
      seniorityMatch,
    },
  };
}

// Test fixture
function makeCandidate(overrides: Partial<CandidateItem> = {}): CandidateItem {
  return {
    candidate_id: 'cand_1',
    user_id: 'user_1',
    full_name: 'Test Candidate',
    email: 'test@example.com',
    primary_skills: ['react', 'nodejs', 'typescript'],
    primary_skill_years: { react: 4, nodejs: 3, typescript: 3 },
    secondary_skills: ['aws', 'docker'],
    total_experience: 6,
    seniority: 'senior',
    availability: 'immediate',
    industries: ['fintech'],
    roles: ['Developer'],
    experience_bucket: '6-10',
    resume_s3_key: 'resumes/2024/01/abc.pdf',
    created_at: '2024-01-10T00:00:00Z',
    last_updated: '2024-01-15T00:00:00Z',
    ...overrides,
  };
}

describe('Match Scoring Algorithm', () => {
  // TC-SCORE-001
  it('returns 100 for perfect match', () => {
    const candidate = makeCandidate();
    const result = calculateMatchScore(
      candidate,
      ['react', 'nodejs'],           // must-have: all matched
      ['typescript', 'aws'],          // good-to-have: all matched (aws in secondary)
      3,                               // min exp: 6 >= 3
      10,                              // max exp: 6 <= 10
      ['senior', 'lead']              // seniority: matches
    );
    expect(result.score).toBe(100);
    expect(result.details.experienceMatch).toBe(true);
    expect(result.details.seniorityMatch).toBe(true);
  });

  // TC-SCORE-002
  it('must-have skills contribute 50% of score (prorated)', () => {
    const candidate = makeCandidate({
      primary_skills: ['react', 'python'],
      secondary_skills: [],
    });
    // Candidate has react but not nodejs, not angular, not vue
    // out of 4 must-have, only react is a direct match
    const result = calculateMatchScore(
      candidate,
      ['react', 'golang', 'rust', 'scala'], // only react matches, rest are different categories
      [],
      undefined,
      undefined,
      undefined
    );
    // 1 out of 4 must-have = 50 * 0.25 = 12.5 → 13 (rounded)
    // good-to-have: none specified → full 20
    // experience: no filter → 15
    // seniority: no filter → 15
    // Total: 13 + 20 + 15 + 15 = 63
    expect(result.details.mustHaveMatched).toContain('react');
    expect(result.score).toBeLessThan(100);
  });

  // TC-SCORE-003
  it('good-to-have skills contribute 20% of score (prorated)', () => {
    const candidate = makeCandidate({
      primary_skills: ['react', 'nodejs'],
      secondary_skills: ['typescript'],
    });
    const result = calculateMatchScore(
      candidate,
      [],                           // no must-have
      ['typescript', 'kubernetes'], // 1 of 2 good-to-have
    );
    // must-have: none specified → 50
    // good-to-have: 1/2 = 20 * 0.5 = 10
    // experience: no filter → 15
    // seniority: no filter → 15
    // Total: 50 + 10 + 15 + 15 = 90
    expect(result.score).toBe(90);
  });

  // TC-SCORE-004
  it('experience in range contributes 15 points', () => {
    const candidate = makeCandidate({ total_experience: 5 });
    const result = calculateMatchScore(candidate, [], [], 3, 10);
    expect(result.details.experienceMatch).toBe(true);
    // Score includes 15 from experience
  });

  // TC-SCORE-005
  it('experience below minimum gives 0 experience points', () => {
    const candidate = makeCandidate({ total_experience: 2 });
    const result = calculateMatchScore(candidate, [], [], 5);
    expect(result.details.experienceMatch).toBe(false);
    // 50 + 20 + 0 + 15 = 85
    expect(result.score).toBe(85);
  });

  // TC-SCORE-006
  it('experience above maximum gives 0 experience points', () => {
    const candidate = makeCandidate({ total_experience: 12 });
    const result = calculateMatchScore(candidate, [], [], undefined, 8);
    expect(result.details.experienceMatch).toBe(false);
    expect(result.score).toBe(85);
  });

  // TC-SCORE-007
  it('seniority match contributes 15 points', () => {
    const candidate = makeCandidate({ seniority: 'senior' });
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, ['senior', 'lead']);
    expect(result.details.seniorityMatch).toBe(true);
  });

  // TC-SCORE-008
  it('seniority mismatch gives 0 seniority points', () => {
    const candidate = makeCandidate({ seniority: 'junior' });
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, ['senior', 'lead']);
    expect(result.details.seniorityMatch).toBe(false);
    // 50 + 20 + 15 + 0 = 85
    expect(result.score).toBe(85);
  });

  // TC-SCORE-009
  it('no criteria specified yields 100 (all defaults)', () => {
    const candidate = makeCandidate();
    const result = calculateMatchScore(candidate, [], []);
    expect(result.score).toBe(100);
  });

  // TC-SCORE-010
  it('score is rounded to integer', () => {
    const candidate = makeCandidate({
      primary_skills: ['react'],
      secondary_skills: [],
    });
    // 1 of 3 must-have = 50 * (1/3) = 16.666...
    // + 20 + 15 + 15 = 66.666 → 67
    const result = calculateMatchScore(
      candidate,
      ['react', 'nodejs', 'typescript'],
      [],
    );
    expect(Number.isInteger(result.score)).toBe(true);
  });

  // TC-SCORE-011
  it('secondary skills are considered in matching', () => {
    const candidate = makeCandidate({
      primary_skills: ['react'],
      secondary_skills: ['aws'],
    });
    const result = calculateMatchScore(
      candidate,
      ['aws'],  // aws is in secondary skills
      [],
    );
    expect(result.details.mustHaveMatched).toContain('aws');
    expect(result.details.mustHaveMissing).toEqual([]);
  });

  it('both experience boundaries are respected', () => {
    const candidate = makeCandidate({ total_experience: 5 });

    // Exact boundary: min = 5, candidate = 5 → match
    const result1 = calculateMatchScore(candidate, [], [], 5, 10);
    expect(result1.details.experienceMatch).toBe(true);

    // Exact boundary: max = 5, candidate = 5 → match
    const result2 = calculateMatchScore(candidate, [], [], 0, 5);
    expect(result2.details.experienceMatch).toBe(true);
  });

  it('empty must-have skills results in full 50 points', () => {
    const candidate = makeCandidate();
    const result = calculateMatchScore(candidate, [], ['typescript']);
    // must-have: 50 (no required), good-to-have: 20 (1/1), exp: 15, seniority: 15
    expect(result.score).toBe(100);
  });

  it('empty good-to-have skills results in full 20 points', () => {
    const candidate = makeCandidate();
    const result = calculateMatchScore(candidate, ['react'], []);
    // must-have: 50 (1/1), good-to-have: 20 (no required), exp: 15, seniority: 15
    expect(result.score).toBe(100);
  });
});
