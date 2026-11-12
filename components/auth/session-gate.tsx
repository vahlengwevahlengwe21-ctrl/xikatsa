'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, LogOut, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { LandingPage } from '@/components/landing-page';
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
  const [showLogin, setShowLogin] = useState(false);

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
      setShowLogin(true);
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
          {showLogin ? (
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                className="fixed left-4 top-4 z-10 gap-2 rounded-full bg-white/90 shadow-sm sm:left-8 sm:top-8"
                onClick={() => setShowLogin(false)}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back to Xikatsa
              </Button>
              {sessionExpired && (
                <p role="status" className="absolute left-1/2 top-20 z-10 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg bg-amber-50 px-4 py-3 text-center text-sm text-amber-900 shadow-sm">
                  Your sign-in session expired. Sign in again to continue.
                </p>
              )}
              <LoginForm
                onLoggedIn={(nextUser) => {
                  setSessionExpired(false);
                  setUser(nextUser);
                }}
              />
            </div>
          ) : (
            <LandingPage onLogin={() => setShowLogin(true)} />
          )}
        </>
      );
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
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
                setShowLogin(false);
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
    </AppShell>
  );
}
