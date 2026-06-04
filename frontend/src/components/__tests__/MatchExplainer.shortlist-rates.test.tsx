import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type {
  CandidateNameSearchResult,
  MatchDebugResponse,
  PricingOutput,
} from '@/lib/api';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSearchCandidatesByName = vi.fn();
const mockMatchDebug = vi.fn();
const mockShortlistCandidate = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    searchCandidatesByName: (...args: unknown[]) => mockSearchCandidatesByName(...args),
    matchDebug: (...args: unknown[]) => mockMatchDebug(...args),
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
  ScreeningModal: () => <div data-testid="screening-modal" />,
  getScreeningStatus: () => ({ label: 'Screened', className: 'bg-green-100' }),
  isScreeningExpired: () => false,
}));

// PricingPanel is mocked to capture the props it receives. The test drives the
// `onPricingCalculated` callback explicitly (inside act) to emit a pricing result
// deterministically — mirroring the real component computing rates.
let capturedPricingProps: Record<string, unknown> = {};

vi.mock('@/components/PricingPanel', () => ({
  PricingPanel: (props: Record<string, unknown>) => {
    capturedPricingProps = props;
    return <div data-testid="pricing-panel" />;
  },
}));

import { CheckCandidateMatch } from '../MatchExplainer';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockCandidate: CandidateNameSearchResult = {
  candidateId: 'cand_1',
  fullName: 'Alice Smith',
  primarySkills: ['react', 'nodejs'],
  totalExperience: 6,
  seniority: 'senior',
  lastUpdated: '2026-01-15T10:30:00Z',
  lastScreenedAt: '2026-06-01T10:00:00Z',
};

const mockDebugResult = {
  candidate: {
    candidateId: 'cand_1',
    fullName: 'Alice Smith',
    primarySkills: ['react', 'nodejs'],
    normalizedPrimary: ['react', 'nodejs'],
    secondarySkills: [],
    normalizedSecondary: [],
    totalExperience: 6,
    seniority: 'senior',
    engagementModel: 'either',
    expectedCtc: 15,
    availability: 'immediate',
  },
  requirement: {
    requirementId: 'req_1',
    clientName: 'Test Client',
    mustHaveSkills: ['react'],
    normalizedMustHave: ['react'],
    goodToHaveSkills: [],
    normalizedGoodToHave: [],
  },
  filters: {
    coreSkill: { passed: true },
    mustHaveRatio: { passed: true, ratio: 1 },
    engagementModel: { passed: true },
    budgetFit: { passed: true },
  },
  wouldBeExcluded: false,
  excludedBy: [],
  score: 85,
  matchDetails: {
    mustHaveMatched: ['react'],
    mustHaveFuzzy: [],
    mustHaveRelated: [],
    mustHaveMissing: [],
    goodToHaveMatched: [],
    goodToHaveFuzzy: [],
    goodToHaveRelated: [],
    experienceMatch: 'full',
    seniorityMatch: true,
    ctcMatch: true,
    locationMatch: 'full',
    availabilityMatch: 'full',
  },
} as unknown as MatchDebugResponse;

const mockPricing = {
  finalQuotedHourly: 30,
  finalQuotedMonthly: 5000,
  finalQuotedAnnual: 60000,
  minimumBillingHourly: 20,
  minimumBillingMonthly: 3500,
  minimumBillingAnnual: 42000,
} as unknown as PricingOutput;

const mockRequirementContext = {
  contractDurationMonths: 12,
  paymentTermsDays: 30,
  engagementModel: 'contract',
  isRateGstInclusive: false,
};

// Drive the search → select → render-ShortlistAction flow.
async function selectCandidate() {
  const input = screen.getByPlaceholderText('Type a candidate name...');
  fireEvent.change(input, { target: { value: 'Alice' } });

  // Debounced name search resolves and shows the suggestion.
  const suggestion = await screen.findByText('Alice Smith');
  fireEvent.click(suggestion);

  // matchDebug resolves → ShortlistAction (with PricingPanel) renders.
  await screen.findByTestId('pricing-panel');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CheckCandidateMatch — shortlist rate calculation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedPricingProps = {};
    mockSearchCandidatesByName.mockResolvedValue({ candidates: [mockCandidate] });
    mockMatchDebug.mockResolvedValue(mockDebugResult);
    mockShortlistCandidate.mockResolvedValue({ success: true });
  });

  it('passes the candidate CTC and requirement context to PricingPanel', async () => {
    render(
      <CheckCandidateMatch
        requirementId="req_1"
        requirementContext={mockRequirementContext}
      />
    );

    await selectCandidate();

    expect(capturedPricingProps.candidateExpectedCtcLpa).toBe(15);
    expect(capturedPricingProps.candidateExperienceYears).toBe(6);
    expect(capturedPricingProps.requirementContext).toEqual(mockRequirementContext);
  });

  it('stores the calculated rates when shortlisting via Check Candidate Match', async () => {
    render(
      <CheckCandidateMatch
        requirementId="req_1"
        requirementContext={mockRequirementContext}
      />
    );

    await selectCandidate();

    // PricingPanel computes rates and reports them up via onPricingCalculated.
    const onPricingCalculated = capturedPricingProps.onPricingCalculated as (p: PricingOutput) => void;
    act(() => onPricingCalculated(mockPricing));

    fireEvent.click(screen.getByRole('button', { name: /Shortlist Candidate/i }));

    await waitFor(() => {
      expect(mockShortlistCandidate).toHaveBeenCalledWith(
        'req_1',
        'cand_1',
        undefined,
        {
          proposedRateHourly: 30,
          proposedRateMonthly: 5000,
          proposedRateAnnual: 60000,
          internalRateHourly: 20,
          internalRateMonthly: 3500,
          internalRateAnnual: 42000,
        }
      );
    });
  });

  it('shortlists with no rates (not zeros/nulls) when pricing cannot be calculated', async () => {
    // PricingPanel never emits a result (e.g. missing CTC) — onPricingCalculated
    // is not called, so pricingResult stays null.
    render(
      <CheckCandidateMatch
        requirementId="req_1"
        requirementContext={mockRequirementContext}
      />
    );

    await selectCandidate();

    fireEvent.click(screen.getByRole('button', { name: /Shortlist Candidate/i }));

    await waitFor(() => {
      expect(mockShortlistCandidate).toHaveBeenCalledWith(
        'req_1',
        'cand_1',
        undefined,
        undefined
      );
    });
  });
});
