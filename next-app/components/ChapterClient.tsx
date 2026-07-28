'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import TheorySection from './TheorySection';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function ChapterClient({
  courseId,
  chapterId,
  moduleId,
  nextChapterId,
}: {
  courseId: string;
  chapterId: string;
  moduleId: string;
  nextChapterId?: string | null;
}) {
  const router = useRouter();
  const { refreshEnrollments } = useAuth();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chapterComplete, setChapterComplete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.content
      .getChapterContent(courseId, chapterId)
      .then((res) => {
        if (!cancelled) {
          setContent(res?.content ?? null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load content');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [courseId, chapterId]);

  const handleMarkComplete = async () => {
    try {
      await api.courses.updateProgress(courseId, moduleId, chapterId);
      await refreshEnrollments();
    } catch {
      // Progress save is best-effort
    }
    setChapterComplete(true);
  };

  const handleNext = () => {
    if (nextChapterId) {
      router.push(`/courses/${courseId}/chapters/${nextChapterId}`);
    } else {
      router.push(`/courses/${courseId}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted text-sm">Loading chapter content...</div>
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-400 text-sm">
          {error || 'Failed to load chapter content. Are you logged in?'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TheorySection content={content} />

      {!chapterComplete ? (
        <div className="flex justify-end">
          <button
            onClick={handleMarkComplete}
            className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent/90"
          >
            Mark Chapter as Complete
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-emerald-400 font-medium">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            Chapter completed!
          </div>
          <button
            onClick={handleNext}
            className="flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent/90"
          >
            {nextChapterId ? 'Next Chapter' : 'Back to Course'}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
