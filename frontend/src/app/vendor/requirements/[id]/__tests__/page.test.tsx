import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import VendorRequirementDetailPage from '../page';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ id: 'req-1' })),
}));

const mockGetPublicRequirement = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    getPublicRequirement: (...args: any[]) => mockGetPublicRequirement(...args),
  },
}));

vi.mock('@/lib/utils', () => ({
  formatVendorEngagementModel: (s: string) => s,
}));

const baseRequirement = {
  requirementId: 'req-1-abcdef',
  jobTitle: 'Senior Backend Engineer',
  engagementModel: 'c2c',
  coreSkill: null,
  mustHaveSkills: [],
  goodToHaveSkills: [],
  minExperience: 5,
  maxExperience: 8,
  seniority: [],
  availability: [],
  location: 'Bengaluru',
  remote: false,
  roles: [],
  additionalFields: undefined,
  createdAt: '2026-01-01T00:00:00Z',
  lastUpdated: '2026-01-01T00:00:00Z',
};

const EXPECTED_FIELDS = [
  'Candidate Name: ',
  'Mobile Number: ',
  'Email ID: ',
  'Experience: ',
  'Availabilty: ',
  'Current Location: ',
  'Preferred Location: ',
  'Bill Rate (per-month): ',
];

async function renderWith(overrides: Record<string, any> = {}) {
  mockGetPublicRequirement.mockResolvedValue({
    requirement: { ...baseRequirement, ...overrides },
  });
  render(<VendorRequirementDetailPage />);
  return waitFor(() =>
    screen.getByRole('link', { name: /Submit via vendors@quadzero\.com/i })
  );
}

function bodyOf(link: HTMLElement): string {
  const href = link.getAttribute('href') || '';
  const query = href.split('?')[1] || '';
  return new URLSearchParams(query).get('body') || '';
}

describe('VendorRequirementDetailPage — Submit mailto body', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes a body parameter in the Submit mailto href', async () => {
    const link = await renderWith();
    expect(link.getAttribute('href')).toContain('body=');
  });

  it('encodes all eight field labels in the mailto body', async () => {
    const link = await renderWith();
    const body = bodyOf(link);
    for (const field of EXPECTED_FIELDS) {
      expect(body).toContain(field.trim());
    }
    // Preserve the intentional misspelling from the ticket verbatim.
    expect(body).toContain('Availabilty:');
  });

  it('includes label + colon + trailing space for each field', async () => {
    const link = await renderWith();
    const body = bodyOf(link);
    for (const field of EXPECTED_FIELDS) {
      expect(body).toContain(field);
    }
  });

  it('URL-encodes newlines between fields (%0A)', async () => {
    const link = await renderWith();
    const rawBody = (link.getAttribute('href') || '').split('body=')[1] || '';
    expect(rawBody).toMatch(/%0A/i);
  });

  it('still includes the subject parameter unchanged', async () => {
    const link = await renderWith();
    const query = (link.getAttribute('href') || '').split('?')[1] || '';
    const subject = new URLSearchParams(query).get('subject') || '';
    expect(subject).toContain('Candidate Submission');
    expect(subject).toContain('Senior Backend Engineer');
    expect(subject).toContain('req-1-abcdef');
  });

  it('renders body template correctly when jobTitle is null', async () => {
    const link = await renderWith({ jobTitle: undefined });
    const body = bodyOf(link);
    for (const field of EXPECTED_FIELDS) {
      expect(body).toContain(field);
    }
  });

  it('renders body template correctly when additionalFields are present', async () => {
    const link = await renderWith({
      additionalFields: [{ label: 'Notice Period', type: 'text', required: true }],
    });
    const body = bodyOf(link);
    for (const field of EXPECTED_FIELDS) {
      expect(body).toContain(field);
    }
  });
});
