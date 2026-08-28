export interface Slide {
  title: string;
  markdown: string;
}

export interface ChapterSlides {
  title: string;
  slides: Slide[];
}

/**
 * Splits a chapter's Markdown into an ordered list of slides.
 *
 * Rules:
 * - The `#` H1 becomes the chapter title.
 * - Each `##` heading starts a new slide; the heading text becomes the slide title.
 * - `###` and deeper headings stay inside their parent slide.
 * - Any content before the first `##` is prepended to the first slide so it is not lost.
 * - If the document has no `##` headings at all, it becomes a single slide.
 */
export function parseChapterSlides(markdown: string): ChapterSlides {
  const lines = markdown.split(/\r?\n/);
  let title = '';
  const slides: Slide[] = [];
  let current: Slide | null = null;
  const leading: string[] = [];
  let inFence = false;
  let inDirective = false;

  for (const line of lines) {
    const fence = line.match(/^\s*(```+|~~~+)\s*([\w+-]*)\s*$/);
    if (fence) {
      inFence = !inFence;
    }

    // `:::terminal-demo` ... `:::` directive blocks are opaque — a `##` inside
    // must not start a new slide (defensive; YAML steps usually won't contain
    // one).
    if (!inFence) {
      if (/^\s*:::/.test(line)) {
        inDirective = !inDirective;
      }
    }

    if (!inFence && !inDirective) {
      const h1 = line.match(/^#\s+(.+?)\s*$/);
      if (h1 && !title) {
        title = h1[1].trim();
        continue;
      }
      const h2 = line.match(/^##\s+(.+?)\s*$/);
      if (h2) {
        current = { title: h2[1].trim(), markdown: '' };
        slides.push(current);
        continue;
      }
    }

    if (current) {
      current.markdown += line + '\n';
    } else {
      leading.push(line);
    }
  }

  if (slides.length === 0) {
    slides.push({ title: title || 'Chapter', markdown: leading.join('\n') });
  } else if (leading.some((l) => l.trim() !== '')) {
    slides[0].markdown = leading.join('\n') + '\n' + slides[0].markdown;
  }

  return { title, slides };
}