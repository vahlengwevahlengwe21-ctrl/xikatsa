import { NextResponse } from 'next/server';
import { isSameOrigin, revokeSession } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 });
  }

  try {
    await revokeSession(request);
    const response = NextResponse.json({ ok: true });
    response.cookies.set('xikatsa_session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });
    return response;
  } catch {
    return NextResponse.json({ ok: false, error: 'Sign-out is temporarily unavailable.' }, { status: 503 });
  }
}
