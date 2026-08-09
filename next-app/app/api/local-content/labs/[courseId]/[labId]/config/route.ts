import { NextResponse } from 'next/server';
import { ensureContent, readLabConfig } from '@/lib/content-local';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string; labId: string }> },
) {
  const { courseId, labId } = await params;
  try {
    await ensureContent();
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
  const config = await readLabConfig(courseId, labId);
  if (config === null) {
    return NextResponse.json(
      { error: `Lab '${labId}' config not found in course '${courseId}'` },
      { status: 404 },
    );
  }
  return NextResponse.json(config);
}
