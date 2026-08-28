'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseChapterSlides } from '@/lib/chapter-slides';
import { parseSlideSegments } from '@/lib/demo-directives';
import DemoTerminal from '@/components/DemoTerminal';
import { api } from '@/lib/api';

function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = extractText(children);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. permissions); ignore.
    }
  };

  return (
    <div className="group relative">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 z-10 rounded-md border border-line bg-bg/80 px-2 py-1 text-xs text-muted opacity-0 transition hover:text-text focus:opacity-100 group-hover:opacity-100"
        title="Copy code"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre>{children}</pre>
    </div>
  );
}

export default function SlideReader({
  content,
  onComplete,
  completeLabel = 'Complete & Continue',
  onCompleteIcon,
}: {
  content: string;
  onComplete?: () => void;
  completeLabel?: string;
  onCompleteIcon?: ReactNode;
}) {
  const { title, slides } = useMemo(() => parseChapterSlides(content), [content]);
  const [index, setIndex] = useState(0);

  const demoIds = useMemo(() => {
    const ids = new Set<string>();
    for (const slide of slides) {
      for (const segment of parseSlideSegments(slide.markdown)) {
        if (segment.type === 'terminal-demo') ids.add(segment.spec.id);
      }
    }
    return [...ids];
  }, [slides]);

  // URL hash markers: each slide gets a stable `#<title-slug>` fragment so the
  // position is reflected in the URL, deep-linkable, and restored on return.
  const slideSlugs = useMemo(() => {
    const seen = new Map<string, number>();
    return slides.map((s) => {
      const base = slugify(s.title) || 'slide';
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      return count === 1 ? base : `${base}-${count}`;
    });
  }, [slides]);

  const indexFromHash = useCallback((): number | null => {
    const raw = window.location.hash.replace(/^#/, '').trim();
    if (!raw) return null;
    const bySlug = slideSlugs.indexOf(raw);
    if (bySlug !== -1) return bySlug;
    const m = raw.match(/^(?:s-)?(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      return n >= 0 && n < slides.length ? n : null;
    }
    return null;
  }, [slideSlugs, slides.length]);

  const indexRef = useRef(0);
  const lastSyncedRef = useRef<number | null>(null);

  // Mirror the current slide into the URL hash. On the very first run, leave an
  // incoming hash alone if it already addresses a slide; otherwise seed it.
  useEffect(() => {
    if (lastSyncedRef.current === null && indexFromHash() !== null) {
      lastSyncedRef.current = index;
      return;
    }
    if (lastSyncedRef.current === index) return;
    lastSyncedRef.current = index;
    const target = `#${slideSlugs[index]}`;
    if (window.location.hash !== target) {
      history.replaceState(null, '', target);
    }
  }, [index, slideSlugs, indexFromHash]);

  // Respond to manual hash edits / browser back-forward into a slide hash.
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // The demo terminal itself persists across slide navigation (same container
  // + tmux session). Reclaim those disposable containers when the learner
  // leaves the whole chapter.
  useEffect(() => {
    return () => {
      for (const id of demoIds) {
        api.demos.destroy(id).catch(() => {});
      }
    };
  }, [demoIds]);

  const total = slides.length;
  const slide = slides[index];
  const isLast = index === total - 1;

  const goTo = useCallback(
    (i: number) => setIndex(Math.max(0, Math.min(total - 1, i))),
    [total]
  );
  // Only complete the chapter once per ~1s window. Holding the arrow key on
  // the final slide would otherwise fire navigation on every OS auto-repeat.
  const lastCompletedAt = useRef(0);
  const next = useCallback(() => {
    if (index >= total - 1) {
      const now = Date.now();
      if (now - lastCompletedAt.current > 1000) {
        lastCompletedAt.current = now;
        onComplete?.();
      }
    } else {
      setIndex((i) => i + 1);
    }
  }, [index, total, onComplete]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Jump to the slide named in the URL hash on mount (deep-link / restore).
  useEffect(() => {
    const i = indexFromHash();
    if (i !== null) goTo(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Respond to manual hash edits / browser back-forward into a slide hash.
  useEffect(() => {
    const onHashChange = () => {
      const i = indexFromHash();
      if (i !== null && i !== indexRef.current) goTo(i);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [indexFromHash, goTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'BUTTON' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key === 'Home') {
        e.preventDefault();
        goTo(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goTo(total - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, goTo, total]);

  if (total === 0) return null;

  return (
    <div className="rounded-xl border border-line bg-panel">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-3">
        <div className="flex items-center gap-2 overflow-hidden">
          <svg className="h-4 w-4 shrink-0 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
          </svg>
          <h3 className="truncate text-sm font-semibold text-text">{title}</h3>
        </div>
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted">
          {index + 1} of {total}
        </span>
      </div>

      {/* Slide content */}
      <article
        className="prose-custom max-w-none px-8 py-6"
        onClick={(e) => {
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          if (x < 64) {
            prev();
          } else if (x > rect.width - 64 && !isLast) {
            next();
          }
        }}
      >
        <h2 className="!mt-0 mb-4 border-b-0 text-xl font-semibold text-text">
          {slide.title}
        </h2>
        {parseSlideSegments(slide.markdown).map((segment, i) =>
          segment.type === 'terminal-demo' ? (
            <DemoTerminal key={`${slide.title}-${i}`} spec={segment.spec} />
          ) : (
            <ReactMarkdown
              key={i}
              remarkPlugins={[remarkGfm]}
              components={{
                pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
              }}
            >
              {segment.content}
            </ReactMarkdown>
          )
        )}
      </article>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-line px-6 py-3">
        <button
          onClick={prev}
          disabled={index === 0}
          className="flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted transition enabled:hover:border-accent/40 enabled:hover:text-text disabled:opacity-40"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Previous
        </button>

        <div className="flex items-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-2 w-2 rounded-full transition ${
                i === index ? 'bg-accent' : 'bg-line hover:bg-accent/40'
              }`}
            />
          ))}
        </div>
        <span className="hidden text-xs text-muted lg:inline">← → / Space to navigate</span>

        {isLast ? (
          onComplete ? (
            <button
              onClick={onComplete}
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-bg transition hover:bg-accent/90"
            >
              {completeLabel}
              {onCompleteIcon}
            </button>
          ) : (
            <span className="text-sm font-medium text-muted">End of chapter</span>
          )
        ) : (
          <button
            onClick={next}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-bg transition hover:bg-accent/90"
          >
            Next
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}