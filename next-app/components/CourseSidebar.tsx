'use client';

import Link from 'next/link';
import type { ContentModule, Chapter } from '@/lib/content-types';

function ChapterIcon({ isCurrent }: { isCurrent: boolean }) {
  const color = isCurrent ? 'text-accent' : 'text-muted';
  return (
    <svg className={`h-4 w-4 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

export default function CourseSidebar({
  modules,
  courseId,
  currentChapterId,
}: {
  modules: ContentModule[];
  courseId: string;
  currentChapterId?: string;
}) {
  return (
    <div className="sticky top-24 rounded-xl border border-line bg-panel p-6">
      <h3 className="mb-4 text-sm font-semibold text-text">Course Content</h3>
      <div className="space-y-4">
        {modules.map((module, modIdx) => (
          <div key={module.id}>
            <div className="mb-2 text-xs font-semibold text-muted">
              Module {modIdx + 1}: {module.title}
            </div>
            <div className="space-y-0.5">
              {module.chapters.map((ch) => {
                const isCurrent = ch.id === currentChapterId;
                return (
                  <Link
                    key={ch.id}
                    href={`/courses/${courseId}/chapters/${ch.id}`}
                    className={`flex items-center gap-2 rounded px-3 py-2 text-sm transition ${
                      isCurrent
                        ? 'bg-accent/10 text-accent'
                        : 'text-muted hover:bg-panel/50 hover:text-text'
                    }`}
                  >
                    <ChapterIcon isCurrent={isCurrent} />
                    <span className="truncate">{ch.title}</span>
                    {isCurrent && (
                      <svg className="ml-auto h-3 w-3 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m9 12.75 1.214-1.215a3 3 0 0 1 4.243 0l.179.178a3 3 0 0 1 0 4.243l-2.65 2.65a3 3 0 0 1-4.243 0l-.179-.178a3 3 0 0 1 0-4.243Z" />
                      </svg>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
