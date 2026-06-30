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
    offer_in_hand: 'Offer in Hand',
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
  const totalResources = `${totalCount} resource${totalCount !== 1 ? 's' : ''} across ${groups.length} role${groups.length !== 1 ? 's' : ''}`;

  const thStyle = 'background-color:#1e40af;color:#ffffff;padding:10px 12px;text-align:left;font-weight:600;font-size:13px;';
  const tdStyle = 'padding:8px 12px;vertical-align:top;font-size:13px;border-bottom:1px solid #e5e7eb;';
  const tagStyle = 'display:inline-block;background-color:#f1f5f9;color:#374151;padding:2px 6px;margin:1px 2px 1px 0;font-size:12px;';

  const renderTags = (values: string[]): string => {
    if (values.length === 0) return '—';
    return values.map((v) => `<span style="${tagStyle}">${escapeHtml(v)}</span>`).join('');
  };

  const rows = groups
    .map((g, i) => {
      const rowStyle = i % 2 === 1 ? ' style="background-color:#f8fafc;"' : '';
      const specificRolesHtml =
        g.specificRoles.length > 0
          ? `<div style="font-size:12px;color:#6b7280;margin-top:3px;">${g.specificRoles.map((r) => escapeHtml(r)).join(' &middot; ')}</div>`
          : '';
      return `<tr${rowStyle}>
      <td style="${tdStyle}">
        <div style="font-weight:600;color:#111827;">${escapeHtml(g.role)}</div>${specificRolesHtml}
      </td>
      <td style="${tdStyle}text-align:center;">
        <span style="background-color:#dbeafe;color:#1e40af;font-weight:bold;padding:2px 10px;font-size:13px;">${g.count}</span>
      </td>
      <td style="${tdStyle}">${renderTags(g.seniorities)}</td>
      <td style="${tdStyle}">${escapeHtml(g.experienceRange)}</td>
      <td style="${tdStyle}">${renderTags(g.availabilities)}</td>
      <td style="${tdStyle}">${renderTags(g.locations)}</td>
    </tr>`;
    })
    .join('\n');

  return `<div style="font-family:Arial,Helvetica,sans-serif;">
  <div style="background-color:#1e40af;color:#ffffff;padding:16px 20px;">
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;opacity:0.8;">Quadzero</div>
    <div style="font-size:20px;font-weight:700;margin-bottom:4px;">Bench List</div>
    <div style="font-size:12px;">${escapeHtml(date)} &nbsp;&middot;&nbsp; ${totalResources}</div>
  </div>
  <p style="font-size:13px;color:#374151;margin:12px 0;line-height:1.5;">These candidates have been screened within the last 15 days and are available within 2 weeks. Please reply to this email to discuss next steps.</p>
  <table style="border-collapse:collapse;width:100%;font-family:Arial,Helvetica,sans-serif;">
    <thead>
      <tr>
        <th style="${thStyle}">Role / Category</th>
        <th style="${thStyle}text-align:center;">Available</th>
        <th style="${thStyle}">Seniority</th>
        <th style="${thStyle}">Experience</th>
        <th style="${thStyle}">Availability</th>
        <th style="${thStyle}">Preferred Location</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <p style="font-size:11px;color:#9ca3af;margin:16px 0 0 0;padding-top:12px;border-top:1px solid #e5e7eb;">This communication is intended for the named recipient only. The information in this bench list is confidential and sourced by Quadzero.</p>
</div>`;
}
