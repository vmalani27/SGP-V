'use client';

import type { TaskStatus, TaskProgressData } from '@/lib/task-types';
import MultipleChoiceTask from './MultipleChoiceTask';
import TerminalActionTask from './TerminalActionTask';
import PortCheckTask from './PortCheckTask';
import TaskHelp from './TaskHelp';

interface LabTaskRendererProps {
  progress: TaskProgressData;
  taskStatuses: Record<string, TaskStatus>;
  taskErrors: Record<string, string>;
  validating: boolean;
  onValidate: (taskId: string, answer?: string) => void;
}

export default function LabTaskRenderer({
  progress,
  taskStatuses,
  taskErrors,
  validating,
  onValidate,
}: LabTaskRendererProps) {
  const { tasks, currentIndex, completed } = progress;

  if (completed) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/20 font-bold text-emerald-400">
            ✓
          </div>
          <h3 className="mb-1 text-base font-semibold text-emerald-300">Lab Complete</h3>
          <p className="font-mono text-xs text-muted">All {tasks.length} tasks verified. Submit to finish.</p>
        </div>
      </div>
    );
  }

  const task = tasks[currentIndex];
  if (!task) return null;

  const status = taskStatuses[task.id] || 'pending';
  const error = taskErrors[task.id];
  const progressPercent = Math.round(((currentIndex + 1) / tasks.length) * 100);

  return (
    <div className="space-y-6 font-sans text-text antialiased">
      {/* 1. Step Indicator & Hairline Progress Bar */}
      <div>
        <div className="flex items-center justify-between font-mono text-[11px] text-muted">
          <span className="font-semibold uppercase tracking-wider text-accent">
            TASK {currentIndex + 1} OF {tasks.length}
          </span>
          <span className="text-muted/50 font-mono">ID: {task.id}</span>
        </div>

        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line/60">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 2. Active Task Execution */}
      <div className="space-y-4">
        {task.type === 'multiple_choice' && (
          <MultipleChoiceTask
            task={task}
            status={status}
            onValidate={onValidate}
            error={error}
          />
        )}
        {task.type === 'terminal_action' && (
          <TerminalActionTask
            task={task}
            status={status}
            onValidate={onValidate}
            error={error}
            validating={validating}
          />
        )}
        {task.type === 'port_check' && (
          <PortCheckTask
            task={task}
            status={status}
            onValidate={onValidate}
            error={error}
            validating={validating}
          />
        )}

        {/* Hints / Assistance */}
        <TaskHelp task={task} />
      </div>
    </div>
  );
}