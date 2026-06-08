import skillsOntology from '../data/skills_ontology.json';

const mappings = skillsOntology.mappings as Record<string, string>;
const roleTaxonomy = (skillsOntology as Record<string, unknown>).roleTaxonomy as Record<string, string[]>;

export function normalizeSkill(skill: string): string {
  const lowercased = skill.toLowerCase().trim();
  return mappings[lowercased] || lowercased;
}

export function normalizeSkills(skills: string[]): string[] {
  const normalized = skills.map(normalizeSkill);
  // Remove duplicates while preserving order
  return [...new Set(normalized)];
}

export function normalizeSkillYears(
  skillYears: Record<string, number>
): Record<string, number> {
  const normalized: Record<string, number> = {};

  for (const [skill, years] of Object.entries(skillYears)) {
    const normalizedSkill = normalizeSkill(skill);
    // If the same normalized skill appears multiple times, take the max years
    if (normalized[normalizedSkill]) {
      normalized[normalizedSkill] = Math.max(normalized[normalizedSkill], years);
    } else {
      normalized[normalizedSkill] = years;
    }
  }

  return normalized;
}

const CORE_SKILL_SET: Set<string> = (() => {
  const set = new Set<string>();
  const categories = skillsOntology.categories as Record<string, string[]>;
  for (const skills of Object.values(categories)) {
    for (const s of skills) set.add(s);
  }
  return set;
})();

/**
 * Returns true if the skill is classified as a core technical skill by the
 * skills ontology (i.e. appears in any `categories` bucket). Used to partition
 * legacy profiles' skills into primary (core) vs secondary (non-core) buckets.
 */
export function isCoreSkill(skill: string): boolean {
  return CORE_SKILL_SET.has(normalizeSkill(skill));
}

export function getSkillCategory(skill: string): string | null {
  const normalizedSkill = normalizeSkill(skill);
  const categories = skillsOntology.categories as Record<string, string[]>;

  for (const [category, skills] of Object.entries(categories)) {
    if (skills.includes(normalizedSkill)) {
      return category;
    }
  }

  return null;
}

export function getRelatedSkills(skill: string): string[] {
  const normalizedSkill = normalizeSkill(skill);
  const category = getSkillCategory(normalizedSkill);

  if (!category) {
    return [];
  }

  const categories = skillsOntology.categories as Record<string, string[]>;
  return categories[category]?.filter((s) => s !== normalizedSkill) || [];
}

export interface SkillMatchResult {
  exactMatched: string[];
  fuzzyMatched: string[];
  relatedMatched: string[];
  missing: string[];
}

/**
 * Token containment check: returns true if all tokens of skillA appear in skillB.
 * Example: tokenContains("client relationship", "client relationship management") → true
 */
function tokenContains(skillA: string, skillB: string): boolean {
  const tokensA = skillA.split(/\s+/).filter(t => t.length > 0);
  const tokensB = new Set(skillB.split(/\s+/).filter(t => t.length > 0));
  return tokensA.length > 0 && tokensA.length !== tokensB.size && tokensA.every(t => tokensB.has(t));
}

/**
 * Check if two skills fuzzy-match via token containment (either direction)
 * or via synonym lookup.
 */
function isFuzzyMatch(
  requiredSkill: string,
  candidateSkill: string,
  requiredSynonyms?: Record<string, string[]>,
  candidateSynonyms?: Record<string, string[]>
): boolean {
  // Token containment: "client relationship" ⊆ "client relationship management"
  if (tokenContains(requiredSkill, candidateSkill) || tokenContains(candidateSkill, requiredSkill)) {
    return true;
  }

  // Synonym match: check if candidate skill is a known synonym of the required skill
  if (requiredSynonyms?.[requiredSkill]?.includes(candidateSkill)) {
    return true;
  }

  // Reverse synonym match: check if required skill is a known synonym of the candidate skill
  if (candidateSynonyms?.[candidateSkill]?.includes(requiredSkill)) {
    return true;
  }

  return false;
}

export function calculateSkillMatch(
  candidateSkills: string[],
  requiredSkills: string[],
  exactOnly: boolean = false,
  requiredSynonyms?: Record<string, string[]>,
  candidateSynonyms?: Record<string, string[]>
): SkillMatchResult {
  const normalizedCandidate = normalizeSkills(candidateSkills);
  const normalizedCandidateSet = new Set(normalizedCandidate);
  const normalizedRequired = normalizeSkills(requiredSkills);

  const exactMatched: string[] = [];
  const fuzzyMatched: string[] = [];
  const relatedMatched: string[] = [];
  const missing: string[] = [];

  for (const skill of normalizedRequired) {
    if (normalizedCandidateSet.has(skill)) {
      exactMatched.push(skill);
      continue;
    }

    // Fuzzy match: token containment or synonym match (always checked, even in exactOnly mode)
    const hasFuzzy = normalizedCandidate.some(
      (cs) => isFuzzyMatch(skill, cs, requiredSynonyms, candidateSynonyms)
    );
    if (hasFuzzy) {
      fuzzyMatched.push(skill);
      continue;
    }

    if (!exactOnly) {
      // Check for related skills in the same category
      const related = getRelatedSkills(skill);
      const hasRelated = related.some((r) => normalizedCandidateSet.has(r));

      if (hasRelated) {
        relatedMatched.push(skill);
      } else {
        missing.push(skill);
      }
    } else {
      missing.push(skill);
    }
  }

  return { exactMatched, fuzzyMatched, relatedMatched, missing };
}

/**
 * Get the role category for a given role title using token-containment matching
 * against the roleTaxonomy in skills_ontology.json.
 * Returns the category name (e.g. 'development', 'testing') or null if no match.
 */
export function getRoleCategory(role: string): string | null {
  const roleLower = role.toLowerCase().trim();

  for (const [category, titles] of Object.entries(roleTaxonomy)) {
    for (const title of titles) {
      // Exact match
      if (roleLower === title) return category;
      // Token containment: all tokens of the taxonomy entry appear in the role
      const titleTokens = title.split(/\s+/);
      const roleTokens = new Set(roleLower.split(/\s+/));
      if (titleTokens.length > 0 && titleTokens.every(t => roleTokens.has(t))) return category;
      // Reverse: all tokens of the role appear in the taxonomy entry
      const roleTokensArr = roleLower.split(/\s+/);
      const titleTokenSet = new Set(titleTokens);
      if (roleTokensArr.length > 0 && roleTokensArr.every(t => titleTokenSet.has(t))) return category;
    }
  }

  return null;
}

const STACK_ABBREVIATIONS: Record<string, string[]> = {
  mern: ['mongodb', 'expressjs', 'react', 'nodejs'],
  mean: ['mongodb', 'expressjs', 'angular', 'nodejs'],
  pern: ['postgresql', 'expressjs', 'react', 'nodejs'],
  lamp: ['linux', 'apache', 'mysql', 'php'],
};

export function expandStackAbbreviation(skill: string): string[] | null {
  const key = skill.toLowerCase().trim().replace(/\s+stack$/i, '');
  return STACK_ABBREVIATIONS[key] ?? null;
}

// Words that qualify a role (e.g. "Architect" in "AWS Architect") but are not themselves
// a technology. Used to extract the tech token from compound coreSkill phrases.
const ROLE_QUALIFIER_WORDS = new Set([
  'architect', 'developer', 'dev', 'admin', 'administrator',
  'engineer', 'engineering', 'manager', 'management', 'analyst',
  'specialist', 'consultant', 'designer', 'expert', 'programmer',
  'professional', 'lead', 'head', 'associate', 'senior', 'junior', 'intern',
  'staff', 'principal', 'director', 'officer', 'technician',
  'scientist', 'researcher',
]);

export type CoreSkillMatchType = 'skipped' | 'stack' | 'exact' | 'token' | 'none';

export interface CoreSkillMatchResult {
  passed: boolean;
  matchType: CoreSkillMatchType;
  matchedToken?: string;
}

/**
 * Returns true when a required tech token is satisfied via either side's synonym map.
 * No-op when both maps are empty/undefined (the production default until synonym data is
 * populated). A skill counts as "held" if it is in the candidate's full-skill set or
 * appears as a component word of one of the candidate's skills.
 */
function tokenSatisfiedBySynonym(
  token: string,
  candidateSet: Set<string>,
  candidateWordTokens: Set<string>,
  requiredSynonyms?: Record<string, string[]>,
  candidateSynonyms?: Record<string, string[]>
): boolean {
  const candidateHolds = (skill: string): boolean => {
    const n = normalizeSkill(skill);
    return candidateSet.has(n) || candidateWordTokens.has(n);
  };
  // Required side: the token has known equivalents and the candidate holds one of them.
  if (requiredSynonyms?.[token]?.some(candidateHolds)) return true;
  // Candidate side: one of the candidate's skills lists this token as a synonym.
  if (candidateSynonyms) {
    for (const [skill, equivalents] of Object.entries(candidateSynonyms)) {
      if (candidateHolds(skill) && equivalents.some((e) => normalizeSkill(e) === token)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns a structured match result for the coreSkill filter.
 * matchType distinguishes how the candidate passed (or why they didn't):
 *   'skipped' — coreSkill is null/undefined, filter not applied
 *   'stack'   — known stack abbreviation (MERN/MEAN/PERN/LAMP), all components required
 *   'exact'   — normalized coreSkill found verbatim in candidate primary skills
 *   'token'   — compound coreSkill (e.g. "Oracle PL/SQL", "AWS Architect"): every tech token
 *               (role qualifiers stripped) is present in the candidate's primary skills
 *   'none'    — candidate does not satisfy the coreSkill requirement
 *
 * The optional synonym maps make the token check synonym-aware. They are a no-op until the
 * synonym data is populated (it is null in practice today) but activate automatically once
 * synonyms exist on either side.
 */
export function coreSkillMatchResult(
  coreSkill: string | null | undefined,
  candidatePrimarySkills: string[],
  requiredSynonyms?: Record<string, string[]>,
  candidateSynonyms?: Record<string, string[]>
): CoreSkillMatchResult {
  if (!coreSkill) return { passed: true, matchType: 'skipped' };

  const normalizedCandidate = normalizeSkills(candidatePrimarySkills);
  const candidateSet = new Set(normalizedCandidate);

  const components = expandStackAbbreviation(coreSkill);
  if (components) {
    return { passed: components.every((c) => candidateSet.has(c)), matchType: 'stack' };
  }

  const normalizedCoreSkill = normalizeSkill(coreSkill);
  if (candidateSet.has(normalizedCoreSkill)) {
    return { passed: true, matchType: 'exact' };
  }

  // Compound coreSkill (e.g. "Oracle PL/SQL", "AWS Architect", "Spring Boot Microservices").
  // Split the RAW phrase into word tokens BEFORE normalization (ontology phrase mappings
  // would otherwise collapse a multi-word compound into a single token), strip role-qualifier
  // words, then require that EVERY remaining technology token is present in the candidate's
  // primary skills (AND semantics). A candidate skill that is itself multi-word after
  // normalization (e.g. "spring boot" → "spring_boot") contributes each of its component
  // words, so a sub-skill spanning multiple words still satisfies the matching tokens.
  const rawTokens = coreSkill.toLowerCase().trim().split(/\s+/);
  const techRawTokens = rawTokens.filter((t) => !ROLE_QUALIFIER_WORDS.has(t));

  if (techRawTokens.length > 0) {
    // Component-word view of the candidate: split every normalized primary skill on
    // whitespace AND underscore so combined forms ("spring_boot") expose their words.
    const candidateWordTokens = new Set<string>();
    for (const skill of normalizedCandidate) {
      for (const word of skill.split(/[\s_]+/)) {
        if (word.length > 0) candidateWordTokens.add(word);
      }
    }

    const tokenPresent = (rawToken: string): boolean => {
      const token = normalizeSkill(rawToken);
      if (candidateSet.has(token)) return true;
      // A token that is itself multi-word after normalization is satisfied only if ALL of
      // its component words are present (e.g. "spring_boot" needs both "spring" and "boot").
      const subWords = token.split(/[\s_]+/).filter((w) => w.length > 0);
      if (subWords.length > 0 && subWords.every((w) => candidateWordTokens.has(w))) return true;
      return tokenSatisfiedBySynonym(
        token,
        candidateSet,
        candidateWordTokens,
        requiredSynonyms,
        candidateSynonyms
      );
    };

    if (techRawTokens.every(tokenPresent)) {
      const matchedToken = techRawTokens.map(normalizeSkill).join(' ');
      return { passed: true, matchType: 'token', matchedToken };
    }
  }

  return { passed: false, matchType: 'none' };
}

/**
 * Returns true if the candidate's primary skills satisfy the coreSkill requirement.
 * For known stack abbreviations (MERN/MEAN/PERN/LAMP), ALL component skills must be present.
 * For compound coreSkills (e.g. "Oracle PL/SQL", "AWS Architect"), every technology token
 * (role qualifiers stripped) must be present in the candidate's primary skills. Falls back
 * to a normalized literal match. The optional synonym maps make the check synonym-aware.
 * Returns true if coreSkill is null/undefined (filter is skipped).
 */
export function coreSkillSatisfiedBy(
  coreSkill: string | null | undefined,
  candidatePrimarySkills: string[],
  requiredSynonyms?: Record<string, string[]>,
  candidateSynonyms?: Record<string, string[]>
): boolean {
  return coreSkillMatchResult(
    coreSkill,
    candidatePrimarySkills,
    requiredSynonyms,
    candidateSynonyms
  ).passed;
}

/**
 * Calculate role match between candidate roles and requirement/search roles.
 * Returns 'full' if any roles share the same category or have token overlap,
 * 'partial' if either side has no roles (no data to compare),
 * 'none' if both have roles but no category overlap.
 */
export function calculateRoleMatch(
  candidateRoles: string[],
  searchRoles: string[]
): 'full' | 'partial' | 'none' {
  if (!searchRoles || searchRoles.length === 0) return 'full';
  if (!candidateRoles || candidateRoles.length === 0) return 'partial';

  // Get categories for both sides
  const candidateCategories = new Set<string>();
  for (const role of candidateRoles) {
    const cat = getRoleCategory(role);
    if (cat) candidateCategories.add(cat);
  }

  const searchCategories = new Set<string>();
  for (const role of searchRoles) {
    const cat = getRoleCategory(role);
    if (cat) searchCategories.add(cat);
  }

  // If either side has no classifiable roles, treat as partial (unknown)
  if (candidateCategories.size === 0 || searchCategories.size === 0) return 'partial';

  // Check for category overlap
  for (const cat of searchCategories) {
    if (candidateCategories.has(cat)) return 'full';
  }

  return 'none';
}

// Curated matrix of role-category pairs that are genuinely distinct tracks AND a
// real false-positive source, so they warrant a hard exclusion. Every other
// cross-category mismatch is left to scoring (the soft role-score penalty).
// Deliberately NOT gated: the engineering family (development/devops/data/security
// cross over constantly), taxonomy-shared pairs (testing↔security, support↔devops,
// data↔consulting, security↔consulting), and all `management` pairs. See ticket #282.
// `design` is the isolated discipline — gated against everything except management.
// Stored as unordered "a|b" keys (sorted) so lookup is direction-independent.
const INCOMPATIBLE_DISCIPLINE_PAIRS = new Set(
  (
    [
      ['development', 'testing'],
      ['development', 'support'],
      ['development', 'design'],
      ['development', 'consulting'],
      ['testing', 'data'],
      ['testing', 'support'],
      ['testing', 'consulting'],
      ['testing', 'design'],
      ['data', 'support'],
      ['data', 'design'],
      ['devops', 'design'],
      ['security', 'design'],
      ['support', 'design'],
      ['consulting', 'design'],
    ] as const
  ).map(([a, b]) => [a, b].sort().join('|'))
);

/**
 * Returns true when the candidate's discipline is explicitly incompatible with
 * the search/requirement discipline. Only fires when calculateRoleMatch returns
 * 'none' AND the category pair is in the curated matrix; returns false for
 * unclassified roles or pairs not in the matrix.
 */
export function disciplinesIncompatible(
  searchRoles: string[],
  candidateRoles: string[]
): boolean {
  if (calculateRoleMatch(candidateRoles, searchRoles) !== 'none') return false;

  const candidateCategories: string[] = [];
  for (const role of candidateRoles) {
    const cat = getRoleCategory(role);
    if (cat) candidateCategories.push(cat);
  }
  const searchCategories: string[] = [];
  for (const role of searchRoles) {
    const cat = getRoleCategory(role);
    if (cat) searchCategories.push(cat);
  }

  for (const ccat of candidateCategories) {
    for (const scat of searchCategories) {
      if (INCOMPATIBLE_DISCIPLINE_PAIRS.has([ccat, scat].sort().join('|'))) return true;
    }
  }

  return false;
}
