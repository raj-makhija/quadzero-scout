import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAcquireLock = vi.fn();
const mockReleaseLock = vi.fn();
const mockHeartbeat = vi.fn();
const mockGetProfile = vi.fn();
const mockGenerateQuestions = vi.fn();
const mockScreenCandidate = vi.fn();
const mockListSubVendors = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    acquireScreeningLock: (...args: unknown[]) => mockAcquireLock(...args),
    releaseScreeningLock: (...args: unknown[]) => mockReleaseLock(...args),
    heartbeatScreeningLock: (...args: unknown[]) => mockHeartbeat(...args),
    getProfile: (...args: unknown[]) => mockGetProfile(...args),
    generateScreeningQuestions: (...args: unknown[]) => mockGenerateQuestions(...args),
    screenCandidate: (...args: unknown[]) => mockScreenCandidate(...args),
    listSubVendors: (...args: unknown[]) => mockListSubVendors(...args),
    getApiUrl: () => 'https://api.test',
  },
  ApiError: class ApiError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { ScreeningModal } from '../screening-modal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// A fully-populated profile so the only fields the test still has to satisfy
// are the screening notes, the "still on the job" LWD confirmation, and the
// screening-question ratings under test.
const FULL_PROFILE = {
  fullName: 'Alice Smith',
  email: 'alice@example.com',
  currentCtc: 10,
  expectedCtc: 15,
  expectedCtcType: 'explicit',
  availability: 'immediate',
  engagementModel: 'either',
  totalExperience: 6,
  seniority: 'senior',
};

function renderModal(onComplete = vi.fn()) {
  return render(
    <ScreeningModal
      candidateId="cand_1"
      candidateName="Alice Smith"
      onClose={vi.fn()}
      onScreeningComplete={onComplete}
    />
  );
}

async function fillBaseRequiredFields() {
  // Notes are always required.
  fireEvent.change(screen.getByLabelText(/Notes from the screening call/), {
    target: { value: 'Spoke with the candidate.' },
  });
  // Confirm "still on the job" so LWD is satisfied without a date.
  fireEvent.click(screen.getByLabelText(/Still on the job/));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScreeningModal — objective question ratings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAcquireLock.mockResolvedValue({ lockToken: 'tok' });
    mockReleaseLock.mockResolvedValue({});
    mockHeartbeat.mockResolvedValue({});
    mockGetProfile.mockResolvedValue(FULL_PROFILE);
    mockListSubVendors.mockResolvedValue({ subVendors: [] });
    mockGenerateQuestions.mockResolvedValue({
      generated: true,
      questions: [
        { question: 'Explain React reconciliation.', category: 'React' },
        { question: 'What is a closure?', category: 'JavaScript' },
      ],
    });
    mockScreenCandidate.mockResolvedValue({});
  });

  it('renders all six rating options for each question', async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText('1. Explain React reconciliation.')).toBeInTheDocument();
    });

    const radiogroups = screen.getAllByRole('radiogroup');
    expect(radiogroups).toHaveLength(2);

    for (const label of ['Great Response', 'Good Response', 'Adequate Response', 'Poor Response', 'No Clue', 'Question Skipped']) {
      // One per question = two occurrences.
      expect(screen.getAllByRole('radio', { name: label })).toHaveLength(2);
    }
  });

  it('selecting a rating replaces any previous selection on the same question', async () => {
    renderModal();
    await waitFor(() => screen.getByText('1. Explain React reconciliation.'));

    const firstGroup = screen.getAllByRole('radiogroup')[0];
    const great = within(firstGroup).getByRole('radio', { name: 'Great Response' });
    const good = within(firstGroup).getByRole('radio', { name: 'Good Response' });

    fireEvent.click(great);
    expect(great).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(good);
    expect(good).toHaveAttribute('aria-checked', 'true');
    expect(great).toHaveAttribute('aria-checked', 'false');
  });

  it('blocks submission when any question is unrated and does not call the API', async () => {
    renderModal();
    await waitFor(() => screen.getByText('1. Explain React reconciliation.'));

    await fillBaseRequiredFields();

    // Rate only the first question, leave the second unrated.
    const groups = screen.getAllByRole('radiogroup');
    fireEvent.click(within(groups[0]).getByRole('radio', { name: 'Great Response' }));

    fireEvent.click(screen.getByRole('button', { name: /Save Screening/ }));

    await waitFor(() => {
      expect(screen.getByText(/All screening questions \(1 unanswered\)/)).toBeInTheDocument();
    });
    expect(mockScreenCandidate).not.toHaveBeenCalled();
  });

  it('allows submission once every question is rated and persists the labels in notes', async () => {
    const onComplete = vi.fn();
    renderModal(onComplete);
    await waitFor(() => screen.getByText('1. Explain React reconciliation.'));

    await fillBaseRequiredFields();

    const groups = screen.getAllByRole('radiogroup');
    fireEvent.click(within(groups[0]).getByRole('radio', { name: 'Great Response' }));
    // "Question Skipped" is a valid answer that satisfies the mandatory check.
    fireEvent.click(within(groups[1]).getByRole('radio', { name: 'Question Skipped' }));

    fireEvent.click(screen.getByRole('button', { name: /Save Screening/ }));

    await waitFor(() => {
      expect(mockScreenCandidate).toHaveBeenCalledTimes(1);
    });

    const notesArg = mockScreenCandidate.mock.calls[0][2] as string;
    expect(notesArg).toContain('A: Great Response');
    expect(notesArg).toContain('A: Question Skipped');
    expect(notesArg).not.toContain('(no answer)');
  });
});
