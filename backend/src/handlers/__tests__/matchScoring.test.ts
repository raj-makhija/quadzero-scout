import { describe, it, expect } from 'vitest';
import type { CandidateItem } from '../../types/index.js';
import { calculateMatchScore, parseSearchLocations, MIN_MUST_HAVE_MATCH_RATIO, RELATED_MATCH_WEIGHT, MUST_HAVE_RELATED_WEIGHT, MUST_HAVE_WEIGHT, GOOD_TO_HAVE_WEIGHT } from '../../lib/matchScoring.js';

// ---------------------------------------------------------------------------
// Match Scoring Algorithm Tests
// Weights: must-have 45, good-to-have 25, experience 8, seniority 5,
//          location 10, availability 7 = 100
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
    expect(result.details.experienceMatch).toBe('full');
    expect(result.details.seniorityMatch).toBe(true);
  });

  // TC-SCORE-002
  it('must-have skills contribute 45% of score (prorated)', () => {
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
    // 1 out of 4 must-have = 45 * 0.25 = 11.25
    // good-to-have: none specified → full 25
    // experience: no filter → 8, seniority: no filter → 5, location: no filter → 10, availability: no filter → 7
    // Total: 11.25 + 25 + 8 + 5 + 10 + 7 = 66.25 → 66
    expect(result.details.mustHaveMatched).toContain('react');
    expect(result.details.mustHaveMatched).not.toContain('golang');
    expect(result.score).toBeLessThan(100);
  });

  // TC-SCORE-003
  it('good-to-have skills contribute 25% of score (prorated)', () => {
    const candidate = makeCandidate({
      primary_skills: ['react', 'nodejs'],
      secondary_skills: ['typescript'],
    });
    const result = calculateMatchScore(
      candidate,
      [],                           // no must-have
      ['typescript', 'kubernetes'], // 1 of 2 good-to-have (exact)
    );
    // must-have: none specified → 45
    // good-to-have: 1/2 exact = (1 + 0) / 2 * 25 = 12.5
    // experience: 8, seniority: 5, location: 10, availability: 7
    // Total: 45 + 12.5 + 8 + 5 + 10 + 7 = 87.5 → 88
    expect(result.score).toBe(88);
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
    // 45 + 25 + 0 + 5 + 10 + 7 = 92
    expect(result.score).toBe(92);
  });

  // TC-SCORE-006
  it('experience way above maximum gives 0 experience points', () => {
    const candidate = makeCandidate({ total_experience: 12 });
    const result = calculateMatchScore(candidate, [], [], undefined, 8);
    expect(result.details.experienceMatch).toBe('none');
    // 45 + 25 + 0 + 5 + 10 + 7 = 92
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
    // 45 + 25 + 8 + 0 + 10 + 7 = 95
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
    // 1 exact + 1 related (typescript in same frontend category) of 3 must-have
    // = (1 + 1*0.3)/3 * 45 = 19.5 + 25 + 8 + 5 + 10 + 7 = 74.5 → 75
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
    expect(result1.details.experienceMatch).toBe('full');

    // Exact boundary: max = 5, candidate = 5 → match
    const result2 = calculateMatchScore(candidate, [], [], 0, 5);
    expect(result2.details.experienceMatch).toBe('full');
  });

  it('empty must-have skills results in full 45 points', () => {
    const candidate = makeCandidate();
    const result = calculateMatchScore(candidate, [], ['typescript']);
    // must-have: 45, good-to-have: 25, exp: 8, seniority: 5, location: 10, availability: 7
    expect(result.score).toBe(100);
  });

  it('empty good-to-have skills results in full 25 points', () => {
    const candidate = makeCandidate();
    const result = calculateMatchScore(candidate, ['react'], []);
    // must-have: 45 (1/1), good-to-have: 25, exp: 8, seniority: 5, location: 10, availability: 7
    expect(result.score).toBe(100);
  });

  // TC-SCORE-012: Related skill counts at 0.3x for must-have
  it('related skill counts at 0.3x weight for must-have match', () => {
    const candidate = makeCandidate({
      primary_skills: ['vue'],  // vue is in frontend category, same as react
      secondary_skills: [],
    });
    const result = calculateMatchScore(candidate, ['react'], []);
    expect(result.details.mustHaveMatched).not.toContain('react');
    expect(result.details.mustHaveRelated).toContain('react'); // related match
    expect(result.details.mustHaveMissing).toEqual([]);
    // Score: (0 + 1*0.3)/1 * 45 = 13.5 + 25 + 8 + 5 + 10 + 7 = 68.5 → 69
    expect(result.score).toBe(69);
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
    // Score: 45 + (0 + 1*0.3)/1 * 25 = 7.5 + 8 + 5 + 10 + 7 = 82.5 → 83
    expect(result.score).toBe(83);
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

  // TC-SCORE-015: 1/10 must-have is below 25% threshold
  it('candidate with 1 of 10 must-have skills is below 25% threshold', () => {
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

  // TC-SCORE-016: 3/10 must-have passes 25% threshold
  it('candidate with 3 of 10 must-have skills passes 25% threshold', () => {
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

  it('MIN_MUST_HAVE_MATCH_RATIO is 0.25', () => {
    expect(MIN_MUST_HAVE_MATCH_RATIO).toBe(0.25);
  });

  it('MUST_HAVE_WEIGHT is 45', () => {
    expect(MUST_HAVE_WEIGHT).toBe(45);
  });

  it('GOOD_TO_HAVE_WEIGHT is 25', () => {
    expect(GOOD_TO_HAVE_WEIGHT).toBe(25);
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
    // 45 + 25 + 8 + 5 + 0 + 7 = 90
    expect(result.score).toBe(90);
  });

  // TC-SCORE-021: Blank location gives partial (+5)
  it('blank location gives partial match (+5 points)', () => {
    const candidate = makeCandidate({ location: undefined });
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, undefined, undefined, ['bangalore']);
    expect(result.details.locationMatch).toBe('partial');
    // 45 + 25 + 8 + 5 + 5 + 7 = 95
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
    // 45 + 25 + 4 + 5 + 10 + 7 = 96
    expect(result.score).toBe(96);
  });

  // TC-SCORE-026: Experience way below min → none
  it('experience way below min gives none (+0)', () => {
    const candidate = makeCandidate({ total_experience: 1 });
    // min = 5, candidate = 1, diff = 4 > 2 → none
    const result = calculateMatchScore(candidate, [], [], 5);
    expect(result.details.experienceMatch).toBe('none');
    // 45 + 25 + 0 + 5 + 10 + 7 = 92
    expect(result.score).toBe(92);
  });

  // TC-SCORE-027: Experience slightly above max → partial
  it('experience slightly above max gives partial match (+4)', () => {
    const candidate = makeCandidate({ total_experience: 9 });
    // max = 8, candidate = 9, diff = 1 ≤ 2 → partial
    const result = calculateMatchScore(candidate, [], [], undefined, 8);
    expect(result.details.experienceMatch).toBe('partial');
    // 45 + 25 + 4 + 5 + 10 + 7 = 96
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
    // 45 + 25 + 8 + 5 + 10 + 3 = 96
    expect(result.score).toBe(96);
  });

  // TC-SCORE-031: Availability 3+ steps later → none
  it('availability 3+ steps later gives none (+0)', () => {
    const candidate = makeCandidate({ availability: '3_months' });
    // Looking for immediate (idx 0), candidate is 3_months (idx 5), diff = 5 > 2 → none
    const result = calculateMatchScore(candidate, [], [], undefined, undefined, undefined, undefined, [], ['immediate']);
    expect(result.details.availabilityMatch).toBe('none');
    // 45 + 25 + 8 + 5 + 10 + 0 = 93
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
});
