import Link from 'next/link';

interface NavItem {
  id: string;
  title: string;
}

export default function PaginationNav({
  courseId,
  prev,
  next,
}: {
  courseId: string;
  prev: NavItem | null;
  next: NavItem | null;
}) {
  return (
    <div className="mt-8 flex items-center justify-between border-t border-line pt-8">
      {prev ? (
        <Link
          href={`/courses/${courseId}/chapters/${prev.id}`}
          className="group flex max-w-md items-center gap-4 rounded-lg border border-line p-4 transition hover:border-accent/50 hover:bg-panel/50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-line/20 text-accent transition group-hover:bg-accent/20">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m15 19-7-7 7-7" />
            </svg>
          </div>
          <div>
            <div className="text-xs text-muted">Previous Chapter</div>
            <div className="font-medium text-text group-hover:text-accent">{prev.title}</div>
          </div>
        </Link>
      ) : (
        <div />
      )}

      {next ? (
        <Link
          href={`/courses/${courseId}/chapters/${next.id}`}
          className="group flex max-w-md items-center gap-4 rounded-lg border border-line p-4 transition hover:border-accent/50 hover:bg-panel/50"
        >
          <div className="text-right">
            <div className="text-xs text-muted">Next Chapter</div>
            <div className="font-medium text-text group-hover:text-accent">{next.title}</div>
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
  );
}
