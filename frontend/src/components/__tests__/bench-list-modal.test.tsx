import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import {
  BenchListModal,
  buildBenchGroups,
  generateHtmlTable,
  generatePlainText,
  buildGroupedExportRows,
  downloadGroupedCsv,
} from '../bench-list-modal';
import type { ProfileListItem } from '@/app/recruiter/locate/page';

// xlsx is mocked so "Download XLSX" can be asserted without a real file write
// (jsdom has no filesystem). writeFile is the spy under test.
const mockWriteFile = vi.fn();
vi.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

// api is mocked so the "Email to me" button can be exercised without network.
const mockSendBenchListEmail = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    sendBenchListEmail: (...args: unknown[]) => mockSendBenchListEmail(...args),
  },
}));

// ---------------------------------------------------------------------------
// Test data — roles are chosen so they normalize into canonical categories.
// ---------------------------------------------------------------------------
const mockProfiles: ProfileListItem[] = [
  {
    candidateId: '1',
    fullName: 'Alice Smith',
    primarySkills: ['react'],
    totalExperience: 5,
    seniority: 'senior',
    location: 'Mumbai, India',
    lastUpdated: '2024-01-15T10:30:00Z',
    roles: ['React Developer', 'UI Engineer'],
    availability: 'immediate',
  },
  {
    candidateId: '2',
    fullName: 'Bob Jones',
    primarySkills: ['angular'],
    totalExperience: 8,
    seniority: 'lead',
    location: 'Pune, India',
    lastUpdated: '2024-01-14T15:20:00Z',
    roles: ['Frontend Lead'],
    availability: '2_weeks',
  },
  {
    candidateId: '3',
    fullName: 'Charlie Brown',
    primarySkills: ['devops'],
    totalExperience: 4,
    seniority: 'mid',
    location: 'Bangalore, India',
    lastUpdated: '2024-01-13T12:00:00Z',
    roles: ['DevOps Engineer'],
    availability: 'immediate',
  },
  // Diana and Eve have effectively the same role written two ways — they must
  // land in the same canonical "Backend" group.
  {
    candidateId: '4',
    fullName: 'Diana Prince',
    primarySkills: ['java'],
    totalExperience: 6,
    seniority: 'senior',
    location: 'Bangalore, India',
    lastUpdated: '2024-01-12T08:00:00Z',
    roles: ['Sr. Software Engineer'],
    availability: '1_week',
  },
  {
    candidateId: '5',
    fullName: 'Eve Wilson',
    primarySkills: ['python'],
    totalExperience: 6,
    seniority: 'mid',
    lastUpdated: '2024-01-11T08:00:00Z',
    roles: ['Senior Software Engineer'],
    availability: '1_week',
  },
  // No roles at all → "Other"; no seniority either.
  {
    candidateId: '6',
    fullName: 'Frank Castle',
    primarySkills: [],
    totalExperience: 3,
    seniority: '',
    lastUpdated: '2024-01-10T08:00:00Z',
    roles: [],
    availability: 'immediate',
  },
];

// ---------------------------------------------------------------------------
// buildBenchGroups tests
// ---------------------------------------------------------------------------
describe('buildBenchGroups', () => {
  it('groups candidates by canonical role category, not raw roles[0]', () => {
    const groups = buildBenchGroups(mockProfiles);
    const roleNames = groups.map(g => g.role);
    expect(roleNames).toContain('Frontend');
    expect(roleNames).toContain('Backend');
    expect(roleNames).toContain('DevOps/Cloud');
    expect(roleNames).toContain('Other');
    // raw titles must NOT appear as group keys
    expect(roleNames).not.toContain('Sr. Software Engineer');
    expect(roleNames).not.toContain('React Developer');
  });

  it('collapses "Sr. Software Engineer" and "Senior Software Engineer" into one group', () => {
    const groups = buildBenchGroups(mockProfiles);
    const backend = groups.find(g => g.role === 'Backend');
    expect(backend?.count).toBe(2);
    expect(backend?.specificRoles).toContain('Sr. Software Engineer');
    expect(backend?.specificRoles).toContain('Senior Software Engineer');
  });

  it('sorts groups by count descending', () => {
    const groups = buildBenchGroups(mockProfiles);
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i - 1].count).toBeGreaterThanOrEqual(groups[i].count);
    }
  });

  it('collects all unique raw job titles within a group (unchanged behavior)', () => {
    const groups = buildBenchGroups(mockProfiles);
    const frontend = groups.find(g => g.role === 'Frontend');
    expect(frontend?.specificRoles).toContain('React Developer');
    expect(frontend?.specificRoles).toContain('UI Engineer');
    expect(frontend?.specificRoles).toContain('Frontend Lead');
  });

  it('computes experience range across the group', () => {
    const groups = buildBenchGroups(mockProfiles);
    const frontend = groups.find(g => g.role === 'Frontend');
    expect(frontend?.experienceRange).toBe('5–8 years');
  });

  it('shows single experience value when min equals max', () => {
    const groups = buildBenchGroups(mockProfiles);
    const backend = groups.find(g => g.role === 'Backend');
    expect(backend?.experienceRange).toBe('6 years');
  });

  it('collects unique formatted seniority values per group', () => {
    const groups = buildBenchGroups(mockProfiles);
    const frontend = groups.find(g => g.role === 'Frontend');
    expect(frontend?.seniorities).toEqual(expect.arrayContaining(['Senior', 'Lead']));
    const backend = groups.find(g => g.role === 'Backend');
    expect(backend?.seniorities).toEqual(expect.arrayContaining(['Senior', 'Mid-Level']));
  });

  it('produces an empty seniorities list when no member has a seniority value', () => {
    const groups = buildBenchGroups(mockProfiles);
    const other = groups.find(g => g.role === 'Other');
    expect(other?.seniorities).toEqual([]);
  });

  it('collects unique formatted availability values', () => {
    const groups = buildBenchGroups(mockProfiles);
    const frontend = groups.find(g => g.role === 'Frontend');
    expect(frontend?.availabilities).toContain('Immediate');
    expect(frontend?.availabilities).toContain('2 Weeks');
  });

  it('shows "Not specified" for candidates with no location', () => {
    const groups = buildBenchGroups(mockProfiles);
    const backend = groups.find(g => g.role === 'Backend');
    expect(backend?.locations).toContain('Not specified');
  });

  it('returns a single group for a lone profile (no crash)', () => {
    const groups = buildBenchGroups([mockProfiles[0]]);
    expect(groups).toHaveLength(1);
    expect(groups[0].role).toBe('Frontend');
  });

  it('returns an empty array for an empty profiles list', () => {
    expect(buildBenchGroups([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Copy-output generators (email HTML + LinkedIn plain text)
// ---------------------------------------------------------------------------
describe('generateHtmlTable', () => {
  it('includes a Seniority column header and renders seniority values as stacked inline tags', () => {
    const groups = buildBenchGroups(mockProfiles);
    const html = generateHtmlTable(groups);
    expect(html).toContain('>Seniority</th>');
    // Values appear in separate display:inline-block spans, not comma-joined.
    expect(html).not.toContain('Senior, Lead');
    expect(html).toContain('display:inline-block');
    expect(html).toContain('Senior');
    expect(html).toContain('Lead');
  });

  it('produces valid output for an empty groups array (no crash, 0 resources)', () => {
    const html = generateHtmlTable([]);
    expect(html).toContain('0 resources across 0 roles');
    expect(html).toContain('>Seniority</th>');
  });

  it('has branded header div before the table with company name, Bench List, date, and totals', () => {
    const groups = buildBenchGroups(mockProfiles);
    const html = generateHtmlTable(groups);
    const tableIdx = html.indexOf('<table');
    const beforeTable = html.slice(0, tableIdx);
    expect(beforeTable).toContain('Quadzero');
    expect(beforeTable).toContain('Bench List');
    expect(beforeTable).toContain('resources across');
  });

  it('has intro framing line between the header band and the table', () => {
    const groups = buildBenchGroups(mockProfiles);
    const html = generateHtmlTable(groups);
    const tableIdx = html.indexOf('<table');
    const beforeTable = html.slice(0, tableIdx);
    expect(beforeTable).toContain('screened within the last 15 days');
  });

  it('merges Role/Category and Roles into one cell — no standalone Roles th', () => {
    const groups = buildBenchGroups(mockProfiles);
    const html = generateHtmlTable(groups);
    expect(html).not.toMatch(/>Roles<\/th>/);
    expect(html).toContain('Role / Category');
    // Specific roles appear as a sub-line inside the same cell.
    expect(html).toContain('React Developer');
  });

  it('renders resource count as a badge with background-color and font-weight:bold', () => {
    const groups = buildBenchGroups(mockProfiles);
    const html = generateHtmlTable(groups);
    expect(html).toMatch(/background-color[^"]*font-weight:bold/);
  });

  it('has no display:flex, display:grid, or border-radius in the output', () => {
    const groups = buildBenchGroups(mockProfiles);
    const html = generateHtmlTable(groups);
    expect(html).not.toContain('display:flex');
    expect(html).not.toContain('display:grid');
    expect(html).not.toContain('border-radius');
  });

  it('has no border:1px solid on cell styles and uses border-bottom for row separation', () => {
    const groups = buildBenchGroups(mockProfiles);
    const html = generateHtmlTable(groups);
    expect(html).not.toContain('border:1px solid');
    expect(html).toContain('border-bottom');
  });

  it('renders empty seniority/availability/location arrays as em dash, not N/A', () => {
    const html = generateHtmlTable([{
      role: 'Other',
      count: 1,
      specificRoles: [],
      seniorities: [],
      experienceRange: '3 years',
      availabilities: [],
      locations: [],
      indicativeRateRange: 'on request',
    }]);
    expect(html).toContain('—');
    expect(html).not.toContain('N/A');
  });

  it('has confidentiality footer after </table>', () => {
    const groups = buildBenchGroups(mockProfiles);
    const html = generateHtmlTable(groups);
    const tableEnd = html.lastIndexOf('</table>');
    const afterTable = html.slice(tableEnd);
    expect(afterTable).toContain('intended for the named recipient only');
  });

  it('reads "1 role" (singular) for a bench list with a single group', () => {
    const html = generateHtmlTable([{
      role: 'Backend',
      count: 2,
      specificRoles: ['Backend Developer'],
      seniorities: ['Senior'],
      experienceRange: '6 years',
      availabilities: ['Immediate'],
      locations: ['Mumbai, India'],
      indicativeRateRange: 'on request',
    }]);
    expect(html).toContain('1 role');
    expect(html).not.toContain('1 roles');
  });

  it('escapes HTML special characters in role names', () => {
    const html = generateHtmlTable([{
      role: 'Other',
      count: 1,
      specificRoles: ['Dev & <Ops>'],
      seniorities: [],
      experienceRange: '4 years',
      availabilities: [],
      locations: [],
      indicativeRateRange: 'on request',
    }]);
    expect(html).toContain('Dev &amp; &lt;Ops&gt;');
    expect(html).not.toContain('<Ops>');
  });
});

describe('generatePlainText', () => {
  it('renders seniority values on separate lines without comma-joining', () => {
    const groups = buildBenchGroups(mockProfiles);
    const text = generatePlainText(groups);
    // No comma-joined multi-value strings.
    expect(text).not.toContain('Senior, Lead');
    expect(text).not.toContain('N/A');
    // Each value appears individually.
    expect(text).toContain('Senior');
    expect(text).toContain('Lead');
    // Group with no seniority renders em dash.
    expect(text).toContain('Seniority: —');
  });

  it('has intro framing and confidentiality footer', () => {
    const groups = buildBenchGroups(mockProfiles);
    const text = generatePlainText(groups);
    expect(text).toContain('screened within the last 15 days');
    expect(text).toContain('intended for the named recipient only');
  });

  it('produces valid output for an empty groups array (no crash, 0 resources)', () => {
    const text = generatePlainText([]);
    expect(text).toContain('0 resources across 0 roles');
    expect(text).toContain('screened within the last 15 days');
    expect(text).toContain('intended for the named recipient only');
  });
});

// ---------------------------------------------------------------------------
// BenchListModal component tests
// ---------------------------------------------------------------------------
// Opens the Export ▾ menu so its items (copy/download/email/include-rates) are
// queryable. The trigger's accessible name is "Export".
const openExportMenu = () =>
  fireEvent.click(screen.getByRole('button', { name: /Export/i }));

describe('BenchListModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the modal with correct title and summary', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    expect(screen.getByText('Bench List')).toBeInTheDocument();
    expect(screen.getByText(/6 resources across 4 roles/)).toBeInTheDocument();
  });

  it('renders canonical category groups as row cards', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();
    expect(screen.getByText('DevOps/Cloud')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('no longer renders the old table column headers (Role / Category, Roles)', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    expect(screen.queryByText('Role / Category')).not.toBeInTheDocument();
    expect(screen.queryByText('Resources Available')).not.toBeInTheDocument();
    // The redundant standalone "Roles" column header is gone.
    expect(screen.queryByText('Roles')).not.toBeInTheDocument();
  });

  it('renders multi-value seniority as individual chips, not a comma string', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    // The comma-joined form must NOT appear anywhere.
    expect(screen.queryByText('Senior, Lead')).not.toBeInTheDocument();
    expect(screen.queryByText('Senior, Mid-Level')).not.toBeInTheDocument();
    // Each value is its own chip text node within the Frontend card.
    const frontend = screen.getByTestId('bench-card-Frontend');
    expect(within(frontend).getByText('Senior')).toBeInTheDocument();
    expect(within(frontend).getByText('Lead')).toBeInTheDocument();
  });

  it('renders a single-value field as a chip (not suppressed or plain text)', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    // DevOps/Cloud has exactly one seniority (Mid-Level) → still a chip.
    const devops = screen.getByTestId('bench-card-DevOps/Cloud');
    expect(within(devops).getByText('Mid-Level')).toBeInTheDocument();
  });

  it('merges the role category and specific roles into one cell', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    const frontend = screen.getByTestId('bench-card-Frontend');
    // Canonical category as primary text…
    expect(within(frontend).getByText('Frontend')).toBeInTheDocument();
    // …specific titles as a subordinate sub-line in the same card.
    expect(
      within(frontend).getByText(/React Developer, UI Engineer, Frontend Lead/)
    ).toBeInTheDocument();
  });

  it('renders the count as a labelled badge per card', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    const frontend = screen.getByTestId('bench-card-Frontend');
    expect(within(frontend).getByLabelText('2 available')).toHaveTextContent('2');
  });

  it('renders em dash for empty seniority, not N/A', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    // Frank's "Other" group has no seniority → em dash, never "N/A".
    const other = screen.getByTestId('bench-card-Other');
    expect(within(other).getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('N/A')).not.toBeInTheDocument();
  });

  it('collapses copy/download actions into the Export menu (hidden until opened)', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    // Not rendered as standalone header controls.
    expect(screen.queryByText('Copy for Email')).not.toBeInTheDocument();
    expect(screen.queryByText('Copy for LinkedIn')).not.toBeInTheDocument();
    expect(screen.queryByText('Download XLSX')).not.toBeInTheDocument();
    expect(screen.queryByText('Download CSV')).not.toBeInTheDocument();
    // Opening the Export menu reveals them.
    openExportMenu();
    expect(screen.getByText('Copy for Email')).toBeInTheDocument();
    expect(screen.getByText('Copy for LinkedIn')).toBeInTheDocument();
    expect(screen.getByText('Download XLSX')).toBeInTheDocument();
    expect(screen.getByText('Download CSV')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    const closeButtons = screen.getAllByRole('button');
    const xButton = closeButtons.find(btn => btn.querySelector('.lucide-x'));
    if (xButton) {
      fireEvent.click(xButton);
    } else {
      const backdrop = document.querySelector('.bg-black.bg-opacity-50');
      if (backdrop) fireEvent.click(backdrop);
    }
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    const backdrop = document.querySelector('.bg-black.bg-opacity-50');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Empty-state tests
// ---------------------------------------------------------------------------
describe('BenchListModal — empty state', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the empty-state message when profiles is empty', () => {
    render(<BenchListModal profiles={[]} onClose={onClose} />);
    expect(
      screen.getByText(
        'No bench-ready resources found. Candidates must be available within 2 weeks and screened in the last 15 days.'
      )
    ).toBeInTheDocument();
  });

  it('shows the "0 resources across 0 roles" summary with no JS error', () => {
    render(<BenchListModal profiles={[]} onClose={onClose} />);
    expect(screen.getByText(/0 resources across 0 roles/)).toBeInTheDocument();
  });

  it('still closes via the close button when empty', () => {
    render(<BenchListModal profiles={[]} onClose={onClose} />);
    const xButton = screen
      .getAllByRole('button')
      .find(btn => btn.querySelector('.lucide-x'));
    fireEvent.click(xButton!);
    expect(onClose).toHaveBeenCalled();
  });

  it('still closes via the backdrop when empty', () => {
    render(<BenchListModal profiles={[]} onClose={onClose} />);
    const backdrop = document.querySelector('.bg-black.bg-opacity-50');
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Indicative rate test data
// ---------------------------------------------------------------------------
// Two "Backend Developer" members with 24 and 36 LPA → range; one "DevOps
// Engineer" with 18 LPA → single; one "QA Engineer" with null rate → on request.
const ratedProfiles: ProfileListItem[] = [
  {
    candidateId: 'r1', fullName: 'Alice', primarySkills: ['node'], totalExperience: 6,
    seniority: 'senior', location: 'Mumbai, India', lastUpdated: '', roles: ['Backend Developer'],
    availability: 'immediate', indicativeBillingRateLpa: 24,
  },
  {
    candidateId: 'r2', fullName: 'Bob', primarySkills: ['node'], totalExperience: 8,
    seniority: 'lead', location: 'Pune, India', lastUpdated: '', roles: ['Backend Developer'],
    availability: '2_weeks', indicativeBillingRateLpa: 36,
  },
  {
    candidateId: 'r3', fullName: 'Charlie', primarySkills: ['aws'], totalExperience: 5,
    seniority: 'mid', location: 'Bangalore, India', lastUpdated: '', roles: ['DevOps Engineer'],
    availability: 'immediate', indicativeBillingRateLpa: 18,
  },
  {
    candidateId: 'r4', fullName: 'Diana', primarySkills: ['selenium'], totalExperience: 4,
    seniority: 'mid', location: 'Chennai, India', lastUpdated: '', roles: ['QA Engineer'],
    availability: '1_week', indicativeBillingRateLpa: null,
  },
];

// All members null rate (or missing the field entirely — legacy API shape).
const unratedProfiles: ProfileListItem[] = [
  {
    candidateId: 'u1', fullName: 'Eve', primarySkills: ['node'], totalExperience: 6,
    seniority: 'senior', location: 'Mumbai, India', lastUpdated: '', roles: ['Backend Developer'],
    availability: 'immediate', indicativeBillingRateLpa: null,
  },
  {
    candidateId: 'u2', fullName: 'Frank', primarySkills: ['node'], totalExperience: 7,
    seniority: 'lead', location: 'Pune, India', lastUpdated: '', roles: ['Backend Developer'],
    availability: '2_weeks', // no indicativeBillingRateLpa field at all
  },
];

// ---------------------------------------------------------------------------
// buildBenchGroups — indicative rate range
// ---------------------------------------------------------------------------
describe('buildBenchGroups indicative rate range', () => {
  it('derives the rate range from min and max member billing LPA', () => {
    const groups = buildBenchGroups(ratedProfiles);
    const backend = groups.find(g => g.role === 'Backend');
    // 24 LPA → ₹2L/month, 36 LPA → ₹3L/month
    expect(backend?.indicativeRateRange).toBe('₹2–3L/month');
  });

  it('formats a single-member group as a single monthly figure (no NaN/negative range)', () => {
    const groups = buildBenchGroups(ratedProfiles);
    const devops = groups.find(g => g.role === 'DevOps/Cloud');
    // 18 LPA / 12 = 1.5L/month
    expect(devops?.indicativeRateRange).toBe('₹1.5L/month');
  });

  it('shows "on request" when all members have null rates', () => {
    const groups = buildBenchGroups(ratedProfiles);
    const qa = groups.find(g => g.role === 'QA/Testing');
    expect(qa?.indicativeRateRange).toBe('on request');
  });

  it('ignores null members when computing min/max for a mixed group', () => {
    const mixed: ProfileListItem[] = [
      { ...ratedProfiles[0], roles: ['Mixed'] },                         // 24 LPA
      { ...ratedProfiles[3], roles: ['Mixed'], candidateId: 'mx' },       // null
    ];
    const groups = buildBenchGroups(mixed);
    // 'Mixed' matches no category keyword, so it falls through to 'Other'.
    const group = groups.find(g => g.role === 'Other');
    // Only the 24 LPA member counts → single figure, null does not skew it.
    expect(group?.indicativeRateRange).toBe('₹2L/month');
  });

  it('shows "on request" for legacy profiles with no rate field at all', () => {
    const groups = buildBenchGroups(unratedProfiles);
    const group = groups.find(g => g.role === 'Backend');
    expect(group?.indicativeRateRange).toBe('on request');
  });
});

// ---------------------------------------------------------------------------
// generateHtmlTable / generatePlainText — rate column inclusion
// ---------------------------------------------------------------------------
describe('rate column in copy outputs', () => {
  it('includes the Indicative Rate column in HTML when includeRates is true', () => {
    const groups = buildBenchGroups(ratedProfiles);
    const html = generateHtmlTable(groups, true);
    expect(html).toContain('Indicative Rate');
    expect(html).toContain('₹2–3L/month');
  });

  it('omits the Indicative Rate column from HTML when includeRates is false', () => {
    const groups = buildBenchGroups(ratedProfiles);
    const html = generateHtmlTable(groups, false);
    expect(html).not.toContain('Indicative Rate');
    expect(html).not.toContain('L/month');
  });

  it('includes the Indicative Rate line in plain text when includeRates is true', () => {
    const groups = buildBenchGroups(ratedProfiles);
    const text = generatePlainText(groups, true);
    expect(text).toContain('Indicative Rate:');
    expect(text).toContain('₹2–3L/month');
  });

  it('omits the Indicative Rate line from plain text when includeRates is false', () => {
    const groups = buildBenchGroups(ratedProfiles);
    const text = generatePlainText(groups, false);
    expect(text).not.toContain('Indicative Rate');
    expect(text).not.toContain('L/month');
  });
});

// ---------------------------------------------------------------------------
// BenchListModal — Include rates toggle & clipboard
// ---------------------------------------------------------------------------
describe('BenchListModal include-rates toggle', () => {
  const onClose = vi.fn();
  let writeMock: ReturnType<typeof vi.fn>;
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    writeMock = vi.fn().mockResolvedValue(undefined);
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write: writeMock, writeText: writeTextMock },
    });
    // jsdom does not implement ClipboardItem; store the data map so tests can read it back.
    (globalThis as any).ClipboardItem = class {
      data: Record<string, Blob>;
      constructor(data: Record<string, Blob>) { this.data = data; }
    };
    // jsdom's Blob has no readable .text() across versions; use a minimal stand-in
    // that exposes its content so copy assertions can inspect the HTML/text payload.
    (globalThis as any).Blob = class {
      private parts: unknown[];
      type: string;
      constructor(parts: unknown[], opts?: { type?: string }) {
        this.parts = parts;
        this.type = opts?.type ?? '';
      }
      text() { return Promise.resolve(this.parts.join('')); }
    };
  });

  it('renders the Include rates checkbox unchecked by default (inside Export menu)', () => {
    render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);
    openExportMenu();
    const checkbox = screen.getByLabelText('Include rates') as HTMLInputElement;
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.checked).toBe(false);
  });

  it('shows the indicative rate in the cards when the checkbox is checked', () => {
    render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);
    openExportMenu();
    expect(screen.queryByText('₹2–3L/month')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Include rates'));
    // Backend group rate range now visible on screen.
    expect(screen.getByText('₹2–3L/month')).toBeInTheDocument();
  });

  it('hides the indicative rate again when the checkbox is unchecked', () => {
    render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);
    openExportMenu();
    const checkbox = screen.getByLabelText('Include rates');
    fireEvent.click(checkbox);
    expect(screen.getByText('₹2–3L/month')).toBeInTheDocument();
    fireEvent.click(checkbox);
    expect(screen.queryByText('₹2–3L/month')).not.toBeInTheDocument();
  });

  it('resets the checkbox to unchecked when the modal is reopened', () => {
    const { unmount } = render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);
    openExportMenu();
    fireEvent.click(screen.getByLabelText('Include rates'));
    expect((screen.getByLabelText('Include rates') as HTMLInputElement).checked).toBe(true);
    unmount();
    render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);
    openExportMenu();
    expect((screen.getByLabelText('Include rates') as HTMLInputElement).checked).toBe(false);
  });

  it('keeps the Include-rates state across menu dismiss/reopen', () => {
    render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);
    openExportMenu();
    fireEvent.click(screen.getByLabelText('Include rates'));
    // Dismiss without selecting (Escape) then reopen — state preserved.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByLabelText('Include rates')).not.toBeInTheDocument();
    openExportMenu();
    expect((screen.getByLabelText('Include rates') as HTMLInputElement).checked).toBe(true);
  });

  it('shows "on request" cells when rates are enabled but all members are unrated', () => {
    render(<BenchListModal profiles={unratedProfiles} onClose={onClose} />);
    openExportMenu();
    fireEvent.click(screen.getByLabelText('Include rates'));
    expect(screen.getByText('on request')).toBeInTheDocument();
  });

  it('Copy for Email includes the rate column only when Include rates is checked', async () => {
    const { unmount } = render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);

    // Unchecked → no rate column in the copied HTML.
    openExportMenu();
    fireEvent.click(screen.getByText('Copy for Email'));
    await waitFor(() => expect(writeMock).toHaveBeenCalledTimes(1));
    const htmlOff = await writeMock.mock.calls[0][0][0].data['text/html'].text();
    expect(htmlOff).not.toContain('Indicative Rate');
    unmount();

    // Checked → rate column present.
    render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);
    openExportMenu();
    fireEvent.click(screen.getByLabelText('Include rates'));
    fireEvent.click(screen.getByText('Copy for Email'));
    await waitFor(() => expect(writeMock).toHaveBeenCalledTimes(2));
    const htmlOn = await writeMock.mock.calls[1][0][0].data['text/html'].text();
    expect(htmlOn).toContain('Indicative Rate');
    expect(htmlOn).toContain('₹2–3L/month');
  });

  it('Copy for LinkedIn includes the rate line only when Include rates is checked', async () => {
    const { unmount } = render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);

    // Unchecked → no rate line in the copied plain text.
    openExportMenu();
    fireEvent.click(screen.getByText('Copy for LinkedIn'));
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledTimes(1));
    expect(writeTextMock.mock.calls[0][0]).not.toContain('Indicative Rate');
    unmount();

    // Checked → rate line present.
    render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);
    openExportMenu();
    fireEvent.click(screen.getByLabelText('Include rates'));
    fireEvent.click(screen.getByText('Copy for LinkedIn'));
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledTimes(2));
    expect(writeTextMock.mock.calls[1][0]).toContain('Indicative Rate');
  });
});

// ---------------------------------------------------------------------------
// buildGroupedExportRows — grouped row shape for XLSX/CSV
// ---------------------------------------------------------------------------
describe('buildGroupedExportRows', () => {
  it('produces a header row matching the modal columns (no rates by default)', () => {
    const rows = buildGroupedExportRows(buildBenchGroups(mockProfiles));
    expect(rows[0]).toEqual([
      'Role / Category',
      'Resources Available',
      'Roles',
      'Seniority',
      'Experience',
      'Availability',
      'Preferred Location',
    ]);
  });

  it('appends an Indicative Rate column when includeRates is true', () => {
    const rows = buildGroupedExportRows(buildBenchGroups(ratedProfiles), true);
    expect(rows[0]).toContain('Indicative Rate');
    // One header + one row per group.
    expect(rows.length).toBe(buildBenchGroups(ratedProfiles).length + 1);
  });

  it('returns a header-only sheet (no data rows) for an empty bench list', () => {
    const rows = buildGroupedExportRows([]);
    expect(rows.length).toBe(1);
    expect(rows[0][0]).toBe('Role / Category');
  });
});

// ---------------------------------------------------------------------------
// Download buttons (XLSX / CSV)
// ---------------------------------------------------------------------------
describe('BenchListModal download buttons', () => {
  const onClose = vi.fn();
  const DATE_RE_XLSX = /^bench-list-\d{4}-\d{2}-\d{2}\.xlsx$/;
  const DATE_RE_CSV = /^bench-list-\d{4}-\d{2}-\d{2}\.csv$/;

  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    createObjectURLMock = vi.fn(() => 'blob:mock');
    revokeObjectURLMock = vi.fn();
    (URL as any).createObjectURL = createObjectURLMock;
    (URL as any).revokeObjectURL = revokeObjectURLMock;
  });

  it('renders both download buttons inside the Export menu', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    openExportMenu();
    expect(screen.getByText('Download XLSX')).toBeInTheDocument();
    expect(screen.getByText('Download CSV')).toBeInTheDocument();
  });

  it('Download XLSX writes a file named bench-list-YYYY-MM-DD.xlsx', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    openExportMenu();
    fireEvent.click(screen.getByText('Download XLSX'));
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const filename = mockWriteFile.mock.calls[0][1] as string;
    expect(filename).toMatch(DATE_RE_XLSX);
  });

  it('Download CSV triggers an anchor download named bench-list-YYYY-MM-DD.csv', () => {
    // Capture the generated anchor to read back its download attribute.
    const realCreate = document.createElement.bind(document);
    let captured: HTMLAnchorElement | null = null;
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        captured = el as HTMLAnchorElement;
        captured.click = vi.fn();
      }
      return el;
    });

    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    openExportMenu();
    fireEvent.click(screen.getByText('Download CSV'));

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(captured).not.toBeNull();
    expect(captured!.download).toMatch(DATE_RE_CSV);
    expect(captured!.click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);

    createSpy.mockRestore();
  });

  it('does not make any network request when downloading (XLSX or CSV)', () => {
    const fetchSpy = vi.fn();
    (globalThis as any).fetch = fetchSpy;
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    openExportMenu();
    fireEvent.click(screen.getByText('Download XLSX'));
    fireEvent.click(screen.getByText('Download CSV'));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockSendBenchListEmail).not.toHaveBeenCalled();
  });

  it('downloads a header-only CSV for an empty bench list without crashing', () => {
    let capturedBlob: any = null;
    const realBlob = globalThis.Blob;
    (globalThis as any).Blob = class {
      content: string;
      constructor(parts: string[]) {
        this.content = parts.join('');
        capturedBlob = this;
      }
    };
    render(<BenchListModal profiles={[]} onClose={onClose} />);
    openExportMenu();
    fireEvent.click(screen.getByText('Download CSV'));
    expect(capturedBlob).not.toBeNull();
    // Only the BOM + header line — no data rows.
    expect(capturedBlob.content).toContain('Role / Category');
    expect(capturedBlob.content.trim().split('\n').length).toBe(1);
    (globalThis as any).Blob = realBlob;
  });

  it('downloadGroupedCsv emits a header-only file for empty groups (unit)', () => {
    let capturedBlob: any = null;
    const realBlob = globalThis.Blob;
    (globalThis as any).Blob = class {
      content: string;
      constructor(parts: string[]) {
        this.content = parts.join('');
        capturedBlob = this;
      }
    };
    downloadGroupedCsv([]);
    expect(capturedBlob.content.trim().split('\n').length).toBe(1);
    (globalThis as any).Blob = realBlob;
  });
});

// ---------------------------------------------------------------------------
// "Email to me" button
// ---------------------------------------------------------------------------
describe('BenchListModal "Email to me"', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendBenchListEmail.mockResolvedValue({});
  });

  it('renders the menu item when isInternal is true', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} isInternal />);
    openExportMenu();
    expect(screen.getByText('Email to me')).toBeInTheDocument();
  });

  it('does not render the item when isInternal is false or omitted', () => {
    const { unmount } = render(<BenchListModal profiles={mockProfiles} onClose={onClose} isInternal={false} />);
    openExportMenu();
    expect(screen.queryByText('Email to me')).not.toBeInTheDocument();
    unmount();
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    openExportMenu();
    expect(screen.queryByText('Email to me')).not.toBeInTheDocument();
  });

  it('calls api.sendBenchListEmail on click', async () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} isInternal />);
    openExportMenu();
    fireEvent.click(screen.getByText('Email to me'));
    await waitFor(() => expect(mockSendBenchListEmail).toHaveBeenCalledTimes(1));
  });

  it('disables the button and shows "Sending…" while the request is in flight', async () => {
    let resolve!: (v: unknown) => void;
    mockSendBenchListEmail.mockReturnValue(new Promise((r) => { resolve = r; }));

    render(<BenchListModal profiles={mockProfiles} onClose={onClose} isInternal />);
    openExportMenu();
    const button = screen.getByText('Email to me').closest('button')!;
    fireEvent.click(button);

    expect(screen.getByText('Sending…')).toBeInTheDocument();
    expect(button).toBeDisabled();

    await act(async () => { resolve({}); });
    await waitFor(() => expect(screen.getByText('Sent!')).toBeInTheDocument());
    expect(button).not.toBeDisabled();
  });

  it('shows "Sent!" on success then resets to "Email to me" after 2s', async () => {
    vi.useFakeTimers();
    try {
      render(<BenchListModal profiles={mockProfiles} onClose={onClose} isInternal />);
      openExportMenu();
      await act(async () => {
        fireEvent.click(screen.getByText('Email to me'));
      });
      expect(screen.getByText('Sent!')).toBeInTheDocument();

      await act(async () => { vi.advanceTimersByTime(2000); });
      expect(screen.queryByText('Sent!')).not.toBeInTheDocument();
      expect(screen.getByText('Email to me')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows "Failed" when the request rejects', async () => {
    mockSendBenchListEmail.mockRejectedValue(new Error('boom'));
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} isInternal />);
    openExportMenu();
    fireEvent.click(screen.getByText('Email to me'));
    await waitFor(() => expect(screen.getByText('Failed')).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// Role filter
// ---------------------------------------------------------------------------
describe('BenchListModal — role filter', () => {
  const onClose = vi.fn();
  beforeEach(() => vi.clearAllMocks());

  const cardRoles = () =>
    screen.getAllByTestId(/^bench-card-/).map(el => el.getAttribute('data-testid')!.replace('bench-card-', ''));

  it('hides non-matching cards as you type and restores them when cleared', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    const input = screen.getByLabelText('Filter by role');
    fireEvent.change(input, { target: { value: 'frontend' } });
    expect(cardRoles()).toEqual(['Frontend']);
    fireEvent.change(input, { target: { value: '' } });
    expect(cardRoles()).toContain('Backend');
    expect(cardRoles()).toContain('Other');
  });

  it('matches case-insensitively', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    const input = screen.getByLabelText('Filter by role');
    for (const term of ['frontend', 'FRONTEND', 'Frontend']) {
      fireEvent.change(input, { target: { value: term } });
      expect(cardRoles()).toEqual(['Frontend']);
    }
  });

  it('shows a no-match indicator (not the empty-bench message) when nothing matches', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Filter by role'), { target: { value: 'zzz-nope' } });
    expect(screen.queryAllByTestId(/^bench-card-/)).toHaveLength(0);
    expect(screen.getByText(/No roles match/)).toBeInTheDocument();
    expect(screen.queryByText(/No bench-ready resources found/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Sort control
// ---------------------------------------------------------------------------
describe('BenchListModal — sort', () => {
  const onClose = vi.fn();
  beforeEach(() => vi.clearAllMocks());

  const cardRoles = () =>
    screen.getAllByTestId(/^bench-card-/).map(el => el.getAttribute('data-testid')!.replace('bench-card-', ''));

  it('defaults to most-available (descending count) order', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    expect((screen.getByLabelText('Sort by') as HTMLSelectElement).value).toBe('count');
    expect(cardRoles()).toEqual(['Frontend', 'Backend', 'DevOps/Cloud', 'Other']);
  });

  it('reorders alphabetically when Role A–Z is selected and restores on switch back', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    const select = screen.getByLabelText('Sort by');
    fireEvent.change(select, { target: { value: 'role' } });
    expect(cardRoles()).toEqual(['Backend', 'DevOps/Cloud', 'Frontend', 'Other']);
    fireEvent.change(select, { target: { value: 'count' } });
    expect(cardRoles()).toEqual(['Frontend', 'Backend', 'DevOps/Cloud', 'Other']);
  });
});

// ---------------------------------------------------------------------------
// Header & dark-mode styling
// ---------------------------------------------------------------------------
describe('BenchListModal — header & dark mode', () => {
  const onClose = vi.fn();
  beforeEach(() => vi.clearAllMocks());

  it('header renders only title, summary and close outside the Export menu', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} isInternal />);
    // Closed menu → none of the actions are in the DOM.
    expect(screen.queryByText('Copy for Email')).not.toBeInTheDocument();
    expect(screen.queryByText('Download XLSX')).not.toBeInTheDocument();
    expect(screen.queryByText('Email to me')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Include rates')).not.toBeInTheDocument();
    // Title + summary present, Export trigger + close present.
    expect(screen.getByText('Bench List')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export/i })).toBeInTheDocument();
  });

  it('applies dark: variants to chips, the count badge, the Export trigger and the role cell', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    const frontend = screen.getByTestId('bench-card-Frontend');
    expect(within(frontend).getByText('Senior').className).toContain('dark:');
    expect(within(frontend).getByLabelText('2 available').className).toContain('dark:');
    expect(within(frontend).getByText('Frontend').className).toContain('dark:');
    expect(screen.getByRole('button', { name: /Export/i }).className).toContain('dark:');
  });
});
