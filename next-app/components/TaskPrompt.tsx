'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';
import type { LabTask } from '@/lib/task-types';

/**
 * Normalizes folded YAML prompt text (e.g. from `>-` scalars) back into
 * clean markdown lists and blocks so bullet points and steps render properly.
 */
export function normalizeTaskPrompt(prompt: string): string {
  if (!prompt) return '';

  let text = prompt.trim();

  // 1. Preserve code blocks from regex transformations
  const codeBlocks: string[] = [];
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // 2. Restore folded bullet lists:
  // e.g. "requirements: - Item 1 - Item 2" or "constraints. - Next item"
  text = text.replace(/:\s*-\s+/g, ':\n\n- ');
  text = text.replace(/([.?!`a-zA-Z0-9])\s+-\s+([A-Z`*])/g, '$1\n\n- $2');

  // 3. Restore folded numbered lists:
  // e.g. "steps: 1. Do this 2. Do that"
  text = text.replace(/:\s*1\.\s+/g, ':\n\n1. ');
  text = text.replace(/([.?!`a-zA-Z0-9])\s+(\d+)\.\s+([A-Z`*])/g, '$1\n\n$2. $3');

  // 4. Ensure single newlines before bullet/number lists are double newlines for markdown list parsing
  text = text.replace(/([^\n])\n(-|\d+\.)\s+/g, '$1\n\n$2 ');

  // 5. Re-inject preserved code blocks
  text = text.replace(/__CODE_BLOCK_(\d+)__/g, (_, idx) => {
    return codeBlocks[Number(idx)] || '';
  });

  return text;
}

interface TaskPromptProps {
  task: LabTask;
  className?: string;
}

export default function TaskPrompt({ task, className = '' }: TaskPromptProps) {
  const normalizedPrompt = normalizeTaskPrompt(task.prompt);

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Task Summary / Title (clean, no jargon badges) */}
      {task.summary && (
        <h3 className="text-base font-medium text-zinc-100 tracking-tight leading-snug">
          {task.summary}
        </h3>
      )}

      {/* Clean Structured Task Content */}
      <div className="text-zinc-400 font-sans text-sm leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <p className="mb-2 text-sm text-zinc-400 font-sans leading-relaxed last:mb-0">
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul className="my-2.5 space-y-1.5 list-none p-0">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="my-2.5 space-y-1.5 list-none p-0">
                {children}
              </ol>
            ),
            li: ({ children }) => {
              return (
                <li className="flex items-start gap-2 text-sm leading-relaxed text-zinc-400">
                  <span className="text-zinc-600 select-none">•</span>
                  <div className="flex-1 min-w-0 font-sans">
                    {children}
                  </div>
                </li>
              );
            },
            code: ({ inline, className: codeClassName, children }: { inline?: boolean; className?: string; children?: React.ReactNode }) => {
              const hasLanguage = codeClassName?.includes('language-');
              if (inline || !hasLanguage) {
                return (
                  <code className="bg-zinc-800/90 text-zinc-200 border border-white/[0.08] font-mono text-xs px-1.5 py-0.5 rounded">
                    {children}
                  </code>
                );
              }
              return (
                <code className={codeClassName}>
                  {children}
                </code>
              );
            },
            pre: CodeBlock,
            strong: ({ children }) => (
              <strong className="font-semibold text-zinc-100 tracking-tight">
                {children}
              </strong>
            ),
            blockquote: ({ children }) => (
              <blockquote className="my-2 border-l-2 border-zinc-600 bg-zinc-800/40 px-3 py-1.5 rounded-r text-sm text-zinc-300 italic">
                {children}
              </blockquote>
            ),
            table: ({ children }) => (
              <div className="my-2.5 overflow-x-auto rounded-lg border border-white/[0.08]">
                <table className="w-full text-left text-xs border-collapse">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-zinc-900/80 border-b border-white/[0.08] text-zinc-200 font-semibold font-mono text-xs">
                {children}
              </thead>
            ),
            th: ({ children }) => (
              <th className="px-3 py-1.5 text-zinc-200 font-semibold">{children}</th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-1.5 border-t border-white/[0.06] text-zinc-400 font-mono text-xs">
                {children}
              </td>
            ),
          }}
        >
          {normalizedPrompt}
        </ReactMarkdown>
      </div>
    </div>
  );
}
