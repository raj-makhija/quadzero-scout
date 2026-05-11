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

/**
 * Returns the component skills for a known stack abbreviation (MERN/MEAN/PERN/LAMP),
 * stripping a trailing " stack" suffix and ignoring case. Returns null for non-abbreviations.
 */
export function expandStackAbbreviation(skill: string): string[] | null {
  const key = skill.toLowerCase().trim().replace(/\s+stack$/i, '');
  return STACK_ABBREVIATIONS[key] ?? null;
}

/**
 * Returns true if the candidate's primary skills satisfy the coreSkill requirement.
 * For known stack abbreviations (MERN/MEAN/PERN/LAMP), ALL component skills must be present.
 * For other skills, falls back to a normalized literal match.
 * Returns true if coreSkill is null/undefined (filter is skipped).
 */
export function coreSkillSatisfiedBy(
  coreSkill: string | null | undefined,
  candidatePrimarySkills: string[]
): boolean {
  if (!coreSkill) return true;
  const components = expandStackAbbreviation(coreSkill);
  if (components) {
    const candidateSet = new Set(normalizeSkills(candidatePrimarySkills));
    return components.every((c) => candidateSet.has(c));
  }
  const normalizedCoreSkill = normalizeSkill(coreSkill);
  return new Set(normalizeSkills(candidatePrimarySkills)).has(normalizedCoreSkill);
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
