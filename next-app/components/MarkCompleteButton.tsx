'use client';

import { useRouter } from 'next/navigation';

export default function MarkCompleteButton({
  courseId,
  nextChapterId,
}: {
  courseId: string;
  nextChapterId?: string | null;
}) {
  const router = useRouter();

  const handleClick = () => {
    const dest = nextChapterId
      ? `/courses/${courseId}/chapters/${nextChapterId}`
      : `/courses/${courseId}`;
    router.push(dest);
  };

  return (
    <button
      onClick={handleClick}
      className="rounded-lg bg-accent px-6 py-2 text-sm font-semibold text-bg transition hover:bg-accent/90"
    >
      {nextChapterId ? 'Next Chapter' : 'Back to Course'}
    </button>
  );
}
