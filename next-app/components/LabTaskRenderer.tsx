'use client';

import type { LabTask, TaskStatus, TaskProgressData } from '@/lib/task-types';
import MultipleChoiceTask from './MultipleChoiceTask';
import TerminalActionTask from './TerminalActionTask';
import PortCheckTask from './PortCheckTask';
import TaskProgress from './TaskProgress';

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
  if (progress.completed) {
    return (
      <div className="space-y-4">
        <TaskProgress currentIndex={progress.tasks.length} total={progress.tasks.length} completed />
        <div className="p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-emerald-300 mb-1">Lab Complete</h3>
          <p className="text-sm text-muted">All tasks completed successfully.</p>
        </div>
      </div>
    );
  }

  const task = progress.tasks[progress.currentIndex];
  if (!task) return null;

  const status = taskStatuses[task.id] || 'pending';
  const error = taskErrors[task.id];

  return (
    <div className="space-y-4">
      <TaskProgress
        currentIndex={progress.currentIndex}
        total={progress.tasks.length}
        completed={false}
      />

      <div className="space-y-3">
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
      </div>
    </div>
  );
}
