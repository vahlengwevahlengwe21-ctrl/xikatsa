import { NextResponse } from 'next/server';
import { MEMBER_ROLES, type Role, type SessionUser } from '@/lib/auth';
import { isValidIdNumber, normalizeIdNumber } from '@/lib/id-number';
import { createSession, isSameOrigin, newSessionToken, verifyPassword } from '@/lib/server-auth';
import { execute, one } from '@/lib/server-database';

const SESSION_COOKIE = 'xikatsa_session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => null)) as { identifier?: unknown; password?: unknown } | null;
    const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (
      !isValidIdNumber(identifier) ||
      !password ||
      password.length > 128
    ) {
      return NextResponse.json({ ok: false, error: 'Invalid sign-in details.' }, { status: 400 });
    }
    const loginId = normalizeIdNumber(identifier);

    const user = await one<{
      id: string;
      full_name: string;
      login_id: string | null;
      member_id: string | null;
      password_hash: string;
      role: Role;
      is_active: boolean | number;
      locked_until: string | null;
    }>(
      `SELECT u.id, u.member_id, u.full_name, u.email, u.login_id, u.password_hash, u.is_active, u.locked_until, r.role_key AS role
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       LEFT JOIN members m ON m.id = u.member_id
       WHERE u.login_id = ?
         AND (r.role_key <> 'member' OR (u.member_id IS NOT NULL AND m.status = 'active'))
       LIMIT 1`,
      [loginId],
    );

    if (!user || !Boolean(Number(user.is_active))) {
      await verifyPassword(password, 'invalid');
      return NextResponse.json({ ok: false, error: 'Invalid sign-in details.' }, { status: 401 });
    }

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      await verifyPassword(password, user.password_hash);
      return NextResponse.json({ ok: false, error: 'Invalid sign-in details.' }, { status: 401 });
    }

    const passwordMatches = await verifyPassword(password, user.password_hash);
    if (!passwordMatches) {
      await execute(
        `UPDATE users
         SET failed_login_attempts = LEAST(failed_login_attempts + 1, 5),
             locked_until = CASE WHEN failed_login_attempts >= 4
               THEN DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 15 MINUTE)
               ELSE locked_until END
         WHERE id = ?`,
        [user.id],
      );
      return NextResponse.json({ ok: false, error: 'Invalid sign-in details.' }, { status: 401 });
    }

    await execute('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);

    if (!MEMBER_ROLES.includes(user.role) || (user.role === 'member' && !user.member_id)) {
      return NextResponse.json({ ok: false, error: 'Invalid sign-in details.' }, { status: 401 });
    }

    const token = newSessionToken();
    const maxAge = await createSession(user.id, token);
    const sessionUser: SessionUser = {
      id: user.id,
      memberId: user.member_id,
      loginId: user.login_id ?? loginId,
      name: user.full_name,
      role: user.role,
    };

    const response = NextResponse.json({ ok: true, user: sessionUser }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge,
    });
    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Sign-in is temporarily unavailable.' },
      { status: 503 },
    );
  }
}
