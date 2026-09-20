import { NextResponse } from 'next/server';
import { setChapterProgress, setLabProgress } from '@/lib/user-store';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { courseId, moduleId, chapterId, labId, status = 'completed' } = body;

    if (!courseId || !moduleId) {
      return NextResponse.json({ error: 'courseId and moduleId are required' }, { status: 400 });
    }

    if (chapterId) {
      const state = await setChapterProgress(courseId, moduleId, chapterId, status);
      return NextResponse.json({ status: 'ok', progress: state.courseProgress[courseId] });
    }

    if (labId) {
      const state = await setLabProgress(courseId, moduleId, labId, status);
      return NextResponse.json({ status: 'ok', labsProgress: state.labProgress[courseId] });
    }

    return NextResponse.json({ error: 'Either chapterId or labId must be provided' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/user/progress error:', err);
    return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 });
  }
}
