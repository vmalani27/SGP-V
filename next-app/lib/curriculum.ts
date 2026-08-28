import type { ContentCourse, CourseItem } from './content-types';
import type { Enrollment } from './api';
import { getAllItems } from './content-server';

export interface CurriculumStatus {
  completedChapterIds: string[];
  completedLabIds: string[];
  completedCount: number;
  totalItems: number;
  nextIncomplete: CourseItem | null;
}

/**
 * Flatten an enrollment's per-module progress maps into flat id lists.
 *
 * progress      → { moduleId: { chapterId: status } }
 * labsProgress  → { moduleId: { labId: status } }
 * Both share the same shape, so one pass handles both.
 */
function completedIds(progress: Record<string, unknown> | undefined): string[] {
  const ids: string[] = [];
  if (!progress) return ids;
  for (const modVal of Object.values(progress)) {
    if (!modVal || typeof modVal !== 'object') continue;
    for (const [itemId, status] of Object.entries(modVal as Record<string, unknown>)) {
      if (status === 'completed') ids.push(itemId);
    }
  }
  return ids;
}

/**
 * Single source of truth for curriculum status. Both the header (resume CTA)
 * and the curriculum (active-row highlight, per-module chips) derive state
 * from here so they can never disagree about what is done or what is next.
 */
export function computeCurriculumStatus(
  course: ContentCourse,
  enrollment: Enrollment | undefined,
): CurriculumStatus {
  const completedChapterIds = completedIds(enrollment?.progress);
  const completedLabIds = completedIds(enrollment?.labsProgress);

  const items = getAllItems(course);
  const isCompleted = (item: CourseItem) =>
    item.type === 'lab'
      ? completedLabIds.includes(item.id)
      : completedChapterIds.includes(item.id);

  return {
    completedChapterIds,
    completedLabIds,
    completedCount: items.filter(isCompleted).length,
    totalItems: items.length,
    nextIncomplete: items.find((item) => !isCompleted(item)) ?? null,
  };
}