import YAML from 'js-yaml';

export interface DemoStep {
  id: string;
  label: string;
  run: string;
  expect?: string;
}

export interface DemoStateQuery {
  label: string;
  command: string;
}

export interface TerminalDemoSpec {
  id: string;
  image?: string;
  pre_pull?: string[];
  /** Ordered, guided steps the learner works through. */
  steps: DemoStep[];
  /** Optional free-form commands for exploration (no stepper ordering). */
  examples?: string[];
  /** Optional live-state poll for the demo container (e.g. a lifecycle chip). */
  state?: DemoStateQuery;
}

export type SlideSegment = { type: 'markdown'; content: string } | { type: 'terminal-demo'; spec: TerminalDemoSpec };

const DIRECTIVE_OPEN = /^\s*:::\s*terminal-demo\s*$/;
const DIRECTIVE_CLOSE = /^\s*:::\s*$/;

function parseSteps(raw: unknown): DemoStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: DemoStep[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const step = s as Record<string, unknown>;
    if (typeof step.run !== 'string' || !step.run.trim()) continue;
    steps.push({
      id: typeof step.id === 'string' && step.id.trim() ? step.id.trim() : `step-${steps.length + 1}`,
      label: typeof step.label === 'string' && step.label.trim() ? step.label.trim() : step.run,
      run: step.run.trim(),
      expect: typeof step.expect === 'string' && step.expect.trim() ? step.expect.trim() : undefined,
    });
  }
  return steps;
}

function parseStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is string => typeof e === 'string' && e.trim() !== '').map((e) => e.trim());
}

function normalizeTerminalSpec(raw: unknown): TerminalDemoSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  if (!id) return null;

  const steps = parseSteps(obj.steps);
  const examples = parseStrings(obj.examples);
  if (steps.length === 0 && examples.length === 0) return null;

  const stateRaw = obj.state as Record<string, unknown> | undefined;
  const state: DemoStateQuery | undefined =
    stateRaw && typeof stateRaw === 'object'
      ? {
          label: typeof stateRaw.label === 'string' && stateRaw.label.trim() ? stateRaw.label.trim() : 'container',
          command: typeof stateRaw.command === 'string' && stateRaw.command.trim() ? stateRaw.command.trim() : '',
        }
      : undefined;

  return {
    id,
    steps,
    examples: examples.length > 0 ? examples : undefined,
    state: state && state.command ? state : undefined,
    image: typeof obj.image === 'string' && obj.image ? obj.image : undefined,
    pre_pull: Array.isArray(obj.pre_pull)
      ? obj.pre_pull.filter((p): p is string => typeof p === 'string')
      : undefined,
  };
}

/**
 * Splits a slide's Markdown into alternating markdown and directive segments.
 *
 * Supports `:::terminal-demo` (id, image, pre_pull, state, steps, examples) —
 * a live terminal whose guided steps are click-to-insert commands the learner
 * runs themselves, with optional "what you should see" expectations and a
 * live container-state chip.
 *
 * Directive bodies are parsed as YAML. Invalid or empty blocks are passed
 * through as markdown so nothing is silently lost.
 */
export function parseSlideSegments(markdown: string): SlideSegment[] {
  const segments: SlideSegment[] = [];
  const lines = markdown.split(/\r?\n/);
  let i = 0;
  let buffer: string[] = [];

  const flushMarkdown = () => {
    const content = buffer.join('\n');
    if (content.trim() !== '') {
      segments.push({ type: 'markdown', content });
    }
    buffer = [];
  };

  while (i < lines.length) {
    const openMatch = DIRECTIVE_OPEN.exec(lines[i]);
    if (openMatch) {
      flushMarkdown();
      const body: string[] = [];
      i += 1;
      let closed = false;
      while (i < lines.length && !DIRECTIVE_CLOSE.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) {
        closed = true;
        i += 1; // consume the closing :::
      }

      if (closed) {
        try {
          const raw = YAML.load(body.join('\n'));
          const spec = normalizeTerminalSpec(raw);
          if (spec) {
            segments.push({ type: 'terminal-demo', spec });
            continue;
          }
        } catch {
          // Fall through: emit the raw block as markdown.
        }
      }
      // Not a valid directive block — restore it verbatim.
      buffer.push(':::terminal-demo', ...body, ...(closed ? [':::'] : []));
    } else {
      buffer.push(lines[i]);
      i += 1;
    }
  }

  flushMarkdown();
  return segments;
}