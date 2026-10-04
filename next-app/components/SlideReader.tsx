'use client';

import React, { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock, { extractText } from '@/components/CodeBlock';
import DemoTerminal from '@/components/DemoTerminal';
import { api } from '@/lib/api';
import type { TerminalDemoSpec } from '@/lib/demo-directives';
import type { CourseItem } from '@/lib/content-types';

export interface RulerChapter {
  id: string;
  label: string;
  title: string;
  href: string;
  isCurrent: boolean;
  isCompleted?: boolean;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const markdownComponents = {
  pre: CodeBlock,
  h1: ({ children }: { children?: ReactNode }) => {
    const text = extractText(children);
    return (
      <h1
        id={slugify(text)}
        className="text-3xl font-extrabold text-white tracking-tight pb-3 border-b border-white/[0.08] mb-6"
      >
        {children}
      </h1>
    );
  },
  h2: ({ children }: { children?: ReactNode }) => {
    const text = extractText(children);
    return (
      <h2
        id={slugify(text)}
        className="text-xl font-bold text-white tracking-tight mt-10 mb-3 pb-2 border-b border-white/[0.06]"
      >
        {children}
      </h2>
    );
  },
  h3: ({ children }: { children?: ReactNode }) => {
    const text = extractText(children);
    return (
      <h3
        id={slugify(text)}
        className="text-base font-semibold tracking-tight text-white mt-7 mb-2.5"
      >
        {children}
      </h3>
    );
  },
  h4: ({ children }: { children?: ReactNode }) => (
    <h4 className="text-xs font-semibold uppercase tracking-wider text-[#64748b] mt-5 mb-2">{children}</h4>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => (
    <em className="italic text-slate-300">{children}</em>
  ),
  code: ({ children, className }: { children?: ReactNode; className?: string }) => {
    if (className) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="font-mono text-[12.5px] text-[#e2e8f0] bg-[#1e2530] border border-white/[0.08] px-1.5 py-0.5 rounded font-medium shadow-xs">
        {children}
      </code>
    );
  },
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="space-y-2 text-[#cbd5e1] list-disc list-inside marker:text-[#64748b] my-3.5">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal list-inside space-y-2 my-3.5 text-[14.5px] text-[#cbd5e1] leading-relaxed marker:text-[#64748b]">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="text-[14.5px] leading-relaxed text-[#cbd5e1] [&>p]:inline">
      {children}
    </li>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="text-[14.5px] text-[#cbd5e1] leading-relaxed my-3.5">{children}</p>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="my-5 p-4 rounded-lg bg-[#151922] border border-white/[0.08] border-l-4 border-l-slate-400 text-sm text-[#cbd5e1] leading-relaxed [&>p]:my-1">
      {children}
    </blockquote>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="my-5 overflow-x-auto rounded-lg border border-white/[0.08] bg-[#151922]">
      <table className="w-full text-left border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: ReactNode }) => <thead className="bg-[#1c2230] border-b border-white/[0.08]">{children}</thead>,
  tbody: ({ children }: { children?: ReactNode }) => <tbody>{children}</tbody>,
  th: ({ children }: { children?: ReactNode }) => (
    <th className="font-mono text-xs text-white text-left py-2.5 px-3.5 font-semibold uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border-b border-white/[0.05] text-xs font-mono text-[#cbd5e1] py-2.5 px-3.5">
      {children}
    </td>
  ),
  tr: ({ children }: { children?: ReactNode }) => (
    <tr className="hover:bg-white/[0.02] transition-colors">
      {children}
    </tr>
  ),
};

export function getModuleDemoSpec(
  moduleId: string | undefined,
  courseId: string | undefined,
  chapterId: string | undefined,
): TerminalDemoSpec {
  const moduleDefaults: Record<string, { image: string }> = {
    'docker-fundamentals': { image: 'labops-docker:latest' },
    'building-images': { image: 'labops-docker-build:latest' },
    'container-networking': { image: 'labops-docker:latest' },
  };
  const fallback = courseId?.includes('git')
    ? { image: 'labops-git-fundamentals:latest' }
    : { image: 'labops-docker:latest' };
  const resolved = moduleDefaults[moduleId ?? ''] ?? fallback;

  return {
    id: chapterId ? `chapter-${slugify(chapterId)}` : 'chapter-scratchpad',
    image: resolved.image,
    steps: [],
  };
}

export interface SlideReaderProps {
  content: string;
  chapterId?: string;
  courseId?: string;
  moduleId?: string;
  chapterDescription?: string;
  assessment?: unknown;
  prevItem?: CourseItem | null;
  nextItem?: CourseItem | null;
  rulerChapters?: RulerChapter[];
  onPrev?: () => void;
  onComplete?: () => void;
  completeLabel?: string;
  onCompleteIcon?: ReactNode;
}

export default function SlideReader({
  content,
  chapterId,
  courseId,
  moduleId,
  chapterDescription,
  assessment,
  prevItem,
  nextItem,
  rulerChapters = [],
  onPrev,
  onComplete,
  completeLabel,
}: SlideReaderProps) {
  const chapterDemoSpec: TerminalDemoSpec = useMemo(() => {
    return getModuleDemoSpec(moduleId, courseId, chapterId);
  }, [moduleId, courseId, chapterId]);

  // Clean up demo container ONLY when navigating away to a different chapter
  const prevChapterIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevChapterIdRef.current && prevChapterIdRef.current !== chapterId && chapterDemoSpec.id) {
      api.demos.destroy(chapterDemoSpec.id).catch(() => {});
    }
    prevChapterIdRef.current = chapterId;
  }, [chapterId, chapterDemoSpec.id]);

  // Terminal blocks remain backward-compatible while module metadata owns demos.
  const cleanedMarkdown = useMemo(() => {
    return content
      .replace(/:::\s*terminal-demo\s*\r?\n[\s\S]*?\r?\n:::\s*/g, '')
      .replace(/:::\s*evaluation\s*\r?\n[\s\S]*?\r?\n:::\s*/g, '')
      .trim();
  }, [content]);

  const [isTerminalOpen, setIsTerminalOpen] = useState(true);

  // Broadcast terminal status to Navbar whenever it changes
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('chapter-terminal-status', { detail: { isOpen: isTerminalOpen } })
    );
  }, [isTerminalOpen]);

  // Listen for toggle requests from Navbar
  useEffect(() => {
    const handleToggle = (e: Event) => {
      const customEvent = e as CustomEvent<{ isOpen?: boolean }>;
      if (typeof customEvent.detail?.isOpen === 'boolean') {
        setIsTerminalOpen(customEvent.detail.isOpen);
      } else {
        setIsTerminalOpen((prev) => !prev);
      }
    };
    window.addEventListener('toggle-chapter-terminal', handleToggle);
    return () => {
      window.removeEventListener('toggle-chapter-terminal', handleToggle);
    };
  }, []);

  const nextButtonText = useMemo(() => {
    if (completeLabel) return completeLabel;
    if (nextItem && nextItem.type === 'lab') {
      return 'Start Lab →';
    }
    if (nextItem && nextItem.type === 'chapter') {
      return 'Next Chapter →';
    }
    return 'Complete Chapter →';
  }, [completeLabel, nextItem]);

  return (
    <div className="w-full h-full overflow-hidden bg-[#090a0f] relative">
      <div
        className={`h-full w-full overflow-hidden ${
          isTerminalOpen ? 'grid grid-cols-1 lg:grid-cols-2' : 'flex'
        }`}
      >
        {/* Left Column: Continuous Scroll Document */}
        <div
          className={`h-full overflow-y-auto px-10 py-8 scrollbar-thin scrollbar-thumb-zinc-800 bg-[#111318] ${
            isTerminalOpen
              ? 'border-r border-white/[0.08]'
              : 'flex-1 flex justify-center'
          }`}
        >
          <div className={`${isTerminalOpen ? 'max-w-[700px]' : 'max-w-[760px] w-full'} space-y-6`}>
            <article className="w-full min-w-0 space-y-4">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {cleanedMarkdown}
              </ReactMarkdown>
            </article>

            {/* Assessment Section (Mounts only if chapter manifest defines an assessment) */}
            {assessment != null && (
              <div className="mt-8 pt-6 border-t border-white/[0.08] space-y-3">
                <div className="text-xs font-mono font-semibold uppercase tracking-wider text-[#64748b]">
                  Chapter Assessment
                </div>
                <div className="p-4 rounded-lg bg-[#151922] border border-white/[0.08] text-sm text-[#cbd5e1] font-mono">
                  {typeof assessment === 'string' ? assessment : JSON.stringify(assessment, null, 2)}
                </div>
              </div>
            )}

            {/* Bottom Chapter Navigation */}
            <div className="pt-6 mt-8 border-t border-white/[0.08] flex items-center justify-between select-none">
              {onPrev ? (
                <button
                  onClick={onPrev}
                  type="button"
                  className="text-xs text-slate-300 hover:text-white font-mono transition-colors cursor-pointer flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/[0.08] bg-[#181d28] hover:bg-[#202736]"
                >
                  ← Previous
                </button>
              ) : (
                <div />
              )}

              <button
                onClick={onComplete}
                type="button"
                className="bg-white hover:bg-slate-200 text-slate-900 font-semibold text-xs px-4 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                {nextButtonText}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Pinned Terminal Shell (fixed at 50% width on lg screens) */}
        {isTerminalOpen && (
          <div className="h-full overflow-hidden">
            <DemoTerminal
              spec={chapterDemoSpec}
              onClose={() => setIsTerminalOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export { SlideReader as ChapterReader };