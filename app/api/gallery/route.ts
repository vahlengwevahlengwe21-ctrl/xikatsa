import { NextResponse } from 'next/server';
import { execute, rows } from '@/lib/server-database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await execute(
      'SELECT id, caption, mime_type, created_at FROM society_gallery ORDER BY created_at ASC, id ASC LIMIT 100',
    );
    return NextResponse.json({ photos: rows(result) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: 'The society gallery is temporarily unavailable.' },
      { status: 503 },
    );
  }
}
