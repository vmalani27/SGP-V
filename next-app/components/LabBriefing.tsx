'use client';

import type { LabMeta, LabTask } from '@/lib/task-types';

interface LabEnv {
  image: string;
  apt_packages: string[];
  pre_pull: string[];
  setup: unknown[];
}

function cleanText(value: string): string {
  return value.replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();
}

function deriveBrief(objectives: string[]): string {
  const [head, ...rest] = objectives.map(cleanText).filter(Boolean);
  if (!head) return '';
  const brief = head.charAt(0).toUpperCase() + head.slice(1).replace(/\.$/, '');
  const tail = rest.slice(0, 2);
  if (tail.length === 0) return brief;
  const joined =
    tail.length === 1 ? tail[0] : `${tail[0].replace(/\.$/, '')}, and ${tail[1]}`;
  return `${brief}. You will ${joined}.`;
}

export default function LabBriefing({
  meta,
  env,
  tasks,
  onStart,
}: {
  meta: LabMeta;
  ordinal?: string;
  moduleTitle?: string;
  env: LabEnv;
  tasks: LabTask[];
  onStart: () => void;
}) {
  const brief = meta.summary?.trim() || deriveBrief(meta.objectives);
  const checkpoints =
    Array.isArray(meta.objectives) && meta.objectives.length > 0
      ? meta.objectives
      : ['Complete the lab tasks in the runner.'];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg">
      <div className="min-h-0 flex-1 overflow-y-auto px-10 py-10">
        <div className="mx-auto w-full max-w-3xl space-y-7">
          {/* Main Title & Compact Metadata Row */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-text">
              {meta.title}
            </h1>

            <div className="mt-3 flex items-center gap-3 font-mono text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="text-muted/60">DIFFICULTY:</span>
                <span className="font-medium text-emerald-400">
                  {meta.difficulty.toUpperCase()}
                </span>
              </span>
              <span className="text-line">•</span>
              <span className="flex items-center gap-1.5">
                <span className="text-muted/60">EST:</span>
                <span className="text-text">{meta.estimated_time} MIN</span>
              </span>
            </div>
          </div>

          {/* Scannable High-Level Brief */}
          <p className="text-base leading-relaxed text-text/80">{brief}</p>

          {/* Checkpoints Card */}
          <div className="rounded-lg border border-line bg-panel/50 p-6">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted">
              Lab Checkpoints
            </span>
            <ul className="mt-4 space-y-3">
              {checkpoints.map((checkpoint) => (
                <li key={checkpoint} className="flex items-start gap-3">
                  <span className="mt-0.5 select-none font-mono text-xs font-bold text-accent">
                    &gt;
                  </span>
                  <span className="text-sm font-medium leading-relaxed text-text">
                    {cleanText(checkpoint)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Compact Action Bar */}
          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={onStart}
              className="flex items-center gap-2 rounded bg-accent px-4 py-2 font-mono text-xs font-semibold text-bg shadow-sm transition-all hover:bg-accentStrong active:scale-[0.98]"
            >
              <span>&gt;_</span>
              <span>Start Lab Environment</span>
            </button>

            <span className="font-mono text-xs text-muted/60">
              This will just take a jiffy
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}