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

export default function LabBriefing({
  meta,
  onStart,
}: {
  meta: LabMeta;
  ordinal?: string;
  moduleTitle?: string;
  env: LabEnv;
  tasks: LabTask[];
  onStart: () => void;
}) {
  const checkpoints =
    Array.isArray(meta.objectives) && meta.objectives.length > 0
      ? meta.objectives
      : ['Complete the lab tasks in the runner.'];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#090a0f]">
      <div className="min-h-0 flex-1 overflow-y-auto px-10 py-12">
        <div className="mx-auto w-full max-w-3xl space-y-8">
          {/* Main Title & Metadata Row */}
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white font-heading pb-3 border-b border-white/[0.08] mb-4">
              {meta.title}
            </h1>

            <div className="flex items-center gap-3 font-mono text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="text-zinc-500">DIFFICULTY:</span>
                <span className="font-medium text-emerald-400">
                  {meta.difficulty.toUpperCase()}
                </span>
              </span>
              <span className="text-zinc-700">•</span>
              <span className="flex items-center gap-1.5">
                <span className="text-zinc-500">EST:</span>
                <span className="font-medium text-zinc-200">{meta.estimated_time} MIN</span>
              </span>
            </div>
          </div>

          {meta.summary && (
            <p className="text-base leading-relaxed text-[#cbd5e1] font-sans">
              {meta.summary.trim()}
            </p>
          )}

          {/* Objectives Card */}
          <div className="rounded-xl border border-white/[0.08] bg-[#111317] p-6">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Lab Objectives
            </span>
            <ul className="mt-4 space-y-3.5">
              {checkpoints.map((checkpoint) => (
                <li key={checkpoint} className="flex items-start gap-3">
                  <span className="mt-0.5 select-none font-mono text-xs font-semibold text-zinc-400">
                    &gt;
                  </span>
                  <span className="text-sm font-normal leading-relaxed text-zinc-200">
                    {cleanText(checkpoint)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Action Button */}
          <div>
            <button
              type="button"
              onClick={onStart}
              className="flex items-center gap-2 rounded-lg bg-zinc-100 px-5 py-2.5 font-mono text-xs font-medium text-zinc-950 transition-colors hover:bg-white active:scale-[0.99] cursor-pointer shadow-sm"
            >
              <span>&gt;_</span>
              <span>Start Environment</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}