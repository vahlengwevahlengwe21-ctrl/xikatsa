import { NextResponse } from 'next/server';
import { one } from '@/lib/server-database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)) {
    return NextResponse.json({ error: 'Photo not found.' }, { status: 404 });
  }

  try {
    const photo = await one<{ mime_type: string; image_base64: string }>(
      'SELECT mime_type, TO_BASE64(image_data) AS image_base64 FROM society_gallery WHERE id = ?',
      [params.id],
    );
    if (!photo || !VALID_IMAGE_TYPES.has(photo.mime_type)) {
      return NextResponse.json({ error: 'Photo not found.' }, { status: 404 });
    }

    return new NextResponse(Buffer.from(photo.image_base64, 'base64'), {
      headers: {
        'Content-Type': photo.mime_type,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'The society gallery is temporarily unavailable.' }, { status: 503 });
  }
}
