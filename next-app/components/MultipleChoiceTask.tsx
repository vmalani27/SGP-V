'use client';

import { useState } from 'react';
import type { LabTask, TaskStatus } from '@/lib/task-types';
import TaskPrompt from './TaskPrompt';
import RichText from './RichText';

interface MultipleChoiceTaskProps {
  task: LabTask;
  status: TaskStatus;
  onValidate: (taskId: string, answer: string) => void;
  error?: string;
}

export default function MultipleChoiceTask({ task, status, onValidate, error }: MultipleChoiceTaskProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!selected) return;
    onValidate(task.id, selected);
  };

  const options = task.options || ['Option A', 'Option B', 'Option C'];

  return (
    <div className="space-y-4">
      {/* 1. Structured Task Prompt */}
      <TaskPrompt task={task} />

      {/* 2. Options List */}
      <div className="space-y-2">
        {options.map((option) => {
          const isSelected = selected === option;
          const isCorrect = status === 'correct' && isSelected;
          const isWrong = status === 'incorrect' && isSelected;
          const looksLikeCode = option.startsWith('docker ') || option.includes(' --') || option.startsWith('http') || option.includes(':');

          return (
            <button
              key={option}
              onClick={() => setSelected(option)}
              disabled={status === 'correct'}
              className={`w-full text-left px-3.5 py-2.5 rounded-lg border text-xs transition-colors
                ${isCorrect ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : isWrong ? 'border-red-500/40 bg-red-500/10 text-red-300'
                  : isSelected ? 'border-white/40 bg-[#1e2530] text-white font-medium'
                  : 'border-white/[0.08] bg-[#151922] text-[#cbd5e1] hover:border-white/[0.16] hover:text-white'
                }
                ${status === 'correct' ? 'cursor-default' : 'cursor-pointer'}
              `}
            >
              <span className="flex items-start gap-3">
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5
                  ${isCorrect ? 'border-emerald-500 bg-emerald-500'
                    : isWrong ? 'border-red-500 bg-red-500'
                    : isSelected ? 'border-white bg-[#1e2530]'
                    : 'border-slate-700 bg-transparent'
                  }`}
                >
                  {isSelected && !isCorrect && !isWrong && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  {isCorrect && (
                    <svg className="w-2.5 h-2.5 text-black stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                </span>
                <span className={`flex-1 ${looksLikeCode ? 'font-mono text-[11.5px] leading-relaxed break-all' : 'font-sans leading-relaxed'}`}>
                  {option}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. Diagnostic Error Feedback */}
      {error && (
        <div className="flex items-start gap-1.5 text-xs leading-relaxed px-1">
          <span className="font-semibold text-rose-400 shrink-0">Incorrect:</span>
          <span className="text-slate-300 [&_p]:inline [&_p]:m-0 [&_a]:no-underline [&_a]:text-slate-200">
            <RichText content={error} size="sm" className="inline" />
          </span>
        </div>
      )}

      {/* 4. Action Button */}
      {status !== 'correct' && (
        <button
          onClick={handleSubmit}
          disabled={!selected}
          className="w-full py-2.5 bg-white text-slate-900 hover:bg-slate-200 disabled:bg-[#1e2433] disabled:text-slate-500 rounded-lg text-sm font-semibold shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          Check Answer
        </button>
      )}

      {/* 5. Completion State */}
      {status === 'correct' && (
        <div className="flex items-center gap-2 text-emerald-400 text-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          Correct!
        </div>
      )}
    </div>
  );
}
