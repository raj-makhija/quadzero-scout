// Server-side bench-list report generation. This mirrors the frontend
// grouping + HTML logic in `frontend/src/components/bench-list-modal.tsx` and
// `frontend/src/lib/roleCategories.ts` so the "Email to me" endpoint
// (POST /recruiter/bench-list/email) can produce the same styled HTML table
// without the recruiter copy-pasting from the modal. Frontend and backend are
// separate npm packages, so the logic is duplicated rather than shared (see
// ticket #362 developer rationale).

// ─── Role categorization (ported from frontend roleCategories.ts) ────────────

const ROLE_CATEGORIES = [
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

type RoleCategory = (typeof ROLE_CATEGORIES)[number];

// Ordered most-specific → most-generic; the first matching rule wins.
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
  if (/[^a-z0-9]/.test(keyword)) {
    return text.includes(keyword);
  }
  return new RegExp(`\\b${keyword}\\b`).test(text);
}

function normalizeRoleCategory(roles: string[] | null | undefined): RoleCategory {
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

// ─── Display formatting (ported from frontend utils.ts) ──────────────────────

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatSeniority(seniority: string): string {
  const map: Record<string, string> = {
    intern: 'Intern',
    junior: 'Junior',
    mid: 'Mid-Level',
    senior: 'Senior',
    lead: 'Lead',
    principal: 'Principal',
    executive: 'Executive',
  };
  return map[seniority] || capitalizeFirst(seniority);
}

function formatAvailability(availability: string): string {
  const map: Record<string, string> = {
    immediate: 'Immediate',
    '1_week': '1 Week',
    '2_weeks': '2 Weeks',
    '1_month': '1 Month',
    '2_months': '2 Months',
    '3_months': '3 Months',
    negotiable: 'Negotiable',
  };
  return map[availability] || capitalizeFirst(availability);
}

// ─── Grouping ────────────────────────────────────────────────────────────────

// Minimal candidate shape this module reads. The bench-list DynamoDB projection
// (see dynamodb.ts:getBenchListCandidates) supplies these snake_case fields.
export interface BenchReportCandidate {
  roles?: string[] | null;
  total_experience: number;
  seniority?: string;
  availability?: string;
  location?: string;
}

export interface BenchGroup {
  role: string;
  count: number;
  specificRoles: string[];
  seniorities: string[];
  experienceRange: string;
  availabilities: string[];
  locations: string[];
}

export function buildBenchGroups(candidates: BenchReportCandidate[]): BenchGroup[] {
  const groupMap = new Map<string, BenchReportCandidate[]>();

  for (const candidate of candidates) {
    const role = normalizeRoleCategory(candidate.roles);
    const existing = groupMap.get(role) || [];
    existing.push(candidate);
    groupMap.set(role, existing);
  }

  const groups: BenchGroup[] = [];
  for (const [role, members] of groupMap) {
    const experiences = members.map((m) => m.total_experience);
    const minExp = Math.min(...experiences);
    const maxExp = Math.max(...experiences);

    const allRoles = new Set<string>();
    members.forEach((m) => m.roles?.forEach((r) => allRoles.add(r)));

    const seniorities = new Set<string>();
    members.forEach((m) => {
      if (m.seniority) seniorities.add(formatSeniority(m.seniority));
    });

    const avails = new Set<string>();
    members.forEach((m) => {
      if (m.availability) avails.add(formatAvailability(m.availability));
    });

    const locs = new Set<string>();
    members.forEach((m) => {
      locs.add(m.location?.trim() || 'Not specified');
    });

    groups.push({
      role,
      count: members.length,
      specificRoles: Array.from(allRoles),
      seniorities: Array.from(seniorities),
      experienceRange: minExp === maxExp ? `${minExp} years` : `${minExp}–${maxExp} years`,
      availabilities: Array.from(avails),
      locations: Array.from(locs),
    });
  }

  groups.sort((a, b) => b.count - a.count);
  return groups;
}

// ─── HTML table (mirrors frontend generateHtmlTable, without the rate column) ─

export function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateHtmlTable(groups: BenchGroup[]): string {
  const date = getFormattedDate();
  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);

  const headerStyle = 'background-color:#1e40af;color:#ffffff;padding:10px 12px;text-align:left;border:1px solid #cbd5e1;font-weight:600;font-size:13px;';
  const cellStyle = 'padding:8px 12px;border:1px solid #cbd5e1;vertical-align:top;font-size:13px;';
  const altRowStyle = 'background-color:#f8fafc;';

  const rows = groups
    .map((g, i) => {
      const rowBg = i % 2 === 1 ? ` style="${altRowStyle}"` : '';
      return `<tr${rowBg}>
      <td style="${cellStyle}font-weight:500;">${escapeHtml(g.role)}</td>
      <td style="${cellStyle}text-align:center;">${g.count}</td>
      <td style="${cellStyle}">${escapeHtml(g.specificRoles.join(', ') || 'N/A')}</td>
      <td style="${cellStyle}">${escapeHtml(g.seniorities.join(', ') || 'N/A')}</td>
      <td style="${cellStyle}">${escapeHtml(g.experienceRange)}</td>
      <td style="${cellStyle}">${escapeHtml(g.availabilities.join(', ') || 'N/A')}</td>
      <td style="${cellStyle}">${escapeHtml(g.locations.join(', '))}</td>
    </tr>`;
    })
    .join('\n');

  return `<div style="font-family:Arial,Helvetica,sans-serif;">
  <h3 style="margin:0 0 4px 0;font-size:16px;color:#1e293b;">Bench List — ${escapeHtml(date)}</h3>
  <p style="margin:0 0 12px 0;font-size:13px;color:#64748b;">${totalCount} resources across ${groups.length} role${groups.length !== 1 ? 's' : ''}</p>
  <table style="border-collapse:collapse;width:100%;font-family:Arial,Helvetica,sans-serif;">
    <thead>
      <tr>
        <th style="${headerStyle}">Role / Category</th>
        <th style="${headerStyle}text-align:center;">Resources Available</th>
        <th style="${headerStyle}">Roles</th>
        <th style="${headerStyle}">Seniority</th>
        <th style="${headerStyle}">Experience</th>
        <th style="${headerStyle}">Availability</th>
        <th style="${headerStyle}">Preferred Location</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</div>`;
}
