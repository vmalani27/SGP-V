'use client';

import Link from 'next/link';
import type { ContentCourse, CourseItem } from '@/lib/content-types';
import { getModuleItems, getAllItems, itemHref } from '@/lib/content-server';

function ClipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8l-4 4 4 4M17 8l4 4-4 4M14 4l-4 16" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v6m0 0l-2.5-2.5M12 13l2.5-2.5M4 17V5a2 2 0 0 1 2-2h8l6 6v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

export default function PlayerSidebar({
  course,
  courseId,
  currentItemId,
  completedChapterIds = [],
  completedLabIds = [],
  onToggle,
}: {
  course: ContentCourse;
  courseId: string;
  currentItemId?: string;
  completedChapterIds?: string[];
  completedLabIds?: string[];
  onToggle?: () => void;
}) {
  const allItems = getAllItems(course);
  const currentIdx = allItems.findIndex((item) => item.id === currentItemId);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-panel text-text select-none">
      {/* Sidebar Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-4">
        <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted">
          Course Content
        </span>
        {onToggle && (
          <button
            onClick={onToggle}
            className="rounded p-1 text-muted transition hover:bg-line/20 hover:text-text"
            title="Close sidebar (ESC)"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Module & Item List */}
      <div className="flex-1 overflow-y-auto divide-y divide-line/30">
        {course.modules.map((mod, modIdx) => {
          const modItems = getModuleItems(mod);
          const modCompleted = modItems.filter((item) =>
            item.type === 'lab'
              ? completedLabIds.includes(item.id)
              : completedChapterIds.includes(item.id)
          ).length;

          return (
            <div key={mod.id} className="py-2.5">
              {/* Module Header */}
              <div className="mb-1 flex items-center justify-between px-4 py-1 font-mono text-[11px]">
                <span className="truncate font-semibold uppercase tracking-wider text-muted">
                  {modIdx + 1}. {mod.title}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted/60 tabular-nums">
                  {modCompleted}/{modItems.length}
                </span>
              </div>

              {/* Items */}
              <div className="space-y-px">
                {modItems.map((item) => {
                  const globalIdx = allItems.findIndex((i) => i.id === item.id);
                  const isCurrent = item.id === currentItemId;
                  const isCompleted =
                    item.type === 'lab'
                      ? completedLabIds.includes(item.id)
                      : completedChapterIds.includes(item.id);
                  const isBefore = globalIdx < currentIdx;
                  const isLocked = !isCurrent && !isCompleted && !isBefore && currentIdx !== -1;

                  const href = itemHref(courseId, item);
                  const isLab = item.type === 'lab';

                  return (
                    <Link
                      key={`${item.type}-${item.id}`}
                      href={href}
                      className={`group flex items-center gap-2.5 border-l-2 py-2 pl-4 pr-3 transition ${
                        isCurrent
                          ? 'border-accent bg-line/10 font-medium text-text'
                          : isLocked
                          ? 'border-transparent text-muted/30 pointer-events-none'
                          : 'border-transparent text-muted hover:bg-line/10 hover:text-text'
                      }`}
                    >
                      {/* Icon */}
                      <span
                        className={`shrink-0 ${
                          isCompleted
                            ? 'text-emerald-400/80'
                            : isCurrent
                            ? 'text-accent'
                            : 'text-muted/60 group-hover:text-text'
                        }`}
                      >
                        {isLab ? <ClipIcon className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />}
                      </span>

                      {/* Title */}
                      <span
                        className={`min-w-0 flex-1 truncate text-xs ${
                          isCurrent
                            ? 'text-text font-medium'
                            : isCompleted
                            ? 'text-muted'
                            : 'text-text'
                        }`}
                      >
                        {item.title}
                      </span>

                      {/* Completed Checkmark */}
                      {isCompleted && (
                        <CheckIcon className="h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
                      )}
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