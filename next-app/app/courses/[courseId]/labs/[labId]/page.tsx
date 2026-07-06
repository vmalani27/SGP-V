import { notFound } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Navbar from '@/components/Navbar';
import { getCourse, getLabContent, getCourseCatalog } from '@/lib/content-server';
import MarkCompleteButton from '@/components/MarkCompleteButton';

export async function generateStaticParams() {
  const catalog = await getCourseCatalog();
  const paths: { courseId: string; labId: string }[] = [];
  for (const entry of catalog) {
    const course = await getCourse(entry.id);
    if (course) {
      for (const mod of course.modules) {
        for (const lab of mod.labs) {
          paths.push({ courseId: course.id, labId: lab.id });
        }
      }
    }
  }
  return paths;
}

export default async function LabPage({
  params,
}: {
  params: Promise<{ courseId: string; labId: string }>;
}) {
  const { courseId, labId } = await params;
  const course = await getCourse(courseId);
  if (!course) return notFound();

  let currentLab = null;
  let prevLab: { id: string; title: string; module?: string } | null = null;
  let nextLab: { id: string; title: string; module?: string } | null = null;
  let currentModuleTitle = '';

  const allLabs = course.modules.flatMap((m) =>
    m.labs.map(lab => ({ ...lab, moduleName: m.title }))
  );

  const idx = allLabs.findIndex((l) => l.id === labId);
  if (idx === -1) return notFound();

  currentLab = allLabs[idx];
  currentModuleTitle = currentLab.moduleName || '';

  if (idx > 0) {
    prevLab = allLabs[idx - 1];
  }
  if (idx < allLabs.length - 1) {
    nextLab = allLabs[idx + 1];
  }

  const content = await getLabContent(currentLab.contentPath);
  if (!content) return notFound();

  const progress = ((idx + 1) / allLabs.length) * 100;

  return (
    <main className="min-h-screen bg-bg text-text pt-16">
      <Navbar />

      {/* Top Navigation Bar */}
      <div className="border-b border-line bg-panel/50 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/courses/${courseId}`}
                className="text-sm font-medium text-muted hover:text-accent"
              >
                {course.title}
              </Link>
              <span className="text-line">/</span>
              <span className="text-sm font-medium text-text">{currentLab.title}</span>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-xs text-muted">
                {idx + 1} of {allLabs.length}
              </span>
              <div className="h-2 w-32 rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Main Content */}
          <div className="lg:col-span-9">
            {/* Lab Header */}
            <div className="mb-6">
              <div className="mb-2 text-sm font-medium text-accent">
                {currentModuleTitle}
              </div>
              <h1 className="text-3xl font-bold text-text">
                {currentLab.title}
              </h1>
            </div>

            {/* Lab Content */}
            <div className="rounded-xl border border-line bg-panel p-8">
              <article className="prose prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              </article>
            </div>

            {/* Mark Complete */}
            <div className="mt-6 flex justify-center">
              <MarkCompleteButton courseId={courseId} labId={labId} />
            </div>

            {/* Pagination Navigation */}
            <div className="mt-8 flex items-center justify-between border-t border-line pt-8">
              {prevLab ? (
                <Link
                  href={`/courses/${courseId}/labs/${prevLab.id}`}
                  className="group flex max-w-md items-center gap-4 rounded-lg border border-line p-4 transition hover:border-accent/50 hover:bg-panel/50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-line/20 text-accent transition group-hover:bg-accent/20">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m15 19-7-7 7-7" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Previous Lab</div>
                    <div className="font-medium text-text group-hover:text-accent">{prevLab.title}</div>
                  </div>
                </Link>
              ) : (
                <div />
              )}

              {nextLab ? (
                <Link
                  href={`/courses/${courseId}/labs/${nextLab.id}`}
                  className="group flex max-w-md items-center gap-4 rounded-lg border border-line p-4 transition hover:border-accent/50 hover:bg-panel/50"
                >
                  <div className="text-right">
                    <div className="text-xs text-muted">Next Lab</div>
                    <div className="font-medium text-text group-hover:text-accent">{nextLab.title}</div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-line/20 text-accent transition group-hover:bg-accent/20">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ) : (
                <Link
                  href={`/courses/${courseId}`}
                  className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-bg transition hover:bg-accent/90"
                >
                  Complete Course
                </Link>
              )}
            </div>
          </div>

          {/* Sidebar - Table of Contents */}
          <div className="lg:col-span-3">
            <div className="sticky top-24 rounded-xl border border-line bg-panel p-6">
              <h3 className="mb-4 text-sm font-semibold text-text">Course Content</h3>
              <div className="space-y-4">
                {course.modules.map((module, modIdx) => (
                  <div key={module.id}>
                    <div className="mb-2 text-xs font-semibold text-muted">
                      Module {modIdx + 1}: {module.title}
                    </div>
                    <div className="space-y-1">
                      {module.labs.map((lab) => {
                        const isCurrent = lab.id === labId;
                        const isCompleted = false;

                        return (
                          <Link
                            key={lab.id}
                            href={`/courses/${courseId}/labs/${lab.id}`}
                            className={`flex items-center gap-2 rounded px-3 py-2 text-sm transition ${
                              isCurrent
                                ? 'bg-accent/10 text-accent'
                                : 'text-muted hover:bg-panel/50 hover:text-text'
                            }`}
                          >
                            {isCompleted ? (
                              <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m9 12.75 1.214-1.215a3 3 0 0 1 4.243 0l.179.178a3 3 0 0 1 0 4.243l-2.65 2.65a3 3 0 0 1-4.243 0l-.179-.178a3 3 0 0 1 0-4.243Z" />
                              </svg>
                            ) : (
                              <div className={`h-2 w-2 rounded-full ${isCurrent ? 'bg-accent' : 'bg-line'}`} />
                            )}
                            <span className="truncate">{lab.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
