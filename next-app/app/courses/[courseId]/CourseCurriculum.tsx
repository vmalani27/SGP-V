'use client';

import { useAuth } from '@/lib/auth-context';
import { computeCurriculumStatus } from '@/lib/curriculum';
import type { ContentModule, ContentCourse, CourseChanges } from '@/lib/content-types';
import CourseAccordion from './CourseAccordion';

export default function CourseCurriculum({
  courseId,
  course,
  modules,
  changes,
}: {
  courseId: string;
  course: ContentCourse;
  modules: ContentModule[];
  changes: CourseChanges;
}) {
  const { getEnrollment } = useAuth();
  const status = computeCurriculumStatus(course, getEnrollment(courseId));
  const activeItemId = status.nextIncomplete?.id ?? null;

  return (
    <>
      {modules.map((mod, modIndex) => (
        <CourseAccordion
          key={mod.id}
          module={mod}
          courseId={courseId}
          moduleIndex={modIndex}
          completedChapterIds={status.completedChapterIds}
          completedLabIds={status.completedLabIds}
          activeItemId={activeItemId}
          changes={changes}
        />
      ))}
    </>
  );
}