import { NextResponse } from 'next/server';
import { COMMITTEE_OFFICE_ROLES, type CommitteeOfficeRole } from '@/lib/auth';
import { one } from '@/lib/server-database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function GET(
  _request: Request,
  { params }: { params: { role: string } },
) {
  if (!COMMITTEE_OFFICE_ROLES.includes(params.role as CommitteeOfficeRole)) {
    return NextResponse.json({ error: 'Committee photo not found.' }, { status: 404 });
  }

  try {
    const photo = await one<{ mime_type: string; image_base64: string }>(
      'SELECT mime_type, TO_BASE64(image_data) AS image_base64 FROM society_committee_profiles WHERE role_key = ? AND image_data IS NOT NULL',
      [params.role],
    );
    if (!photo || !VALID_IMAGE_TYPES.has(photo.mime_type)) {
      return NextResponse.json({ error: 'Committee photo not found.' }, { status: 404 });
    }

    return new NextResponse(Buffer.from(photo.image_base64, 'base64'), {
      headers: {
        'Content-Type': photo.mime_type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Committee photos are temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
