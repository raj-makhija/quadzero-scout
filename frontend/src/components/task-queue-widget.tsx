'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  ListTodo,
  AlertTriangle,
  Clock,
  ChevronUp,
  ChevronDown,
  Check,
  X,
} from 'lucide-react';
import { api, type RecruiterTask, type SnoozePreset } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

export const COLLAPSED_COUNT = 3;
const POLL_INTERVAL_MS = 60_000;

export const TASK_LABELS: Record<string, string> = {
  submit_to_client: 'Submit to client',
  follow_up_client: 'Follow up with client',
  schedule_interview: 'Schedule interview',
  record_interview_feedback: 'Record interview feedback',
  send_offer: 'Send offer',
  follow_up_offer: 'Follow up on offer',
  confirm_joining: 'Confirm joining date',
  post_placement_checkin: 'Post-placement check-in',
  screen_candidate: 'Screen matching candidate',
  rescreen_candidate: 'Re-screen candidate',
  source_candidates: 'Re-run search for stale requirement',
  close_requirement: 'Close filled requirement',
  review_bulk_import: 'Review bulk-imported profile',
  review_ingested_resume: 'Review ingested resume',
};

const SNOOZE_OPTIONS: Array<{ preset: SnoozePreset; label: string }> = [
  { preset: '1h', label: '1 hour' },
  { preset: '4h', label: '4 hours' },
  { preset: 'tomorrow', label: 'Tomorrow' },
  { preset: 'next_week', label: 'Next week' },
  { preset: 'custom', label: 'Custom date…' },
];

export function taskLabel(task: RecruiterTask): string {
  return TASK_LABELS[task.type] || task.type;
}

export function taskContextLine(task: RecruiterTask): string {
  const { candidate_name, requirement_title, client_name } = task.context || {};
  return [candidate_name, requirement_title, client_name].filter(Boolean).join(' · ');
}

export function isOverdue(task: RecruiterTask, now: Date = new Date()): boolean {
  return new Date(task.due_date).getTime() < now.getTime();
}

export function dueLabel(task: RecruiterTask, now: Date = new Date()): string {
  const diffMs = new Date(task.due_date).getTime() - now.getTime();
  const overdue = diffMs < 0;
  const hours = Math.round(Math.abs(diffMs) / 3_600_000);
  const text = hours >= 24 ? `${Math.round(hours / 24)}d` : `${Math.max(hours, 1)}h`;
  return overdue ? `Overdue by ${text}` : `Due in ${text}`;
}

function TaskCard({
  task,
  onDoIt,
  onSnooze,
  onComplete,
}: {
  task: RecruiterTask;
  onDoIt: (task: RecruiterTask) => void;
  onSnooze: (task: RecruiterTask, preset: SnoozePreset, customDate?: string) => void;
  onComplete: (task: RecruiterTask) => void;
}) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const overdue = isOverdue(task);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-gray-900 dark:text-gray-100">{taskLabel(task)}</div>
        <span
          className={`shrink-0 inline-flex items-center gap-1 text-xs ${
            overdue ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {overdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {dueLabel(task)}
        </span>
      </div>
      {taskContextLine(task) && (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{taskContextLine(task)}</div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onDoIt(task)}
          className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          Do It
        </button>
        <button
          type="button"
          onClick={() => onComplete(task)}
          className="inline-flex items-center gap-1 rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <Check className="h-3 w-3" /> Done
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setSnoozeOpen((v) => !v)}
            className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Snooze
          </button>
          {snoozeOpen && (
            <div className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
              {SNOOZE_OPTIONS.map((opt) =>
                opt.preset === 'custom' ? (
                  <div key="custom" className="border-t border-gray-100 dark:border-gray-700 p-2">
                    <input
                      type="datetime-local"
                      aria-label="Custom snooze date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-transparent px-1 py-0.5 text-xs"
                    />
                    <button
                      type="button"
                      disabled={!customDate}
                      onClick={() => {
                        setSnoozeOpen(false);
                        onSnooze(task, 'custom', new Date(customDate).toISOString());
                      }}
                      className="mt-1 w-full rounded bg-gray-700 px-2 py-1 text-xs text-white disabled:opacity-50"
                    >
                      Snooze until…
                    </button>
                  </div>
                ) : (
                  <button
                    key={opt.preset}
                    type="button"
                    onClick={() => {
                      setSnoozeOpen(false);
                      onSnooze(task, opt.preset);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    {opt.label}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TaskQueueWidget() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tasks, setTasks] = useState<RecruiterTask[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(true);

  const role = (session?.user as { role?: string } | undefined)?.role;
  const isRecruiter = status === 'authenticated' && role === 'recruiter';

  const load = useCallback(async () => {
    try {
      const { tasks } = await api.getTasks();
      setTasks(tasks);
    } catch {
      // Silent — the widget is non-critical; next poll retries.
    }
  }, []);

  useEffect(() => {
    if (!isRecruiter) return;
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isRecruiter, load]);

  const removeLocal = (taskId: string) => setTasks((prev) => prev.filter((t) => t.task_id !== taskId));

  const isPool = (task: RecruiterTask) => task.owner_id === 'POOL';

  const handleDoIt = (task: RecruiterTask) => {
    if (task.action_url) router.push(task.action_url);
  };

  const handleSnooze = async (task: RecruiterTask, preset: SnoozePreset, customDate?: string) => {
    removeLocal(task.task_id); // optimistic
    try {
      await api.snoozeTask(task.task_id, preset, { customDate, pool: isPool(task) });
    } catch {
      toast({ variant: 'error', title: 'Could not snooze task' });
      load();
    }
  };

  const handleComplete = async (task: RecruiterTask) => {
    removeLocal(task.task_id); // optimistic
    try {
      await api.completeTask(task.task_id, { pool: isPool(task) });
    } catch {
      toast({ variant: 'error', title: 'Could not complete task' });
      load();
    }
  };

  if (!isRecruiter) return null;

  const visible = expanded ? tasks : tasks.slice(0, COLLAPSED_COUNT);

  return (
    <div className="fixed task-widget-position right-4 z-40 w-80 max-w-[calc(100vw-2rem)]">
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 shadow-xl">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-t-xl bg-gray-100 dark:bg-gray-800 px-3 py-2"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <ListTodo className="h-4 w-4" /> Tasks
            {tasks.length > 0 && (
              <span className="rounded-full bg-blue-600 px-1.5 text-xs text-white">{tasks.length}</span>
            )}
          </span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>

        {open && (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3">
            {tasks.length === 0 ? (
              <div className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                You&apos;re all caught up 🎉
              </div>
            ) : (
              <>
                {visible.map((task) => (
                  <TaskCard
                    key={task.task_id}
                    task={task}
                    onDoIt={handleDoIt}
                    onSnooze={handleSnooze}
                    onComplete={handleComplete}
                  />
                ))}
                {tasks.length > COLLAPSED_COUNT && (
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="w-full rounded py-1 text-center text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {expanded ? 'Show less' : `View all (${tasks.length})`}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <button type="button" className="sr-only" aria-hidden onClick={() => setOpen(false)}>
        <X />
      </button>
    </div>
  );
}

export default TaskQueueWidget;
