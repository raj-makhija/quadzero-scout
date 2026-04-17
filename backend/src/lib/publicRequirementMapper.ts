import type { RequirementItem, AdditionalFieldDefinition } from '../types/index.js';

export interface PublicRequirementSummary {
  requirementId: string;
  jobTitle?: string;
  coreSkill?: string | null;
  mustHaveSkills: string[];
  goodToHaveSkills: string[];
  minExperience: number | null;
  maxExperience: number | null;
  seniority: string[];
  availability: string[];
  location: string | null;
  remote: boolean;
  roles: string[];
  additionalFields?: AdditionalFieldDefinition[];
  createdAt: string;
  lastUpdated: string;
}

/**
 * Maps a RequirementItem to a public-safe summary using an allow-list approach.
 * Only explicitly picked fields are included — new fields added to RequirementItem
 * will NOT be exposed unless added here.
 */
export function toPublicRequirement(item: RequirementItem): PublicRequirementSummary {
  const criteria = item.parsed_criteria;

  return {
    requirementId: item.requirement_id,
    jobTitle: item.job_title,
    coreSkill: criteria?.coreSkill ?? null,
    mustHaveSkills: criteria?.mustHaveSkills ?? [],
    goodToHaveSkills: criteria?.goodToHaveSkills ?? [],
    minExperience: criteria?.minExperience ?? null,
    maxExperience: criteria?.maxExperience ?? null,
    seniority: criteria?.seniority ?? [],
    availability: criteria?.availability ?? [],
    location: criteria?.location ?? null,
    remote: criteria?.remote ?? false,
    roles: criteria?.roles ?? [],
    additionalFields: item.additional_fields,
    createdAt: item.created_at,
    lastUpdated: item.last_updated,
  };
}
