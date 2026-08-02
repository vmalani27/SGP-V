'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ContentModule, Chapter, ContentLab } from '@/lib/content-types';

function ChapterRow({
  chapter,
  courseId,
  index,
  isCompleted,
}: {
  chapter: Chapter;
  courseId: string;
  index: number;
  isCompleted: boolean;
}) {
  const href = `/courses/${courseId}/chapters/${chapter.id}`;

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-line/10"
    >
      {/* Step indicator */}
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
        isCompleted
          ? 'bg-emerald-500/15 text-emerald-400'
          : 'bg-line/20 text-muted group-hover:bg-accent/10 group-hover:text-accent'
      }`}>
        {isCompleted ? (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        ) : (
          index + 1
        )}
      </div>

      {/* Title + progress */}
      <div className="flex flex-1 items-center justify-between min-w-0">
        <span className={`text-sm truncate transition ${
          isCompleted ? 'text-muted' : 'text-text group-hover:text-accent'
        }`}>
          {chapter.title}
        </span>
      </div>
    </Link>
  );
}

function LabRow({
  lab,
  courseId,
  isCompleted,
}: {
  lab: ContentLab;
  courseId: string;
  isCompleted: boolean;
}) {
  const href = `/courses/${courseId}/labs/${lab.id}`;

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-line/10"
    >
      {/* Icon */}
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition ${
        isCompleted
          ? 'bg-emerald-500/15 text-emerald-400'
          : 'bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20'
      }`}>
        {isCompleted ? (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        )}
      </div>

      <div className="flex flex-1 items-center justify-between min-w-0">
        <span className={`text-sm truncate transition ${
          isCompleted ? 'text-muted' : 'text-text group-hover:text-accent'
        }`}>
          {lab.title}
        </span>
        <span className="ml-2 text-[11px] font-medium text-amber-400/70 shrink-0">
          LAB
        </span>
      </div>
    </Link>
  );
}

export default function CourseAccordion({
  module,
  courseId,
  moduleIndex,
  completedChapterIds = [],
  completedLabIds = [],
}: {
  module: ContentModule;
  courseId: string;
  moduleIndex: number;
  completedChapterIds?: string[];
  completedLabIds?: string[];
}) {
  const [isOpen, setIsOpen] = useState(moduleIndex === 0);

  const completedCount = module.chapters.filter((ch) => completedChapterIds.includes(ch.id)).length;
  const totalChapters = module.chapters.length;
  const totalItems = totalChapters + (module.labs?.length ?? 0);
  const progress = totalItems > 0 ? (completedCount / totalItems) * 100 : 0;

  return (
    <div className="rounded-xl border border-line bg-panel overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-line/5"
      >
        {/* Module number with progress ring */}
        <div className="relative h-9 w-9 shrink-0">
          <svg className="h-9 w-9 -rotate-90" viewBox="0 0 36 36">
            <circle
              cx="18" cy="18" r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-line/30"
            />
            <circle
              cx="18" cy="18" r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={`${progress * 0.942} 100`}
              strokeLinecap="round"
              className={progress === 100 ? 'text-emerald-500' : 'text-accent'}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-text">
            {moduleIndex + 1}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text truncate">{module.title}</h3>
          {isOpen && (
            <p className="mt-0.5 text-xs text-muted line-clamp-1">{module.description}</p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {completedCount > 0 && (
            <span className={`text-xs font-medium tabular-nums ${
              completedCount === totalChapters ? 'text-emerald-400' : 'text-muted'
            }`}>
              {completedCount}/{totalChapters}
            </span>
          )}
          <svg
            className={`h-4 w-4 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-line/50 px-5 pb-2">
          {/* Chapters */}
          <div className="space-y-0.5 pt-1">
            {module.chapters.map((ch, idx) => (
              <ChapterRow
                key={ch.id}
                chapter={ch}
                courseId={courseId}
                index={idx}
                isCompleted={completedChapterIds.includes(ch.id)}
              />
            ))}
          </div>

          {/* Labs */}
          {module.labs && module.labs.length > 0 && (
            <div className="mt-2 border-t border-line/30 pt-2">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted/60">
                Hands-on Labs
              </p>
              <div className="space-y-0.5">
                {module.labs.map((lab) => (
                  <LabRow
                    key={lab.id}
                    lab={lab}
                    courseId={courseId}
                    isCompleted={completedLabIds.includes(lab.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
