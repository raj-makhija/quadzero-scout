import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { CandidateSearchResult, SearchCriteria } from '@/lib/api';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetProfile = vi.fn();
const mockShortlistCandidate = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    getProfile: (...args: unknown[]) => mockGetProfile(...args),
    shortlistCandidate: (...args: unknown[]) => mockShortlistCandidate(...args),
  },
  ApiError: class ApiError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock('@/components/screening-modal', () => ({
  getScreeningStatus: () => ({ label: 'Screened', className: 'bg-green-100' }),
  isScreeningExpired: () => false,
}));

vi.mock('@/lib/utils', () => ({
  formatSeniority: (v: string) => v,
  formatAvailability: (v: string) => v,
  formatCandidateEngagement: (v: string) => v,
  getMatchScoreColor: () => 'text-green-600',
  getMatchScoreBgColor: () => 'bg-green-50',
  formatDate: (v: string) => v,
}));

let capturedPricingProps: Record<string, unknown> = {};

vi.mock('@/components/PricingPanel', () => ({
  PricingPanel: (props: Record<string, unknown>) => {
    capturedPricingProps = props;
    return <div data-testid="pricing-panel" />;
  },
}));

import { ShortlistModal } from '../shortlist-modal';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockCandidate: CandidateSearchResult = {
  candidateId: 'cand_1',
  fullName: 'Alice Smith',
  primarySkills: ['react', 'nodejs'],
  totalExperience: 6,
  seniority: 'senior',
  availability: 'immediate',
  engagementModel: 'either',
  matchScore: 85,
  matchDetails: {
    mustHaveMatched: ['react'],
    mustHaveRelated: [],
    mustHaveMissing: [],
    goodToHaveMatched: ['nodejs'],
    goodToHaveRelated: [],
    experienceMatch: 'full',
    seniorityMatch: true,
    ctcMatch: true,
    locationMatch: 'full',
    availabilityMatch: 'full',
  },
  lastUpdated: '2024-01-15T10:30:00Z',
  expectedCtc: 15,
  currentCtc: 10,
  expectedCtcType: 'fixed',
  location: 'Bangalore, India',
};

const mockSearchCriteria: SearchCriteria = {
  mustHaveSkills: ['react'],
};

const mockRequirementContext = {
  requirementId: 'req_1',
  clientName: 'Test Client',
  jobTitle: 'React Developer',
  engagementModel: 'contract',
  contractDurationMonths: 12,
  paymentTermsDays: 30,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShortlistModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedPricingProps = {};
  });

  it('passes fresh expectedCtc from profile refetch to PricingPanel', async () => {
    mockGetProfile.mockResolvedValue({
      fullName: 'Alice Smith',
      primarySkills: ['react', 'nodejs'],
      totalExperience: 8,
      seniority: 'senior',
      expectedCtc: 25,
      currentCtc: 12,
      expectedCtcType: 'negotiable',
    });

    render(
      <ShortlistModal
        candidate={mockCandidate}
        requirementContext={mockRequirementContext}
        searchCriteria={mockSearchCriteria}
        onClose={vi.fn()}
        onShortlisted={vi.fn()}
        onRescreen={vi.fn()}
      />
    );

    expect(mockGetProfile).toHaveBeenCalledWith('cand_1');

    // Initially, PricingPanel gets the search-result value
    expect(capturedPricingProps.candidateExpectedCtcLpa).toBe(15);

    // After the profile refetch resolves, PricingPanel gets the fresh value
    await waitFor(() => {
      expect(capturedPricingProps.candidateExpectedCtcLpa).toBe(25);
    });
    expect(capturedPricingProps.candidateCurrentCtcLpa).toBe(12);
    expect(capturedPricingProps.candidateExperienceYears).toBe(8);
    expect(capturedPricingProps.expectedCtcType).toBe('negotiable');
  });

  it('falls back to search-result values when profile refetch fails', async () => {
    mockGetProfile.mockRejectedValue(new Error('Network error'));

    render(
      <ShortlistModal
        candidate={mockCandidate}
        requirementContext={mockRequirementContext}
        searchCriteria={mockSearchCriteria}
        onClose={vi.fn()}
        onShortlisted={vi.fn()}
        onRescreen={vi.fn()}
      />
    );

    // Wait for the rejected promise to settle
    await waitFor(() => {
      expect(mockGetProfile).toHaveBeenCalledOnce();
    });

    // PricingPanel should still have the search-result values
    expect(capturedPricingProps.candidateExpectedCtcLpa).toBe(15);
    expect(capturedPricingProps.candidateCurrentCtcLpa).toBe(10);
    expect(capturedPricingProps.candidateExperienceYears).toBe(6);
  });

  it('renders the modal with candidate name and requirement context', () => {
    mockGetProfile.mockResolvedValue({
      fullName: 'Alice Smith',
      primarySkills: ['react'],
      totalExperience: 6,
      seniority: 'senior',
      expectedCtc: 15,
      currentCtc: 10,
    });

    render(
      <ShortlistModal
        candidate={mockCandidate}
        requirementContext={mockRequirementContext}
        searchCriteria={mockSearchCriteria}
        onClose={vi.fn()}
        onShortlisted={vi.fn()}
        onRescreen={vi.fn()}
      />
    );

    expect(screen.getByText('Shortlist for Test Client')).toBeInTheDocument();
    expect(screen.getByText(/Alice Smith/)).toBeInTheDocument();
  });
});
