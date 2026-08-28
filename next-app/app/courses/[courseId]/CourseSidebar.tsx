import type { ReactNode } from 'react';
import type { ContentCourse } from '@/lib/content-types';

function Panel({
  title,
  index,
  children,
}: {
  title: string;
  index: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <span className="mr-2 font-mono text-muted/50">{index}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function BulletList({ items, mono = false }: { items: string[]; mono?: boolean }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm text-muted">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted/50" />
          <span className={mono ? 'font-mono text-xs leading-relaxed' : 'leading-relaxed'}>
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function CourseSidebar({ course }: { course: ContentCourse }) {
  const hasAny =
    (course.prerequisites?.length ?? 0) > 0 ||
    (course.environment?.length ?? 0) > 0 ||
    (course.keyTakeaways?.length ?? 0) > 0 ||
    (course.quickLinks?.length ?? 0) > 0;

  if (!hasAny) return null;

  return (
    <div className="space-y-4">
      {course.prerequisites && course.prerequisites.length > 0 && (
        <Panel title="Prerequisites" index="01">
          <BulletList items={course.prerequisites} />
        </Panel>
      )}

      {course.environment && course.environment.length > 0 && (
        <Panel title="Environment" index="02">
          <BulletList items={course.environment} mono />
        </Panel>
      )}

      {course.keyTakeaways && course.keyTakeaways.length > 0 && (
        <Panel title="Key Takeaways" index="03">
          <BulletList items={course.keyTakeaways} />
        </Panel>
      )}

      {course.quickLinks && course.quickLinks.length > 0 && (
        <Panel title="Quick Links" index="04">
          <ul className="space-y-2">
            {course.quickLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2 text-sm text-accent transition hover:text-accentStrong"
                >
                  <svg
                    className="h-4 w-4 text-muted/60 transition group-hover:text-accent"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.75}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  <span>{link.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}