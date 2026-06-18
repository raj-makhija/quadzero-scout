import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MatchDebugResponse } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {},
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/components/screening-modal', () => ({
  ScreeningModal: () => null,
  isScreeningExpired: () => false,
  getScreeningStatus: () => ({ label: 'Screened', className: '' }),
}));

vi.mock('@/components/shortlist-modal', () => ({
  ShortlistModal: () => null,
}));

import { MatchDebugPanel } from '../MatchExplainer';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDebugResult(overrides: Partial<MatchDebugResponse> = {}): MatchDebugResponse {
  return {
    candidate: {
      candidateId: 'c1',
      fullName: 'Alice Smith',
      primarySkills: ['react'],
      normalizedPrimary: ['react'],
      secondarySkills: [],
      normalizedSecondary: [],
      totalExperience: 5,
      seniority: 'senior',
      engagementModel: 'full_time_contract',
      availability: 'immediate',
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
    score: 75,
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MatchDebugPanel — AI scoring display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders AI score and rationale when aiScore is present', () => {
    render(
      <MatchDebugPanel
        result={makeDebugResult({ aiScore: 82, aiRationale: 'Strong React background.' })}
      />
    );

    expect(screen.getByText(/AI Score/)).toBeInTheDocument();
    expect(screen.getByText('82/100')).toBeInTheDocument();
    expect(screen.getByText('Strong React background.')).toBeInTheDocument();
  });

  it('renders the AI section using the violet AI-findings palette', () => {
    render(
      <MatchDebugPanel
        result={makeDebugResult({ aiScore: 82, aiRationale: 'Strong React background.' })}
      />
    );

    // The AI section wrapper carries the violet background used elsewhere for AI findings.
    const label = screen.getByText(/AI Score/);
    const section = label.closest('div')?.parentElement;
    expect(section?.className).toMatch(/bg-violet-50/);
  });

  it('renders AI score without rationale when aiRationale is absent', () => {
    render(
      <MatchDebugPanel
        result={makeDebugResult({ aiScore: 60 })}
      />
    );

    expect(screen.getByText(/AI Score/)).toBeInTheDocument();
    expect(screen.getByText('60/100')).toBeInTheDocument();
  });

  it('does not render AI score section when aiScore is absent (score at or below threshold)', () => {
    render(
      <MatchDebugPanel result={makeDebugResult()} />
    );

    expect(screen.queryByText(/AI Score/)).toBeNull();
  });

  it('does not crash when result has no AI fields at all', () => {
    const result = makeDebugResult();
    // Verify aiScore is not set
    expect(result.aiScore).toBeUndefined();

    render(<MatchDebugPanel result={result} />);
    // Panel renders the deterministic score correctly
    expect(screen.getByText('75/100')).toBeInTheDocument();
  });
});
