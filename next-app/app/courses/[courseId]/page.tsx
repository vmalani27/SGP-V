import { notFound } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { getCourse, getAllItems } from '@/lib/content-server';
import CourseProgressHeader from './CourseProgressHeader';
import CourseCurriculum from './CourseCurriculum';

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const course = await getCourse(courseId);
  if (!course) return notFound();

  const allItems = getAllItems(course);
  const firstChapter = allItems[0];

  const firstChapterHref = firstChapter
    ? `/courses/${courseId}/chapters/${firstChapter.id}`
    : '#';

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
        firstChapterHref={firstChapterHref}
      />

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-5">
              <div className="rounded-xl border border-line bg-panel p-5">
                <h3 className="mb-4 font-semibold text-text">What You&apos;ll Learn</h3>
                <ul className="space-y-3 text-sm text-muted">
                  {course.modules.map((mod) => (
                    <li key={mod.id} className="flex items-start gap-2">
                      <svg className="mt-0.5 h-4 w-4 shrink-0 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>{mod.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="lg:col-span-2">
            <h2 className="mb-6 text-xl font-bold text-text">Course Curriculum</h2>
            <div className="space-y-4">
              <CourseCurriculum courseId={courseId} modules={course.modules} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
