import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BenchListModal, buildBenchGroups, generateHtmlTable, generatePlainText } from '../bench-list-modal';
import type { ProfileListItem } from '@/app/recruiter/locate/page';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const mockProfiles: ProfileListItem[] = [
  {
    candidateId: '1',
    fullName: 'Alice Smith',
    primarySkills: ['salesforce'],
    totalExperience: 5,
    seniority: 'senior',
    location: 'Mumbai, India',
    lastUpdated: '2024-01-15T10:30:00Z',
    roles: ['Salesforce Developer', 'Salesforce Architect'],
    availability: 'immediate',
  },
  {
    candidateId: '2',
    fullName: 'Bob Jones',
    primarySkills: ['salesforce'],
    totalExperience: 8,
    seniority: 'lead',
    location: 'Pune, India',
    lastUpdated: '2024-01-14T15:20:00Z',
    roles: ['Salesforce Developer'],
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
  {
    candidateId: '4',
    fullName: 'Diana Prince',
    primarySkills: ['react'],
    totalExperience: 3,
    seniority: 'mid',
    lastUpdated: '2024-01-12T08:00:00Z',
    roles: [],
    availability: '1_week',
  },
  {
    candidateId: '5',
    fullName: 'Eve Wilson',
    primarySkills: ['react'],
    totalExperience: 3,
    seniority: 'mid',
    lastUpdated: '2024-01-11T08:00:00Z',
    availability: '1_week',
  },
];

// ---------------------------------------------------------------------------
// buildBenchGroups tests
// ---------------------------------------------------------------------------
describe('buildBenchGroups', () => {
  it('groups candidates by their first role', () => {
    const groups = buildBenchGroups(mockProfiles);
    const roleNames = groups.map(g => g.role);
    expect(roleNames).toContain('Salesforce Developer');
    expect(roleNames).toContain('DevOps Engineer');
    expect(roleNames).toContain('Other');
  });

  it('sorts groups by count descending', () => {
    const groups = buildBenchGroups(mockProfiles);
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i - 1].count).toBeGreaterThanOrEqual(groups[i].count);
    }
  });

  it('counts members correctly', () => {
    const groups = buildBenchGroups(mockProfiles);
    const sfGroup = groups.find(g => g.role === 'Salesforce Developer');
    expect(sfGroup?.count).toBe(2);
  });

  it('collects all unique roles within a group', () => {
    const groups = buildBenchGroups(mockProfiles);
    const sfGroup = groups.find(g => g.role === 'Salesforce Developer');
    expect(sfGroup?.specificRoles).toContain('Salesforce Developer');
    expect(sfGroup?.specificRoles).toContain('Salesforce Architect');
  });

  it('computes experience range for multiple candidates', () => {
    const groups = buildBenchGroups(mockProfiles);
    const sfGroup = groups.find(g => g.role === 'Salesforce Developer');
    expect(sfGroup?.experienceRange).toBe('5–8 years');
  });

  it('shows single experience value when min equals max', () => {
    const groups = buildBenchGroups(mockProfiles);
    const devOpsGroup = groups.find(g => g.role === 'DevOps Engineer');
    expect(devOpsGroup?.experienceRange).toBe('4 years');
  });

  it('collects unique formatted availability values', () => {
    const groups = buildBenchGroups(mockProfiles);
    const sfGroup = groups.find(g => g.role === 'Salesforce Developer');
    expect(sfGroup?.availabilities).toContain('Immediate');
    expect(sfGroup?.availabilities).toContain('2 Weeks');
  });

  it('collects unique locations', () => {
    const groups = buildBenchGroups(mockProfiles);
    const sfGroup = groups.find(g => g.role === 'Salesforce Developer');
    expect(sfGroup?.locations).toContain('Mumbai, India');
    expect(sfGroup?.locations).toContain('Pune, India');
  });

  it('shows "Not specified" for candidates with no location', () => {
    const groups = buildBenchGroups(mockProfiles);
    const otherGroup = groups.find(g => g.role === 'Other');
    expect(otherGroup?.locations).toContain('Not specified');
  });

  it('groups candidates with no roles under "Other"', () => {
    const groups = buildBenchGroups(mockProfiles);
    const otherGroup = groups.find(g => g.role === 'Other');
    expect(otherGroup).toBeDefined();
    expect(otherGroup!.count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// BenchListModal component tests
// ---------------------------------------------------------------------------
describe('BenchListModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the modal with correct title and summary', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    expect(screen.getByText('Bench List')).toBeInTheDocument();
    expect(screen.getByText(/5 resources across 3 roles/)).toBeInTheDocument();
  });

  it('renders all role groups in the table', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    // Some roles appear in both the "Role / Category" and "Roles" columns, so use getAllByText
    expect(screen.getAllByText('Salesforce Developer').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('DevOps Engineer').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('displays copy buttons', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    expect(screen.getByText('Copy for Email')).toBeInTheDocument();
    expect(screen.getByText('Copy for LinkedIn')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    // The X button is the last button in the header
    const closeButtons = screen.getAllByRole('button');
    const xButton = closeButtons.find(btn => btn.querySelector('.lucide-x'));
    if (xButton) {
      fireEvent.click(xButton);
    } else {
      // Click the backdrop
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

  it('renders table headers correctly', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    expect(screen.getByText('Role / Category')).toBeInTheDocument();
    expect(screen.getByText('Resources Available')).toBeInTheDocument();
    expect(screen.getByText('Roles')).toBeInTheDocument();
    expect(screen.getByText('Experience')).toBeInTheDocument();
    expect(screen.getByText('Availability')).toBeInTheDocument();
    expect(screen.getByText('Preferred Location')).toBeInTheDocument();
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
    const backend = groups.find(g => g.role === 'Backend Developer');
    // 24 LPA → ₹2L/month, 36 LPA → ₹3L/month
    expect(backend?.indicativeRateRange).toBe('₹2–3L/month');
  });

  it('formats a single-member group as a single monthly figure (no NaN/negative range)', () => {
    const groups = buildBenchGroups(ratedProfiles);
    const devops = groups.find(g => g.role === 'DevOps Engineer');
    // 18 LPA / 12 = 1.5L/month
    expect(devops?.indicativeRateRange).toBe('₹1.5L/month');
  });

  it('shows "on request" when all members have null rates', () => {
    const groups = buildBenchGroups(ratedProfiles);
    const qa = groups.find(g => g.role === 'QA Engineer');
    expect(qa?.indicativeRateRange).toBe('on request');
  });

  it('ignores null members when computing min/max for a mixed group', () => {
    const mixed: ProfileListItem[] = [
      { ...ratedProfiles[0], roles: ['Mixed'] },                         // 24 LPA
      { ...ratedProfiles[3], roles: ['Mixed'], candidateId: 'mx' },       // null
    ];
    const groups = buildBenchGroups(mixed);
    const group = groups.find(g => g.role === 'Mixed');
    // Only the 24 LPA member counts → single figure, null does not skew it.
    expect(group?.indicativeRateRange).toBe('₹2L/month');
  });

  it('shows "on request" for legacy profiles with no rate field at all', () => {
    const groups = buildBenchGroups(unratedProfiles);
    const group = groups.find(g => g.role === 'Backend Developer');
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

  it('renders the Include rates checkbox unchecked by default', () => {
    render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);
    const checkbox = screen.getByLabelText('Include rates') as HTMLInputElement;
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.checked).toBe(false);
  });

  it('shows the Indicative Rate column when the checkbox is checked', () => {
    render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);
    expect(screen.queryByText('Indicative Rate')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Include rates'));
    expect(screen.getByText('Indicative Rate')).toBeInTheDocument();
  });

  it('hides the Indicative Rate column again when the checkbox is unchecked', () => {
    render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);
    const checkbox = screen.getByLabelText('Include rates');
    fireEvent.click(checkbox);
    expect(screen.getByText('Indicative Rate')).toBeInTheDocument();
    fireEvent.click(checkbox);
    expect(screen.queryByText('Indicative Rate')).not.toBeInTheDocument();
  });

  it('resets the checkbox to unchecked when the modal is reopened', () => {
    const { unmount } = render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Include rates'));
    expect((screen.getByLabelText('Include rates') as HTMLInputElement).checked).toBe(true);
    unmount();
    render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);
    expect((screen.getByLabelText('Include rates') as HTMLInputElement).checked).toBe(false);
  });

  it('shows "on request" cells when rates are enabled but all members are unrated', () => {
    render(<BenchListModal profiles={unratedProfiles} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Include rates'));
    expect(screen.getByText('on request')).toBeInTheDocument();
  });

  it('Copy for Email includes the rate column only when Include rates is checked', async () => {
    const { unmount } = render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);

    // Unchecked → no rate column in the copied HTML.
    fireEvent.click(screen.getByText('Copy for Email'));
    await waitFor(() => expect(writeMock).toHaveBeenCalledTimes(1));
    const htmlOff = await writeMock.mock.calls[0][0][0].data['text/html'].text();
    expect(htmlOff).not.toContain('Indicative Rate');
    unmount();

    // Checked → rate column present.
    render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);
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
    fireEvent.click(screen.getByText('Copy for LinkedIn'));
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledTimes(1));
    expect(writeTextMock.mock.calls[0][0]).not.toContain('Indicative Rate');
    unmount();

    // Checked → rate line present.
    render(<BenchListModal profiles={ratedProfiles} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Include rates'));
    fireEvent.click(screen.getByText('Copy for LinkedIn'));
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledTimes(2));
    expect(writeTextMock.mock.calls[1][0]).toContain('Indicative Rate');
  });
});
