import { promises as fs } from 'fs';
import path from 'path';
import type { ContentCourse, CourseCatalogEntry } from './content-types';

const CONTENT_DIR = path.join(process.cwd(), 'content');
const CATALOG_PATH = path.join(CONTENT_DIR, 'index.json');

export async function getCourseCatalog(): Promise<CourseCatalogEntry[]> {
  const data = await fs.readFile(CATALOG_PATH, 'utf-8');
  const catalog = JSON.parse(data);
  return catalog.courses as CourseCatalogEntry[];
}

export async function getCourse(courseId: string): Promise<ContentCourse | null> {
  try {
    const coursePath = path.join(CONTENT_DIR, 'courses', courseId, 'course.json');
    const data = await fs.readFile(coursePath, 'utf-8');
    return JSON.parse(data) as ContentCourse;
  } catch {
    return null;
  }
}

export async function getLabContent(contentPath: string): Promise<string | null> {
  try {
    const fullPath = path.join(CONTENT_DIR, contentPath);
    return await fs.readFile(fullPath, 'utf-8');
  } catch {
    return null;
  }
}
