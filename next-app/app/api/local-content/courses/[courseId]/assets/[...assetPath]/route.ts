import { NextRequest, NextResponse } from 'next/server';
import { ensureContent, readAssetBuffer } from '@/lib/content-local';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ courseId: string; assetPath: string[] }> }
) {
  const { courseId, assetPath } = await params;

  if (!courseId || !assetPath || assetPath.length === 0) {
    return new NextResponse('Asset not found', { status: 404 });
  }

  try {
    await ensureContent();
  } catch (e) {
    return new NextResponse(`Error loading content store: ${String(e)}`, { status: 500 });
  }

  const joinedPath = assetPath.join('/');
  const asset = await readAssetBuffer(courseId, joinedPath);

  if (!asset) {
    return new NextResponse(`Asset '${joinedPath}' not found for course '${courseId}'`, { status: 404 });
  }

  return new NextResponse(asset.buffer, {
    status: 200,
    headers: {
      'Content-Type': asset.mimeType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
    },
  });
}
