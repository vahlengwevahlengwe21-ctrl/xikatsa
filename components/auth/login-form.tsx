'use client';

import { useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { loginWithCredentials, setSession, type SessionUser } from '@/lib/auth';

export function LoginForm({ onLoggedIn }: { onLoggedIn: (user: SessionUser) => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const session = await loginWithCredentials(identifier, password);
      if (!session) {
        setPassword('');
        setError('Invalid sign-in details.');
        return;
      }
      setSession(session);
      onLoggedIn(session);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-100 via-white to-sky-100 px-4 py-10">
      <Card className="w-full max-w-md overflow-hidden shadow-xl">
        <CardHeader className="bg-emerald-950 px-6 py-6 text-white">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <ShieldCheck className="h-6 w-6" aria-hidden />
          </div>
          <CardTitle className="font-heading text-2xl text-white">XIKATSA SOCIETY</CardTitle>
          <CardDescription className="text-emerald-100">Secure governance portal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="login_identifier" className="text-sm font-medium text-foreground">ID number</label>
              <Input
                id="login_identifier"
                type="text"
                autoComplete="username"
                required
                maxLength={13}
                inputMode="numeric"
                pattern="[0-9]{13}"
                title="Enter your 13-digit ID number."
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="Enter your 13-digit ID number"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="login_password" className="text-sm font-medium text-foreground">Password</label>
              <Input
                id="login_password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full gap-2" disabled={loading}>
              <LockKeyhole className="h-4 w-4" aria-hidden />
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>

            <div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 text-emerald-950" role="note" aria-label="Authorized access notice">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold">Authorized access only</p>
                <p className="text-xs leading-relaxed text-emerald-900/80">
                  This secure portal is for authorized members and staff of Xikatsa Society.
                </p>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
