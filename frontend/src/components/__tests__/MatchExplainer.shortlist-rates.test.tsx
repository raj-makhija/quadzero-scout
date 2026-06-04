import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CandidateNameSearchResult, MatchDebugResponse } from '@/lib/api';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSearchByName = vi.fn();
const mockMatchDebug = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    searchCandidatesByName: (...args: unknown[]) => mockSearchByName(...args),
    matchDebug: (...args: unknown[]) => mockMatchDebug(...args),
  },
  ApiError: class ApiError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

// Capture the props the shared modals are rendered with.
let shortlistModalProps: Record<string, unknown> | null = null;
let screeningModalProps: Record<string, unknown> | null = null;

vi.mock('@/components/shortlist-modal', () => ({
  ShortlistModal: (props: Record<string, unknown>) => {
    shortlistModalProps = props;
    return <div data-testid="shortlist-modal" />;
  },
}));

vi.mock('@/components/screening-modal', () => ({
  ScreeningModal: (props: Record<string, unknown>) => {
    screeningModalProps = props;
    return (
      <div data-testid="screening-modal">
        <button
          onClick={() =>
            (props.onScreeningComplete as (id: string, v: Record<string, unknown>) => void)(
              'cand_1',
              { expectedCtc: 18, currentCtc: 12 },
            )
          }
        >
          complete-screening
        </button>
      </div>
    );
  },
  // Screening is valid only when a lastScreenedAt is present (recent).
  isScreeningExpired: (lastScreenedAt?: string) => !lastScreenedAt,
  getScreeningStatus: () => ({ label: 'Screened', className: 'bg-green-100' }),
}));

import { CheckCandidateMatch } from '../MatchExplainer';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const requirementContext = {
  requirementId: 'req_1',
  clientName: 'Acme Corp',
  jobTitle: 'React Engineer',
  engagementModel: 'full_time_contract',
  contractDurationMonths: 12,
  paymentTermsDays: 30,
  budgetMinLpa: 10,
  budgetMaxLpa: 25,
  isRateGstInclusive: true,
};

function makeCandidate(screened: boolean): CandidateNameSearchResult {
  return {
    candidateId: 'cand_1',
    fullName: 'Alice Smith',
    primarySkills: ['react'],
    totalExperience: 6,
    seniority: 'senior',
    lastUpdated: '2024-01-01T00:00:00Z',
    lastScreenedAt: screened ? '2026-06-01T00:00:00Z' : undefined,
  };
}

function makeMatchDebug(expectedCtc?: number): MatchDebugResponse {
  return {
    candidate: {
      candidateId: 'cand_1',
      fullName: 'Alice Smith',
      primarySkills: ['react'],
      normalizedPrimary: ['react'],
      secondarySkills: [],
      normalizedSecondary: [],
      totalExperience: 6,
      seniority: 'senior',
      engagementModel: 'full_time_contract',
      expectedCtc,
      currentCtc: undefined,
      availability: 'immediate',
      location: 'Bangalore',
    },
    requirement: {
      requirementId: 'req_1',
      clientName: 'Acme Corp',
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
    score: 82,
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
      roleMatch: 'full',
    },
  };
}

// Drive CheckCandidateMatch up to the point where ShortlistAction is shown.
async function selectCandidate() {
  const input = screen.getByPlaceholderText('Type a candidate name...');
  fireEvent.change(input, { target: { value: 'Alice' } });
  const suggestion = await screen.findByText('Alice Smith');
  fireEvent.click(suggestion);
  return screen.findByText('Shortlist Candidate');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CheckCandidateMatch → ShortlistAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shortlistModalProps = null;
    screeningModalProps = null;
  });

  it('opens the shared ShortlistModal with the requirement pricing context when screening is valid and CTC is present', async () => {
    mockSearchByName.mockResolvedValue({ candidates: [makeCandidate(true)] });
    mockMatchDebug.mockResolvedValue(makeMatchDebug(15));

    render(
      <CheckCandidateMatch
        requirementId="req_1"
        requirementContext={requirementContext}
        isInternalRecruiter={true}
      />,
    );

    const shortlistBtn = await selectCandidate();
    fireEvent.click(shortlistBtn);

    // Routes to ShortlistModal (rates path), not screening.
    expect(screen.getByTestId('shortlist-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('screening-modal')).not.toBeInTheDocument();

    // The same requirement context the Search Candidate flow uses is forwarded,
    // so the modal's PricingPanel computes identical rates.
    expect(shortlistModalProps?.requirementContext).toEqual(requirementContext);
    expect(shortlistModalProps?.isInternalRecruiter).toBe(true);
    expect((shortlistModalProps?.candidate as { expectedCtc?: number }).expectedCtc).toBe(15);
  });

  it('routes to the ScreeningModal first when CTC is missing', async () => {
    mockSearchByName.mockResolvedValue({ candidates: [makeCandidate(true)] });
    mockMatchDebug.mockResolvedValue(makeMatchDebug(undefined));

    render(
      <CheckCandidateMatch requirementId="req_1" requirementContext={requirementContext} />,
    );

    const shortlistBtn = await selectCandidate();
    fireEvent.click(shortlistBtn);

    expect(screen.getByTestId('screening-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('shortlist-modal')).not.toBeInTheDocument();
  });

  it('merges the just-screened CTC into the candidate before opening the ShortlistModal (QA-reject fix)', async () => {
    mockSearchByName.mockResolvedValue({ candidates: [makeCandidate(true)] });
    mockMatchDebug.mockResolvedValue(makeMatchDebug(undefined));

    render(
      <CheckCandidateMatch requirementId="req_1" requirementContext={requirementContext} />,
    );

    const shortlistBtn = await selectCandidate();
    fireEvent.click(shortlistBtn);

    // Missing CTC → screening opens first.
    expect(screen.getByTestId('screening-modal')).toBeInTheDocument();

    // Recruiter keys in the CTC during screening and saves.
    fireEvent.click(screen.getByText('complete-screening'));

    // ShortlistModal now opens with the freshly-entered CTC available for pricing,
    // not "Candidate CTC not available".
    expect(screen.getByTestId('shortlist-modal')).toBeInTheDocument();
    expect((shortlistModalProps?.candidate as { expectedCtc?: number }).expectedCtc).toBe(18);
    expect((shortlistModalProps?.candidate as { currentCtc?: number }).currentCtc).toBe(12);
  });

  it('routes to the ScreeningModal when screening is expired even if CTC is present', async () => {
    mockSearchByName.mockResolvedValue({ candidates: [makeCandidate(false)] });
    mockMatchDebug.mockResolvedValue(makeMatchDebug(15));

    render(
      <CheckCandidateMatch requirementId="req_1" requirementContext={requirementContext} />,
    );

    const shortlistBtn = await selectCandidate();
    fireEvent.click(shortlistBtn);

    expect(screen.getByTestId('screening-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('shortlist-modal')).not.toBeInTheDocument();
    expect(screeningModalProps?.isShortlistFlow).toBe(true);
  });
});
