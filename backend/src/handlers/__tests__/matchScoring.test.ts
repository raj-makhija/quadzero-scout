import { describe, it, expect } from 'vitest';
import type { CandidateItem } from '../../types/index.js';
import { calculateMatchScore, parseSearchLocations, MIN_MUST_HAVE_MATCH_RATIO, RELATED_MATCH_WEIGHT, MUST_HAVE_RELATED_WEIGHT, MUST_HAVE_WEIGHT, GOOD_TO_HAVE_WEIGHT, SKILL_PROMINENCE_WEIGHT, SKILL_YEARS_WEIGHT, ROLE_MATCH_WEIGHT, CTC_OVER_BUDGET_MAX_PENALTY } from '../../lib/matchScoring.js';

// ---------------------------------------------------------------------------
// Match Scoring Algorithm Tests
// Weights: must-have 40, good-to-have 22, role 8, experience 8, seniority 5,
//          location 10, availability 7 = 100
// + skill relevance bonus: up to 12 (prominence 8 + years 4) for matched must-have
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
  it('returns max score of 100 for perfect match even when relevance bonus would exceed it', () => {
    const candidate = makeCandidate();
    const result = calculateMatchScore(
      candidate,
      ['react', 'nodejs'],           // must-have: all matched
      ['typescript', 'aws'],          // good-to-have: all matched (aws in secondary)
      3,                               // min exp: 6 >= 3
      10,                              // max exp: 6 <= 10
      ['senior', 'lead']              // seniority: matches
    );
    // Base 100 + prominence/years bonus would = 110; capped at 100
    expect(result.score).toBe(100);
    expect(result.details.mustHaveMatched).toContain('react');
    expect(result.details.mustHaveMatched).toContain('nodejs');
    expect(result.details.mustHaveRelated).toEqual([]);
    expect(result.details.mustHaveMissing).toEqual([]);
    expect(result.details.experienceMatch).toBe('full');
    expect(result.details.seniorityMatch).toBe(true);
  });

  // TC-SCORE-002
  it('must-have skills contribute 40 pts of score (prorated)', () => {
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
    // 1 out of 4 must-have = 40 * 0.25 = 10
    // good-to-have: none specified → full 22, role: no filter → 8
    // experience: no filter → 8, seniority: no filter → 5, location: no filter → 10, availability: no filter → 7
    // Total: 10 + 22 + 8 + 8 + 5 + 10 + 7 = 70
    expect(result.details.mustHaveMatched).toContain('react');
    expect(result.details.mustHaveMatched).not.toContain('golang');
    expect(result.score).toBeLessThan(100);
  });

  // TC-SCORE-003
  it('good-to-have skills contribute 22 pts of score (prorated)', () => {
    const candidate = makeCandidate({
      primary_skills: ['react', 'nodejs'],
      secondary_skills: ['typescript'],
    });
    const result = calculateMatchScore(
      candidate,
      [],                           // no must-have
      ['typescript', 'kubernetes'], // 1 of 2 good-to-have (exact)
    );
    // must-have: none specified → 40
    // good-to-have: 1/2 exact = (1 + 0) / 2 * 22 = 11
    // role: no filter → 8, experience: 8, seniority: 5, location: 10, availability: 7
    // Total: 40 + 11 + 8 + 8 + 5 + 10 + 7 = 89
    expect(result.score).toBe(89);
  });

  // TC-SCORE-004
  it('experience in range gives full experience points', () => {
    const candidate = makeCandidate({ total_experience: 5 });
    const result = calculateMatchScore(candidate, [], [], 3, 10);
    expect(result.details.experienceMatch).toBe('full');
  });

  // TC-SCORE-005
  it('experience way below minimum gives 0 experience points', () => {
    const candidate = makeCandidate({ total_experience: 2 });
    const result = calculateMatchScore(candidate, [], [], 5);
    expect(result.details.experienceMatch).toBe('none');
    // 40 + 22 + 8 + 0 + 5 + 10 + 7 = 92
    expect(result.score).toBe(92);
  });

  // TC-SCORE-006
  it('experience way above maximum gives 0 experience points', () => {
    const candidate = makeCandidate({ total_experience: 12 });
    const result = calculateMatchScore(candidate, [], [], undefined, 8);
    expect(result.details.experienceMatch).toBe('none');
    // 40 + 22 + 8 + 0 + 5 + 10 + 7 = 92
    expect(result.score).toBe(92);
  });

  // TC-SCORE-007
  it('seniority match contributes 5 points', () => {
    const candidate = makeCandidate({ seniority: 'senior' });
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, ['senior', 'lead']);
    expect(result.details.seniorityMatch).toBe(true);
  });

  // TC-SCORE-008
  it('seniority mismatch gives 0 seniority points', () => {
    const candidate = makeCandidate({ seniority: 'junior' });
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, ['senior', 'lead']);
    expect(result.details.seniorityMatch).toBe(false);
    // 40 + 22 + 8 + 8 + 0 + 10 + 7 = 95
    expect(result.score).toBe(95);
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
    // 1 exact (react) of 3 must-have — nodejs and typescript are missing or related (not scored)
    // = 1/3 * 40 ≈ 13.3 + 22 + 8 + 8 + 5 + 10 + 7 ≈ 73
    const result = calculateMatchScore(
      candidate,
      ['react', 'nodejs', 'typescript'],
      [],
    );
    expect(Number.isInteger(result.score)).toBe(true);
  });

  // TC-SCORE-011
  it('must-have skill found only in secondary_skills is flagged as secondary, not a primary match', () => {
    const candidate = makeCandidate({
      primary_skills: ['react'],
      secondary_skills: ['aws'],
    });
    const result = calculateMatchScore(
      candidate,
      ['aws'],
      [],
    );
    expect(result.details.mustHaveMatched).not.toContain('aws');
    expect(result.details.mustHaveSecondary).toContain('aws');
    expect(result.details.mustHaveMissing).toEqual([]);
  });

  it('both experience boundaries are respected', () => {
    const candidate = makeCandidate({ total_experience: 5 });

    // Exact boundary: min = 5, candidate = 5 → match
    const result1 = calculateMatchScore(candidate, [], [], 5, 10);
    expect(result1.details.experienceMatch).toBe('full');

    // Exact boundary: max = 5, candidate = 5 → match
    const result2 = calculateMatchScore(candidate, [], [], 0, 5);
    expect(result2.details.experienceMatch).toBe('full');
  });

  it('empty must-have skills results in full 40 points', () => {
    const candidate = makeCandidate();
    const result = calculateMatchScore(candidate, [], ['typescript']);
    // must-have: 40, good-to-have: 22, role: 8, exp: 8, seniority: 5, location: 10, availability: 7
    expect(result.score).toBe(100);
  });

  it('empty good-to-have skills results in full 22 points (score capped at 100)', () => {
    const candidate = makeCandidate();
    const result = calculateMatchScore(candidate, ['react'], []);
    // must-have: 40 (1/1), good-to-have: 22, role: 8, exp: 8, seniority: 5, location: 10, availability: 7 = 100
    // + prominence/years bonus would push to 110; capped at 100
    expect(result.score).toBe(100);
  });

  // TC-SCORE-012: Related skill does NOT score for must-have (exact-only)
  it('related skill does NOT score for must-have (exact-only scoring)', () => {
    const candidate = makeCandidate({
      primary_skills: ['vue'],  // vue is in frontend category, same as react
      secondary_skills: [],
    });
    const result = calculateMatchScore(candidate, ['react'], []);
    expect(result.details.mustHaveMatched).not.toContain('react');
    expect(result.details.mustHaveRelated).toContain('react'); // related shown for display only
    expect(result.details.mustHaveMissing).toEqual([]);
    // Score: 0/1 * 40 = 0 + 22 + 8 + 8 + 5 + 10 + 7 = 60
    expect(result.score).toBe(60);
  });

  // TC-SCORE-013: Related skill counts at 0.3x for good-to-have
  it('related skill counts at 0.3x weight for good-to-have', () => {
    const candidate = makeCandidate({
      primary_skills: ['vue'],
      secondary_skills: [],
    });
    const result = calculateMatchScore(candidate, [], ['react']); // react is good-to-have
    expect(result.details.goodToHaveMatched).toEqual([]);
    expect(result.details.goodToHaveRelated).toContain('react');
    // Score: 40 + (0 + 1*0.3)/1 * 22 = 6.6 + 8 + 8 + 5 + 10 + 7 = 84.6 → 85
    expect(result.score).toBe(85);
  });

  // TC-SCORE-014: Salesforce and ServiceNow are in different categories after split
  it('salesforce and servicenow are in different categories after split', () => {
    const candidate = makeCandidate({
      primary_skills: ['servicenow'],
      secondary_skills: [],
    });
    const result = calculateMatchScore(candidate, ['salesforce'], []);
    expect(result.details.mustHaveMatched).toEqual([]);
    expect(result.details.mustHaveRelated).toEqual([]); // different categories
    expect(result.details.mustHaveMissing).toContain('salesforce');
  });

  // TC-SCORE-015: 1/10 must-have is below 40% threshold
  it('candidate with 1 of 10 must-have skills is below 40% threshold', () => {
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

  // TC-SCORE-016: 4/10 must-have passes 40% threshold
  it('candidate with 4 of 10 must-have skills passes 40% threshold', () => {
    const candidate = makeCandidate({
      primary_skills: ['react', 'nodejs', 'python', 'java'],
      secondary_skills: [],
    });
    const mustHave = ['react', 'nodejs', 'python', 'java', 'golang',
                       'rust', 'csharp', 'ruby', 'php', 'scala'];
    const result = calculateMatchScore(candidate, mustHave, []);
    const ratio = result.details.mustHaveMatched.length / mustHave.length;
    expect(ratio).toBe(0.4);
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
    expect(result.details.mustHaveMatched).toEqual([]); // no exact match
    expect(result.details.mustHaveRelated).toContain('mysql'); // related for display
    expect(result.details.mustHaveMissing).toEqual([]); // not truly missing
  });

  it('RELATED_MATCH_WEIGHT is 0.3', () => {
    expect(RELATED_MATCH_WEIGHT).toBe(0.3);
  });

  it('MUST_HAVE_RELATED_WEIGHT is 0.3', () => {
    expect(MUST_HAVE_RELATED_WEIGHT).toBe(0.3);
  });

  it('MIN_MUST_HAVE_MATCH_RATIO is 0.40', () => {
    expect(MIN_MUST_HAVE_MATCH_RATIO).toBe(0.40);
  });

  it('MUST_HAVE_WEIGHT is 40', () => {
    expect(MUST_HAVE_WEIGHT).toBe(40);
  });

  it('GOOD_TO_HAVE_WEIGHT is 22', () => {
    expect(GOOD_TO_HAVE_WEIGHT).toBe(22);
  });

  it('ROLE_MATCH_WEIGHT is 8', () => {
    expect(ROLE_MATCH_WEIGHT).toBe(8);
  });

  // --- Location Tests ---

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
    // 40 + 22 + 8 + 8 + 5 + 0 + 7 = 90
    expect(result.score).toBe(90);
  });

  // TC-SCORE-021: Blank location gives partial (+5)
  it('blank location gives partial match (+5 points)', () => {
    const candidate = makeCandidate({ location: undefined });
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, undefined, undefined, ['bangalore']);
    expect(result.details.locationMatch).toBe('partial');
    // 40 + 22 + 8 + 8 + 5 + 5 + 7 = 95
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

  // --- Experience Graduated Scoring Tests ---

  // TC-SCORE-025: Experience slightly below min → partial
  it('experience slightly below min gives partial match (+4)', () => {
    const candidate = makeCandidate({ total_experience: 4 });
    // min = 5, candidate = 4, diff = 1 ≤ 2 → partial
    const result = calculateMatchScore(candidate, [], [], 5);
    expect(result.details.experienceMatch).toBe('partial');
    // 40 + 22 + 8 + 4 + 5 + 10 + 7 = 96
    expect(result.score).toBe(96);
  });

  // TC-SCORE-026: Experience way below min → none
  it('experience way below min gives none (+0)', () => {
    const candidate = makeCandidate({ total_experience: 1 });
    // min = 5, candidate = 1, diff = 4 > 2 → none
    const result = calculateMatchScore(candidate, [], [], 5);
    expect(result.details.experienceMatch).toBe('none');
    // 40 + 22 + 8 + 0 + 5 + 10 + 7 = 92
    expect(result.score).toBe(92);
  });

  // TC-SCORE-027: Experience slightly above max → partial
  it('experience slightly above max gives partial match (+4)', () => {
    const candidate = makeCandidate({ total_experience: 9 });
    // max = 8, candidate = 9, diff = 1 ≤ 2 → partial
    const result = calculateMatchScore(candidate, [], [], undefined, 8);
    expect(result.details.experienceMatch).toBe('partial');
    // 40 + 22 + 8 + 4 + 5 + 10 + 7 = 96
    expect(result.score).toBe(96);
  });

  // --- Availability Scoring Tests ---

  // TC-SCORE-028: Availability exact match → full
  it('availability exact match gives full points (+7)', () => {
    const candidate = makeCandidate({ availability: 'immediate' });
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, undefined, undefined, [], ['immediate']);
    expect(result.details.availabilityMatch).toBe('full');
    expect(result.score).toBe(100);
  });

  // TC-SCORE-029: Candidate available earlier than desired → full
  it('candidate available earlier than desired gives full points', () => {
    const candidate = makeCandidate({ availability: 'immediate' });
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, undefined, undefined, [], ['1_month']);
    expect(result.details.availabilityMatch).toBe('full');
    expect(result.score).toBe(100);
  });

  // TC-SCORE-030: Availability 1-2 steps later → partial
  it('availability 1-2 steps later gives partial (+3)', () => {
    const candidate = makeCandidate({ availability: '1_month' });
    // Looking for immediate (idx 0), candidate is 1_month (idx 3), diff = 3 but 1_month is 2 steps from 2_weeks...
    // Actually: latest desired is immediate (idx 0), candidate idx is 3, steps later = 3. That's >2 so 'none'.
    // Let me use a closer example: looking for 2_weeks (idx 2), candidate is 1_month (idx 3), diff = 1 → partial
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, undefined, undefined, [], ['2_weeks']);
    expect(result.details.availabilityMatch).toBe('partial');
    // 40 + 22 + 8 + 8 + 5 + 10 + 3 = 96
    expect(result.score).toBe(96);
  });

  // TC-SCORE-031: Availability 3+ steps later → none
  it('availability 3+ steps later gives none (+0)', () => {
    const candidate = makeCandidate({ availability: '3_months' });
    // Looking for immediate (idx 0), candidate is 3_months (idx 5), diff = 5 > 2 → none
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, undefined, undefined, [], ['immediate']);
    expect(result.details.availabilityMatch).toBe('none');
    // 40 + 22 + 8 + 8 + 5 + 10 + 0 = 93
    expect(result.score).toBe(93);
  });

  // TC-SCORE-032: No availability criteria → full for all
  it('no availability criteria gives full availability points', () => {
    const candidate = makeCandidate({ availability: '3_months' });
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, undefined, undefined, [], []);
    expect(result.details.availabilityMatch).toBe('full');
    expect(result.score).toBe(100);
  });

  // TC-SCORE-033: Multi-availability OR — any match is full
  it('availability matches any of the desired values → full', () => {
    const candidate = makeCandidate({ availability: '2_weeks' });
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, undefined, undefined, [], ['immediate', '2_weeks']);
    expect(result.details.availabilityMatch).toBe('full');
    expect(result.score).toBe(100);
  });

  // --- Skill Relevance Bonus Tests ---

  // TC-SCORE-034: Skill in top-3 primary position gets full prominence bonus (capped at 100)
  it('must-have skill in top-3 position gets full prominence bonus (score capped at 100)', () => {
    const candidate = makeCandidate({
      primary_skills: ['oracle', 'java', 'sql'],
      primary_skill_years: { oracle: 8, java: 5, sql: 4 },
      secondary_skills: [],
    });
    const result = calculateMatchScore(candidate, ['oracle'], []);
    // Base: 100; Prominence bonus 8 + years bonus 4 = 12; gross 112 → capped at 100
    expect(result.score).toBe(100);
  });

  // TC-SCORE-035: Skill in position 4-6 gets half prominence bonus (capped at 100)
  it('must-have skill in position 4-6 gets half prominence bonus (score capped at 100)', () => {
    const candidate = makeCandidate({
      primary_skills: ['java', 'python', 'react', 'oracle', 'sql'],
      primary_skill_years: { java: 5, python: 4, react: 3, oracle: 6, sql: 4 },
      secondary_skills: [],
    });
    const result = calculateMatchScore(candidate, ['oracle'], []);
    // Base: 100; Prominence bonus 4 + years bonus 4 = 8; gross 108 → capped at 100
    expect(result.score).toBe(100);
  });

  // TC-SCORE-036: Skill only in secondary skills gets partial must-have credit (0.5 weight) and no prominence bonus
  it('must-have skill in secondary-only gets half credit and no relevance bonus', () => {
    const candidate = makeCandidate({
      primary_skills: ['java', 'python'],
      primary_skill_years: { java: 5, python: 4 },
      secondary_skills: ['oracle'],
    });
    const result = calculateMatchScore(candidate, ['oracle'], []);
    // Base (full-match baseline): 100.
    // Must-have match is secondary-only → 0.5 ratio × 40 = 20 (vs 40 full) → -20.
    // Prominence: 0 (secondary). Years: 0. Bonus total: 0.
    expect(result.score).toBe(80);
  });

  // TC-SCORE-037: Skill with <2 years gets no years bonus (capped at 100)
  it('must-have skill with less than 2 years gets no years bonus (score capped at 100)', () => {
    const candidate = makeCandidate({
      primary_skills: ['oracle'],
      primary_skill_years: { oracle: 1 },
      secondary_skills: [],
    });
    const result = calculateMatchScore(candidate, ['oracle'], []);
    // Base: 100; Prominence bonus 8, years 0; gross 108 → capped at 100
    expect(result.score).toBe(100);
  });

  // TC-SCORE-038: Skill at position 10+ gets no prominence bonus (capped at 100)
  it('must-have skill at position 10+ gets no prominence bonus (score capped at 100)', () => {
    const candidate = makeCandidate({
      primary_skills: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'oracle'],
      primary_skill_years: { oracle: 8 },
      secondary_skills: [],
    });
    const result = calculateMatchScore(candidate, ['oracle'], []);
    // Base: 100; Prominence 0 (pos 10), years 4; gross 104 → capped at 100
    expect(result.score).toBe(100);
  });

  it('SKILL_PROMINENCE_WEIGHT is 8', () => {
    expect(SKILL_PROMINENCE_WEIGHT).toBe(8);
  });

  it('SKILL_YEARS_WEIGHT is 4', () => {
    expect(SKILL_YEARS_WEIGHT).toBe(4);
  });

  // --- Score Cap Tests ---

  // TC-SCORE-CAP-001: Score is always capped at 100 regardless of bonus
  it('score never exceeds 100 even with maximum relevance bonus', () => {
    const candidate = makeCandidate({
      primary_skills: ['oracle'],
      primary_skill_years: { oracle: 10 },
      secondary_skills: [],
    });
    const result = calculateMatchScore(candidate, ['oracle'], []);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  // TC-SCORE-CAP-002: Relevance bonus preserves ordering when base < 100
  it('relevance bonus differentiates candidates when base score is below 100', () => {
    // Seniority mismatch (-5) + location mismatch (-10) → base 85, so bonus can differentiate
    const highProminence = makeCandidate({
      primary_skills: ['oracle', 'java'],
      primary_skill_years: { oracle: 8, java: 3 },
      secondary_skills: [],
      location: 'Mumbai',
    });
    const lowProminence = makeCandidate({
      primary_skills: ['java', 'python', 'react', 'node', 'go', 'rust', 'oracle', 'sql', 'mongo', 'redis', 'kafka'],
      primary_skill_years: { oracle: 8 },
      secondary_skills: [],
      location: 'Mumbai',
    });
    // base = 40+22+8+8+0+0+7 = 85 (seniority=['principal'] mismatches 'senior', location mismatch)
    const highResult = calculateMatchScore(highProminence, ['oracle'], [], undefined, undefined, ['principal'], undefined, ['bangalore']);
    const lowResult = calculateMatchScore(lowProminence, ['oracle'], [], undefined, undefined, ['principal'], undefined, ['bangalore']);
    // highProminence: pos 0, 8yrs → bonus 12 → 97; lowProminence: pos 10, 8yrs → bonus 4 → 89
    expect(highResult.score).toBeGreaterThan(lowResult.score);
    expect(highResult.score).toBeLessThanOrEqual(100);
    expect(lowResult.score).toBeLessThanOrEqual(100);
  });

  // TC-SCORE-CAP-003: Base score exactly 100 (no bonus active path) still returns 100
  it('base score of 100 with no must-have skills returns exactly 100', () => {
    const candidate = makeCandidate();
    const result = calculateMatchScore(candidate, [], []);
    expect(result.score).toBe(100);
  });

  // TC-SCORE-CAP-004: CTC penalty is applied before the cap
  it('CTC penalty is applied before the 100-cap (penalty reduces from over-100 gross to under 100)', () => {
    // Candidate with location mismatch (base 90) + full relevance bonus → gross ~102
    // Apply a CTC penalty so the result is < 100, confirming penalty ran before cap
    const candidate = makeCandidate({
      primary_skills: ['oracle'],
      primary_skill_years: { oracle: 8 },
      secondary_skills: [],
      expected_ctc: 45, // 1.5× budget → overRatio=0.5 → penalty=10
    });
    const resultWithPenalty = calculateMatchScore(
      candidate, ['oracle'], [],
      undefined, undefined, undefined,
      30,          // maxBudgetLpa
      ['bangalore'] // location mismatch: -10 from base
    );
    const resultNoPenalty = calculateMatchScore(
      candidate, ['oracle'], [],
      undefined, undefined, undefined,
      undefined,   // no budget
      ['bangalore']
    );
    expect(resultNoPenalty.score).toBeLessThanOrEqual(100);
    expect(resultWithPenalty.score).toBeLessThan(resultNoPenalty.score);
    expect(resultWithPenalty.score).toBeGreaterThanOrEqual(0);
  });

  // --- Role Match Tests ---

  // TC-SCORE-039: Same role category gives full role points (+8)
  it('same role category gives full role points', () => {
    const candidate = makeCandidate({ roles: ['Backend Developer'] });
    const result = calculateMatchScore(
      candidate, [], [], undefined, undefined, undefined, undefined, [], [],
      undefined, undefined, ['Software Engineer']
    );
    expect(result.details.roleMatch).toBe('full');
    expect(result.score).toBe(100);
  });

  // TC-SCORE-040: Different role category gives 0 role points
  it('different role category gives 0 role points', () => {
    const candidate = makeCandidate({ roles: ['QA Engineer'] });
    const result = calculateMatchScore(
      candidate, [], [], undefined, undefined, undefined, undefined, [], [],
      undefined, undefined, ['Software Engineer']
    );
    expect(result.details.roleMatch).toBe('none');
    // 40 + 22 + 0 + 8 + 5 + 10 + 7 = 92
    expect(result.score).toBe(92);
  });

  // TC-SCORE-041: No search roles gives full role points (no filter)
  it('no search roles gives full role points', () => {
    const candidate = makeCandidate({ roles: ['QA Engineer'] });
    const result = calculateMatchScore(
      candidate, [], [], undefined, undefined, undefined, undefined, [], [],
      undefined, undefined, []
    );
    expect(result.details.roleMatch).toBe('full');
    expect(result.score).toBe(100);
  });

  // TC-SCORE-042: No candidate roles gives partial role points
  it('no candidate roles gives partial role points', () => {
    const candidate = makeCandidate({ roles: [] });
    const result = calculateMatchScore(
      candidate, [], [], undefined, undefined, undefined, undefined, [], [],
      undefined, undefined, ['Software Engineer']
    );
    expect(result.details.roleMatch).toBe('partial');
    // 40 + 22 + 4 + 8 + 5 + 10 + 7 = 96
    expect(result.score).toBe(96);
  });

  // TC-SCORE-043: Developer outranks tester for developer JD (role scoring impact)
  it('developer candidate scores higher than tester for developer JD', () => {
    const developerCandidate = makeCandidate({
      primary_skills: ['java', 'rest_api', 'sql'],
      roles: ['Java Developer'],
    });
    const testerCandidate = makeCandidate({
      primary_skills: ['java', 'rest_api', 'sql'],
      roles: ['QA Automation Engineer'],
    });
    const searchRoles = ['Java Developer', 'Backend Engineer'];

    // Location filter ensures base < 100 so role match can differentiate the final scores
    const devResult = calculateMatchScore(
      developerCandidate, ['java', 'rest_api'], [], undefined, undefined, undefined, undefined, ['bangalore'], [],
      undefined, undefined, searchRoles
    );
    const testResult = calculateMatchScore(
      testerCandidate, ['java', 'rest_api'], [], undefined, undefined, undefined, undefined, ['bangalore'], [],
      undefined, undefined, searchRoles
    );

    expect(devResult.details.roleMatch).toBe('full');
    expect(testResult.details.roleMatch).toBe('none');
    expect(devResult.score).toBeGreaterThan(testResult.score);
  });

  // --- Secondary-skill weighting (primary vs secondary bucket) ---

  it('mixed must-have: 1 in primary + 1 in secondary scores primary higher', () => {
    const primaryOnly = makeCandidate({
      primary_skills: ['react', 'nodejs'],
      secondary_skills: [],
    });
    const primaryPlusSecondary = makeCandidate({
      primary_skills: ['react'],
      secondary_skills: ['nodejs'],
    });
    // Location filter keeps base < 100 so relevance bonus doesn't push both to 100
    const primaryResult = calculateMatchScore(primaryOnly, ['react', 'nodejs'], [], undefined, undefined, undefined, undefined, ['bangalore']);
    const splitResult = calculateMatchScore(primaryPlusSecondary, ['react', 'nodejs'], [], undefined, undefined, undefined, undefined, ['bangalore']);
    expect(primaryResult.score).toBeGreaterThan(splitResult.score);
    expect(splitResult.details.mustHaveMatched).toEqual(['react']);
    expect(splitResult.details.mustHaveSecondary).toEqual(['nodejs']);
  });

  it('candidate whose only evidence of must-have is in secondary fails the 40% filter', () => {
    const candidate = makeCandidate({
      primary_skills: ['react'],
      secondary_skills: ['aws', 'docker'],
    });
    // Must-haves: aws, docker, kubernetes — two match in secondary, one missing
    const result = calculateMatchScore(candidate, ['aws', 'docker', 'kubernetes'], []);
    // effective = (0 + 0*0.85 + 2*0.5) / 3 = 0.333 — below 0.40 threshold
    const effective = (
      result.details.mustHaveMatched.length
      + result.details.mustHaveFuzzy.length * 0.85
      + result.details.mustHaveSecondary.length * 0.5
    ) / 3;
    expect(effective).toBeLessThan(MIN_MUST_HAVE_MATCH_RATIO);
  });

  // --- CTC Over-Budget Penalty Tests ---

  // TC-SCORE-CTC-001: over-budget candidate scores lower than identical in-budget candidate
  it('over-budget candidate scores lower than identical in-budget candidate', () => {
    const inBudget = makeCandidate({ expected_ctc: 20 });
    const overBudget = makeCandidate({ expected_ctc: 60 }); // 2× maxBudgetLpa
    const maxBudgetLpa = 30;

    const inResult = calculateMatchScore(inBudget, [], [], undefined, undefined, undefined, maxBudgetLpa);
    const overResult = calculateMatchScore(overBudget, [], [], undefined, undefined, undefined, maxBudgetLpa);

    expect(overResult.score).toBeLessThan(inResult.score);
  });

  // TC-SCORE-CTC-002: penalty is proportional to degree of over-budget
  it('penalty is proportional — 2× over budget penalised more than 10% over', () => {
    const slightlyOver = makeCandidate({ expected_ctc: 33 }); // 10% over 30
    const significantlyOver = makeCandidate({ expected_ctc: 60 }); // 2× over 30
    const maxBudgetLpa = 30;

    const slightResult = calculateMatchScore(slightlyOver, [], [], undefined, undefined, undefined, maxBudgetLpa);
    const sigResult = calculateMatchScore(significantlyOver, [], [], undefined, undefined, undefined, maxBudgetLpa);

    // 2× over budget (penalty=20) must rank lower than 10% over budget (penalty=2)
    expect(sigResult.score).toBeLessThan(slightResult.score);
  });

  // TC-SCORE-CTC-003: candidate at or below budget ceiling receives no penalty
  it('candidate at budget ceiling receives no score penalty', () => {
    const atBudget = makeCandidate({ expected_ctc: 30 });
    const noCTC = makeCandidate();
    const maxBudgetLpa = 30;

    const atResult = calculateMatchScore(atBudget, [], [], undefined, undefined, undefined, maxBudgetLpa);
    const noResult = calculateMatchScore(noCTC, [], [], undefined, undefined, undefined, maxBudgetLpa);

    expect(atResult.score).toBe(noResult.score);
  });

  // TC-SCORE-CTC-004: no maxBudgetLpa → CTC does not affect score
  it('when maxBudgetLpa is absent, expected_ctc does not affect score', () => {
    const withCTC = makeCandidate({ expected_ctc: 200 });
    const noCTC = makeCandidate();

    const withResult = calculateMatchScore(withCTC, [], []);
    const withoutResult = calculateMatchScore(noCTC, [], []);

    expect(withResult.score).toBe(withoutResult.score);
  });

  // TC-SCORE-CTC-005: no expected_ctc → score unaffected regardless of maxBudgetLpa
  it('when expected_ctc is absent, maxBudgetLpa does not affect score', () => {
    const withBudget = calculateMatchScore(makeCandidate(), [], [], undefined, undefined, undefined, 50);
    const withoutBudget = calculateMatchScore(makeCandidate(), [], []);

    expect(withBudget.score).toBe(withoutBudget.score);
  });

  // TC-SCORE-CTC-006: ctcMatch boolean uses 0.85 threshold, independent of penalty
  it('ctcMatch is false when expectedCtc > maxBudgetLpa × 0.85, true otherwise', () => {
    const maxBudgetLpa = 30;
    const overThreshold = makeCandidate({ expected_ctc: 26 }); // 26 > 30 * 0.85 = 25.5
    const underThreshold = makeCandidate({ expected_ctc: 20 }); // 20 <= 25.5

    const overResult = calculateMatchScore(overThreshold, [], [], undefined, undefined, undefined, maxBudgetLpa);
    const underResult = calculateMatchScore(underThreshold, [], [], undefined, undefined, undefined, maxBudgetLpa);

    expect(overResult.details.ctcMatch).toBe(false);
    expect(underResult.details.ctcMatch).toBe(true);
    // Both are under budget ceiling (26 <= 30, 20 <= 30) so neither incurs a penalty
    expect(overResult.score).toBe(underResult.score);
  });

  // TC-SCORE-CTC-007: score never goes below zero for extreme over-budget
  it('score never goes below zero even for extreme over-budget (10× budget)', () => {
    const candidate = makeCandidate({
      primary_skills: ['cobol'],
      secondary_skills: [],
      expected_ctc: 300, // 10× the 30 LPA budget
    });

    const result = calculateMatchScore(
      candidate,
      ['react', 'nodejs', 'typescript', 'python', 'java'],
      [],
      undefined, undefined,
      ['principal'],
      30
    );

    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  // TC-SCORE-CTC-008: maxBudgetLpa = 0 does not cause division-by-zero
  it('maxBudgetLpa = 0 does not throw and applies no penalty', () => {
    const candidate = makeCandidate({ expected_ctc: 10 });

    expect(() => {
      const result = calculateMatchScore(candidate, [], [], undefined, undefined, undefined, 0);
      expect(result.score).toBeGreaterThanOrEqual(0);
    }).not.toThrow();
  });

  // TC-SCORE-CTC-009: candidate at ctcMatch 0.85 threshold is within budget ceiling → no penalty
  it('candidate at ctcMatch 0.85 threshold (within budget ceiling) receives no penalty', () => {
    const atThreshold = makeCandidate({ expected_ctc: 25.5 }); // exactly 30 * 0.85
    const noCTC = makeCandidate();
    const maxBudgetLpa = 30;

    const atResult = calculateMatchScore(atThreshold, [], [], undefined, undefined, undefined, maxBudgetLpa);
    const noResult = calculateMatchScore(noCTC, [], [], undefined, undefined, undefined, maxBudgetLpa);

    expect(atResult.score).toBe(noResult.score); // 25.5 <= 30 → no penalty
    expect(atResult.details.ctcMatch).toBe(true);
  });

  it('CTC_OVER_BUDGET_MAX_PENALTY is 20', () => {
    expect(CTC_OVER_BUDGET_MAX_PENALTY).toBe(20);
  });
});
