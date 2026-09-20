'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import SlideReader, { type RulerChapter } from './SlideReader';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { itemHref } from '@/lib/content-utils';
import type { CourseItem } from '@/lib/content-types';

export default function ChapterClient({
  courseId,
  chapterId,
  moduleId,
  chapterDescription,
  assessment,
  initialContent = null,
  prevItem,
  nextItem,
  rulerChapters = [],
}: {
  courseId: string;
  chapterId: string;
  moduleId: string;
  chapterDescription?: string;
  assessment?: unknown;
  initialContent?: string | null;
  prevItem?: CourseItem | null;
  nextItem?: CourseItem | null;
  rulerChapters?: RulerChapter[];
}) {
  const router = useRouter();
  const { getEnrollment, refreshEnrollments } = useAuth();
  const enrollment = getEnrollment(courseId);
  const [content, setContent] = useState<string | null>(initialContent);
  const [loading, setLoading] = useState(!initialContent);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialContent) {
      setContent(initialContent);
      setLoading(false);
      return;
    }

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
  }, [courseId, chapterId, initialContent]);

  const rulerWithCompletion = useMemo(() => {
    const progress = (enrollment?.progress ?? {}) as Record<string, Record<string, string>>;
    return (rulerChapters || []).map((ch) => {
      const isCompleted = Object.values(progress).some(
        (modProgress) => modProgress?.[ch.id] === 'completed'
      );
      return {
        ...ch,
        isCompleted,
      };
    });
  }, [rulerChapters, enrollment]);

  const handlePrev = prevItem
    ? () => router.push(itemHref(courseId, prevItem))
    : undefined;

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
      <div className="flex h-[calc(100vh-theme(spacing.14))] items-center justify-center bg-[#0b0c0e]">
        <div className="flex items-center gap-3 text-zinc-500 font-mono text-xs">
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
          <span>Loading briefing content...</span>
        </div>
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="flex h-[calc(100vh-theme(spacing.14))] items-center justify-center bg-[#0b0c0e]">
        <div className="text-rose-400 text-sm font-mono">
          {error || 'Failed to load chapter content. Are you logged in?'}
        </div>
      </div>
    );
  }

  return (
    <SlideReader
      content={content}
      chapterId={chapterId}
      chapterDescription={chapterDescription}
      assessment={assessment}
      prevItem={prevItem}
      nextItem={nextItem}
      rulerChapters={rulerWithCompletion}
      onPrev={handlePrev}
      onComplete={handleCompleteAndContinue}
    />
  );
}
