'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SlideReader from './SlideReader';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { itemHref } from '@/lib/content-server';
import type { CourseItem } from '@/lib/content-types';

export default function ChapterClient({
  courseId,
  chapterId,
  moduleId,
  nextItem,
}: {
  courseId: string;
  chapterId: string;
  moduleId: string;
  nextItem?: CourseItem | null;
}) {
  const router = useRouter();
  const { refreshEnrollments } = useAuth();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleCompleteAndContinue = async () => {
    try {
      await api.courses.updateProgress(courseId, moduleId, chapterId);
      await refreshEnrollments();
    } catch {
      // Progress save is best-effort
    }
    if (nextItem) {
      router.push(itemHref(courseId, nextItem));
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
      <SlideReader
        content={content}
        onComplete={handleCompleteAndContinue}
        completeLabel={
          nextItem
            ? nextItem.type === 'lab'
              ? 'Start Lab'
              : 'Continue'
            : 'Complete Course'
        }
        onCompleteIcon={
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
          </svg>
        }
      />
    </div>
  );
}
