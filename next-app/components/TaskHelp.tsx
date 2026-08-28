'use client';

import { useState } from 'react';
import type { LabTask } from '@/lib/task-types';
import RichText from './RichText';

interface TaskHelpProps {
  task: LabTask;
}

/**
 * Progressive guidance ladder: reveal one hint at a time, then a final
 * solution command only as an explicit last-resort escalation. Hints steer
 * the student toward the concept/tool, never hand them the answer.
 */
export default function TaskHelp({ task }: TaskHelpProps) {
  const [revealed, setRevealed] = useState(0);
  const [showSolution, setShowSolution] = useState(false);

  const hints = task.hints ?? (task.hint ? [task.hint] : []);
  const solution = task.solution?.command;
  const allHintsShown = revealed >= hints.length;

  if (hints.length === 0 && !solution) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Need help?</p>

      {hints.slice(0, revealed).map((hint, i) => (
        <div key={i} className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <p className="text-xs text-amber-200 font-medium mb-1">Hint {i + 1}:</p>
          <RichText content={hint} size="xs" className="prose-amber" />
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        {!allHintsShown && (
          <button
            onClick={() => setRevealed(revealed + 1)}
            className="px-3 py-1.5 bg-gray-700/40 hover:bg-gray-700/60 text-muted hover:text-text rounded-lg text-xs font-medium transition-colors"
          >
            {revealed === 0 ? 'Hint 1' : `Hint ${revealed + 1}`}
          </button>
        )}
        {allHintsShown && solution && (
          <button
            onClick={() => setShowSolution(true)}
            disabled={showSolution}
            className="px-3 py-1.5 bg-gray-800 border border-gray-700 hover:border-gray-600 text-muted hover:text-text rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          >
            Show Solution
          </button>
        )}
      </div>

      {showSolution && solution && (
        <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
          <p className="text-xs text-muted mb-1">Solution</p>
          <pre className="text-sm text-text whitespace-pre-wrap break-all leading-relaxed">{solution}</pre>
        </div>
      )}
    </div>
  );
}
