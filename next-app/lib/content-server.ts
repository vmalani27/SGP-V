import type { ContentCourse, CourseCatalogEntry, CourseItem, Chapter, ContentModule } from './content-types';

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';

async function backendFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export async function getCourseCatalog(): Promise<CourseCatalogEntry[]> {
  return (await backendFetch<CourseCatalogEntry[]>('/api/v1/courses')) ?? [];
}

export async function getCourse(courseId: string): Promise<ContentCourse | null> {
  return backendFetch<ContentCourse>(`/api/v1/courses/${courseId}`);
}

export function getAllChapters(course: ContentCourse): (Chapter & { moduleId: string; moduleTitle: string })[] {
  return course.modules.flatMap((mod) =>
    mod.chapters.map((ch) => ({ ...ch, moduleId: mod.id, moduleTitle: mod.title }))
  );
}

export function getChapterById(course: ContentCourse, chapterId: string) {
  return getAllChapters(course).find((ch) => ch.id === chapterId) || null;
}

export function getAllItems(course: ContentCourse): CourseItem[] {
  return course.modules.flatMap((mod) => getModuleItems(mod));
}

export function getModuleItems(module: ContentModule): CourseItem[] {
  if (module.items && module.items.length > 0) {
    return module.items.map((it) => ({
      type: it.type,
      id: it.id,
      title: it.title,
      moduleId: module.id,
      moduleTitle: module.title,
    }));
  }
  return [
    ...module.chapters.map((ch) => ({
      type: 'chapter' as const,
      id: ch.id,
      title: ch.title,
      moduleId: module.id,
      moduleTitle: module.title,
    })),
    ...(module.labs ?? []).map((lb) => ({
      type: 'lab' as const,
      id: lb.id,
      title: lb.title,
      moduleId: module.id,
      moduleTitle: module.title,
    })),
  ];
}

export function itemHref(courseId: string, item: { type: string; id: string }): string {
  return item.type === 'lab'
    ? `/courses/${courseId}/labs/${item.id}`
    : `/courses/${courseId}/chapters/${item.id}`;
}

export function getPrevNextItems(course: ContentCourse, itemId: string) {
  const all = getAllItems(course);
  const idx = all.findIndex((i) => i.id === itemId);
  if (idx === -1) return { prev: null, next: null, current: null, total: all.length, index: -1 };
  return {
    prev: idx > 0 ? all[idx - 1] : null,
    next: idx < all.length - 1 ? all[idx + 1] : null,
    current: all[idx],
    total: all.length,
    index: idx,
  };
}
