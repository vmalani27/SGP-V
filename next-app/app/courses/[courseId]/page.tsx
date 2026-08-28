import { notFound } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { getCourse, getAllItems, itemHref } from '@/lib/content-server';
import { getCourseChanges } from '@/lib/content-local';
import CourseProgressHeader from './CourseProgressHeader';
import CourseCurriculum from './CourseCurriculum';
import CourseSidebar from './CourseSidebar';

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const course = await getCourse(courseId);
  if (!course) return notFound();

  const allItems = getAllItems(course);
  const firstItem = allItems[0];

  const firstItemHref = firstItem ? itemHref(courseId, firstItem) : '#';

  const changes = await getCourseChanges(courseId);

  return (
    <main className="min-h-screen bg-bg text-text">
      <Navbar
        breadcrumb={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: course.title },
        ]}
      />

      <CourseProgressHeader
        courseId={courseId}
        course={course}
        firstItemHref={firstItemHref}
      />

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-5">
              <CourseSidebar course={course} />
            </div>
          </div>
          <div className="lg:col-span-2">
            <h2 className="mb-6 text-xl font-bold text-text">Course Curriculum</h2>
            <div className="space-y-4">
              <CourseCurriculum courseId={courseId} course={course} modules={course.modules} changes={changes} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
