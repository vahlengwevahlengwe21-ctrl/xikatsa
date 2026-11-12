import { NextResponse } from 'next/server';
import { execute, rows } from '@/lib/server-database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await execute(
      `SELECT r.role_key, u.full_name, COALESCE(p.bio, '') AS bio,
          p.image_data IS NOT NULL AS has_photo
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       JOIN society_committee_profiles p ON p.role_key = r.role_key
       WHERE r.role_key IN ('chairperson', 'deputy-chairperson', 'finance', 'deputy-finance', 'secretary', 'deputy-secretary')
         AND u.is_active = TRUE
       ORDER BY r.id ASC, u.full_name ASC`,
    );
    return NextResponse.json(
      { profiles: rows(result) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { error: 'Committee profiles are temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
