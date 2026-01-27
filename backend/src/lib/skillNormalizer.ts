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

export function calculateSkillMatch(
  candidateSkills: string[],
  requiredSkills: string[]
): { matched: string[]; missing: string[] } {
  const normalizedCandidate = new Set(normalizeSkills(candidateSkills));
  const normalizedRequired = normalizeSkills(requiredSkills);

  const matched: string[] = [];
  const missing: string[] = [];

  for (const skill of normalizedRequired) {
    if (normalizedCandidate.has(skill)) {
      matched.push(skill);
    } else {
      // Check for related skills in the same category
      const related = getRelatedSkills(skill);
      const hasRelated = related.some((r) => normalizedCandidate.has(r));

      if (hasRelated) {
        matched.push(skill); // Partial match through related skill
      } else {
        missing.push(skill);
      }
    }
  }

  return { matched, missing };
}
