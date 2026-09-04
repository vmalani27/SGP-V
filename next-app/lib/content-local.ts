import 'server-only';

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

import * as tar from 'tar';
import yaml from 'js-yaml';
import type { ContentChange, CourseChanges } from './content-types';

/**
 * Client-side content bootstrap (runs on the Next.js server).
 *
 * The published content is a single tarball on S3. This module downloads it,
 * verifies its sha256 against the backend's version handshake, extracts it
 * into a local content dir, and serves individual files from there. The
 * backend no longer reads content files — this module owns that.
 */

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';
const CONTENT_DIR = process.env.CONTENT_LOCAL_DIR || '/app/.content';
const DATA_DIR = path.join(CONTENT_DIR, 'data');
const MARKER_PATH = path.join(CONTENT_DIR, 'version');
const CHANGES_PATH = path.join(CONTENT_DIR, 'changes.json');
const TMP_DIR = path.join(CONTENT_DIR, '.sync-tmp');

export interface ContentVersion {
  version: string;
  download_url: string;
  artifact_sha256: string;
  from_version?: string | null;
  changes?: ContentChange[];
  updatedAt?: string | null;
}

// How long new/updated badges remain visible after a content release.
const BADGE_TTL_MS = (Number(process.env.CONTENT_BADGE_TTL_DAYS) || 7) * 24 * 60 * 60 * 1000;

let syncPromise: Promise<void> | null = null;

export async function getContentVersion(): Promise<ContentVersion | null> {
  const urls = [
    process.env.BACKEND_API_URL,
    'http://backend:8000',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
  ].filter(Boolean) as string[];

  for (const baseUrl of urls) {
    try {
      const res = await fetch(`${baseUrl}/api/v1/content/version`, { cache: 'no-store' });
      if (res.ok) {
        return (await res.json()) as ContentVersion;
      }
    } catch {
      // try next candidate URL
    }
  }
  return null;
}

/**
 * Ensure the local content dir matches the published version. Safe to call
 * from any route handler — concurrent callers share a single in-flight sync.
 */
export async function ensureContent(): Promise<void> {
  if (!syncPromise) {
    syncPromise = doSync().finally(() => {
      syncPromise = null;
    });
  }
  return syncPromise;
}

async function isCurrent(version: string): Promise<boolean> {
  try {
    if ((await fs.readFile(MARKER_PATH, 'utf8')).trim() !== version) return false;
    await fs.access(path.join(DATA_DIR, 'index.json'));
    return true;
  } catch {
    return false;
  }
}

async function ensureChangesFile(version: string): Promise<void> {
  try {
    const existing = JSON.parse(await fs.readFile(CHANGES_PATH, 'utf8'));
    if (existing && existing.version === version) return;
  } catch {
    // missing or unreadable — rewrite below
  }
  await fs.writeFile(
    CHANGES_PATH,
    JSON.stringify({ version, from_version: null, changes: [] }, null, 2),
    'utf8',
  );
}

/** Persist the changelog alongside the version marker for the current version. */
async function writeChanges(info: ContentVersion): Promise<void> {
  await fs.writeFile(
    CHANGES_PATH,
    JSON.stringify(
      {
        version: info.version,
        from_version: info.from_version ?? null,
        changes: info.changes ?? [],
        updatedAt: info.updatedAt ?? null,
      },
      null,
      2,
    ),
    'utf8',
  );
}

async function doSync(): Promise<void> {
  const info = await getContentVersion();
  if (!info || !info.version || !info.download_url) return; // nothing published yet — keep current

  if (await isCurrent(info.version)) {
    await ensureChangesFile(info.version); // never wipe badges for the live version
    return;
  }

  const res = await fetch(info.download_url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to download content (${res.status})`);

  const buf = Buffer.from(await res.arrayBuffer());
  // artifact_sha256 covers the raw (uncompressed) tar bytes, which are
  // deterministic across builds; the gzip stream is not. Decompress first.
  const raw = gunzipSync(buf);
  const digest = createHash('sha256').update(raw).digest('hex').slice(0, 16);
  if (info.artifact_sha256 && digest !== info.artifact_sha256) {
    throw new Error(`Content checksum mismatch: got ${digest}, expected ${info.artifact_sha256}`);
  }

  // Extract into a temp sibling dir, then atomically swap into place so a
  // failure mid-download never leaves a partially-updated content tree.
  await fs.rm(TMP_DIR, { recursive: true, force: true });
  const tmpData = path.join(TMP_DIR, 'data');
  await fs.mkdir(tmpData, { recursive: true });
  const tarballPath = path.join(TMP_DIR, 'content.tar.gz');
  await fs.writeFile(tarballPath, buf);
  await tar.x({ file: tarballPath, cwd: tmpData, gzip: true });

  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await fs.rename(tmpData, DATA_DIR);
  await fs.writeFile(MARKER_PATH, info.version);
  await writeChanges(info);
  await fs.rm(TMP_DIR, { recursive: true, force: true });
}

// ── Local file readers ───────────────────────────────────────────────────────

async function readFile(...segments: string[]): Promise<string | null> {
  try {
    return await fs.readFile(path.join(DATA_DIR, ...segments), 'utf8');
  } catch {
    return null;
  }
}

async function loadYaml<T = Record<string, unknown>>(...segments: string[]): Promise<T | null> {
  const raw = await readFile(...segments);
  if (raw === null) return null;
  try {
    return yaml.load(raw) as T;
  } catch {
    return null;
  }
}

interface LocalModule {
  id: string;
  items: ({ id: string } | string)[];
}

async function findModuleId(courseId: string, itemId: string): Promise<string | null> {
  const course = await loadYaml<{ modules?: (string | Record<string, unknown>)[] }>(
    'courses', courseId, 'course.yaml'
  );
  if (!course?.modules) return null;

  for (const modRef of course.modules) {
    if (typeof modRef !== 'string') continue;
    const mod = await loadYaml<LocalModule>('courses', courseId, 'modules', modRef, 'module.yaml');
    if (!mod?.items) continue;
    const found = mod.items.some((it) =>
      typeof it === 'string' ? it === itemId : it.id === itemId
    );
    if (found) return modRef;
  }
  return null;
}

export async function readChapterContent(courseId: string, chapterId: string): Promise<string | null> {
  const modId = await findModuleId(courseId, chapterId);
  if (!modId) return null;
  return readFile('courses', courseId, 'modules', modId, 'chapters', `${chapterId}.md`);
}

export interface LabInstructions {
  lab_id: string;
  title: string;
  module_id: string;
  chapter_id: string;
  instructions: string | null;
}

export async function readLabInstructions(courseId: string, labId: string): Promise<LabInstructions | null> {
  const modId = await findModuleId(courseId, labId);
  if (!modId) return null;

  const lab = await loadYaml<{ title?: string; chapterId?: string }>(
    'courses', courseId, 'modules', modId, 'labs', labId, 'lab.yaml'
  );

  return {
    lab_id: labId,
    title: typeof lab?.title === 'string' ? lab.title : labId,
    module_id: modId,
    chapter_id: typeof lab?.chapterId === 'string' ? lab.chapterId : '',
    instructions: await readFile('courses', courseId, 'modules', modId, 'labs', labId, 'instructions.md'),
  };
}

export async function readLabTasks(courseId: string, labId: string): Promise<Record<string, unknown>[] | null> {
  const modId = await findModuleId(courseId, labId);
  if (!modId) return null;
  const lab = await loadYaml<{ tasks?: Record<string, unknown>[] }>(
    'courses', courseId, 'modules', modId, 'labs', labId, 'lab.yaml'
  );
  return Array.isArray(lab?.tasks) ? lab.tasks : [];
}

export async function readLabConfig(courseId: string, labId: string): Promise<Record<string, unknown> | null> {
  const modId = await findModuleId(courseId, labId);
  if (!modId) return null;

  const config = await loadYaml<Record<string, unknown>>(
    'courses', courseId, 'modules', modId, 'labs', labId, 'lab.yaml'
  );
  if (!config) return null;

  config.lab_id = labId;
  config.module_id = modId;

  // Resolve environment reference (string) to a shared environments/{ref}.yaml file.
  const envRef = config.environment;
  if (typeof envRef === 'string') {
    const envData = await loadYaml<Record<string, unknown>>('environments', `${envRef}.yaml`);
    if (envData) config.environment = envData;
  }

  return config;
}

// ── Content update badges ──────────────────────────────────────────────────────
// The worker stores a per-version changelog (`content_changes/{version}` in
// Firestore), the backend exposes it in /content/version, and this maps raw
// content paths onto the chapter/lab items of one course.

const ITEM_PATH_RE = /^courses\/([^/]+)\/modules\/[^/]+\/(?:chapters\/([^/]+)\.md|labs\/([^/]+)\/)/;

/**
 * Return new/updated chapter+lab item ids for a course, from the changelog
 * persisted for the currently-published version. Empty on first publish (no
 * previous version), on backend lag, or when nothing changed for this course.
 */
export async function getCourseChanges(courseId: string): Promise<CourseChanges> {
  try {
    await ensureContent();
  } catch {
    return {};
  }

  let raw: string | null = null;
  try {
    raw = await fs.readFile(CHANGES_PATH, 'utf8');
  } catch {
    return {};
  }

  let parsed: { changes?: ContentChange[]; updatedAt?: string | null } | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!Array.isArray(parsed?.changes)) return {};

  // Badges are temporary: a changelog without a usable publish timestamp, or
  // one older than the TTL, renders nothing regardless of what changed.
  if (typeof parsed.updatedAt !== 'string') return {};
  const releasedAt = new Date(parsed.updatedAt).getTime();
  if (!Number.isFinite(releasedAt) || Date.now() - releasedAt > BADGE_TTL_MS) return {};

  const map: CourseChanges = {};
  for (const c of parsed.changes) {
    if (!c || typeof c !== 'object') continue;
    if (c.change === 'removed') continue; // deletions leave the TOC anyway
    const m = ITEM_PATH_RE.exec(c.path ?? '');
    if (!m) continue;
    if (m[1] !== courseId) continue;
    const id = m[2] ?? m[3];
    if (!id) continue;
    map[id] = { kind: m[2] ? 'chapter' : 'lab', change: c.change };
  }
  return map;
}
