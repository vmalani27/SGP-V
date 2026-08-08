import { notFound } from 'next/navigation';
import LearningPlayer from '@/components/LearningPlayer';
import ChapterClient from '@/components/ChapterClient';
import { getCourse, getPrevNextItems } from '@/lib/content-server';

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ courseId: string; chapterId: string }>;
}) {
  const { courseId, chapterId } = await params;
  const course = await getCourse(courseId);
  if (!course) return notFound();

  const { current, next } = getPrevNextItems(course, chapterId);
  if (!current) return notFound();

  const allChapters = course.modules.flatMap((mod) =>
    mod.chapters.map((ch) => ({ ...ch, moduleId: mod.id, moduleTitle: mod.title }))
  );
  const chapterData = allChapters.find((ch) => ch.id === chapterId);
  if (!chapterData) return notFound();

  return (
    <LearningPlayer
      course={course}
      courseId={courseId}
      currentItem={chapterData}
    >
      <ChapterClient
        courseId={courseId}
        chapterId={chapterId}
        moduleId={chapterData.moduleId}
        nextItem={next}
      />
    </LearningPlayer>
  );
}
