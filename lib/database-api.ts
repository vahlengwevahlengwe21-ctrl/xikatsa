import { SESSION_EXPIRED_EVENT } from '@/lib/auth';

export async function databaseRequest<T>(operation: string, input: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch('/api/database', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ operation, input }),
  });
  const payload = (await response.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new Error('Your sign-in session has expired. Please sign in again.');
  }
  if (!response.ok) {
    throw new Error(payload?.error ?? 'The database request failed.');
  }
  return payload?.data as T;
}
