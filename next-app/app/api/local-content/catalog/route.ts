import { NextResponse } from 'next/server';
import { ensureContent, readCatalog } from '@/lib/content-local';

export async function GET() {
  try {
    await ensureContent();
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
  const catalog = await readCatalog();
  return NextResponse.json(catalog);
}
