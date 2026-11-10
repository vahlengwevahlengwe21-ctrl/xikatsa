import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { MEMBER_ROLES, type Role, type SessionUser } from '@/lib/auth';
import { execute, one } from '@/lib/server-database';

const SESSION_COOKIE = 'xikatsa_session';
const SESSION_LIFETIME_SECONDS = 60 * 60 * 8;
const PASSWORD_KEY_LENGTH = 64;

function deriveKey(password: string, salt: string, length: number, options?: { N: number; r: number; p: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, length, options ?? {}, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt, PASSWORD_KEY_LENGTH, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== '16384' || parts[2] !== '8' || parts[3] !== '1') {
    await deriveKey(password, 'xikatsa-invalid-password-hash', PASSWORD_KEY_LENGTH, { N: 16384, r: 8, p: 1 });
    return false;
  }

  const salt = parts[4];
  const expected = Buffer.from(parts[5], 'hex');
  if (
    !salt ||
    expected.length !== PASSWORD_KEY_LENGTH ||
    !/^[a-f0-9]{32}$/i.test(salt) ||
    !/^[a-f0-9]{128}$/i.test(parts[5])
  ) {
    await deriveKey(password, 'xikatsa-invalid-password-hash', PASSWORD_KEY_LENGTH, { N: 16384, r: 8, p: 1 });
    return false;
  }

  const actual = await deriveKey(password, salt, PASSWORD_KEY_LENGTH, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(actual, expected);
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

export async function createSession(userId: string, token: string) {
  await execute(
    'INSERT INTO user_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 8 HOUR))',
    [randomBytes(16).toString('hex'), userId, hashSessionToken(token)],
  );
  return SESSION_LIFETIME_SECONDS;
}

export function getSessionToken(request: Request) {
  const cookie = request.headers.get('cookie') ?? '';
  const value = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!value) return null;

  try {
    const token = decodeURIComponent(value);
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

export async function getAuthenticatedUser(request: Request): Promise<SessionUser | null> {
  const token = getSessionToken(request);
  if (!token) return null;

  const user = await one<{ id: string; member_id: string | null; full_name: string; login_id: string | null; role: string }>(
    `SELECT u.id, u.member_id, u.full_name, u.login_id, r.role_key AS role
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id AND u.is_active = TRUE
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     LEFT JOIN members m ON m.id = u.member_id
     WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
       AND (r.role_key <> 'member' OR m.status = 'active')
     LIMIT 1`,
    [hashSessionToken(token)],
  );

  if (!user || !MEMBER_ROLES.includes(user.role as Role)) return null;
  if (user.role === 'member' && !user.member_id) return null;
  return {
    id: user.id,
    memberId: user.member_id,
    loginId: user.login_id ?? '',
    name: user.full_name,
    role: user.role as Role,
  };
}

export async function revokeSession(request: Request) {
  const token = getSessionToken(request);
  if (token) {
    await execute('DELETE FROM user_sessions WHERE token_hash = ?', [hashSessionToken(token)]);
  }
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return origin !== null && origin === new URL(request.url).origin;
}
