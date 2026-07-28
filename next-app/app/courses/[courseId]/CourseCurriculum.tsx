'use client';

import { useAuth } from '@/lib/auth-context';
import type { ContentModule } from '@/lib/content-types';
import CourseAccordion from './CourseAccordion';

export default function CourseCurriculum({
  courseId,
  modules,
}: {
  courseId: string;
  modules: ContentModule[];
}) {
  const { getEnrollment } = useAuth();
  const enrollment = getEnrollment(courseId);

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

  return (
    <>
      {modules.map((mod, modIndex) => (
        <CourseAccordion
          key={mod.id}
          module={mod}
          courseId={courseId}
          moduleIndex={modIndex}
          completedChapterIds={completedChapterIds}
        />
      ))}
    </>
  );
}
