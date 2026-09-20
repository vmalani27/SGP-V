'use client';

import React, { useEffect, useMemo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import YAML from 'js-yaml';
import { Zap } from 'lucide-react';
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
        className="text-2xl font-semibold text-zinc-100 tracking-tight pb-2 border-b border-white/[0.06] mb-6"
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
        className="text-base font-medium text-zinc-100 tracking-tight mt-8 mb-3"
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
        className="text-sm font-medium tracking-tight text-zinc-200 mt-6 mb-2"
      >
        {children}
      </h3>
    );
  },
  h4: ({ children }: { children?: ReactNode }) => (
    <h4 className="text-xs font-semibold text-zinc-300 mt-4 mb-1.5">{children}</h4>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-zinc-100">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => (
    <em className="italic text-zinc-200">{children}</em>
  ),
  code: ({ children, className }: { children?: ReactNode; className?: string }) => {
    if (className) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="font-mono text-[12.5px] text-zinc-200 bg-zinc-800/70 border border-white/[0.06] px-1.5 py-0.5 rounded font-normal">
        {children}
      </code>
    );
  },
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="space-y-2 text-zinc-300 list-disc list-inside marker:text-zinc-500 my-3">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal list-inside space-y-2 my-3 text-[14px] text-zinc-300 leading-relaxed marker:text-zinc-500">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="text-[14px] leading-relaxed text-zinc-300 [&>p]:inline">
      {children}
    </li>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="text-[14px] text-zinc-300 leading-relaxed my-3">{children}</p>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="border-l-2 border-zinc-700 bg-zinc-900/40 px-4 py-2.5 my-4 rounded-r text-xs text-zinc-400 leading-relaxed">
      {children}
    </blockquote>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full text-left border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: ReactNode }) => <thead>{children}</thead>,
  tbody: ({ children }: { children?: ReactNode }) => <tbody>{children}</tbody>,
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border-b border-zinc-800 font-mono text-xs text-zinc-400 text-left py-2 px-3 font-semibold uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border-b border-[#202023] text-xs font-mono text-zinc-300 py-2.5 px-3">
      {children}
    </td>
  ),
  tr: ({ children }: { children?: ReactNode }) => (
    <tr className="border-b border-[#202023] hover:bg-zinc-900/30 transition-colors">
      {children}
    </tr>
  ),
};

export function extractChapterDemoSpec(markdown: string, fallbackId: string): TerminalDemoSpec {
  const regex = /:::\s*terminal-demo\s*\r?\n([\s\S]*?)\r?\n:::/g;
  let match: RegExpExecArray | null;
  let id = fallbackId;
  let image = 'labops-docker:latest';
  const prePullSet = new Set<string>();

  while ((match = regex.exec(markdown)) !== null) {
    try {
      const parsed = YAML.load(match[1]) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.id === 'string' && parsed.id.trim()) {
          id = parsed.id.trim();
        }
        if (typeof parsed.image === 'string' && parsed.image.trim()) {
          image = parsed.image.trim();
        }
        if (Array.isArray(parsed.pre_pull)) {
          for (const item of parsed.pre_pull) {
            if (typeof item === 'string' && item.trim()) {
              prePullSet.add(item.trim());
            }
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  return {
    id,
    image,
    pre_pull: prePullSet.size > 0 ? Array.from(prePullSet) : undefined,
    steps: [],
  };
}

export interface SlideReaderProps {
  content: string;
  chapterId?: string;
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
  chapterDescription,
  assessment,
  prevItem,
  nextItem,
  rulerChapters = [],
  onPrev,
  onComplete,
  completeLabel,
}: SlideReaderProps) {
  // Extract persistent demo spec for the terminal shell
  const chapterDemoSpec: TerminalDemoSpec = useMemo(() => {
    return extractChapterDemoSpec(
      content,
      chapterId ? `chapter-${slugify(chapterId)}` : 'chapter-scratchpad'
    );
  }, [content, chapterId]);

  // Clean up demo container on unmount
  useEffect(() => {
    return () => {
      if (chapterDemoSpec.id) {
        api.demos.destroy(chapterDemoSpec.id).catch(() => {});
      }
    };
  }, [chapterDemoSpec.id]);

  // Clean markdown: strip :::terminal-demo and :::evaluation directives to eliminate duplicate task cards
  const cleanedMarkdown = useMemo(() => {
    return content
      .replace(/:::\s*terminal-demo\s*\r?\n[\s\S]*?\r?\n:::\s*/g, '')
      .replace(/:::\s*evaluation\s*\r?\n[\s\S]*?\r?\n:::\s*/g, '')
      .trim();
  }, [content]);

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
    <div className="w-full h-full overflow-hidden bg-[#0b0c0e]">
      <div className="grid grid-cols-1 lg:grid-cols-2 h-full w-full overflow-hidden">
        {/* Left Column: Continuous Scroll Document */}
        <div className="h-full overflow-y-auto px-10 py-8 scrollbar-thin scrollbar-thumb-zinc-800 border-r border-white/[0.06] bg-[#0b0c0e]">
          <div className="max-w-[700px] space-y-6">
            <article className="w-full min-w-0 space-y-4">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {cleanedMarkdown}
              </ReactMarkdown>
            </article>

            {/* Assessment Section (Mounts only if chapter manifest defines an assessment) */}
            {assessment != null && (
              <div id={nextItem?.type === 'lab' ? undefined : 'lab'} className="mt-8 pt-6 border-t border-white/[0.08] space-y-3 scroll-mt-16">
                <div className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-400">
                  Chapter Assessment
                </div>
                <div className="p-4 rounded-lg bg-[#141416] border border-white/[0.06] text-sm text-zinc-300 font-mono">
                  {typeof assessment === 'string' ? assessment : JSON.stringify(assessment, null, 2)}
                </div>
              </div>
            )}

            {/* Hands-on Lab Challenge Card if next item is a lab */}
            {nextItem && nextItem.type === 'lab' && (
              <div id="lab" className="mt-8 pt-6 border-t border-white/[0.08] space-y-3 scroll-mt-16">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono font-semibold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" /> Hands-On Lab Challenge
                  </div>
                  <span className="text-[11px] font-mono text-zinc-500">Evaluated Task</span>
                </div>
                <div className="p-4 rounded-lg bg-[#141416] border border-sky-900/30 text-sm text-zinc-300">
                  <div className="font-medium text-zinc-100">{nextItem.title}</div>
                  <p className="text-xs text-zinc-400 mt-1">
                    Ready to test your skills? Launch the interactive lab environment to begin the practical assessment.
                  </p>
                  <div className="mt-4 flex items-center">
                    <button
                      onClick={onComplete}
                      type="button"
                      className="bg-sky-500 hover:bg-sky-400 text-zinc-950 font-medium text-xs px-3.5 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Zap className="w-3 h-3 fill-current" /> Start Lab Challenge
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Chapter Navigation */}
            <div className="pt-6 mt-8 border-t border-white/[0.06] flex items-center justify-between select-none">
              {onPrev ? (
                <button
                  onClick={onPrev}
                  type="button"
                  className="text-xs text-zinc-400 hover:text-zinc-200 font-mono transition-colors cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/[0.06] hover:bg-white/[0.04]"
                >
                  ← Previous
                </button>
              ) : (
                <div />
              )}

              <button
                onClick={onComplete}
                type="button"
                className="bg-white text-zinc-950 font-medium text-xs px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                {nextButtonText}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Pinned Terminal Shell (fixed at 50% width on lg screens) */}
        <div className="h-full bg-black/90 p-4 flex flex-col overflow-hidden">
          <DemoTerminal spec={chapterDemoSpec} />
        </div>
      </div>
    </div>
  );
}

export { SlideReader as ChapterReader };