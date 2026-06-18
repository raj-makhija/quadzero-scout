import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PromptsPage from '../page';
import type { PromptVersion } from '@/lib/api';

const mockListPrompts = vi.fn();
const mockGetPromptVersions = vi.fn();
const mockUpdatePrompt = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    listPrompts: (...a: unknown[]) => mockListPrompts(...a),
    getPromptVersions: (...a: unknown[]) => mockGetPromptVersions(...a),
    updatePrompt: (...a: unknown[]) => mockUpdatePrompt(...a),
  },
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const PROMPTS_LIST = { prompts: [{ promptKey: 'resume_parser', activeVersion: 2, lastUpdated: '2024-01-01' }] };

const makeVersion = (overrides: Partial<PromptVersion> = {}): PromptVersion => ({
  promptKey: 'resume_parser',
  version: 1,
  content: 'existing content',
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
  createdBy: 'admin',
  ...overrides,
});

describe('PromptsPage — hasChanges logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- no-active-version path --

  it('Save Changes is disabled when there is no active version and content is empty', async () => {
    mockListPrompts.mockResolvedValue(PROMPTS_LIST);
    mockGetPromptVersions.mockResolvedValue({ promptKey: 'resume_parser', versions: [] });

    render(<PromptsPage />);

    const saveBtn = await screen.findByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeDisabled();
  });

  it('Save Changes is disabled when content is whitespace-only and no active version', async () => {
    mockListPrompts.mockResolvedValue(PROMPTS_LIST);
    mockGetPromptVersions.mockResolvedValue({ promptKey: 'resume_parser', versions: [] });

    render(<PromptsPage />);
    await screen.findByRole('button', { name: /save changes/i });

    fireEvent.change(screen.getByPlaceholderText(/enter the prompt content/i), {
      target: { value: '   \n  ' },
    });

    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('Save Changes enables when non-empty content is typed and there is no active version', async () => {
    mockListPrompts.mockResolvedValue(PROMPTS_LIST);
    mockGetPromptVersions.mockResolvedValue({ promptKey: 'resume_parser', versions: [] });

    render(<PromptsPage />);
    await screen.findByRole('button', { name: /save changes/i });

    fireEvent.change(screen.getByPlaceholderText(/enter the prompt content/i), {
      target: { value: 'some real content' },
    });

    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
  });

  it('"You have unsaved changes." is shown when content is non-empty and no active version exists', async () => {
    mockListPrompts.mockResolvedValue(PROMPTS_LIST);
    mockGetPromptVersions.mockResolvedValue({ promptKey: 'resume_parser', versions: [] });

    render(<PromptsPage />);
    await screen.findByRole('button', { name: /save changes/i });

    expect(screen.queryByText(/you have unsaved changes/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/enter the prompt content/i), {
      target: { value: 'some real content' },
    });

    expect(screen.getByText(/you have unsaved changes/i)).toBeInTheDocument();
  });

  // -- has-active-version path (regression guards) --

  it('Save Changes is disabled when content matches the active version', async () => {
    mockListPrompts.mockResolvedValue(PROMPTS_LIST);
    mockGetPromptVersions.mockResolvedValue({
      promptKey: 'resume_parser',
      versions: [makeVersion()],
    });

    render(<PromptsPage />);
    const saveBtn = await screen.findByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeDisabled();
  });

  it('Save Changes enables when content differs from the active version', async () => {
    mockListPrompts.mockResolvedValue(PROMPTS_LIST);
    mockGetPromptVersions.mockResolvedValue({
      promptKey: 'resume_parser',
      versions: [makeVersion({ content: 'existing content' })],
    });

    render(<PromptsPage />);
    await screen.findByRole('button', { name: /save changes/i });

    fireEvent.change(screen.getByPlaceholderText(/enter the prompt content/i), {
      target: { value: 'modified content' },
    });

    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
  });

  it('Save Changes enables when only the description is changed', async () => {
    mockListPrompts.mockResolvedValue(PROMPTS_LIST);
    mockGetPromptVersions.mockResolvedValue({
      promptKey: 'resume_parser',
      versions: [makeVersion({ description: 'original desc' })],
    });

    render(<PromptsPage />);
    await screen.findByRole('button', { name: /save changes/i });

    fireEvent.change(screen.getByPlaceholderText(/brief description/i), {
      target: { value: 'new desc' },
    });

    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
  });

  // -- post-save path --

  it('Save button returns to disabled after a successful first save', async () => {
    mockListPrompts.mockResolvedValue(PROMPTS_LIST);
    mockGetPromptVersions
      .mockResolvedValueOnce({ promptKey: 'resume_parser', versions: [] })
      .mockResolvedValue({
        promptKey: 'resume_parser',
        versions: [makeVersion({ content: 'brand new content' })],
      });
    mockUpdatePrompt.mockResolvedValue({ promptKey: 'resume_parser', version: 1 });

    render(<PromptsPage />);
    await screen.findByRole('button', { name: /save changes/i });

    fireEvent.change(screen.getByPlaceholderText(/enter the prompt content/i), {
      target: { value: 'brand new content' },
    });

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeEnabled();
    fireEvent.click(saveBtn);

    await waitFor(() => expect(mockUpdatePrompt).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
    );
  });
});
