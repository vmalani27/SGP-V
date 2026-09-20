import { NextResponse } from 'next/server';
import { getContentVersion } from '@/lib/content-local';

export async function GET() {
  try {
    const version = await getContentVersion();
    return NextResponse.json(
      { version },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { version: 'unknown', error: (error as Error).message },
      { status: 500 }
    );
  }
}
