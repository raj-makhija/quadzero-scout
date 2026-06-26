import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — needed to load the page module without Next.js runtime
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useParams: vi.fn().mockReturnValue({ candidateId: 'cand_1' }),
}));

vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/api', () => ({
  api: {},
  ApiError: class ApiError extends Error {
    code: string;
    constructor(message: string, code = '') {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock('@/lib/utils', () => ({
  formatDate: (d: string) => d,
  formatSeniority: (v: string) => v,
  formatAvailability: (v: string) => v,
  formatCandidateEngagement: (v: string) => v,
  generateHeadline: () => '',
}));

vi.mock('@/components/Header', () => ({ Header: () => null }));
vi.mock('@/components/screening-modal', () => ({
  ScreeningModal: () => null,
  getScreeningStatus: () => ({ label: 'Screened', className: '' }),
  isScreeningExpired: () => false,
}));
vi.mock('@/components/screening-history-panel', () => ({ default: () => null }));
vi.mock('@/components/MatchExplainer', () => ({ CheckRequirementMatch: () => null }));

import { ShortlistedRequirementRow } from '../[candidateId]/page';
import type { ShortlistedRequirement } from '@/lib/api';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeReq(status: ShortlistedRequirement['status']): ShortlistedRequirement {
  return {
    requirementId: 'req_1',
    clientName: 'TechCorp',
    jobTitle: 'Developer',
    engagementModel: 'full_time',
    mustHaveSkills: [],
    taggedAt: '2024-01-15T10:30:00Z',
    taggedBy: 'user_r',
    status,
  };
}

const noop = () => {};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShortlistedRequirementRow — status badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Shortlisted" badge for shortlisted status', () => {
    render(
      <ShortlistedRequirementRow
        req={makeReq('shortlisted')}
        removeConfirmId={null}
        removing={false}
        onConfirmRemove={noop}
        onCancelRemove={noop}
        onRemove={noop}
      />
    );
    expect(screen.getByTestId('shortlist-status-badge')).toHaveTextContent('Shortlisted');
  });

  it('shows "Submitted" badge for submitted status — not hard-coded "Shortlisted"', () => {
    render(
      <ShortlistedRequirementRow
        req={makeReq('submitted')}
        removeConfirmId={null}
        removing={false}
        onConfirmRemove={noop}
        onCancelRemove={noop}
        onRemove={noop}
      />
    );
    const badge = screen.getByTestId('shortlist-status-badge');
    expect(badge).toHaveTextContent('Submitted');
    expect(badge).not.toHaveTextContent('Shortlisted');
  });

  it('shows "Rejected" badge for rejected status — not hard-coded "Shortlisted"', () => {
    render(
      <ShortlistedRequirementRow
        req={makeReq('rejected')}
        removeConfirmId={null}
        removing={false}
        onConfirmRemove={noop}
        onCancelRemove={noop}
        onRemove={noop}
      />
    );
    const badge = screen.getByTestId('shortlist-status-badge');
    expect(badge).toHaveTextContent('Rejected');
    expect(badge).not.toHaveTextContent('Shortlisted');
  });
});
