import {
  calculateMatchScore,
  MIN_MUST_HAVE_MATCH_RATIO,
  FUZZY_MATCH_WEIGHT,
  MUST_HAVE_SECONDARY_WEIGHT,
  parseSearchLocations,
  isEngagementModelCompatible,
} from './matchScoring.js';
import { normalizeSkill, normalizeSkills, coreSkillSatisfiedBy, disciplinesIncompatible } from './skillNormalizer.js';
import { isCandidateWithinBudget } from './ctcConversion.js';
import type { CandidateItem } from '../types/index.js';
import type { MatchDetails } from './matchScoring.js';

export interface MatchCriteria {
  coreSkill?: string | null;
  mustHaveSkills?: string[];
  goodToHaveSkills?: string[];
  minExperience?: number | null;
  maxExperience?: number | null;
  seniority?: string[];
  availability?: string[];
  location?: string | null;
  roles?: string[];
  maxBudgetLpa?: number | null;
  engagementModel?: string | null;
  skillSynonyms?: Record<string, string[]> | null;
}

export interface MatchOptions {
  /**
   * When true (notify semantics): include candidates with score=0 if budgetFit=true.
   * When false (default, search semantics): require score > 0.
   * The must-have ratio gate is a hard prerequisite in both modes.
   */
  notifyInclusion?: boolean;
  sortBy?: string;
}

export interface ScoredCandidate {
  candidate: CandidateItem;
  score: number;
  details: MatchDetails;
  budgetFit: boolean;
}

/** Normalize a synonym map: lowercase keys and values. Returns undefined if input is null/undefined. */
export function normalizeSynonymMap(
  synonyms: Record<string, string[]> | null | undefined
): Record<string, string[]> | undefined {
  if (!synonyms) return undefined;
  const result: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(synonyms)) {
    result[normalizeSkill(key)] = normalizeSkills(values);
  }
  return result;
}

/**
 * Score, filter, and rank a list of candidates against matching criteria.
 *
 * Steps applied in order:
 * 1. coreSkill pre-filter (must appear in candidate's primary skills)
 * 2. calculateMatchScore for each remaining candidate
 * 3. Must-have ratio gate (hard prerequisite, always applied)
 * 4. Engagement model hard filter
 * 5. Inclusion rule: search mode requires score > 0; notify mode allows score=0 when budgetFit=true
 * 6. Sort by sortBy option (default: matchScore desc)
 */
export function matchAndRankCandidates(
  candidates: CandidateItem[],
  criteria: MatchCriteria,
  options: MatchOptions = {}
): ScoredCandidate[] {
  const { notifyInclusion = false, sortBy } = options;

  const normalizedMustHave = normalizeSkills(criteria.mustHaveSkills ?? []);
  const normalizedGoodToHave = normalizeSkills(criteria.goodToHaveSkills ?? []);
  const searchLocations = parseSearchLocations(criteria.location ?? undefined);
  const reqSynonyms = normalizeSynonymMap(criteria.skillSynonyms);

  const candidatesToScore = criteria.coreSkill
    ? candidates.filter((c) => coreSkillSatisfiedBy(criteria.coreSkill!, c.primary_skills))
    : candidates;

  const results: ScoredCandidate[] = [];

  for (const candidate of candidatesToScore) {
    const candSynonyms = normalizeSynonymMap(candidate.skill_synonyms);

    const { score, details } = calculateMatchScore(
      candidate,
      normalizedMustHave,
      normalizedGoodToHave,
      criteria.minExperience ?? undefined,
      criteria.maxExperience ?? undefined,
      criteria.seniority?.length ? criteria.seniority : undefined,
      criteria.maxBudgetLpa ?? undefined,
      searchLocations,
      criteria.availability,
      reqSynonyms,
      candSynonyms,
      criteria.roles
    );

    // Hard prerequisite: must-have ratio gate (applied regardless of notifyInclusion)
    if (normalizedMustHave.length > 0) {
      const effectiveRatio = (
        details.mustHaveMatched.length
        + (details.mustHaveFuzzy?.length ?? 0) * FUZZY_MATCH_WEIGHT
        + (details.mustHaveSecondary?.length ?? 0) * MUST_HAVE_SECONDARY_WEIGHT
      ) / normalizedMustHave.length;
      if (effectiveRatio < MIN_MUST_HAVE_MATCH_RATIO) continue;
    }

    // Hard filter: discipline gate
    if (disciplinesIncompatible(criteria.roles ?? [], candidate.roles ?? [])) continue;

    // Hard filter: engagement model compatibility
    const engagementModel = criteria.engagementModel;
    if (engagementModel && engagementModel !== 'either') {
      const candidateModel = candidate.engagement_model || 'either';
      if (!isEngagementModelCompatible(engagementModel, candidateModel)) continue;
    }

    const budgetFit = isCandidateWithinBudget(candidate.expected_ctc, criteria.maxBudgetLpa ?? undefined);

    if (notifyInclusion) {
      // Notify semantics: score > 0 OR within budget
      if (score === 0 && !budgetFit) continue;
    } else {
      // Search semantics: score must be > 0
      if (score === 0) continue;
    }

    results.push({ candidate, score, details, budgetFit });
  }

  results.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    const dateDiff = new Date(b.candidate.last_updated).getTime() - new Date(a.candidate.last_updated).getTime();
    const expDiff = b.candidate.total_experience - a.candidate.total_experience;
    switch (sortBy) {
      case 'lastUpdated': return dateDiff || scoreDiff || expDiff;
      case 'experience': return expDiff || scoreDiff || dateDiff;
      default: return scoreDiff || dateDiff || expDiff;
    }
  });

  return results;
}
