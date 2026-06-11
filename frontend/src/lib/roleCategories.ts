// Canonical role categories for the Bench List. Grouping the LLM-extracted raw
// job titles into this curated set keeps the externally-published bench list
// readable and collapses near-duplicate titles (e.g. "Sr. Software Engineer" /
// "Senior Software Engineer") into a single group. Matching is keyword-based —
// no LLM call (see ticket #360, "LLM-based categorization" is out of scope).

export const ROLE_CATEGORIES = [
  'Frontend',
  'Backend',
  'Full Stack',
  'DevOps/Cloud',
  'Data Engineering',
  'QA/Testing',
  'Mobile',
  'PM/BA',
  'Other',
] as const;

export type RoleCategory = (typeof ROLE_CATEGORIES)[number];

// Ordered most-specific → most-generic. The first rule with a matching keyword
// wins, so generic catch-alls (Backend's "engineer"/"software engineer") must
// come after the specialised categories that also contain the word "engineer".
const CATEGORY_RULES: { category: RoleCategory; keywords: string[] }[] = [
  { category: 'QA/Testing', keywords: ['qa', 'quality assurance', 'sdet', 'test engineer', 'tester', 'automation test', 'test automation'] },
  { category: 'DevOps/Cloud', keywords: ['devops', 'sre', 'site reliability', 'cloud', 'infrastructure', 'platform engineer', 'kubernetes', 'systems engineer'] },
  { category: 'Data Engineering', keywords: ['data engineer', 'data engineering', 'etl', 'data pipeline', 'big data', 'machine learning', 'ml engineer', 'data scientist', 'data analyst', 'analytics engineer'] },
  { category: 'Mobile', keywords: ['mobile', 'ios', 'android', 'react native', 'flutter', 'swift'] },
  { category: 'PM/BA', keywords: ['product manager', 'project manager', 'business analyst', 'product owner', 'scrum master', 'program manager', 'ba'] },
  { category: 'Full Stack', keywords: ['full stack', 'fullstack', 'full-stack'] },
  { category: 'Frontend', keywords: ['frontend', 'front end', 'front-end', 'react', 'angular', 'vue', 'ui engineer', 'ui developer', 'ui/ux', 'web developer', 'javascript developer'] },
  { category: 'Backend', keywords: ['backend', 'back end', 'back-end', 'software engineer', 'software developer', 'sde', 'member of technical staff', 'mts', 'java', 'python', 'node', '.net', 'golang', 'go developer', 'api', 'server', 'engineer'] },
];

function hasKeyword(text: string, keyword: string): boolean {
  // Phrases or keywords containing non-alphanumeric characters (".net",
  // "react native", "ui/ux") are matched as plain substrings.
  if (/[^a-z0-9]/.test(keyword)) {
    return text.includes(keyword);
  }
  // Single alphanumeric tokens require word boundaries so "go" does not match
  // "django" and "ba" does not match "database".
  return new RegExp(`\\b${keyword}\\b`).test(text);
}

/**
 * Maps a candidate's raw `roles` array to one canonical role category using
 * keyword matching. Returns the category of the first role that matches any
 * rule; falls through to "Other" when nothing matches (or the input is
 * empty/missing). Case-insensitive.
 */
export function normalizeRoleCategory(roles: string[] | null | undefined): RoleCategory {
  if (!roles || roles.length === 0) return 'Other';

  for (const role of roles) {
    if (!role) continue;
    const text = role.toLowerCase();
    for (const rule of CATEGORY_RULES) {
      if (rule.keywords.some((kw) => hasKeyword(text, kw))) {
        return rule.category;
      }
    }
  }

  return 'Other';
}
