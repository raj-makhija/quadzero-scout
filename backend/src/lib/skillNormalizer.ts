import skillsOntology from '../data/skills_ontology.json';

const mappings = skillsOntology.mappings as Record<string, string>;

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
