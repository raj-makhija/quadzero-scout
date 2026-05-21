import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  usePathname: vi.fn(() => '/recruiter/search'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: { user: { role: 'recruiter', isInternal: true } },
    status: 'authenticated' as const,
  })),
  signOut: vi.fn(),
  signIn: vi.fn(),
  SessionProvider: ({ children }: any) => children,
}));

const mockSearchCandidates = vi.fn();
const mockGetClientNames = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    searchCandidates: (...args: any[]) => mockSearchCandidates(...args),
    getClientNames: (...args: any[]) => mockGetClientNames(...args),
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
  Header: ({ children }: any) => <div data-testid="header">{children}</div>,
}));

vi.mock('@/components/PricingPanel', () => ({
  PricingPanel: () => null,
}));

vi.mock('@/components/ui/combobox-input', () => ({
  ComboboxInput: () => null,
}));

vi.mock('@/components/criteria-editor', () => ({
  CriteriaEditor: () => null,
}));

vi.mock('@/components/additional-fields-builder', () => ({
  AdditionalFieldsBuilder: () => null,
}));

vi.mock('@/components/screening-modal', () => ({
  ScreeningModal: () => null,
  getScreeningStatus: () => ({ label: 'Not Screened', className: 'bg-gray-100' }),
  isScreeningExpired: () => false,
}));

vi.mock('@/components/shortlist-modal', () => ({
  ShortlistModal: () => null,
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  formatSeniority: (s: string) => s,
  formatAvailability: (s: string) => s,
  formatCandidateEngagement: (s: string) => s,
  getMatchScoreColor: () => 'text-green-600',
  getMatchScoreBgColor: () => 'bg-green-100',
  formatRelativeTime: () => 'recently',
  formatEngagementModel: (s: string) => s,
  generateJobTitle: () => 'Developer',
  SENIORITY_OPTIONS: [],
  AVAILABILITY_OPTIONS: [],
  ENGAGEMENT_MODEL_OPTIONS: [],
  PAYROLL_OPTIONS: [],
}));

import RecruiterSearchPage from '../page';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const PAGE_SIZE = 20;

function makeCandidates(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    candidateId: `cand_${i + 1}`,
    fullName: `Candidate ${i + 1}`,
    primarySkills: ['react'],
    totalExperience: 5,
    seniority: 'senior',
    location: 'Bangalore, India',
    availability: 'immediate',
    engagementModel: 'either',
    matchScore: 80,
    matchDetails: {
      mustHaveMatched: ['react'],
      mustHaveFuzzy: [],
      mustHaveSecondary: [],
      mustHaveRelated: [],
      mustHaveMissing: [],
      goodToHaveMatched: [],
      goodToHaveFuzzy: [],
      goodToHaveRelated: [],
      experienceMatch: 'full' as const,
      seniorityMatch: true,
      ctcMatch: true,
      locationMatch: 'full' as const,
      availabilityMatch: 'full' as const,
      roleMatch: true,
    },
    lastUpdated: '2024-01-15T10:30:00Z',
  }));
}

const STORAGE_KEY = 'scout_recruiter_search';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('RecruiterSearchPage — pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientNames.mockResolvedValue({ clientNames: [], endClients: [] });

    // Prefill sessionStorage so the page starts in results view and auto-searches
    const prefilled = {
      viewMode: 'results',
      searchCriteria: { mustHaveSkills: ['react'] },
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
      if (key === STORAGE_KEY) return JSON.stringify(prefilled);
      return null;
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});
  });

  it('shows pagination controls when totalMatches exceeds PAGE_SIZE', async () => {
    const totalMatches = 100; // 5 pages at PAGE_SIZE=20
    mockSearchCandidates.mockResolvedValue({
      candidates: makeCandidates(PAGE_SIZE),
      pagination: {
        count: PAGE_SIZE,
        hasMore: true,
        lastEvaluatedKey: Buffer.from(JSON.stringify({ offset: PAGE_SIZE })).toString('base64'),
      },
      totalMatches,
    });

    render(<RecruiterSearchPage />);

    await waitFor(() => {
      expect(screen.getByText('Previous')).toBeInTheDocument();
    });
    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  it('shows correct total page count from backend totalMatches', async () => {
    const totalMatches = 110; // ceil(110/20) = 6 pages
    mockSearchCandidates.mockResolvedValue({
      candidates: makeCandidates(PAGE_SIZE),
      pagination: {
        count: PAGE_SIZE,
        hasMore: true,
        lastEvaluatedKey: Buffer.from(JSON.stringify({ offset: PAGE_SIZE })).toString('base64'),
      },
      totalMatches,
    });

    render(<RecruiterSearchPage />);

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 6')).toBeInTheDocument();
    });
  });

  it('hides pagination controls when results fit on one page', async () => {
    mockSearchCandidates.mockResolvedValue({
      candidates: makeCandidates(15),
      pagination: { count: 15, hasMore: false },
      totalMatches: 15,
    });

    render(<RecruiterSearchPage />);

    await waitFor(() => {
      expect(screen.getByText('15 candidates found')).toBeInTheDocument();
    });
    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });

  it('hides pagination when exactly PAGE_SIZE results and no more', async () => {
    mockSearchCandidates.mockResolvedValue({
      candidates: makeCandidates(PAGE_SIZE),
      pagination: { count: PAGE_SIZE, hasMore: false },
      totalMatches: PAGE_SIZE,
    });

    render(<RecruiterSearchPage />);

    await waitFor(() => {
      expect(screen.getByText(`${PAGE_SIZE} candidates found`)).toBeInTheDocument();
    });
    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });

  it('does not accumulate totalMatches when fetching next page', async () => {
    window.scrollTo = vi.fn() as any;
    const totalMatches = 100;
    mockSearchCandidates.mockResolvedValue({
      candidates: makeCandidates(PAGE_SIZE),
      pagination: {
        count: PAGE_SIZE,
        hasMore: true,
        lastEvaluatedKey: Buffer.from(JSON.stringify({ offset: PAGE_SIZE })).toString('base64'),
      },
      totalMatches,
    });

    render(<RecruiterSearchPage />);

    await waitFor(() => {
      expect(screen.getByText('100 candidates found')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('Page 2 of 5')).toBeInTheDocument();
    });
    expect(screen.getByText('100 candidates found')).toBeInTheDocument();
  });
});
