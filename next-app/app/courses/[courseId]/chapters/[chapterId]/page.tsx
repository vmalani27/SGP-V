import { notFound } from 'next/navigation';
import ChapterClient from '@/components/ChapterClient';
import { getCourse, getPrevNextItems, getChapterContent } from '@/lib/content-server';
import type { RulerChapter } from '@/components/SlideReader';

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ courseId: string; chapterId: string }>;
}) {
  const { courseId, chapterId } = await params;
  const course = await getCourse(courseId);
  if (!course) return notFound();

  const { current, prev, next } = getPrevNextItems(course, chapterId);
  if (!current) return notFound();

  const allChapters = course.modules.flatMap((mod) =>
    mod.chapters.map((ch) => ({ ...ch, moduleId: mod.id, moduleTitle: mod.title }))
  );
  const chapterData = allChapters.find((ch) => ch.id === chapterId);
  if (!chapterData) return notFound();

  const initialContent = await getChapterContent(courseId, chapterId);

  const rulerChapters: RulerChapter[] = allChapters.map((ch, index) => {
    return {
      id: ch.id,
      label: String(index + 1),
      title: ch.title,
      href: `/courses/${courseId}/chapters/${ch.id}`,
      isCurrent: ch.id === chapterId,
    };
  });

  return (
    <ChapterClient
      courseId={courseId}
      chapterId={chapterId}
      moduleId={chapterData.moduleId}
      chapterDescription={chapterData.description}
      assessment={chapterData.assessment ?? null}
      initialContent={initialContent}
      prevItem={prev}
      nextItem={next}
      rulerChapters={rulerChapters}
    />
  );
}
