import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CloneDataPage from '../page';

const mockStartCloneProdData = vi.fn();
const mockGetCloneProdDataStatus = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    startCloneProdData: (...a: unknown[]) => mockStartCloneProdData(...a),
    getCloneProdDataStatus: (...a: unknown[]) => mockGetCloneProdDataStatus(...a),
  },
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const ORIGINAL_STAGE = process.env.NEXT_PUBLIC_STAGE;

describe('CloneDataPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_STAGE = ORIGINAL_STAGE;
  });

  it('does not render the clone action on prod', () => {
    process.env.NEXT_PUBLIC_STAGE = 'prod';
    render(<CloneDataPage />);
    expect(screen.getByText(/not available in the production environment/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start clone/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/to confirm/i)).not.toBeInTheDocument();
  });

  it('keeps Start Clone disabled until the stage name is typed', () => {
    process.env.NEXT_PUBLIC_STAGE = 'dev';
    render(<CloneDataPage />);

    const button = screen.getByRole('button', { name: /start clone/i });
    const input = screen.getByLabelText(/to confirm/i);
    expect(button).toBeDisabled();

    fireEvent.change(input, { target: { value: 'wrong' } });
    expect(button).toBeDisabled();

    fireEvent.change(input, { target: { value: 'DEV' } });
    expect(button).toBeEnabled();
  });

  it('shows a destructive-overwrite warning naming the current stage', () => {
    process.env.NEXT_PUBLIC_STAGE = 'qa';
    render(<CloneDataPage />);
    expect(screen.getByText(/Destructive/i)).toBeInTheDocument();
    // The warning references the QA environment as the deletion target.
    expect(screen.getAllByText(/QA/).length).toBeGreaterThan(0);
  });

  it('starts the clone and renders progress once confirmed', async () => {
    process.env.NEXT_PUBLIC_STAGE = 'dev';
    mockStartCloneProdData.mockResolvedValue({ jobId: 'clone_1' });
    mockGetCloneProdDataStatus.mockResolvedValue({
      jobId: 'clone_1',
      status: 'completed',
      source: 'prod',
      target: 'dev',
      createdAt: 'now',
      updatedAt: 'now',
      tables: [{ table: 'TalentProfiles', scanned: 5, written: 5, failed: 0 }],
      s3: { copied: 3, failed: 0 },
    });

    render(<CloneDataPage />);
    fireEvent.change(screen.getByLabelText(/to confirm/i), { target: { value: 'DEV' } });
    fireEvent.click(screen.getByRole('button', { name: /start clone/i }));

    await waitFor(() => expect(mockStartCloneProdData).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('TalentProfiles')).toBeInTheDocument());
    expect(screen.getByText(/Resume files copied/i)).toBeInTheDocument();
  });
});
