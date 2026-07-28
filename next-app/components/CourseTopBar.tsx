import Link from 'next/link';

export default function CourseTopBar({
  courseId,
  courseTitle,
  itemTitle,
  currentIndex,
  totalItems,
}: {
  courseId: string;
  courseTitle: string;
  itemTitle: string;
  currentIndex: number;
  totalItems: number;
}) {
  const progress = totalItems > 0 ? ((currentIndex + 1) / totalItems) * 100 : 0;

  return (
    <div className="border-b border-line bg-panel/50 backdrop-blur">
      <div className="mx-auto max-w-7xl px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/courses/${courseId}`}
              className="text-sm font-medium text-muted hover:text-accent"
            >
              {courseTitle}
            </Link>
            <span className="text-line">/</span>
            <span className="text-sm font-medium text-text">{itemTitle}</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-muted">
              {currentIndex + 1} of {totalItems}
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
  );
}
