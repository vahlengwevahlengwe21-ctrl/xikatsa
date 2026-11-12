import { NextResponse } from 'next/server';
import { one } from '@/lib/server-database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function GET() {
  try {
    const photo = await one<{ mime_type: string; image_base64: string }>(
      'SELECT mime_type, TO_BASE64(image_data) AS image_base64 FROM society_founder_photo WHERE id = 1',
    );
    if (!photo || !VALID_IMAGE_TYPES.has(photo.mime_type)) {
      return NextResponse.json({ error: 'The founder portrait has not been published.' }, { status: 404 });
    }

    return new NextResponse(Buffer.from(photo.image_base64, 'base64'), {
      headers: {
        'Content-Type': photo.mime_type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'The founder portrait is temporarily unavailable.' }, { status: 503 });
  }
}
