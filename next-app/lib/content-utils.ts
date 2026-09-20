import type { ContentCourse, CourseItem, Chapter, ContentModule } from './content-types';

export function getAllChapters(course: ContentCourse): (Chapter & { moduleId: string; moduleTitle: string })[] {
  return course.modules.flatMap((mod) =>
    mod.chapters.map((ch) => ({ ...ch, moduleId: mod.id, moduleTitle: mod.title }))
  );
}

export function getChapterById(course: ContentCourse, chapterId: string) {
  return getAllChapters(course).find((ch) => ch.id === chapterId) || null;
}

export function getAllItems(course: ContentCourse): CourseItem[] {
  if (!course?.modules) return [];
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

export function cleanTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/^(?:Chapter|Lab|Module)\s+\d+:\s*/i, '')
    .replace(/^(?:Chapter|Lab|Module)\s+\d+\s*[-—–]\s*/i, '')
    .trim();
}

export interface ChapterTreeNode {
  chapter: CourseItem;
  labs: CourseItem[];
}

export function getModuleChapterTree(module: ContentModule): ChapterTreeNode[] {
  const items = getModuleItems(module);
  const tree: ChapterTreeNode[] = [];
  let current: ChapterTreeNode | null = null;

  for (const item of items) {
    if (item.type === 'chapter') {
      current = { chapter: item, labs: [] };
      tree.push(current);
    } else if (item.type === 'lab') {
      if (current) {
        current.labs.push(item);
      } else {
        current = {
          chapter: {
            ...item,
            type: 'chapter',
            id: `ch-${item.id}`,
            title: item.title,
          },
          labs: [item],
        };
        tree.push(current);
      }
    }
  }

  return tree;
}
