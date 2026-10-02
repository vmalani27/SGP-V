'use client';

import { useState, useEffect } from 'react';
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

  // Automatically close hints & solution whenever task changes
  useEffect(() => {
    setRevealed(0);
    setShowSolution(false);
  }, [task.id]);

  const hints = task.hints ?? (task.hint ? [task.hint] : []);
  const solution = task.solution?.command;
  const allHintsShown = revealed >= hints.length;

  if (hints.length === 0 && !solution) return null;

  return (
    <div className="space-y-3 pt-2">
      <p className="text-xs text-zinc-500 font-mono">Need help?</p>

      {hints.slice(0, revealed).map((hint, i) => (
        <div key={i} className="relative p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-amber-200 font-medium">Hint {i + 1}:</p>
            <button
              type="button"
              onClick={() => setRevealed(i)}
              className="text-amber-400/60 hover:text-amber-300 text-xs px-1 rounded transition-colors cursor-pointer"
              title="Close hint"
            >
              ✕
            </button>
          </div>
          <RichText content={hint} size="xs" className="prose-amber" />
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        {!allHintsShown && (
          <button
            type="button"
            onClick={() => setRevealed(revealed + 1)}
            className="px-3 py-1.5 bg-zinc-900/80 border border-white/[0.08] hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            {revealed === 0 ? 'Hint 1' : `Hint ${revealed + 1}`}
          </button>
        )}
        {allHintsShown && solution && (
          <button
            type="button"
            onClick={() => setShowSolution((prev) => !prev)}
            className="px-3 py-1.5 bg-zinc-900/80 border border-white/[0.08] hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            {showSolution ? 'Hide Solution' : 'Show Solution'}
          </button>
        )}
      </div>

      {showSolution && solution && (
        <div className="relative p-3 rounded-lg bg-[#16171b]/60 border border-white/[0.05]">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-zinc-500 font-mono">Solution</p>
            <button
              type="button"
              onClick={() => setShowSolution(false)}
              className="text-zinc-500 hover:text-zinc-300 text-xs px-1 rounded transition-colors cursor-pointer"
              title="Close solution"
            >
              ✕
            </button>
          </div>
          <pre className="text-xs font-mono text-zinc-200 whitespace-pre-wrap break-all leading-relaxed">{solution}</pre>
        </div>
      )}
    </div>
  );
}
