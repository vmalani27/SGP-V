'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import type { ContentCourse } from '@/lib/content-types';
import { itemHref } from '@/lib/content-server';
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
  const percentage = enrollment?.percentage ?? 0;
  const hasProgress = percentage > 0;

  let ctaHref = firstItemHref;
  let ctaLabel = 'Start Learning';
  if (status.nextIncomplete) {
    ctaHref = itemHref(courseId, status.nextIncomplete);
    ctaLabel = `Resume: ${status.nextIncomplete.title}`;
  } else if (hasProgress) {
    ctaLabel = 'Continue Learning';
  }

  return (
    <section className="border-b border-line bg-panel/30">
      <div className="mx-auto max-w-6xl px-6 py-6 pt-24">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-sm border border-line px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted">
                {course.level}
              </span>
              {hasProgress && (
                <span className="rounded-sm border border-line px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted">
                  {status.completedCount}/{status.totalItems} completed
                </span>
              )}
            </div>

            <h1 className="hero-font text-2xl font-bold tracking-tight text-text md:text-3xl">
              {course.title}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted line-clamp-2">{course.description}</p>

            {hasProgress && (
              <div className="mt-4 max-w-md">
                <div className="mb-1 flex items-center justify-between font-mono text-[11px] text-muted">
                  <span>
                    {status.completedCount} of {status.totalItems} completed
                  </span>
                  <span className="tabular-nums text-text">{percentage}%</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-text/70 transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <Link
            href={ctaHref}
            className="group inline-flex shrink-0 items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:bg-accent/90"
          >
            {ctaLabel}
            <svg
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}