import { promises as fs } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type {
  ContentChange,
  CourseChanges,
  ContentCourse,
  CourseCatalogEntry,
  ContentModule,
  Chapter,
  ContentLab,
  CourseItem,
} from './content-types';

/**
 * Local Content Store (Zero Outbound Network Polling).
 *
 * All course files and curriculum metadata are managed on the host filesystem
 * by the LabOps CLI (~/.labops/content) and mounted into the container as read-only (:ro).
 * This module purely reads from the local filesystem with zero network latency.
 */

const CONTENT_DIR = process.env.CONTENT_LOCAL_DIR || '/app/.content';
const MARKER_PATH = path.join(CONTENT_DIR, 'version');
const CHANGES_PATH = path.join(CONTENT_DIR, 'changes.json');

// How long new/updated badges remain visible after a content release.
const BADGE_TTL_MS = (Number(process.env.CONTENT_BADGE_TTL_DAYS) || 7) * 24 * 60 * 60 * 1000;

const ITEM_PATH_RE = /^courses\/([^/]+)\/modules\/[^/]+\/(?:chapters\/([^/]+)\.md|labs\/([^/]+)\/lab\.yaml)$/;

export async function getContentVersion(): Promise<string> {
  try {
    const raw = await fs.readFile(MARKER_PATH, 'utf8');
    if (raw && raw.trim()) return raw.trim();
  } catch {}

  try {
    const dataDir = await getDataDir();
    const raw = await fs.readFile(path.join(dataDir, 'version'), 'utf8');
    if (raw && raw.trim()) return raw.trim();
  } catch {}

  return 'dev-local';
}

let resolvedDataDir: string | null = null;

async function getDataDir(): Promise<string> {
  if (resolvedDataDir) return resolvedDataDir;

  const candidates = [
    path.join(CONTENT_DIR, 'data'),
    CONTENT_DIR,
    path.resolve(process.cwd(), '../out/published/171ae31d28516106'),
    path.resolve(process.cwd(), 'out/published/171ae31d28516106'),
    path.resolve(process.cwd(), '../out'),
    path.resolve(process.cwd(), 'out'),
    '/out',
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      // Check if candidate contains courses or catalog
      const hasCourses = await fs.access(path.join(candidate, 'courses')).then(() => true).catch(() => false);
      const hasCatalog = await fs.access(path.join(candidate, 'catalog.json')).then(() => true).catch(() => false);
      if (hasCourses || hasCatalog) {
        resolvedDataDir = candidate;
        return candidate;
      }
    } catch {}
  }

  resolvedDataDir = path.join(CONTENT_DIR, 'data');
  return resolvedDataDir;
}

/**
 * Ensures the local content directory is available.
 * Zero outbound network calls — instant local disk check.
 */
export async function ensureContent(): Promise<void> {
  await getDataDir();
}

// ── Local file readers ───────────────────────────────────────────────────────

async function readFile(...segments: string[]): Promise<string | null> {
  try {
    const base = await getDataDir();
    return await fs.readFile(path.join(base, ...segments), 'utf8');
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

  const baseConfig: Record<string, unknown> = { ...config };
  if (!baseConfig.tasks) {
    const tasks = await readLabTasks(courseId, labId);
    if (tasks) baseConfig.tasks = tasks;
  }

  // Resolve environment definition from environments/<env>.yaml if environment is a string
  if (typeof baseConfig.environment === 'string') {
    const envName = baseConfig.environment;
    const envDef = await loadYaml<Record<string, unknown>>('environments', `${envName}.yaml`);
    if (envDef) {
      baseConfig.environment = {
        name: envName,
        ...envDef,
      };
    }
  }

  return baseConfig;
}

/**
 * Return new/updated chapter+lab item ids for a course from changes.json.
 */
export async function getCourseChanges(courseId: string): Promise<CourseChanges> {
  let parsed: { changes?: ContentChange[]; updatedAt?: string | null } | null = null;
  
  const possibleChangesPaths = [
    CHANGES_PATH,
    path.join(await getDataDir(), 'changes.json'),
    path.join(await getDataDir(), '..', 'changes.json'),
  ];

  for (const p of possibleChangesPaths) {
    try {
      const raw = await fs.readFile(p, 'utf8');
      parsed = JSON.parse(raw);
      if (parsed?.changes) break;
    } catch {}
  }

  if (!Array.isArray(parsed?.changes) || parsed.changes.length === 0) {
    return {};
  }

  if (typeof parsed.updatedAt === 'string') {
    const releasedAt = new Date(parsed.updatedAt).getTime();
    if (Number.isFinite(releasedAt) && Date.now() - releasedAt > BADGE_TTL_MS) {
      return {};
    }
  }

  const map: CourseChanges = {};
  for (const c of parsed.changes) {
    if (!c || typeof c !== 'object') continue;
    if (c.change === 'removed') continue;
    const m = ITEM_PATH_RE.exec(c.path ?? '');
    if (!m || m[1] !== courseId) continue;
    const id = m[2] ?? m[3];
    if (!id) continue;
    map[id] = { kind: m[2] ? 'chapter' : 'lab', change: c.change };
  }
  return map;
}

// ── Course & Catalog Readers ──────────────────────────────────────────────────

export async function readCatalog(): Promise<CourseCatalogEntry[]> {
  // 1. Try reading catalog.json from DATA_DIR or root
  const rawCatalog = await readFile('catalog.json');
  if (rawCatalog) {
    try {
      const data = JSON.parse(rawCatalog);
      if (Array.isArray(data.courses)) {
        return data.courses.map((c: any) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          level: c.level,
          totalChapters: c.totalChapters ?? (Array.isArray(c.modules) ? c.modules.reduce((acc: number, m: any) => acc + (m.chapters?.length || 0), 0) : 0),
          totalLabs: c.totalLabs ?? (Array.isArray(c.modules) ? c.modules.reduce((acc: number, m: any) => acc + (m.labs?.length || 0), 0) : 0),
          modules: c.modules ?? [],
        }));
      }
    } catch {}
  }

  // 2. Fallback: read index.json
  const rawIndex = await readFile('index.json');
  if (rawIndex) {
    try {
      const data = JSON.parse(rawIndex);
      if (Array.isArray(data.courses)) {
        return data.courses;
      }
    } catch {}
  }

  return [];
}

export async function readCourse(courseId: string): Promise<ContentCourse | null> {
  const courseYaml = await loadYaml<{
    id?: string;
    title?: string;
    description?: string;
    prerequisites?: string[];
    modules?: string[];
    spec?: {
      host?: string;
      runtime?: string;
      scope?: string;
    };
    keyTakeaways?: string[];
    quickLinks?: { label: string; href: string }[];
  }>('courses', courseId, 'course.yaml');

  if (!courseYaml) return null;

  const modules: ContentModule[] = [];

  if (Array.isArray(courseYaml.modules)) {
    for (const modId of courseYaml.modules) {
      if (typeof modId !== 'string') continue;
      const mod = await readModule(courseId, modId);
      if (mod) modules.push(mod);
    }
  }

  return {
    id: courseYaml.id ?? courseId,
    title: courseYaml.title ?? courseId,
    description: courseYaml.description ?? '',
    prerequisites: Array.isArray(courseYaml.prerequisites) ? courseYaml.prerequisites : undefined,
    modules,
    spec: courseYaml.spec
      ? {
          host: courseYaml.spec.host ?? '',
          runtime: courseYaml.spec.runtime ?? '',
          scope: courseYaml.spec.scope ?? '',
        }
      : undefined,
    keyTakeaways: courseYaml.keyTakeaways,
    quickLinks: courseYaml.quickLinks,
  };
}

async function readModule(courseId: string, moduleId: string): Promise<ContentModule | null> {
  const modYaml = await loadYaml<{
    id?: string;
    title?: string;
    description?: string;
    order?: number;
    items?: ({ type: 'chapter' | 'lab'; id: string } | string)[];
  }>('courses', courseId, 'modules', moduleId, 'module.yaml');

  if (!modYaml) return null;

  const chapters: Chapter[] = [];
  const labs: ContentLab[] = [];
  const items: CourseItem[] = [];

  let itemOrder = 1;
  if (Array.isArray(modYaml.items)) {
    for (const rawItem of modYaml.items) {
      if (typeof rawItem === 'string') continue;
      if (rawItem.type === 'chapter') {
        const title = (await getChapterTitle(courseId, moduleId, rawItem.id)) ?? rawItem.id;
        chapters.push({
          id: rawItem.id,
          title,
          description: '',
          order: itemOrder,
        });
        items.push({
          type: 'chapter',
          id: rawItem.id,
          title,
          moduleId,
          moduleTitle: modYaml.title ?? moduleId,
        });
        itemOrder++;
      } else if (rawItem.type === 'lab') {
        const labYaml = await loadYaml<{ title?: string; description?: string }>(
          'courses', courseId, 'modules', moduleId, 'labs', rawItem.id, 'lab.yaml'
        );
        const title = labYaml?.title ?? rawItem.id;
        labs.push({
          id: rawItem.id,
          title,
          description: labYaml?.description ?? '',
          order: itemOrder,
        });
        items.push({
          type: 'lab',
          id: rawItem.id,
          title,
          moduleId,
          moduleTitle: modYaml.title ?? moduleId,
        });
        itemOrder++;
      }
    }
  }

  return {
    id: modYaml.id ?? moduleId,
    title: modYaml.title ?? moduleId,
    description: modYaml.description ?? '',
    order: modYaml.order,
    chapters,
    labs,
    items,
  };
}

async function getChapterTitle(courseId: string, moduleId: string, chapterId: string): Promise<string | null> {
  const content = await readFile('courses', courseId, 'modules', moduleId, 'chapters', `${chapterId}.md`);
  if (!content) return null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim();
    }
  }
  return null;
}
