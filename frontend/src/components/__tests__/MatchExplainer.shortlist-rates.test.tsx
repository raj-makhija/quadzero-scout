import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { MatchDebugResponse } from '@/lib/api';

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
    constructor(message: string, code = '') {
      super(message);
      this.code = code;
    }
  },
}));

const mockIsExpired = vi.fn();

// Capture the props the shared modals are rendered with.
let screeningProps: Record<string, any> | null = null;
let shortlistProps: Record<string, any> | null = null;

vi.mock('@/components/screening-modal', () => ({
  ScreeningModal: (props: Record<string, unknown>) => {
    screeningProps = props;
    return <div data-testid="screening-modal" />;
  },
  isScreeningExpired: (d?: string) => mockIsExpired(d),
  getScreeningStatus: () => ({ label: 'Screened', className: 'bg-green-100' }),
}));

vi.mock('@/components/shortlist-modal', () => ({
  ShortlistModal: (props: Record<string, unknown>) => {
    shortlistProps = props;
    return <div data-testid="shortlist-modal" />;
  },
}));

import { CheckCandidateMatch } from '../MatchExplainer';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const requirementContext = {
  requirementId: 'req_1',
  clientName: 'Acme',
  jobTitle: 'Senior React Dev',
  engagementModel: 'full_time_contract',
  contractDurationMonths: 6,
  paymentTermsDays: 45,
  budgetMinLpa: 10,
  budgetMaxLpa: 20,
  isRateGstInclusive: true,
};

function makeDebug(expectedCtc?: number): MatchDebugResponse {
  return {
    candidate: {
      candidateId: 'c1',
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
      clientName: 'Acme',
      mustHaveSkills: ['react'],
      normalizedMustHave: ['react'],
      goodToHaveSkills: [],
      normalizedGoodToHave: [],
    },
    filters: {
      coreSkill: { passed: true },
      mustHaveRatio: { passed: true },
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
      roleMatch: 'full',
    },
  } as MatchDebugResponse;
}

async function selectCandidate(expectedCtc?: number) {
  mockSearchByName.mockResolvedValue({
    candidates: [{
      candidateId: 'c1',
      fullName: 'Alice Smith',
      primarySkills: ['react'],
      totalExperience: 6,
      seniority: 'senior',
      lastUpdated: 'now',
      lastScreenedAt: '2026-06-01T00:00:00Z',
    }],
  });
  mockMatchDebug.mockResolvedValue(makeDebug(expectedCtc));

  render(
    <CheckCandidateMatch
      requirementId="req_1"
      requirementContext={requirementContext}
      isInternalRecruiter={false}
    />
  );

  fireEvent.change(screen.getByPlaceholderText('Type a candidate name...'), {
    target: { value: 'Ali' },
  });
  fireEvent.click(await screen.findByText('Alice Smith'));
  return screen.findByRole('button', { name: /Shortlist Candidate/i });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CheckCandidateMatch → ShortlistAction routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    screeningProps = null;
    shortlistProps = null;
    mockIsExpired.mockReturnValue(false);
  });

  it('screening valid + CTC present → opens ShortlistModal with the requirement pricing context', async () => {
    const btn = await selectCandidate(15);
    fireEvent.click(btn);

    expect(await screen.findByTestId('shortlist-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('screening-modal')).toBeNull();
    // Rates are computed by the shared ShortlistModal from candidate CTC + context.
    expect(shortlistProps?.candidate.expectedCtc).toBe(15);
    expect(shortlistProps?.requirementContext.requirementId).toBe('req_1');
    expect(shortlistProps?.requirementContext.contractDurationMonths).toBe(6);
    expect(shortlistProps?.requirementContext.paymentTermsDays).toBe(45);
    expect(shortlistProps?.requirementContext.isRateGstInclusive).toBe(true);
  });

  it('CTC missing → routes through ScreeningModal first (not ShortlistModal)', async () => {
    const btn = await selectCandidate(undefined);
    fireEvent.click(btn);

    expect(await screen.findByTestId('screening-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('shortlist-modal')).toBeNull();
    expect(screeningProps?.isShortlistFlow).toBe(true);
  });

  it('screening expired → routes through ScreeningModal first', async () => {
    mockIsExpired.mockReturnValue(true);
    const btn = await selectCandidate(15);
    fireEvent.click(btn);

    expect(await screen.findByTestId('screening-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('shortlist-modal')).toBeNull();
  });

  it('merges the CTC keyed in during screening into the candidate before opening ShortlistModal (QA #271 regression)', async () => {
    // Candidate has no CTC → screening opens first.
    const btn = await selectCandidate(undefined);
    fireEvent.click(btn);
    await screen.findByTestId('screening-modal');

    // Recruiter keys in CTC during screening; ScreeningModal reports it back.
    act(() => {
      screeningProps?.onScreeningComplete('c1', { expectedCtc: 18, currentCtc: 12 });
    });

    // ShortlistModal must now see the just-entered CTC so PricingPanel can price it.
    expect(await screen.findByTestId('shortlist-modal')).toBeInTheDocument();
    expect(shortlistProps?.candidate.expectedCtc).toBe(18);
    expect(shortlistProps?.candidate.currentCtc).toBe(12);
  });
});
