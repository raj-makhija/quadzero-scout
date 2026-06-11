import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  BenchListModal,
  buildBenchGroups,
  generateHtmlTable,
  generatePlainText,
} from '../bench-list-modal';
import type { ProfileListItem } from '@/app/recruiter/locate/page';

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
  it('includes a Seniority column header and per-row seniority values', () => {
    const groups = buildBenchGroups(mockProfiles);
    const html = generateHtmlTable(groups);
    expect(html).toContain('<th style="');
    expect(html).toContain('>Seniority</th>');
    expect(html).toContain('Senior, Lead');
  });

  it('produces valid output for an empty groups array (no crash, 0 resources)', () => {
    const html = generateHtmlTable([]);
    expect(html).toContain('0 resources across 0 roles');
    expect(html).toContain('>Seniority</th>');
  });
});

describe('generatePlainText', () => {
  it('includes a "Seniority:" line per group', () => {
    const groups = buildBenchGroups(mockProfiles);
    const text = generatePlainText(groups);
    expect(text).toContain('Seniority: Senior, Lead');
    // Group with no seniority renders N/A
    expect(text).toContain('Seniority: N/A');
  });

  it('produces valid output for an empty groups array (no crash, 0 resources)', () => {
    const text = generatePlainText([]);
    expect(text).toContain('0 resources across 0 roles');
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
    expect(screen.getByText(/6 resources across 4 roles/)).toBeInTheDocument();
  });

  it('renders canonical category groups in the table', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();
    expect(screen.getByText('DevOps/Cloud')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('renders table headers including the Seniority column', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    expect(screen.getByText('Role / Category')).toBeInTheDocument();
    expect(screen.getByText('Resources Available')).toBeInTheDocument();
    expect(screen.getByText('Roles')).toBeInTheDocument();
    expect(screen.getByText('Seniority')).toBeInTheDocument();
    expect(screen.getByText('Experience')).toBeInTheDocument();
    expect(screen.getByText('Availability')).toBeInTheDocument();
    expect(screen.getByText('Preferred Location')).toBeInTheDocument();
  });

  it('renders seniority values for groups with different distributions', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    // Frontend: Senior, Lead
    expect(screen.getByText('Senior, Lead')).toBeInTheDocument();
    // Backend: Senior, Mid-Level
    expect(screen.getByText('Senior, Mid-Level')).toBeInTheDocument();
    // Other: no seniority → N/A (Frank's row)
    expect(screen.getAllByText('N/A').length).toBeGreaterThanOrEqual(1);
  });

  it('displays copy buttons', () => {
    render(<BenchListModal profiles={mockProfiles} onClose={onClose} />);
    expect(screen.getByText('Copy for Email')).toBeInTheDocument();
    expect(screen.getByText('Copy for LinkedIn')).toBeInTheDocument();
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
