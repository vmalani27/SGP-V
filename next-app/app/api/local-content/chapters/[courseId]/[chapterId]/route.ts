import { NextResponse } from 'next/server';
import { ensureContent, readChapterContent } from '@/lib/content-local';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string; chapterId: string }> },
) {
  const { courseId, chapterId } = await params;
  try {
    await ensureContent();
  } catch (e) {
    return NextResponse.json({ content: null, error: String(e) }, { status: 500 });
  }
  const content = await readChapterContent(courseId, chapterId);
  if (content === null) {
    return NextResponse.json(
      { content: null, error: `Chapter '${chapterId}' not found in course '${courseId}'` },
      { status: 404 },
    );
  }
  return NextResponse.json({ content });
}
