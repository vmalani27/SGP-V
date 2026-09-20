'use client';

import type { LabTask, TaskStatus } from '@/lib/task-types';
import TaskPrompt from './TaskPrompt';
import RichText from './RichText';

interface PortCheckTaskProps {
  task: LabTask;
  status: TaskStatus;
  onValidate: (taskId: string) => void;
  error?: string;
  validating?: boolean;
}

export default function PortCheckTask({ task, status, onValidate, error, validating }: PortCheckTaskProps) {
  const port = task.validation.port || 80;
  const path = task.validation.path || '/';

  return (
    <div className="space-y-4">
      {/* 1. Structured Task Prompt */}
      <TaskPrompt task={task} />

      {/* 2. Service Target Card */}
      <div className="p-3 rounded-lg bg-[#16171b]/60 border border-white/[0.05] space-y-1.5 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Service Endpoint:</span>
          <span className="font-mono text-zinc-200 font-medium">
            Port <code className="bg-zinc-800/90 text-zinc-200 border border-white/[0.08] font-mono text-xs px-1.5 py-0.5 rounded">{port}</code>
            {path !== '/' && <> at <code className="bg-zinc-800/90 text-zinc-200 border border-white/[0.08] font-mono text-xs px-1.5 py-0.5 rounded">{path}</code></>}
          </span>
        </div>
        <p className="text-[11px] text-zinc-500">Use the terminal on the right to start your service, then validate.</p>
      </div>

      {/* 3. Diagnostic Error Feedback */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <RichText content={error} size="sm" className="prose-error" />
        </div>
      )}

      {/* 4. Action CTA */}
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
