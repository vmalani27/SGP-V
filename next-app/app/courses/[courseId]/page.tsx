import { notFound } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { getCourse, getCourseCatalog } from '@/lib/content-server';
import CourseLabsWithProgress from '@/components/CourseLabsWithProgress';

export async function generateStaticParams() {
  const catalog = await getCourseCatalog();
  return catalog.map((c) => ({ courseId: c.id }));
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const course = await getCourse(courseId);
  if (!course) return notFound();

  return (
    <main className="min-h-screen bg-bg text-text">
      <Navbar />

      <div className="mx-auto max-w-4xl px-6 py-10 pt-20">
        <div className="mb-2 flex items-center gap-3 text-sm text-muted">
          <Link href="/dashboard" className="hover:text-accent">Dashboard</Link>
          <span>/</span>
          <span className="text-text">{course.title}</span>
        </div>

        <h1 className="hero-font mt-4 text-3xl font-bold">{course.title}</h1>
        <p className="mt-2 text-muted">{course.description}</p>

        <div className="mt-4 flex items-center gap-4 text-sm text-muted">
          <span className="rounded-md bg-accent/10 px-2 py-0.5 font-medium text-accent capitalize">{course.level}</span>
          <span>{course.totalLabs} Labs</span>
          <span>~{course.estimatedHours} hours</span>
        </div>

        <div className="mt-10 space-y-8">
          <CourseLabsWithProgress courseId={course.id} modules={course.modules} />
        </div>
      </div>
    </main>
  );
}
