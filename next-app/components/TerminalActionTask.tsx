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
      <div className="p-3 rounded-lg bg-[#151922] border border-white/[0.08] text-[#cbd5e1] text-xs">
        <p>Use the terminal on the right to complete this task.</p>
      </div>

{/* 3. Diagnostic Error Feedback */}
{error && (
  <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-3 text-xs">
    <div className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-rose-400 mb-1">
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500/10 text-[9px] text-rose-400">
        ✕
      </span>
      <span>TASK ERROR!</span>
    </div>
    <div className="pl-5 text-zinc-300 leading-relaxed font-normal [&_code]:font-mono [&_code]:text-[11px] [&_code]:bg-zinc-800/80 [&_code]:text-zinc-200 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:border [&_code]:border-white/[0.06]">
      <RichText content={error} size="sm" />
    </div>
  </div>
)}

      {/* 4. Action Button */}
      {status !== 'correct' && (
        <button
          onClick={() => onValidate(task.id)}
          disabled={validating}
          className="w-full py-2.5 bg-white text-slate-900 hover:bg-slate-200 disabled:bg-[#1e2433] disabled:text-slate-500 rounded-lg text-sm font-semibold shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
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
