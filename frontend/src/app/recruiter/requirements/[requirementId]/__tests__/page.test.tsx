import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import RequirementDetailPage from '../page';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  useParams: vi.fn(() => ({ requirementId: 'req-1' })),
}));

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: { user: { id: 'rec-1', role: 'recruiter', isInternal: true } },
    status: 'authenticated' as const,
  })),
}));

const mockGetRequirement = vi.fn();
const mockGetShortlistedCandidates = vi.fn();
const mockUpdateRequirement = vi.fn();
const mockGetLinkedInStatus = vi.fn();
const mockGetLinkedInAuthUrl = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    getRequirement: (...args: any[]) => mockGetRequirement(...args),
    getShortlistedCandidates: (...args: any[]) => mockGetShortlistedCandidates(...args),
    updateRequirement: (...args: any[]) => mockUpdateRequirement(...args),
    getLinkedInStatus: (...args: any[]) => mockGetLinkedInStatus(...args),
    getLinkedInAuthUrl: (...args: any[]) => mockGetLinkedInAuthUrl(...args),
  },
}));

vi.mock('@/components/Header', () => ({ Header: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/components/custom-fields-modal', () => ({ CustomFieldsModal: () => null }));
vi.mock('@/components/MatchExplainer', () => ({ CheckCandidateMatch: () => null }));
vi.mock('@/components/pipeline/pipeline-board', () => ({ PipelineBoard: () => null }));
vi.mock('@/components/criteria-editor', () => ({ CriteriaEditor: () => null }));

vi.mock('@/lib/utils', () => ({
  formatDate: () => 'today',
  formatEngagementModel: (s: string) => s,
  formatPayroll: (s: string) => s,
  formatSeniority: (s: string) => s,
  formatAvailability: (s: string) => s,
  generateJobTitle: () => 'Generated Title',
  formatInr: (v: number) => String(v),
}));

const baseRequirement = {
  requirementId: 'req-1',
  recruiterId: 'rec-1',
  clientName: 'Acme',
  endClient: null,
  jobTitle: 'Blue Yonder Engineer',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  engagementModel: 'full_time_regular',
  payroll: 'quadzero',
  budgetMinLpa: null,
  budgetMaxLpa: null,
  maxResourceBudgetLpa: null,
  contractDurationMonths: null,
  paymentTermsDays: null,
  contactPersonName: null,
  isRateGstInclusive: false,
  jdText: 'Looking for a supply chain engineer.',
  additionalFields: [],
  notifyRecruiterIds: [],
  contributingRecruiters: [],
  requestHistory: [],
  statusHistory: [],
  changeHistory: [],
  parsedCriteria: {
    coreSkill: 'Blue Yonder ESP',
    mustHaveSkills: ['blue yonder esp'],
    goodToHaveSkills: [],
    roles: [],
    minExperience: null,
    maxExperience: null,
    seniority: [],
    availability: [],
    location: null,
  },
};

describe('RequirementDetailPage — core skill editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetShortlistedCandidates.mockResolvedValue({ candidates: [] });
    mockUpdateRequirement.mockResolvedValue({});
    mockGetLinkedInStatus.mockResolvedValue({ connected: false, needsReconnect: false });
  });

  it('pre-populates the core skill field with the existing value when editing begins', async () => {
    mockGetRequirement.mockResolvedValue(baseRequirement);
    render(<RequirementDetailPage />);

    const editButton = await screen.findByTitle('Edit requirement details');
    fireEvent.click(editButton);

    const coreSkillInput = await screen.findByPlaceholderText('e.g., React, Java, Blue Yonder');
    expect((coreSkillInput as HTMLInputElement).value).toBe('Blue Yonder ESP');
  });

  it('persists the edited core skill in the updateRequirement payload', async () => {
    mockGetRequirement.mockResolvedValue(baseRequirement);
    render(<RequirementDetailPage />);

    fireEvent.click(await screen.findByTitle('Edit requirement details'));

    const coreSkillInput = await screen.findByPlaceholderText('e.g., React, Java, Blue Yonder');
    fireEvent.change(coreSkillInput, { target: { value: 'Blue Yonder' } });

    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(mockUpdateRequirement).toHaveBeenCalled());
    const [, payload] = mockUpdateRequirement.mock.calls[0];
    expect(payload.parsedCriteria).toBeDefined();
    expect(payload.parsedCriteria.coreSkill).toBe('Blue Yonder');
  });

  it('clears the core skill to null when the field is emptied', async () => {
    mockGetRequirement.mockResolvedValue(baseRequirement);
    render(<RequirementDetailPage />);

    fireEvent.click(await screen.findByTitle('Edit requirement details'));

    const coreSkillInput = await screen.findByPlaceholderText('e.g., React, Java, Blue Yonder');
    fireEvent.change(coreSkillInput, { target: { value: '' } });

    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(mockUpdateRequirement).toHaveBeenCalled());
    const [, payload] = mockUpdateRequirement.mock.calls[0];
    expect(payload.parsedCriteria.coreSkill).toBeNull();
  });
});

describe('RequirementDetailPage — LinkedIn silent re-auth', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mockGetShortlistedCandidates.mockResolvedValue({ candidates: [] });
    mockGetRequirement.mockResolvedValue(baseRequirement);
    mockGetLinkedInAuthUrl.mockResolvedValue({ authUrl: 'https://www.linkedin.com/oauth/v2/authorization?x=1' });
    // jsdom forbids real navigation; swap in a writable location stub.
    delete (window as any).location;
    (window as any).location = { pathname: '/recruiter/requirements/req-1', href: '' };
  });

  afterEach(() => {
    (window as any).location = originalLocation;
  });

  it('transparently redirects through OAuth when the token is within the refresh window', async () => {
    mockGetLinkedInStatus.mockResolvedValue({ connected: true, needsReconnect: false, refreshSoon: true });
    render(<RequirementDetailPage />);

    await waitFor(() => expect(mockGetLinkedInAuthUrl).toHaveBeenCalled());
    await waitFor(() =>
      expect(window.location.href).toBe('https://www.linkedin.com/oauth/v2/authorization?x=1')
    );
  });

  it('does NOT redirect for a healthy token outside the refresh window', async () => {
    mockGetLinkedInStatus.mockResolvedValue({ connected: true, needsReconnect: false, refreshSoon: false });
    render(<RequirementDetailPage />);

    await screen.findByTitle('Edit requirement details');
    expect(mockGetLinkedInAuthUrl).not.toHaveBeenCalled();
    expect(window.location.href).toBe('');
  });
});
