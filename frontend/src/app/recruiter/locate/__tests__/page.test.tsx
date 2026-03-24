import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  usePathname: vi.fn(() => '/recruiter/locate'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

const mockUseSession = vi.fn(() => ({
  data: { user: { role: 'recruiter', isInternal: true } },
  status: 'authenticated' as const,
}));

vi.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
  signOut: vi.fn(),
  signIn: vi.fn(),
  SessionProvider: ({ children }: any) => children,
}));

const mockListRecentProfiles = vi.fn();
const mockSearchCandidates = vi.fn();
const mockSearchCandidatesByName = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    listRecentProfiles: (...args: any[]) => mockListRecentProfiles(...args),
    searchCandidates: (...args: any[]) => mockSearchCandidates(...args),
    searchCandidatesByName: (...args: any[]) => mockSearchCandidatesByName(...args),
  },
  ApiError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock('@/components/Header', () => ({
  Header: () => <div data-testid="header">Header</div>,
}));

vi.mock('@/components/bench-list-modal', () => ({
  BenchListModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="bench-list-modal">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock('@/components/screening-modal', () => ({
  getScreeningStatus: (lastScreenedAt?: string) => {
    if (!lastScreenedAt) return { label: 'Not Screened', className: 'bg-gray-100' };
    const daysSince = (Date.now() - new Date(lastScreenedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 15) return { label: 'Screening Expired', className: 'bg-orange-100' };
    return { label: 'Screened', className: 'bg-green-100' };
  },
}));

import LocateProfilePage from '../page';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const mockRecentProfiles = [
  {
    candidateId: 'cand_1',
    fullName: 'Alice Smith',
    primarySkills: ['react', 'nodejs'],
    totalExperience: 6,
    seniority: 'senior',
    location: 'Bangalore, India',
    lastUpdated: '2024-01-15T10:30:00Z',
    lastScreenedAt: new Date().toISOString(),
  },
  {
    candidateId: 'cand_2',
    fullName: 'Bob Jones',
    primarySkills: ['python'],
    totalExperience: 2,
    seniority: 'junior',
    location: 'Mumbai, India',
    lastUpdated: '2024-01-14T15:20:00Z',
  },
];

const mockSearchResponse = {
  candidates: [
    {
      candidateId: 'cand_1',
      fullName: 'Alice Smith',
      primarySkills: ['react', 'nodejs'],
      totalExperience: 6,
      seniority: 'senior',
      location: 'Bangalore, India',
      availability: 'immediate',
      engagementModel: 'either',
      matchScore: 85,
      matchDetails: {
        mustHaveMatched: ['react'],
        mustHaveRelated: [],
        mustHaveMissing: [],
        goodToHaveMatched: [],
        goodToHaveRelated: [],
        experienceMatch: 'full' as const,
        seniorityMatch: true,
        ctcMatch: true,
        locationMatch: 'full' as const,
        availabilityMatch: 'full' as const,
      },
      lastUpdated: '2024-01-15T10:30:00Z',
      lastScreenedAt: new Date().toISOString(),
    },
  ],
  pagination: { count: 1, hasMore: false },
  totalMatches: 1,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('LocateProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({
      data: { user: { role: 'recruiter', isInternal: true } },
      status: 'authenticated' as const,
    });
    mockListRecentProfiles.mockResolvedValue({ profiles: mockRecentProfiles, pagination: { count: 2, hasMore: false } });
    mockSearchCandidates.mockResolvedValue(mockSearchResponse);
    mockSearchCandidatesByName.mockResolvedValue({ candidates: mockRecentProfiles });
  });

  it('renders recent profiles on page load', async () => {
    render(<LocateProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    });

    expect(mockListRecentProfiles).toHaveBeenCalledWith(50);
  });

  it('shows loading skeleton while fetching recent profiles', () => {
    mockListRecentProfiles.mockReturnValue(new Promise(() => {})); // never resolves
    render(<LocateProfilePage />);

    // Skeleton cards have animate-pulse class
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows empty state when no recent profiles exist', async () => {
    mockListRecentProfiles.mockResolvedValue({ profiles: [] });
    render(<LocateProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('No profiles yet')).toBeInTheDocument();
    });
  });

  it('shows filter panel toggle', () => {
    render(<LocateProfilePage />);

    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  it('toggles filter panel open and closed', async () => {
    render(<LocateProfilePage />);

    const filterToggle = screen.getByText('Filters');
    fireEvent.click(filterToggle);

    await waitFor(() => {
      expect(screen.getByText('Experience (Years)')).toBeInTheDocument();
      expect(screen.getByText('Seniority Level')).toBeInTheDocument();
      expect(screen.getByText('Skills')).toBeInTheDocument();
      expect(screen.getByText('Location')).toBeInTheDocument();
      expect(screen.getByText('Availability / Notice Period')).toBeInTheDocument();
      expect(screen.getByText('Engagement Model')).toBeInTheDocument();
      expect(screen.getByText('Screening Status')).toBeInTheDocument();
    });

    // Close
    fireEvent.click(filterToggle);

    await waitFor(() => {
      expect(screen.queryByText('Experience (Years)')).not.toBeInTheDocument();
    });
  });

  it('applies filters and switches to filtered mode', async () => {
    render(<LocateProfilePage />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    // Open filters
    fireEvent.click(screen.getByText('Filters'));

    // Click the "Lead" seniority badge (avoids conflict with card text)
    await waitFor(() => {
      expect(screen.getByText('Lead')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Lead'));

    // Apply
    fireEvent.click(screen.getByText('Apply Filters'));

    await waitFor(() => {
      expect(mockSearchCandidates).toHaveBeenCalled();
    });

    const callArgs = mockSearchCandidates.mock.calls[0];
    expect(callArgs[0].seniority).toEqual(['lead']);
  });

  it('clears filters and reverts to recent mode', async () => {
    render(<LocateProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    // Open filters, apply, then clear
    fireEvent.click(screen.getByText('Filters'));
    await waitFor(() => {
      expect(screen.getByText('Lead')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Lead'));
    fireEvent.click(screen.getByText('Apply Filters'));

    await waitFor(() => {
      expect(mockSearchCandidates).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Clear All'));

    // Should reload recent profiles view
    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    });
  });

  it('renders CandidateCard with screening status badge', async () => {
    render(<LocateProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Screened')).toBeInTheDocument();
      expect(screen.getByText('Not Screened')).toBeInTheDocument();
    });
  });

  it('renders candidate details in card (experience, seniority, location)', async () => {
    render(<LocateProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('6 yrs exp')).toBeInTheDocument();
      expect(screen.getByText('2 yrs exp')).toBeInTheDocument();
      expect(screen.getByText('Bangalore, India')).toBeInTheDocument();
      expect(screen.getByText('Mumbai, India')).toBeInTheDocument();
    });
  });

  it('renders skills badges on candidate cards', async () => {
    render(<LocateProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('react')).toBeInTheDocument();
      expect(screen.getByText('nodejs')).toBeInTheDocument();
      expect(screen.getByText('python')).toBeInTheDocument();
    });
  });

  it('name search typeahead navigates to candidate profile', async () => {
    const { useRouter } = await import('next/navigation');
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush, replace: vi.fn(), back: vi.fn() } as any);

    render(<LocateProfilePage />);

    const input = screen.getByPlaceholderText('Type a name to search...');
    fireEvent.change(input, { target: { value: 'Ali' } });

    // Wait for debounced suggestions
    await waitFor(() => {
      expect(mockSearchCandidatesByName).toHaveBeenCalledWith('Ali', 10);
    });
  });

  it('shows description text for the page', () => {
    render(<LocateProfilePage />);
    expect(screen.getByText('Search for a candidate by name or use filters to browse profiles')).toBeInTheDocument();
  });

  it('shows export button when profiles are displayed', async () => {
    render(<LocateProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument();
    });
  });

  it('shows export dropdown with CSV and Excel options', async () => {
    render(<LocateProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Export'));

    await waitFor(() => {
      expect(screen.getByText('Export as CSV')).toBeInTheDocument();
      expect(screen.getByText('Export as Excel')).toBeInTheDocument();
    });
  });

  describe('Bench List button', () => {
    it('shows bench list button for internal recruiters in filtered mode', async () => {
      render(<LocateProfilePage />);

      // Wait for recent profiles to load
      await waitFor(() => {
        expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      });

      // Open filters and apply to switch to filtered mode
      fireEvent.click(screen.getByText('Filters'));
      await waitFor(() => {
        expect(screen.getByText('Apply Filters')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Apply Filters'));

      // Wait for the filtered results text to appear (indicates mode switched)
      await waitFor(() => {
        expect(screen.getByText(/candidate.*match your filters/)).toBeInTheDocument();
      });

      expect(screen.getByText('Bench List')).toBeInTheDocument();
    });

    it('hides bench list button for external recruiters', async () => {
      mockUseSession.mockReturnValue({
        data: { user: { role: 'recruiter', isInternal: false } },
        status: 'authenticated' as const,
      });

      render(<LocateProfilePage />);

      // Wait for recent profiles to load
      await waitFor(() => {
        expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      });

      // Open filters and apply
      fireEvent.click(screen.getByText('Filters'));
      await waitFor(() => {
        expect(screen.getByText('Apply Filters')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Apply Filters'));

      // Wait for the filtered results to show
      await waitFor(() => {
        expect(screen.getByText(/candidate.*match your filters/)).toBeInTheDocument();
      });

      expect(screen.queryByText('Bench List')).not.toBeInTheDocument();
    });

    it('shows bench list button in recent mode', async () => {
      render(<LocateProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      });

      // In recent mode, bench list button should also be visible
      expect(screen.getByText('Bench List')).toBeInTheDocument();
    });

    it('opens bench list modal from recent mode after fetching filtered data', async () => {
      render(<LocateProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      });

      // Click bench list from recent mode — triggers a search with preset filters
      fireEvent.click(screen.getByText('Bench List'));

      await waitFor(() => {
        expect(screen.getByTestId('bench-list-modal')).toBeInTheDocument();
      });

      // Verify the search was called with bench list preset criteria
      expect(mockSearchCandidates).toHaveBeenCalledWith(
        { availability: ['immediate', '1_week', '2_weeks'] },
        { limit: 100 },
        'lastUpdated',
      );
    });

    it('opens bench list modal from filtered mode with current results', async () => {
      render(<LocateProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      });

      // Switch to filtered mode first
      fireEvent.click(screen.getByText('Filters'));
      await waitFor(() => {
        expect(screen.getByText('Apply Filters')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Apply Filters'));

      await waitFor(() => {
        expect(screen.getByText(/candidate.*match your filters/)).toBeInTheDocument();
      });

      // Reset mock call count to verify bench list doesn't trigger another search
      mockSearchCandidates.mockClear();

      fireEvent.click(screen.getByText('Bench List'));

      await waitFor(() => {
        expect(screen.getByTestId('bench-list-modal')).toBeInTheDocument();
      });

      // Should NOT call searchCandidates again — uses existing filtered results
      expect(mockSearchCandidates).not.toHaveBeenCalled();
    });
  });
});
