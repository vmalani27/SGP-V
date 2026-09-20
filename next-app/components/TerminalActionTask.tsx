'use client';

import type { LabTask, TaskStatus } from '@/lib/task-types';
import TaskPrompt from './TaskPrompt';
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
      {/* 1. Structured Task Prompt */}
      <TaskPrompt task={task} />

      {/* 2. Terminal Guidance */}
      <div className="p-3 rounded-lg bg-[#16171b]/60 border border-white/[0.05] text-zinc-400 text-xs">
        <p>Use the terminal on the right to complete this task.</p>
      </div>

      {/* 3. Diagnostic Error Feedback */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <RichText content={error} size="sm" className="prose-error" />
        </div>
      )}

      {/* 4. Action Button */}
      {status !== 'correct' && (
        <button
          onClick={() => onValidate(task.id)}
          disabled={validating}
          className="w-full py-2.5 bg-white text-zinc-950 hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-lg text-sm font-medium shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {validating ? 'Checking...' : 'Check Answer'}
        </button>
      )}

      {/* 5. Completion State */}
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
