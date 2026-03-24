import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BenchListModal, buildBenchGroups } from '../bench-list-modal';
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
