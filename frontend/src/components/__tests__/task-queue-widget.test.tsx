import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  TaskQueueWidget,
  taskLabel,
  taskContextLine,
  isOverdue,
  dueLabel,
  COLLAPSED_COUNT,
  TASK_REFRESH_EVENT,
} from '../task-queue-widget';
import type { RecruiterTask } from '@/lib/api';

// ── Mocks ─────────────────────────────────────────────────────────────────---
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: { user: { id: 'rec-1', role: 'recruiter' } },
    status: 'authenticated' as const,
  })),
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockGetTasks = vi.fn();
const mockSnoozeTask = vi.fn();
const mockCompleteTask = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    getTasks: (...a: unknown[]) => mockGetTasks(...a),
    snoozeTask: (...a: unknown[]) => mockSnoozeTask(...a),
    completeTask: (...a: unknown[]) => mockCompleteTask(...a),
  },
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

// ── Fixtures ─────────────────────────────────────────────────────────────---
const NOW = new Date('2026-06-01T00:00:00Z');

function task(overrides: Partial<RecruiterTask>): RecruiterTask {
  return {
    owner_id: 'rec-1',
    task_id: 't1',
    type: 'submit_to_client',
    priority: 2,
    status: 'active',
    entity_ref: 'REQ#r1#CAND#c1',
    context: { candidate_name: 'Asha', requirement_title: 'Backend Dev', client_name: 'Acme' },
    action_url: '/recruiter/requirements/r1',
    due_date: '2026-06-02T00:00:00Z',
    generated_at: '2026-06-01T00:00:00Z',
    snoozed_until: null,
    snooze_count: 0,
    ...overrides,
  };
}

// ── Pure-helper tests ────────────────────────────────────────────────────---
describe('task-queue-widget helpers', () => {
  it('maps type to a human label', () => {
    expect(taskLabel(task({ type: 'record_interview_feedback' }))).toBe('Record interview feedback');
  });
  it('joins candidate · requirement · client', () => {
    expect(taskContextLine(task({}))).toBe('Asha · Backend Dev · Acme');
  });
  it('detects overdue tasks', () => {
    expect(isOverdue(task({ due_date: '2026-05-01T00:00:00Z' }), NOW)).toBe(true);
    expect(isOverdue(task({ due_date: '2026-06-10T00:00:00Z' }), NOW)).toBe(false);
  });
  it('labels due/overdue windows', () => {
    expect(dueLabel(task({ due_date: '2026-06-02T00:00:00Z' }), NOW)).toBe('Due in 1d');
    expect(dueLabel(task({ due_date: '2026-05-30T00:00:00Z' }), NOW)).toBe('Overdue by 2d');
  });
});

// ── Component tests ──────────────────────────────────────────────────────---
describe('TaskQueueWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTasks.mockResolvedValue({ tasks: [task({})] });
    mockSnoozeTask.mockResolvedValue({ snoozed: true, snoozedUntil: 'x' });
    mockCompleteTask.mockResolvedValue({ completed: true });
  });

  it('loads and renders tasks with type label and context', async () => {
    render(<TaskQueueWidget />);
    expect(await screen.findByText('Submit to client')).toBeInTheDocument();
    expect(screen.getByText('Asha · Backend Dev · Acme')).toBeInTheDocument();
  });

  it('shows only the top N tasks collapsed, all when expanded', async () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      task({ task_id: `t${i}`, context: { candidate_name: `C${i}` } })
    );
    mockGetTasks.mockResolvedValue({ tasks: many });
    render(<TaskQueueWidget />);

    await screen.findByText('C0');
    // Collapsed: only COLLAPSED_COUNT context lines visible
    expect(screen.queryByText('C4')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(`View all (${many.length})`));
    expect(await screen.findByText('C4')).toBeInTheDocument();
    expect(COLLAPSED_COUNT).toBe(3);
  });

  it('navigates to action_url on Do It', async () => {
    render(<TaskQueueWidget />);
    fireEvent.click(await screen.findByText('Do It'));
    expect(mockPush).toHaveBeenCalledWith('/recruiter/requirements/r1');
  });

  it('optimistically removes a task and calls snoozeTask', async () => {
    render(<TaskQueueWidget />);
    fireEvent.click(await screen.findByText('Snooze'));
    fireEvent.click(screen.getByText('1 hour'));
    await waitFor(() => expect(mockSnoozeTask).toHaveBeenCalledWith('t1', '1h', { customDate: undefined, pool: false }));
    expect(screen.queryByText('Submit to client')).not.toBeInTheDocument();
  });

  it('completes a task with the pool flag for non-screening POOL tasks', async () => {
    mockGetTasks.mockResolvedValue({ tasks: [task({ owner_id: 'POOL', type: 'source_candidates' })] });
    render(<TaskQueueWidget />);
    fireEvent.click(await screen.findByText('Done'));
    await waitFor(() => expect(mockCompleteTask).toHaveBeenCalledWith('t1', { pool: true }));
  });

  it('hides the Done button for screening tasks (they auto-resolve on screen)', async () => {
    mockGetTasks.mockResolvedValue({ tasks: [task({ owner_id: 'POOL', type: 'screen_candidate' })] });
    render(<TaskQueueWidget />);
    expect(await screen.findByText('Screen matching candidate')).toBeInTheDocument();
    expect(screen.queryByText('Done')).not.toBeInTheDocument();
    // Do It / Snooze remain available.
    expect(screen.getByText('Do It')).toBeInTheDocument();
    expect(screen.getByText('Snooze')).toBeInTheDocument();
  });

  it('reloads the task list on the refresh event (e.g. after a screening)', async () => {
    render(<TaskQueueWidget />);
    await screen.findByText('Submit to client');
    expect(mockGetTasks).toHaveBeenCalledTimes(1);
    fireEvent(window, new Event(TASK_REFRESH_EVENT));
    await waitFor(() => expect(mockGetTasks).toHaveBeenCalledTimes(2));
  });

  it('renders nothing for non-recruiters', async () => {
    const { useSession } = await import('next-auth/react');
    (useSession as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      data: { user: { id: 'u', role: 'candidate' } },
      status: 'authenticated',
    });
    const { container } = render(<TaskQueueWidget />);
    expect(container).toBeEmptyDOMElement();
  });

  it('anchors with task-widget-position so it clears the mobile BottomNav', async () => {
    const { container } = render(<TaskQueueWidget />);
    await screen.findByText('Submit to client');
    const widget = container.querySelector('.task-widget-position');
    expect(widget).not.toBeNull();
  });

  it('reserves page-bottom clearance so the widget never floats over page actions', async () => {
    render(<TaskQueueWidget />);
    await screen.findByText('Submit to client');
    expect(document.documentElement.style.getPropertyValue('--task-widget-clearance')).not.toBe('');
  });

  it('removes the clearance reservation for non-recruiters', async () => {
    const { useSession } = await import('next-auth/react');
    (useSession as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      data: { user: { id: 'u', role: 'candidate' } },
      status: 'authenticated',
    });
    render(<TaskQueueWidget />);
    expect(document.documentElement.style.getPropertyValue('--task-widget-clearance')).toBe('');
  });
});
