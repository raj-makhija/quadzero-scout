import { describe, it, expect } from 'vitest';
import type { CandidateItem } from '../../types/index.js';
import { calculateMatchScore, parseSearchLocations, MIN_MUST_HAVE_MATCH_RATIO, RELATED_MATCH_WEIGHT } from '../../lib/matchScoring.js';

// ---------------------------------------------------------------------------
// TC-SCORE-001 through TC-SCORE-018: Match Scoring Algorithm
// ---------------------------------------------------------------------------

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
    expect(result.details.mustHaveMatched).toContain('react');
    expect(result.details.mustHaveMatched).toContain('nodejs');
    expect(result.details.mustHaveRelated).toEqual([]);
    expect(result.details.mustHaveMissing).toEqual([]);
    expect(result.details.experienceMatch).toBe(true);
    expect(result.details.seniorityMatch).toBe(true);
  });

  // TC-SCORE-002
  it('must-have skills contribute 50% of score (prorated, exact only)', () => {
    const candidate = makeCandidate({
      primary_skills: ['react', 'python'],
      secondary_skills: [],
    });
    // Candidate has react but not golang, rust, scala (all different sub-categories)
    const result = calculateMatchScore(
      candidate,
      ['react', 'golang', 'rust', 'scala'], // only react matches exactly
      [],
      undefined,
      undefined,
      undefined
    );
    // 1 out of 4 must-have = 50 * 0.25 = 12.5 → 13 (rounded)
    // good-to-have: none specified → full 20
    // experience: no filter → 10
    // seniority: no filter → 10
    // location: no filter → 10
    // Total: 13 + 20 + 10 + 10 + 10 = 63
    expect(result.details.mustHaveMatched).toContain('react');
    expect(result.details.mustHaveMatched).not.toContain('golang');
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
      ['typescript', 'kubernetes'], // 1 of 2 good-to-have (exact)
    );
    // must-have: none specified → 50
    // good-to-have: 1/2 exact = (1 + 0) / 2 * 20 = 10
    // experience: no filter → 10
    // seniority: no filter → 10
    // location: no filter → 10
    // Total: 50 + 10 + 10 + 10 + 10 = 90
    expect(result.score).toBe(90);
  });

  // TC-SCORE-004
  it('experience in range contributes 15 points', () => {
    const candidate = makeCandidate({ total_experience: 5 });
    const result = calculateMatchScore(candidate, [], [], 3, 10);
    expect(result.details.experienceMatch).toBe(true);
  });

  // TC-SCORE-005
  it('experience below minimum gives 0 experience points', () => {
    const candidate = makeCandidate({ total_experience: 2 });
    const result = calculateMatchScore(candidate, [], [], 5);
    expect(result.details.experienceMatch).toBe(false);
    // 50 + 20 + 0 + 10 + 10 = 90
    expect(result.score).toBe(90);
  });

  // TC-SCORE-006
  it('experience above maximum gives 0 experience points', () => {
    const candidate = makeCandidate({ total_experience: 12 });
    const result = calculateMatchScore(candidate, [], [], undefined, 8);
    expect(result.details.experienceMatch).toBe(false);
    // 50 + 20 + 0 + 10 + 10 = 90
    expect(result.score).toBe(90);
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
    // 50 + 20 + 10 + 0 + 10 = 90
    expect(result.score).toBe(90);
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
    // + 20 + 10 + 10 + 10 = 66.666 → 67
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
    // must-have: 50 (no required), good-to-have: 20 (1/1 exact), exp: 10, seniority: 10, location: 10
    expect(result.score).toBe(100);
  });

  it('empty good-to-have skills results in full 20 points', () => {
    const candidate = makeCandidate();
    const result = calculateMatchScore(candidate, ['react'], []);
    // must-have: 50 (1/1), good-to-have: 20 (no required), exp: 10, seniority: 10, location: 10
    expect(result.score).toBe(100);
  });

  // TC-SCORE-012: Related skill does NOT count as must-have match
  it('related skill does NOT count as must-have match (exact only)', () => {
    const candidate = makeCandidate({
      primary_skills: ['vue'],  // vue is in frontend category, same as react
      secondary_skills: [],
    });
    const result = calculateMatchScore(candidate, ['react'], []);
    // Before this fix, vue would match react. Now it should not count for scoring.
    expect(result.details.mustHaveMatched).not.toContain('react');
    expect(result.details.mustHaveRelated).toContain('react'); // shown as related for display
    expect(result.details.mustHaveMissing).toEqual([]);
    // Score: 0/1 must-have = 0 * 50 = 0 + 20 + 10 + 10 + 10 = 50
    expect(result.score).toBe(50);
  });

  // TC-SCORE-013: Related skill counts at 0.3x for good-to-have
  it('related skill counts at 0.3x weight for good-to-have', () => {
    const candidate = makeCandidate({
      primary_skills: ['vue'],
      secondary_skills: [],
    });
    const result = calculateMatchScore(candidate, [], ['react']); // react is good-to-have
    // vue is related to react (both frontend), so related match
    expect(result.details.goodToHaveMatched).toEqual([]);
    expect(result.details.goodToHaveRelated).toContain('react');
    // Score: 50 (no must-have) + (0 + 1*0.3)/1 * 20 = 6 + 10 + 10 + 10 = 86
    expect(result.score).toBe(86);
  });

  // TC-SCORE-014: Salesforce and ServiceNow are in different categories after split
  it('salesforce and servicenow are in different categories after split', () => {
    const candidate = makeCandidate({
      primary_skills: ['servicenow'],
      secondary_skills: [],
    });
    const result = calculateMatchScore(candidate, ['salesforce'], []);
    // After category split: salesforce is in "salesforce", servicenow is in "erp"
    expect(result.details.mustHaveMatched).toEqual([]);
    expect(result.details.mustHaveRelated).toEqual([]); // different categories
    expect(result.details.mustHaveMissing).toContain('salesforce');
  });

  // TC-SCORE-015: 1/10 must-have is below 30% threshold
  it('candidate with 1 of 10 must-have skills is below 30% threshold', () => {
    const candidate = makeCandidate({
      primary_skills: ['react'],
      secondary_skills: [],
    });
    const mustHave = ['react', 'nodejs', 'python', 'java', 'golang',
                       'rust', 'csharp', 'ruby', 'php', 'scala'];
    const result = calculateMatchScore(candidate, mustHave, []);
    const ratio = result.details.mustHaveMatched.length / mustHave.length;
    expect(ratio).toBe(0.1);
    expect(ratio).toBeLessThan(MIN_MUST_HAVE_MATCH_RATIO);
  });

  // TC-SCORE-016: 3/10 must-have passes 30% threshold
  it('candidate with 3 of 10 must-have skills passes 30% threshold', () => {
    const candidate = makeCandidate({
      primary_skills: ['react', 'nodejs', 'python'],
      secondary_skills: [],
    });
    const mustHave = ['react', 'nodejs', 'python', 'java', 'golang',
                       'rust', 'csharp', 'ruby', 'php', 'scala'];
    const result = calculateMatchScore(candidate, mustHave, []);
    const ratio = result.details.mustHaveMatched.length / mustHave.length;
    expect(ratio).toBe(0.3);
    expect(ratio).toBeGreaterThanOrEqual(MIN_MUST_HAVE_MATCH_RATIO);
  });

  // TC-SCORE-017: SAP and Oracle ERP are related (same erp sub-category)
  it('sap and oracle_erp are related (both in erp sub-category)', () => {
    const candidate = makeCandidate({
      primary_skills: ['sap'],
      secondary_skills: [],
    });
    const result = calculateMatchScore(candidate, [], ['oracle_erp']);
    expect(result.details.goodToHaveRelated).toContain('oracle_erp');
  });

  // TC-SCORE-018: must-have related skills appear in mustHaveRelated
  it('must-have related skills are reported in mustHaveRelated for display', () => {
    const candidate = makeCandidate({
      primary_skills: ['postgresql'],
      secondary_skills: [],
    });
    const result = calculateMatchScore(candidate, ['mysql'], []);
    // postgresql and mysql are both in sql_databases
    expect(result.details.mustHaveMatched).toEqual([]); // no exact match
    expect(result.details.mustHaveRelated).toContain('mysql'); // related for display
    expect(result.details.mustHaveMissing).toEqual([]); // not truly missing
  });

  it('RELATED_MATCH_WEIGHT is 0.3', () => {
    expect(RELATED_MATCH_WEIGHT).toBe(0.3);
  });

  it('MIN_MUST_HAVE_MATCH_RATIO is 0.3', () => {
    expect(MIN_MUST_HAVE_MATCH_RATIO).toBe(0.3);
  });

  // TC-SCORE-019: Location full match gives +10
  it('location full match gives +10 points', () => {
    const candidate = makeCandidate({ location: 'Bangalore, India' });
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, undefined, undefined, ['bangalore']);
    expect(result.details.locationMatch).toBe('full');
    expect(result.score).toBe(100);
  });

  // TC-SCORE-020: Location none match gives +0
  it('location mismatch gives 0 location points', () => {
    const candidate = makeCandidate({ location: 'Mumbai, India' });
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, undefined, undefined, ['bangalore']);
    expect(result.details.locationMatch).toBe('none');
    // 50 + 20 + 10 + 10 + 0 = 90
    expect(result.score).toBe(90);
  });

  // TC-SCORE-021: Blank location gives partial (+5)
  it('blank location gives partial match (+5 points)', () => {
    const candidate = makeCandidate({ location: undefined });
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, undefined, undefined, ['bangalore']);
    expect(result.details.locationMatch).toBe('partial');
    // 50 + 20 + 10 + 10 + 5 = 95
    expect(result.score).toBe(95);
  });

  // TC-SCORE-022: No location criteria gives full points to all
  it('no location criteria gives full location points', () => {
    const candidate = makeCandidate({ location: 'Mumbai, India' });
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, undefined, undefined, []);
    expect(result.details.locationMatch).toBe('full');
    expect(result.score).toBe(100);
  });

  // TC-SCORE-023: Multi-location OR matching
  it('multi-location OR matching — any match is full', () => {
    const candidate = makeCandidate({ location: 'Chennai, India' });
    const locations = parseSearchLocations('Bangalore, Chennai, Pune');
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, undefined, undefined, locations);
    expect(result.details.locationMatch).toBe('full');
    expect(result.score).toBe(100);
  });

  // TC-SCORE-024: parseSearchLocations splits correctly
  it('parseSearchLocations splits comma/semicolon-separated locations', () => {
    expect(parseSearchLocations('Bangalore, Chennai; Pune')).toEqual(['bangalore', 'chennai', 'pune']);
    expect(parseSearchLocations('')).toEqual([]);
    expect(parseSearchLocations(undefined)).toEqual([]);
    expect(parseSearchLocations('  ')).toEqual([]);
  });
});
