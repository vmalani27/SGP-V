'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { ContentModule } from '@/lib/content-types';

export default function CourseLabsWithProgress({
  courseId,
  modules,
}: {
  courseId: string;
  modules: ContentModule[];
}) {
  const [progress, setProgress] = useState<Record<string, Record<string, string>>>({});
  const [percentage, setPercentage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.courses
      .progress(courseId)
      .then((enrollment) => {
        setProgress((enrollment.progress as Record<string, Record<string, string>>) || {});
        setPercentage(enrollment.percentage ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [courseId]);

  const getLabStatus = (modId: string, labId: string) => {
    if (loading) return 'loading';
    if (progress[modId]?.[labId] === 'completed') return 'completed';
    return 'in-progress';
  };

  return (
    <>
      {!loading && (
        <div className="mb-6 flex items-center gap-3 text-sm text-muted">
          <span className="rounded-md bg-accent/10 px-2 py-0.5 font-medium text-accent">
            {percentage}% complete
          </span>
          <span className="h-3 w-px bg-line" />
          <span className="text-xs">Progress saved to your account</span>
        </div>
      )}

      {modules.map((mod) => (
        <section key={mod.id}>
          <h2 className="hero-font text-xl font-semibold">{mod.title}</h2>
          <p className="mt-1 text-sm text-muted">{mod.description}</p>

          <div className="mt-4 divide-y divide-line rounded-xl border border-line">
            {mod.labs.map((lab, idx) => {
              const status = getLabStatus(mod.id, lab.id);
              return (
                <Link
                  key={lab.id}
                  href={`/courses/${courseId}/labs/${lab.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition hover:bg-panel"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
                      status === 'completed'
                        ? 'bg-accent/20 text-accent'
                        : 'bg-accent/10 text-accent'
                    }`}
                  >
                    {status === 'completed' ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">{lab.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{lab.duration}</p>
                  </div>
                  <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                  </svg>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
