import { calculateSkillMatch } from './skillNormalizer.js';
import { isCandidateWithinBudget } from './ctcConversion.js';
import type { CandidateItem, CandidateSearchResult } from '../types/index.js';

export type MatchDetails = CandidateSearchResult['matchDetails'];

export interface MatchScoreResult {
  score: number;
  details: MatchDetails;
}

export function calculateMatchScore(
  candidate: CandidateItem,
  mustHaveSkills: string[],
  goodToHaveSkills: string[],
  minExp?: number,
  maxExp?: number,
  seniority?: string[],
  maxBudgetLpa?: number
): MatchScoreResult {
  let score = 0;

  // Get candidate skills
  const candidateSkills = [
    ...candidate.primary_skills,
    ...candidate.secondary_skills,
  ];

  // Must-have skills match (50% of score)
  const mustHaveMatch = calculateSkillMatch(candidateSkills, mustHaveSkills);
  const mustHaveRatio = mustHaveSkills.length > 0
    ? mustHaveMatch.matched.length / mustHaveSkills.length
    : 1;
  score += mustHaveRatio * 50;

  // Good-to-have skills match (20% of score)
  const goodToHaveMatch = calculateSkillMatch(candidateSkills, goodToHaveSkills);
  const goodToHaveRatio = goodToHaveSkills.length > 0
    ? goodToHaveMatch.matched.length / goodToHaveSkills.length
    : 1;
  score += goodToHaveRatio * 20;

  // Experience match (15% of score)
  const experience = candidate.total_experience;
  let experienceMatch = true;
  if (minExp !== undefined && experience < minExp) {
    experienceMatch = false;
  }
  if (maxExp !== undefined && experience > maxExp) {
    experienceMatch = false;
  }
  if (experienceMatch) {
    score += 15;
  }

  // Seniority match (15% of score)
  let seniorityMatch = true;
  if (seniority && seniority.length > 0) {
    seniorityMatch = seniority.includes(candidate.seniority);
  }
  if (seniorityMatch) {
    score += 15;
  }

  // CTC budget check
  const ctcMatch = isCandidateWithinBudget(candidate.expected_ctc, maxBudgetLpa);

  return {
    score: Math.round(score),
    details: {
      mustHaveMatched: mustHaveMatch.matched,
      mustHaveMissing: mustHaveMatch.missing,
      goodToHaveMatched: goodToHaveMatch.matched,
      experienceMatch,
      seniorityMatch,
      ctcMatch,
    },
  };
}
