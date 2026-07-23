import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import VendorRequirementDetailPage from '../page';

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ id: 'req-abc' })),
}));

const mockGetPublicRequirement = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    getPublicRequirement: (...args: any[]) => mockGetPublicRequirement(...args),
  },
}));

vi.mock('@/lib/utils', () => ({
  formatEngagementModel: (s: string) => s,
}));

const baseRequirement = {
  requirementId: 'req-abc-123',
  jobTitle: 'Senior React Developer',
  engagementModel: 'contract',
  coreSkill: null,
  mustHaveSkills: [],
  goodToHaveSkills: [],
  minExperience: null,
  maxExperience: null,
  seniority: [],
  availability: [],
  location: null,
  remote: false,
  roles: [],
  additionalFields: [],
  createdAt: '2026-01-01T00:00:00Z',
  lastUpdated: '2026-01-01T00:00:00Z',
};

describe('VendorRequirementDetailPage — Submit mailto body', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPublicRequirement.mockResolvedValue({ requirement: baseRequirement });
  });

  it('includes a body parameter in the Submit mailto href', async () => {
    render(<VendorRequirementDetailPage />);

    const link = await screen.findByRole('link', { name: /Submit via vendors@quadzero\.com/i });
    const href = link.getAttribute('href') ?? '';
    expect(href).toContain('body=');
  });

  it('encodes all eight field labels in the mailto body', async () => {
    render(<VendorRequirementDetailPage />);

    const link = await screen.findByRole('link', { name: /Submit via vendors@quadzero\.com/i });
    const href = link.getAttribute('href') ?? '';

    const bodyParam = new URLSearchParams(href.split('?')[1]).get('body') ?? '';
    const decoded = decodeURIComponent(bodyParam);

    expect(decoded).toContain('Candidate Name:');
    expect(decoded).toContain('Mobile Number:');
    expect(decoded).toContain('Email ID:');
    expect(decoded).toContain('Experience:');
    expect(decoded).toContain('Availabilty:'); // preserving exact spelling from ticket
    expect(decoded).toContain('Current Location:');
    expect(decoded).toContain('Preferred Location:');
    expect(decoded).toContain('Bill Rate (per-month):');
  });

  it('includes label + colon + trailing space for each field', async () => {
    render(<VendorRequirementDetailPage />);

    const link = await screen.findByRole('link', { name: /Submit via vendors@quadzero\.com/i });
    const href = link.getAttribute('href') ?? '';
    const bodyParam = new URLSearchParams(href.split('?')[1]).get('body') ?? '';
    const decoded = decodeURIComponent(bodyParam);

    expect(decoded).toContain('Candidate Name: ');
    expect(decoded).toContain('Mobile Number: ');
    expect(decoded).toContain('Email ID: ');
    expect(decoded).toContain('Experience: ');
    expect(decoded).toContain('Availabilty: ');
    expect(decoded).toContain('Current Location: ');
    expect(decoded).toContain('Preferred Location: ');
    expect(decoded).toContain('Bill Rate (per-month): ');
  });

  it('URL-encodes newlines between fields (%0A)', async () => {
    render(<VendorRequirementDetailPage />);

    const link = await screen.findByRole('link', { name: /Submit via vendors@quadzero\.com/i });
    const href = link.getAttribute('href') ?? '';
    const rawBody = href.split('body=')[1] ?? '';
    expect(rawBody).toMatch(/%0A/i);
  });

  it('still includes the subject parameter unchanged', async () => {
    render(<VendorRequirementDetailPage />);

    const link = await screen.findByRole('link', { name: /Submit via vendors@quadzero\.com/i });
    const href = link.getAttribute('href') ?? '';
    const subject = new URLSearchParams(href.split('?')[1]).get('subject') ?? '';
    const decoded = decodeURIComponent(subject);

    expect(decoded).toContain('Candidate Submission');
    expect(decoded).toContain('Senior React Developer');
    expect(decoded).toContain('req-abc-123');
  });

  it('renders body template correctly when jobTitle is null', async () => {
    mockGetPublicRequirement.mockResolvedValue({
      requirement: { ...baseRequirement, jobTitle: undefined },
    });
    render(<VendorRequirementDetailPage />);

    const link = await screen.findByRole('link', { name: /Submit via vendors@quadzero\.com/i });
    const href = link.getAttribute('href') ?? '';
    const bodyParam = new URLSearchParams(href.split('?')[1]).get('body') ?? '';
    const decoded = decodeURIComponent(bodyParam);

    expect(decoded).toContain('Candidate Name:');
    expect(decoded).toContain('Bill Rate (per-month):');
  });

  it('renders body template correctly when additionalFields are present', async () => {
    mockGetPublicRequirement.mockResolvedValue({
      requirement: {
        ...baseRequirement,
        additionalFields: [{ key: 'pan', label: 'PAN Number', required: true }],
      },
    });
    render(<VendorRequirementDetailPage />);

    const link = await screen.findByRole('link', { name: /Submit via vendors@quadzero\.com/i });
    const href = link.getAttribute('href') ?? '';
    const bodyParam = new URLSearchParams(href.split('?')[1]).get('body') ?? '';
    const decoded = decodeURIComponent(bodyParam);

    expect(decoded).toContain('Candidate Name:');
    expect(decoded).toContain('Bill Rate (per-month):');
  });
});
