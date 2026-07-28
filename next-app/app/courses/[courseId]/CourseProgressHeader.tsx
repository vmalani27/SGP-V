'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import type { ContentCourse } from '@/lib/content-types';

export default function CourseProgressHeader({
  courseId,
  course,
  firstChapterHref,
}: {
  courseId: string;
  course: ContentCourse;
  firstChapterHref: string;
}) {
  const { getEnrollment } = useAuth();
  const enrollment = getEnrollment(courseId);

  const percentage = enrollment?.percentage ?? 0;
  const hasProgress = percentage > 0;

  const completedChapterIds: string[] = [];
  if (enrollment?.progress) {
    for (const modVal of Object.values(enrollment.progress)) {
      if (modVal && typeof modVal === 'object') {
        for (const [chId, status] of Object.entries(modVal as Record<string, unknown>)) {
          if (status === 'completed') completedChapterIds.push(chId);
        }
      }
    }
  }

  let continueHref = firstChapterHref;
  if (hasProgress) {
    const allChapters = course.modules.flatMap((mod) => mod.chapters);
    const nextIncomplete = allChapters.find((ch) => !completedChapterIds.includes(ch.id));
    if (nextIncomplete) {
      continueHref = `/courses/${courseId}/chapters/${nextIncomplete.id}`;
    }
  }

  return (
    <section className="border-b border-line bg-panel/30">
      <div className="mx-auto max-w-6xl px-6 py-6 pt-24">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex-1">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-full bg-accent/10 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-accent">
                {course.level}
              </span>
              {hasProgress && (
                <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                  {percentage}%
                </span>
              )}
            </div>
            <h1 className="hero-font text-2xl font-bold md:text-3xl">{course.title}</h1>
            <p className="mt-2 max-w-xl text-sm text-muted line-clamp-2">{course.description}</p>

            {hasProgress && (
              <div className="mt-4 max-w-md">
                <div className="mb-1 flex items-center justify-between text-xs text-muted">
                  <span>{percentage}% complete</span>
                  <span className="font-medium text-accent">{percentage}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <Link
                href={continueHref}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent/90"
              >
                {hasProgress ? 'Continue Learning' : 'Start Learning'}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
