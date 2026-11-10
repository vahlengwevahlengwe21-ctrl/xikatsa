'use client';

import { useEffect, useState } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { LoginForm } from '@/components/auth/login-form';
import { Button } from '@/components/ui/button';
import {
  clearSession,
  logoutSession,
  refreshSession,
  ROLE_LABELS,
  SESSION_EXPIRED_EVENT,
  type SessionUser,
} from '@/lib/auth';

export function SessionGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    refreshSession()
      .then(setUser)
      .catch(() => setError('The session service is unavailable. Refresh the page to try again.'))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      clearSession();
      setSessionExpired(true);
      setError(null);
      setUser(null);
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  if (!ready) return null;

  if (!user) {
    return error
      ? <div role="alert" className="p-6 text-center text-sm text-rose-700">{error}</div>
      : (
        <>
          {sessionExpired && (
            <p role="status" className="mb-4 text-center text-sm text-amber-800">
              Your sign-in session expired. Sign in again to continue.
            </p>
          )}
          <LoginForm
            onLoggedIn={(nextUser) => {
              setSessionExpired(false);
              setUser(nextUser);
            }}
          />
        </>
      );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between lg:ml-64 lg:w-[calc(100%-16rem)]">
        <div className="flex min-w-0 items-start gap-2 sm:items-center">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          <span className="min-w-0 break-words">
            Signed in as <strong>{user.role === 'super-administrator' ? 'System account' : user.name}</strong>
            {user.role !== 'super-administrator' && <> · {ROLE_LABELS[user.role]}</>}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-2 self-start border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50 sm:self-auto"
          onClick={async () => {
            setError(null);
            try {
              await logoutSession();
              clearSession();
              setUser(null);
            } catch {
              setError('Sign-out failed. Please try again.');
            }
          }}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {children}
    </div>
  );
}
