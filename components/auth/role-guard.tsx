'use client';

import { getSession, type Role } from '@/lib/auth';

export function RoleGate({ children, allow, fallback }: { children: React.ReactNode; allow: Role[]; fallback?: React.ReactNode }) {
  const session = getSession();
  const role = session?.role;

  if (!session || !role || !allow.includes(role)) {
    return fallback ?? (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        You do not have permission to view this area.
      </div>
    );
  }

  return <>{children}</>;
}
