'use client';

import { useState } from 'react';
import type { LabTask, TaskStatus } from '@/lib/task-types';
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
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Task</p>
        <RichText content={task.prompt} />
      </div>

      <div className="space-y-2">
        {options.map((option) => {
          const isSelected = selected === option;
          const isCorrect = status === 'correct' && isSelected;
          const isWrong = status === 'incorrect' && isSelected;
          return (
            <button
              key={option}
              onClick={() => setSelected(option)}
              disabled={status === 'correct'}
              className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors
                ${isCorrect ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                  : isWrong ? 'border-red-500 bg-red-500/10 text-red-300'
                  : isSelected ? 'border-amber-500 bg-amber-500/10 text-text'
                  : 'border-gray-700 bg-transparent text-muted hover:border-gray-600 hover:text-text'
                }
                ${status === 'correct' ? 'cursor-default' : 'cursor-pointer'}
              `}
            >
              <span className="flex items-center gap-3">
                <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0
                  ${isCorrect ? 'border-emerald-500 bg-emerald-500'
                    : isSelected ? 'border-amber-500'
                    : 'border-gray-600'
                  }`}
                >
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
                {option}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <RichText content={error} size="sm" className="prose-error" />
        </div>
      )}

      {status !== 'correct' && (
        <button
          onClick={handleSubmit}
          disabled={!selected}
          className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Check Answer
        </button>
      )}

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
