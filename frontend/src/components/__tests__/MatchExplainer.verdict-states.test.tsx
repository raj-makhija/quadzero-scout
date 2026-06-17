import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

vi.mock('@/components/screening-modal', () => ({
  ScreeningModal: () => <div data-testid="screening-modal" />,
  isScreeningExpired: () => false,
  getScreeningStatus: () => ({ label: 'Screened', className: 'bg-green-100' }),
}));

vi.mock('@/components/shortlist-modal', () => ({
  ShortlistModal: () => <div data-testid="shortlist-modal" />,
}));

import { CheckCandidateMatch } from '../MatchExplainer';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makeDebug(overrides: Partial<MatchDebugResponse>): MatchDebugResponse {
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
      expectedCtc: 15,
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
    ...overrides,
  } as MatchDebugResponse;
}

async function renderWithDebug(debug: MatchDebugResponse) {
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
  mockMatchDebug.mockResolvedValue(debug);

  render(<CheckCandidateMatch requirementId="req_1" />);
  fireEvent.change(screen.getByPlaceholderText('Type a candidate name...'), {
    target: { value: 'Ali' },
  });
  fireEvent.click(await screen.findByText('Alice Smith'));
}

// ---------------------------------------------------------------------------
// Tests — three distinct verdict states (#418)
// ---------------------------------------------------------------------------

describe('MatchDebugPanel verdict states (#418)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a clean Match for a confirmed candidate', async () => {
    await renderWithDebug(makeDebug({ wouldBeExcluded: false, coreSkillUnconfirmed: false }));
    expect(await screen.findByText('Match')).toBeInTheDocument();
    expect(screen.queryByText('Review')).toBeNull();
    expect(screen.queryByText('No Match')).toBeNull();
  });

  it('renders a Review state for a coreSkill-unconfirmed candidate', async () => {
    await renderWithDebug(makeDebug({
      wouldBeExcluded: false,
      coreSkillUnconfirmed: true,
      filters: {
        coreSkill: { passed: false },
        mustHaveRatio: { passed: true },
        engagementModel: { passed: true },
        budgetFit: { passed: true },
      },
      excludedBy: ['coreSkill'],
    }));
    expect(await screen.findByText('Review')).toBeInTheDocument();
    expect(screen.getByText('— core skill unconfirmed')).toBeInTheDocument();
    expect(screen.queryByText('No Match')).toBeNull();
  });

  it('renders a hard No Match when another gate also fails', async () => {
    await renderWithDebug(makeDebug({
      wouldBeExcluded: true,
      coreSkillUnconfirmed: false,
      excludedBy: ['coreSkill', 'discipline'],
    }));
    expect(await screen.findByText('No Match')).toBeInTheDocument();
    expect(screen.getByText(/excluded by: coreSkill, discipline/)).toBeInTheDocument();
    expect(screen.queryByText('Review')).toBeNull();
  });
});
