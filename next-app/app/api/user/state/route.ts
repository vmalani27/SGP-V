import { NextResponse } from 'next/server';
import { readUserState, updateProfile } from '@/lib/user-store';

export async function GET() {
  try {
    const state = await readUserState();
    return NextResponse.json(state);
  } catch (err) {
    console.error('GET /api/user/state error:', err);
    return NextResponse.json({ error: 'Failed to read user state' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.displayName) {
      const updated = await updateProfile(body.displayName);
      return NextResponse.json(updated);
    }
    const state = await readUserState();
    return NextResponse.json(state);
  } catch (err) {
    console.error('POST /api/user/state error:', err);
    return NextResponse.json({ error: 'Failed to update user profile' }, { status: 500 });
  }
}
