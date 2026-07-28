'use client';

import Link from 'next/link';
import type { ContentCourse } from '@/lib/content-types';

export default function PlayerSidebar({
  course,
  courseId,
  currentChapterId,
  completedChapterIds = [],
  onToggle,
}: {
  course: ContentCourse;
  courseId: string;
  currentChapterId?: string;
  completedChapterIds?: string[];
  onToggle?: () => void;
}) {
  const allItems = course.modules.flatMap((mod) =>
    mod.chapters.map((ch) => ({
      type: 'chapter' as const,
      id: ch.id,
      title: ch.title,
      moduleId: mod.id,
      moduleTitle: mod.title,
    }))
  );

  const currentIdx = allItems.findIndex((item) => item.id === currentChapterId);

  return (
    <div className="flex h-full flex-col overflow-y-auto border-r border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-xs font-semibold text-muted">Course Content</span>
        {onToggle && (
          <button
            onClick={onToggle}
            className="rounded p-1 text-muted hover:bg-line/20 hover:text-text transition"
            title="Close sidebar"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-5">
        {course.modules.map((mod, modIdx) => {
          const modItems = allItems.filter((item) => item.moduleId === mod.id);
          const modCompleted = modItems.filter(
            (item) => item.type === 'chapter' && completedChapterIds.includes(item.id)
          ).length;

          return (
            <div key={mod.id} className="mb-5">
              <div className="mb-1.5 flex items-center justify-between px-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted/50">
                  {modIdx + 1}. {mod.title}
                </span>
                {modCompleted > 0 && (
                  <span className="text-[10px] text-muted/40 tabular-nums">
                    {modCompleted}/{mod.chapters.length}
                  </span>
                )}
              </div>

              <div className="space-y-px">
                {modItems.map((item, idx) => {
                  const globalIdx = allItems.findIndex((i) => i.id === item.id);
                  const isCurrent = item.id === currentChapterId;
                  const isCompleted = item.type === 'chapter' && completedChapterIds.includes(item.id);
                  const isBefore = globalIdx < currentIdx;
                  const isLocked = !isCurrent && !isCompleted && !isBefore && currentIdx !== -1;

                  const href = `/courses/${courseId}/chapters/${item.id}`;

                  return (
                    <Link
                      key={item.id}
                      href={href}
                      className={`flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] transition ${
                        isCurrent
                          ? 'bg-accent/10 text-accent font-medium'
                          : isLocked
                          ? 'text-muted/30 pointer-events-none'
                          : isCompleted
                          ? 'text-muted/70 hover:text-text hover:bg-line/10'
                          : 'text-muted hover:text-text hover:bg-line/10'
                      }`}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          isCurrent
                            ? 'bg-accent text-bg'
                            : isCompleted
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-line/15 text-muted/50'
                        }`}>
                          {isCompleted ? (
                            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                          ) : (
                            idx + 1
                          )}
                        </span>

                      <span className="truncate">{item.title}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
