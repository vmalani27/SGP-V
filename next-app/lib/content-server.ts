import type { ContentCourse, CourseCatalogEntry, CourseItem, Chapter, ContentModule } from './content-types';
import { readCatalog, readCourse, readChapterContent } from './content-local';

export async function getCourseCatalog(): Promise<CourseCatalogEntry[]> {
  return await readCatalog();
}

export async function getCourse(courseId: string): Promise<ContentCourse | null> {
  return await readCourse(courseId);
}

export async function getChapterContent(courseId: string, chapterId: string): Promise<string | null> {
  return await readChapterContent(courseId, chapterId);
}

export * from './content-utils';

