import { NextResponse } from 'next/server';
import { ensureContent, readCourse } from '@/lib/content-local';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await params;
  try {
    await ensureContent();
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
  const course = await readCourse(courseId);
  if (!course) {
    return NextResponse.json({ error: `Course '${courseId}' not found` }, { status: 404 });
  }
  return NextResponse.json(course);
}
