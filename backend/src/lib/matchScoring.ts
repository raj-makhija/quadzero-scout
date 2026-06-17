import { calculateSkillMatch, normalizeSkill, calculateRoleMatch } from './skillNormalizer.js';
import { isCandidateWithinBudget } from './ctcConversion.js';
import { expandLocationAliases } from './locationNormalizer.js';
import type { CandidateItem, CandidateSearchResult } from '../types/index.js';

export type MatchDetails = CandidateSearchResult['matchDetails'];

/** Minimum effective must-have ratio for a candidate to pass the gate.
 *  Set to 0: any positive ratio (at least one exact, fuzzy, or secondary match)
 *  passes; a ratio of exactly 0 (zero must-have matches) is excluded. */
export const MIN_MUST_HAVE_MATCH_RATIO = 0;

/** Weight applied to related (category-based) good-to-have skill matches. */
export const RELATED_MATCH_WEIGHT = 0.3;

/** Weight applied to related (category-based) must-have skill matches. */
export const MUST_HAVE_RELATED_WEIGHT = 0.3;

/** Weight applied to fuzzy (token-containment / synonym) matches toward must-have ratio and scoring. */
export const FUZZY_MATCH_WEIGHT = 0.85;

/** Weight applied to must-have skills that match only against a candidate's
 *  secondary_skills (non-core). These are weaker signals than primary-bucket
 *  matches because the skill is not a core competency for the candidate. */
export const MUST_HAVE_SECONDARY_WEIGHT = 0.5;

/** Score weight for must-have skills component. */
export const MUST_HAVE_WEIGHT = 40;

/** Score weight for good-to-have skills component. */
export const GOOD_TO_HAVE_WEIGHT = 22;

/** Score weight for role match component (category-based role alignment). */
export const ROLE_MATCH_WEIGHT = 8;

/** Bonus points for skill prominence — matched skill appearing early in primary_skills. */
export const SKILL_PROMINENCE_WEIGHT = 8;

/** Bonus points for years of experience in matched skills. */
export const SKILL_YEARS_WEIGHT = 4;

/** Maximum score penalty applied when a candidate's expected CTC exceeds the budget ceiling. */
export const CTC_OVER_BUDGET_MAX_PENALTY = 20;

/** Recall safety net (#418): a candidate who passes every other gate but does
 *  NOT satisfy the requirement's coreSkill is surfaced for review (rather than
 *  hard-excluded) only when its raw match score clears this floor. Below it, a
 *  non-core match is too weak to be worth a recruiter's attention. */
export const CORESKILL_UNCONFIRMED_SCORE_FLOOR = 40;

/** Score multiplier applied to a surfaced coreSkill-unconfirmed candidate so it
 *  ranks below confirmed matches — surfaced, but clearly secondary (#418). */
export const CORESKILL_UNCONFIRMED_PENALTY = 0.5;

/** Tolerance (in years) for partial experience match outside the specified range. */
const EXPERIENCE_PARTIAL_TOLERANCE = 2;

/** Maps requirement engagement models to compatible candidate engagement models.
 *  Requirement enum: full_time_regular, full_time_contract, part_time_contract
 *  Candidate enum: contract, full_time, either */
const ENGAGEMENT_MODEL_COMPAT: Record<string, string[]> = {
  full_time_regular: ['full_time'],
  full_time_contract: ['full_time', 'contract'],
  part_time_contract: ['contract'],
  full_time: ['full_time'],
  contract: ['contract'],
};

export function isEngagementModelCompatible(reqModel: string, candidateModel: string): boolean {
  if (!reqModel || reqModel === 'either' || candidateModel === 'either') return true;
  const compatible = ENGAGEMENT_MODEL_COMPAT[reqModel];
  if (!compatible) return true;
  return compatible.includes(candidateModel);
}

/** Availability values in order from shortest to longest notice period. */
const AVAILABILITY_ORDER: string[] = [
  'immediate', 'offer_in_hand', '1_week', '2_weeks', '1_month', '2_months', '3_months', 'negotiable',
];

export interface MatchScoreResult {
  score: number;
  details: MatchDetails;
}

/**
 * Check if a candidate's location matches any of the desired search locations.
 * Returns 'full' if match found, 'partial' if candidate has no location, 'none' otherwise.
 */
function matchLocation(
  candidateLocation: string | undefined | null,
  searchLocations: string[]
): 'full' | 'partial' | 'none' {
  if (searchLocations.length === 0) return 'full';

  if (!candidateLocation || !candidateLocation.trim()) return 'partial';

  const candidateLower = candidateLocation.toLowerCase();
  for (const loc of searchLocations) {
    const aliases = expandLocationAliases(loc);
    if (aliases.some(alias => candidateLower.includes(alias))) return 'full';
  }
  return 'none';
}

/**
 * Parse a comma/semicolon-separated location string into an array of
 * trimmed, lowercased individual locations.
 */
export function parseSearchLocations(location?: string): string[] {
  if (!location || !location.trim()) return [];
  return location
    .split(/[,;]/)
    .map(l => l.trim().toLowerCase())
    .filter(l => l.length > 0);
}

/**
 * Graduated experience matching.
 * - No criteria → full
 * - Within range → full
 * - Within EXPERIENCE_PARTIAL_TOLERANCE years of boundary → partial
 * - Further outside → none
 */
function matchExperience(
  candidateExp: number,
  minExp?: number,
  maxExp?: number,
): 'full' | 'partial' | 'none' {
  if (minExp === undefined && maxExp === undefined) return 'full';

  const belowMin = minExp !== undefined && candidateExp < minExp;
  const aboveMax = maxExp !== undefined && candidateExp > maxExp;

  if (!belowMin && !aboveMax) return 'full';

  // Check if within tolerance
  if (belowMin && (minExp! - candidateExp) <= EXPERIENCE_PARTIAL_TOLERANCE) return 'partial';
  if (aboveMax && (candidateExp - maxExp!) <= EXPERIENCE_PARTIAL_TOLERANCE) return 'partial';

  return 'none';
}

/**
 * Availability matching.
 * - No criteria → full
 * - Candidate matches any desired value → full
 * - Candidate available earlier than any desired → full (sooner is always fine)
 * - Candidate 1–2 steps later than the latest desired → partial
 * - Candidate 3+ steps later → none
 */
function matchAvailability(
  candidateAvailability: string | undefined | null,
  searchAvailability: string[]
): 'full' | 'partial' | 'none' {
  if (!searchAvailability || searchAvailability.length === 0) return 'full';
  if (!candidateAvailability) return 'partial';

  const candidateIdx = AVAILABILITY_ORDER.indexOf(candidateAvailability);
  if (candidateIdx === -1) return 'partial'; // unknown availability

  // Exact match
  if (searchAvailability.includes(candidateAvailability)) return 'full';

  // Find the indices of all desired availability values
  const desiredIndices = searchAvailability
    .map(a => AVAILABILITY_ORDER.indexOf(a))
    .filter(i => i !== -1);

  if (desiredIndices.length === 0) return 'full';

  const latestDesired = Math.max(...desiredIndices);
  const earliestDesired = Math.min(...desiredIndices);

  // Candidate available earlier than any desired → full (they can start sooner)
  if (candidateIdx < earliestDesired) return 'full';

  // Distance from the latest desired value
  const stepsLater = candidateIdx - latestDesired;

  if (stepsLater <= 2) return 'partial';
  return 'none';
}

/**
 * Find the 0-based position of a normalized required skill in the candidate's
 * primary_skills array. Returns -1 if the skill is not found in primary skills
 * (it may still exist in secondary skills).
 */
function findSkillPosition(requiredSkill: string, primarySkills: string[]): number {
  // First pass: exact normalized match
  for (let i = 0; i < primarySkills.length; i++) {
    if (normalizeSkill(primarySkills[i]) === requiredSkill) return i;
  }
  // Second pass: substring containment (covers token containment, e.g. "oracle" in "oracle dba")
  for (let i = 0; i < primarySkills.length; i++) {
    const norm = normalizeSkill(primarySkills[i]);
    if (norm.includes(requiredSkill) || requiredSkill.includes(norm)) return i;
  }
  return -1;
}

/**
 * Calculate a relevance bonus for matched must-have skills based on:
 * 1. Skill prominence — how early the skill appears in the candidate's primary_skills
 *    (earlier = more core to the candidate's profile)
 * 2. Skill experience — years of experience the candidate has in the matched skill
 *
 * Returns 0–12 bonus points (8 prominence + 4 years), averaged across matched skills.
 */
function calculateSkillRelevanceBonus(
  matchedSkills: string[],
  primarySkills: string[],
  skillYears: Record<string, number>
): number {
  if (matchedSkills.length === 0) return 0;

  // Normalize skill years keys for lookup
  const normalizedYears: Record<string, number> = {};
  for (const [skill, years] of Object.entries(skillYears || {})) {
    const norm = normalizeSkill(skill);
    normalizedYears[norm] = Math.max(normalizedYears[norm] || 0, years);
  }

  let totalBonus = 0;

  for (const skill of matchedSkills) {
    // Prominence: position in primary_skills array
    const pos = findSkillPosition(skill, primarySkills);
    if (pos >= 0 && pos < 3) totalBonus += SKILL_PROMINENCE_WEIGHT;
    else if (pos >= 0 && pos < 6) totalBonus += SKILL_PROMINENCE_WEIGHT * 0.5;
    else if (pos >= 0 && pos < 10) totalBonus += SKILL_PROMINENCE_WEIGHT * 0.25;
    // pos >= 10 or -1 (secondary-only): no prominence bonus

    // Years of experience in the matched skill
    const years = normalizedYears[skill] || 0;
    if (years >= 5) totalBonus += SKILL_YEARS_WEIGHT;
    else if (years >= 2) totalBonus += SKILL_YEARS_WEIGHT * 0.5;
  }

  return totalBonus / matchedSkills.length;
}

/**
 * Compute a proportional score penalty for candidates whose expected CTC exceeds
 * the budget ceiling. Returns 0 when either value is absent, when maxBudgetLpa is
 * zero (guards against division by zero), or when the candidate is at or under budget.
 * Penalty is capped at CTC_OVER_BUDGET_MAX_PENALTY.
 */
function calculateCtcPenalty(
  expectedCtc: number | undefined | null,
  maxBudgetLpa: number | undefined | null
): number {
  if (expectedCtc == null || maxBudgetLpa == null || maxBudgetLpa <= 0) return 0;
  if (expectedCtc <= maxBudgetLpa) return 0;
  const overRatio = (expectedCtc - maxBudgetLpa) / maxBudgetLpa;
  return Math.min(overRatio * CTC_OVER_BUDGET_MAX_PENALTY, CTC_OVER_BUDGET_MAX_PENALTY);
}

export function calculateMatchScore(
  candidate: CandidateItem,
  mustHaveSkills: string[],
  goodToHaveSkills: string[],
  minExp?: number,
  maxExp?: number,
  seniority?: string[],
  maxBudgetLpa?: number,
  searchLocations?: string[],
  searchAvailability?: string[],
  requiredSynonyms?: Record<string, string[]>,
  candidateSynonyms?: Record<string, string[]>,
  searchRoles?: string[]
): MatchScoreResult {
  let score = 0;

  // Get candidate skills — split by bucket so a must-have that only matches a
  // candidate's secondary_skills is treated as a weaker signal than a match
  // against primary_skills (core competency).
  const primaryBucket = candidate.primary_skills;
  const secondaryBucket = candidate.secondary_skills;
  const candidateSkills = [...primaryBucket, ...secondaryBucket];

  // First, match must-haves against the primary bucket only (full weight).
  const primaryMustHaveMatch = calculateSkillMatch(primaryBucket, mustHaveSkills, true, requiredSynonyms, candidateSynonyms);

  // For must-haves not found in primary, try the secondary bucket (weighted 0.5).
  const secondaryMustHaveMatch = calculateSkillMatch(secondaryBucket, primaryMustHaveMatch.missing, true, requiredSynonyms, candidateSynonyms);
  const mustHaveSecondary = [...secondaryMustHaveMatch.exactMatched, ...secondaryMustHaveMatch.fuzzyMatched];

  // Second pass on still-missing must-haves to surface related skills for display only (not scored).
  const mustHaveRelatedDisplay = calculateSkillMatch(candidateSkills, secondaryMustHaveMatch.missing, false);

  // Combined view used by the scoring bonus and by downstream consumers that
  // still expect aggregated exact/fuzzy arrays (e.g. the existing filter
  // callsites). Primary-bucket matches populate these; secondary-only matches
  // are surfaced via the dedicated mustHaveSecondary field.
  const mustHaveMatch = {
    exactMatched: primaryMustHaveMatch.exactMatched,
    fuzzyMatched: primaryMustHaveMatch.fuzzyMatched,
    relatedMatched: [] as string[],
    missing: secondaryMustHaveMatch.missing,
  };

  const mustHaveEffective = mustHaveSkills.length > 0
    ? (
        primaryMustHaveMatch.exactMatched.length
        + primaryMustHaveMatch.fuzzyMatched.length * FUZZY_MATCH_WEIGHT
        + mustHaveSecondary.length * MUST_HAVE_SECONDARY_WEIGHT
      ) / mustHaveSkills.length
    : 1;
  score += mustHaveEffective * MUST_HAVE_WEIGHT;

  // Skill relevance bonus — rewards candidates where matched must-have skills
  // appear prominently in their primary skills and where they have years of experience.
  // This differentiates e.g. an Oracle DBA (oracle in top 3 skills, 8+ years) from
  // a QA tester who lists oracle as skill #25 with no years data.
  const allMatchedMustHave = [...mustHaveMatch.exactMatched, ...mustHaveMatch.fuzzyMatched];
  score += calculateSkillRelevanceBonus(
    allMatchedMustHave,
    candidate.primary_skills,
    candidate.primary_skill_years
  );

  // Good-to-have skills match — fuzzy + related allowed at reduced weight
  const goodToHaveMatch = calculateSkillMatch(candidateSkills, goodToHaveSkills, false, requiredSynonyms, candidateSynonyms);
  const goodToHaveEffective = goodToHaveSkills.length > 0
    ? (goodToHaveMatch.exactMatched.length + goodToHaveMatch.fuzzyMatched.length * FUZZY_MATCH_WEIGHT + goodToHaveMatch.relatedMatched.length * RELATED_MATCH_WEIGHT) / goodToHaveSkills.length
    : 1;
  score += goodToHaveEffective * GOOD_TO_HAVE_WEIGHT;

  // Experience match (8% of score) — graduated
  const experienceMatch = matchExperience(candidate.total_experience, minExp, maxExp);
  if (experienceMatch === 'full') {
    score += 8;
  } else if (experienceMatch === 'partial') {
    score += 4;
  }

  // Seniority match (5% of score)
  let seniorityMatch = true;
  if (seniority && seniority.length > 0) {
    seniorityMatch = seniority.includes(candidate.seniority);
  }
  if (seniorityMatch) {
    score += 5;
  }

  // Location match (10% of score)
  const locations = searchLocations || [];
  const locationMatch = matchLocation(candidate.location, locations);
  if (locationMatch === 'full') {
    score += 10;
  } else if (locationMatch === 'partial') {
    score += 5;
  }
  // 'none' = 0 points

  // Availability match (7% of score)
  const availabilityMatch = matchAvailability(candidate.availability, searchAvailability || []);
  if (availabilityMatch === 'full') {
    score += 7;
  } else if (availabilityMatch === 'partial') {
    score += 3;
  }

  // Role match (8 pts) — category-based alignment between candidate and requirement roles
  const roleMatch = calculateRoleMatch(candidate.roles || [], searchRoles || []);
  if (roleMatch === 'full') {
    score += ROLE_MATCH_WEIGHT;
  } else if (roleMatch === 'partial') {
    score += ROLE_MATCH_WEIGHT * 0.5;
  }
  // 'none' = 0 points

  // CTC budget check
  const ctcMatch = isCandidateWithinBudget(candidate.expected_ctc, maxBudgetLpa);

  // CTC over-budget penalty — proportional to how far the candidate exceeds maxBudgetLpa
  const ctcPenalty = calculateCtcPenalty(candidate.expected_ctc, maxBudgetLpa);

  return {
    score: Math.min(100, Math.max(0, Math.round(score - ctcPenalty))),
    details: {
      mustHaveMatched: mustHaveMatch.exactMatched,
      mustHaveFuzzy: mustHaveMatch.fuzzyMatched,
      mustHaveSecondary,
      mustHaveRelated: mustHaveRelatedDisplay.relatedMatched,
      mustHaveMissing: mustHaveRelatedDisplay.missing,
      goodToHaveMatched: goodToHaveMatch.exactMatched,
      goodToHaveFuzzy: goodToHaveMatch.fuzzyMatched,
      goodToHaveRelated: goodToHaveMatch.relatedMatched,
      experienceMatch,
      seniorityMatch,
      ctcMatch,
      locationMatch,
      availabilityMatch,
      roleMatch,
    },
  };
}
