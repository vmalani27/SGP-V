import { NextResponse } from 'next/server';
import { ensureContent, readLabTasks } from '@/lib/content-local';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string; labId: string }> },
) {
  const { courseId, labId } = await params;
  try {
    await ensureContent();
  } catch (e) {
    return NextResponse.json({ lab_id: labId, tasks: [], error: String(e) }, { status: 500 });
  }
  const tasks = await readLabTasks(courseId, labId);
  if (tasks === null) {
    return NextResponse.json(
      { error: `Lab '${labId}' config not found in course '${courseId}'` },
      { status: 404 },
    );
  }
  return NextResponse.json({ lab_id: labId, tasks });
}
