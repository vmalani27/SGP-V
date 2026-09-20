import { NextResponse } from 'next/server';
import { enrollCourse } from '@/lib/user-store';

export async function POST(req: Request) {
  try {
    const { courseId } = await req.json();
    if (!courseId) {
      return NextResponse.json({ error: 'courseId is required' }, { status: 400 });
    }
    const state = await enrollCourse(courseId);
    return NextResponse.json({ status: 'enrolled', courseId, state });
  } catch (err) {
    console.error('POST /api/user/enroll error:', err);
    return NextResponse.json({ error: 'Failed to enroll course' }, { status: 500 });
  }
}
