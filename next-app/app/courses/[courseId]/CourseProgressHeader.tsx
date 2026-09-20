'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import type { ContentCourse } from '@/lib/content-types';
import { itemHref } from '@/lib/content-utils';
import { computeCurriculumStatus } from '@/lib/curriculum';

export default function CourseProgressHeader({
  courseId,
  course,
  firstItemHref,
}: {
  courseId: string;
  course: ContentCourse;
  firstItemHref: string;
}) {
  const { getEnrollment } = useAuth();
  const enrollment = getEnrollment(courseId);
  const status = computeCurriculumStatus(course, enrollment);
  const percentage = status.totalItems > 0
    ? Math.min(100, Math.round((status.completedCount / status.totalItems) * 100))
    : (enrollment?.percentage ?? 0);
  const hasProgress = status.completedCount > 0 || percentage > 0;

  let ctaHref = firstItemHref;
  let ctaLabel = 'Start Learning';
  if (status.nextIncomplete) {
    ctaHref = itemHref(courseId, status.nextIncomplete);
    ctaLabel = `Resume: ${status.nextIncomplete.title}`;
  } else if (hasProgress) {
    ctaLabel = 'Continue Learning';
  }

  return (
    <section className="border-b border-zinc-800 bg-[#09090b] pt-[56px]">
      <div className="mx-auto max-w-6xl px-6 py-6 md:px-8">
        {/* Title Row + Action */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="min-w-0">
            <h1 className="hero-font text-2xl font-bold tracking-tight text-zinc-100">
              {course.title}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400 truncate">
              {course.description}
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end shrink-0">
            <Link
              href={ctaHref}
              className="flex shrink-0 items-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-white active:scale-95"
            >
              <span>{ctaLabel}</span>
              <span className="text-zinc-500">→</span>
            </Link>
          </div>
        </div>

        {/* Single Integrated Progress Bar */}
        {hasProgress && (
          <div className="mt-6 flex items-center gap-4">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-zinc-200 transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="shrink-0 font-mono text-xs text-zinc-500">
              {status.completedCount} / {status.totalItems} ({percentage}%)
            </span>
          </div>
        )}
      </div>
    </section>
  );
}