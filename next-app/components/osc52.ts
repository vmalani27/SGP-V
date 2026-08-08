const OSC = '\x1b]';
const ESC = '\x1b';
const MAX_OSC_LEN = 4096;

export class Osc52Extractor {
  private buffer = '';
  private readonly copyCb: (text: string) => void;

  constructor(copyCb: (text: string) => void) {
    this.copyCb = copyCb;
  }

  /** Feed a chunk of decoded terminal output; returns the chunk minus OSC 52 sequences. */
  process(chunk: string): string {
    this.buffer += chunk;

    let out = '';
    let rest = this.buffer;

    while (rest.length > 0) {
      const idx = rest.indexOf(OSC);
      if (idx === -1) {
        out += rest;
        rest = '';
        break;
      }

      out += rest.slice(0, idx);
      const tail = rest.slice(idx);

      const termStart = findTerminatorStart(tail);

      if (tail.startsWith('\x1b]52;')) {
        if (termStart === -1) {
          // Incomplete OSC 52 — keep buffering (drop if it grows unbounded).
          if (tail.length >= MAX_OSC_LEN) {
            rest = '';
          } else {
            rest = tail;
          }
          break;
        }
        this.handleSequence(tail.slice(5, termStart));
        rest = tail.slice(termStart + terminatorLength(tail, termStart));
        continue;
      }

      // Some other OSC sequence (not OSC 52) — pass through, buffering only if
      // a terminator is expected but not yet received.
      if (termStart !== -1) {
        out += tail.slice(0, termStart + terminatorLength(tail, termStart));
        rest = tail.slice(termStart + terminatorLength(tail, termStart));
      } else if (tail.length >= MAX_OSC_LEN) {
        out += tail;
        rest = '';
      } else {
        rest = tail;
        break;
      }
    }

    this.buffer = rest;
    return out;
  }

  private handleSequence(body: string): void {
    // Format: <Pc>;<Pd>  where Pc is the clipboard id and Pd is base64 text.
    const semi = body.indexOf(';');
    if (semi === -1) return;
    const b64 = body.slice(semi + 1);
    if (!b64) return;

    try {
      const text = decodeBase64(b64);
      if (text) {
        this.copyCb(text);
      }
    } catch {
      // ignore malformed payloads
    }
  }
}

function terminatorLength(s: string, start: number): number {
  return s.charCodeAt(start) === 7 ? 1 : 2;
}

function findTerminatorStart(s: string): number {
  for (let i = 1; i < s.length; i++) {
    if (s.charCodeAt(i) === 7) return i; // BEL
    if (s[i] === '\\' && s[i - 1] === ESC) return i - 1; // ST (\x1b\\)
  }
  return -1;
}

function decodeBase64(b64: string): string {
  if (typeof atob === 'function') {
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i);
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
  return Buffer.from(b64, 'base64').toString('utf-8');
}
