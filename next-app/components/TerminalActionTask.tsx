'use client';

import type { LabTask, TaskStatus } from '@/lib/task-types';
import RichText from './RichText';

interface TerminalActionTaskProps {
  task: LabTask;
  status: TaskStatus;
  onValidate: (taskId: string) => void;
  error?: string;
  validating?: boolean;
}

export default function TerminalActionTask({ task, status, onValidate, error, validating }: TerminalActionTaskProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Task</p>
        <RichText content={task.prompt} />
      </div>

      <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
        <p className="text-xs text-muted">Use the terminal on the right to complete this task.</p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <RichText content={error} size="sm" className="prose-error" />
        </div>
      )}

      {status !== 'correct' && (
        <button
          onClick={() => onValidate(task.id)}
          disabled={validating}
          className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {validating ? 'Checking...' : 'Check Answer'}
        </button>
      )}

      {status === 'correct' && (
        <div className="flex items-center gap-2 text-emerald-400 text-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          Task complete!
        </div>
      )}
    </div>
  );
}
