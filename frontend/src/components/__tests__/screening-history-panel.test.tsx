import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ScreeningHistoryEntry, ScreeningHistoryResponse } from '@/lib/api';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockGetScreeningHistory = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    getScreeningHistory: (...args: unknown[]) => mockGetScreeningHistory(...args),
  },
}));

import ScreeningHistoryPanel from '../screening-history-panel';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const mockEntry: ScreeningHistoryEntry = {
  screenedAt: '2026-03-10T10:30:00.000Z',
  screenedBy: 'user-123',
  screenerEmail: 'recruiter@example.com',
  previousValues: {
    current_ctc: 10,
    location: 'Mumbai',
  },
  updatedValues: {
    current_ctc: 15,
    location: 'Bangalore',
  },
  fieldsUpdated: ['current_ctc', 'location'],
  notes: 'Updated CTC after phone screening. Candidate confirmed relocation.',
};

const mockEntryNoChanges: ScreeningHistoryEntry = {
  screenedAt: '2026-03-08T14:00:00.000Z',
  screenedBy: 'user-456',
  screenerEmail: 'other-recruiter@example.com',
  previousValues: {},
  updatedValues: {},
  fieldsUpdated: [],
  notes: 'Initial screening, no changes needed.',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ScreeningHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state while fetching', () => {
    mockGetScreeningHistory.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ScreeningHistoryPanel candidateId="c-1" mode="modal" />);
    expect(screen.getByText('Loading history...')).toBeDefined();
  });

  it('renders empty state when no screenings', async () => {
    mockGetScreeningHistory.mockResolvedValue({ candidateId: 'c-1', screenings: [] });
    render(<ScreeningHistoryPanel candidateId="c-1" mode="inline" />);

    // Expand the collapsed card first
    const header = screen.getByText('Screening History');
    fireEvent.click(header);

    await waitFor(() => {
      expect(screen.getByText('No screening history found.')).toBeDefined();
    });
  });

  it('renders correct number of timeline entries', async () => {
    mockGetScreeningHistory.mockResolvedValue({
      candidateId: 'c-1',
      screenings: [mockEntry, mockEntryNoChanges],
    });
    render(<ScreeningHistoryPanel candidateId="c-1" mode="inline" />);

    // Expand card
    fireEvent.click(screen.getByText('Screening History'));

    await waitFor(() => {
      expect(screen.getByText('recruiter@example.com')).toBeDefined();
      expect(screen.getByText('other-recruiter@example.com')).toBeDefined();
    });
  });

  it('shows count badge when screenings exist', async () => {
    mockGetScreeningHistory.mockResolvedValue({
      candidateId: 'c-1',
      screenings: [mockEntry, mockEntryNoChanges],
    });
    render(<ScreeningHistoryPanel candidateId="c-1" mode="inline" />);

    await waitFor(() => {
      expect(screen.getByText('2')).toBeDefined();
    });
  });

  it('expanding entry shows notes and field diff', async () => {
    mockGetScreeningHistory.mockResolvedValue({
      candidateId: 'c-1',
      screenings: [mockEntry],
    });
    render(<ScreeningHistoryPanel candidateId="c-1" mode="inline" />);

    // Expand card
    fireEvent.click(screen.getByText('Screening History'));

    await waitFor(() => {
      expect(screen.getByText('recruiter@example.com')).toBeDefined();
    });

    // Expand the timeline entry
    fireEvent.click(screen.getByText('recruiter@example.com'));

    await waitFor(() => {
      expect(screen.getByText('Updated CTC after phone screening. Candidate confirmed relocation.')).toBeDefined();
      expect(screen.getByText('Current CTC')).toBeDefined();
      expect(screen.getByText('Location')).toBeDefined();
      expect(screen.getByText('10 LPA')).toBeDefined();
      expect(screen.getByText('15 LPA')).toBeDefined();
      expect(screen.getByText('Mumbai')).toBeDefined();
      expect(screen.getByText('Bangalore')).toBeDefined();
    });
  });

  it('shows "No fields were changed" for entry with empty fieldsUpdated', async () => {
    mockGetScreeningHistory.mockResolvedValue({
      candidateId: 'c-1',
      screenings: [mockEntryNoChanges],
    });
    render(<ScreeningHistoryPanel candidateId="c-1" mode="inline" />);

    // Expand card
    fireEvent.click(screen.getByText('Screening History'));

    await waitFor(() => {
      expect(screen.getByText('other-recruiter@example.com')).toBeDefined();
    });

    // Expand entry
    fireEvent.click(screen.getByText('other-recruiter@example.com'));

    await waitFor(() => {
      expect(screen.getByText('No fields were changed.')).toBeDefined();
    });
  });

  it('modal mode renders backdrop and close button', async () => {
    const onClose = vi.fn();
    mockGetScreeningHistory.mockResolvedValue({
      candidateId: 'c-1',
      screenings: [mockEntry],
    });
    render(
      <ScreeningHistoryPanel
        candidateId="c-1"
        candidateName="John Doe"
        mode="modal"
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Screening History')).toBeDefined();
      expect(screen.getByText('John Doe')).toBeDefined();
    });
  });

  it('renders error state on API failure', async () => {
    mockGetScreeningHistory.mockRejectedValue(new Error('Network error'));
    render(<ScreeningHistoryPanel candidateId="c-1" mode="inline" />);

    // Expand card
    fireEvent.click(screen.getByText('Screening History'));

    await waitFor(() => {
      expect(screen.getByText('Failed to load screening history.')).toBeDefined();
    });
  });
});
