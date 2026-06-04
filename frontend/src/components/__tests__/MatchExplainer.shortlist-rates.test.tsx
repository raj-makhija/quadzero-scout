import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { MatchDebugResponse, CandidateNameSearchResult } from '@/lib/api';

// ---------------------------------------------------------------------------
// Mocks
//
// Ticket #271: shortlisting via "Check Candidate Match" must reuse the SAME
// Screening Modal + Shortlist Modal as the "Search Candidate" flow, so the
// recommended/minimum rates are calculated and stored. These tests assert the
// smart routing into those shared modals and that the pricing context the
// Shortlist Modal needs is threaded through correctly.
// ---------------------------------------------------------------------------

const mockSearchByName = vi.fn();
const mockMatchDebug = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    searchCandidatesByName: (...args: unknown[]) => mockSearchByName(...args),
    matchDebug: (...args: unknown[]) => mockMatchDebug(...args),
  },
  ApiError: class ApiError extends Error {
    code?: string;
  },
}));

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
    return <div data-testid="screening-modal" />;
  },
  // Mirror the real implementations (screening-modal.tsx).
  isScreeningExpired: (lastScreenedAt?: string) => {
    if (!lastScreenedAt) return true;
    return (Date.now() - new Date(lastScreenedAt).getTime()) / (1000 * 60 * 60 * 24) > 15;
  },
  getScreeningStatus: () => ({ label: 'Screened', className: 'bg-green-100' }),
}));

import { CheckCandidateMatch } from '../MatchExplainer';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const RECENT_SCREEN = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
const EXPIRED_SCREEN = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

function makeSuggestion(lastScreenedAt?: string): CandidateNameSearchResult {
  return {
    candidateId: 'cand_1',
    fullName: 'Alice Smith',
    primarySkills: ['react'],
    totalExperience: 6,
    seniority: 'senior',
    location: 'Bangalore',
    lastUpdated: '2024-01-01T00:00:00Z',
    lastScreenedAt,
  };
}

function makeMatchData(expectedCtc?: number): MatchDebugResponse {
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
      engagementModel: 'either',
      expectedCtc,
      currentCtc: 10,
      availability: 'immediate',
      location: 'Bangalore',
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
    },
  };
}

const requirementContext = {
  requirementId: 'req_1',
  clientName: 'Test Client',
  jobTitle: 'React Developer',
  engagementModel: 'contract',
  contractDurationMonths: 12,
  paymentTermsDays: 30,
  isRateGstInclusive: false,
};

// Render the component, run the name search, and select the candidate so the
// ShortlistAction (with its "Shortlist Candidate" button) is on screen.
async function selectCandidate(lastScreenedAt: string | undefined, expectedCtc: number | undefined) {
  mockSearchByName.mockResolvedValue({ candidates: [makeSuggestion(lastScreenedAt)] });
  mockMatchDebug.mockResolvedValue(makeMatchData(expectedCtc));

  render(
    <CheckCandidateMatch
      requirementId="req_1"
      requirementContext={requirementContext}
      isInternalRecruiter={false}
    />
  );

  fireEvent.change(screen.getByPlaceholderText('Type a candidate name...'), {
    target: { value: 'Alice' },
  });

  // Debounced (300ms) name search → suggestion appears → select it → matchDebug.
  const suggestion = await screen.findByText('Alice Smith');
  fireEvent.click(suggestion);

  return screen.findByRole('button', { name: /Shortlist Candidate/i });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CheckCandidateMatch — shortlist rate flow (#271)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shortlistModalProps = null;
    screeningModalProps = null;
  });

  it('opens the shared ShortlistModal with the pricing context when screening is valid and CTC is present', async () => {
    const button = await selectCandidate(RECENT_SCREEN, 15);
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByTestId('shortlist-modal')).toBeInTheDocument());
    expect(screen.queryByTestId('screening-modal')).not.toBeInTheDocument();

    // The pricing inputs that make rate calculation match the Search Candidate
    // flow must be forwarded to the shared modal.
    expect(shortlistModalProps?.requirementContext).toMatchObject({
      requirementId: 'req_1',
      engagementModel: 'contract',
      contractDurationMonths: 12,
      paymentTermsDays: 30,
      isRateGstInclusive: false,
    });
    // Candidate CTC + match score carry through so PricingPanel can compute rates.
    expect((shortlistModalProps?.candidate as { expectedCtc?: number }).expectedCtc).toBe(15);
    expect((shortlistModalProps?.candidate as { matchScore?: number }).matchScore).toBe(85);
  });

  it('routes to the Screening Modal first when CTC is missing (cannot price yet)', async () => {
    const button = await selectCandidate(RECENT_SCREEN, undefined);
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByTestId('screening-modal')).toBeInTheDocument());
    expect(screen.queryByTestId('shortlist-modal')).not.toBeInTheDocument();
  });

  it('routes to the Screening Modal first when screening is expired', async () => {
    const button = await selectCandidate(EXPIRED_SCREEN, 15);
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByTestId('screening-modal')).toBeInTheDocument());
    expect(screen.queryByTestId('shortlist-modal')).not.toBeInTheDocument();
    expect(screeningModalProps?.isShortlistFlow).toBe(true);
  });
});
