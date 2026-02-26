import { calculateSkillMatch } from './skillNormalizer.js';
import { isCandidateWithinBudget } from './ctcConversion.js';
import type { CandidateItem, CandidateSearchResult } from '../types/index.js';

export type MatchDetails = CandidateSearchResult['matchDetails'];

/** Minimum ratio of exact must-have matches to total must-have skills.
 *  Candidates below this threshold are filtered out. */
export const MIN_MUST_HAVE_MATCH_RATIO = 0.3;

/** Weight applied to related (category-based) good-to-have skill matches. */
export const RELATED_MATCH_WEIGHT = 0.3;

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
    if (candidateLower.includes(loc)) return 'full';
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

export function calculateMatchScore(
  candidate: CandidateItem,
  mustHaveSkills: string[],
  goodToHaveSkills: string[],
  minExp?: number,
  maxExp?: number,
  seniority?: string[],
  maxBudgetLpa?: number,
  searchLocations?: string[]
): MatchScoreResult {
  let score = 0;

  // Get candidate skills
  const candidateSkills = [
    ...candidate.primary_skills,
    ...candidate.secondary_skills,
  ];

  // Must-have skills match (50% of score) — exact only, no related credit
  const mustHaveMatch = calculateSkillMatch(candidateSkills, mustHaveSkills, true);

  // Second pass: check which missing must-have skills have related matches (for display only)
  const mustHaveRelatedCheck = calculateSkillMatch(candidateSkills, mustHaveMatch.missing, false);

  const mustHaveRatio = mustHaveSkills.length > 0
    ? mustHaveMatch.exactMatched.length / mustHaveSkills.length
    : 1;
  score += mustHaveRatio * 50;

  // Good-to-have skills match (20% of score) — related allowed at reduced weight
  const goodToHaveMatch = calculateSkillMatch(candidateSkills, goodToHaveSkills, false);
  const goodToHaveEffective = goodToHaveSkills.length > 0
    ? (goodToHaveMatch.exactMatched.length + goodToHaveMatch.relatedMatched.length * RELATED_MATCH_WEIGHT) / goodToHaveSkills.length
    : 1;
  score += goodToHaveEffective * 20;

  // Experience match (10% of score)
  const experience = candidate.total_experience;
  let experienceMatch = true;
  if (minExp !== undefined && experience < minExp) {
    experienceMatch = false;
  }
  if (maxExp !== undefined && experience > maxExp) {
    experienceMatch = false;
  }
  if (experienceMatch) {
    score += 10;
  }

  // Seniority match (10% of score)
  let seniorityMatch = true;
  if (seniority && seniority.length > 0) {
    seniorityMatch = seniority.includes(candidate.seniority);
  }
  if (seniorityMatch) {
    score += 10;
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

  // CTC budget check
  const ctcMatch = isCandidateWithinBudget(candidate.expected_ctc, maxBudgetLpa);

  return {
    score: Math.round(score),
    details: {
      mustHaveMatched: mustHaveMatch.exactMatched,
      mustHaveRelated: mustHaveRelatedCheck.relatedMatched,
      mustHaveMissing: mustHaveRelatedCheck.missing,
      goodToHaveMatched: goodToHaveMatch.exactMatched,
      goodToHaveRelated: goodToHaveMatch.relatedMatched,
      experienceMatch,
      seniorityMatch,
      ctcMatch,
      locationMatch,
    },
  };
}
