'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpenText, HeartHandshake, LayoutDashboard, Landmark, Megaphone, Menu, Settings, Users, Wallet, X } from 'lucide-react';
import { canAccessSettings, getSession, ROLE_NAV_RULES, type Role } from '@/lib/auth';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/finance', label: 'Financial records', icon: Wallet },
  { href: '/benefits', label: 'Benefits', icon: HeartHandshake },
  { href: '/announcements', label: 'Announcements', icon: Megaphone },
  { href: '/policy', label: 'Society policy', icon: BookOpenText },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    setRole(getSession()?.role ?? null);
  }, []);

  const navItems = NAV_ITEMS.filter((item) => {
    if (!role) return true;
    if (item.href === '/settings') return canAccessSettings(role);
    return ROLE_NAV_RULES[role].includes(item.href as '/' | '/members' | '/finance' | '/benefits' | '/announcements' | '/policy' | '/settings');
  });

  return (
    <div className="flex h-full flex-col text-white">
      <div className="flex items-center gap-3 px-6 pb-8 pt-7">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
          <Landmark className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <p className="font-heading text-base font-bold tracking-wide">XIKATSA</p>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-emerald-100/80">Society</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Main">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                active
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-emerald-50/85 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mx-3 mb-4 rounded-xl bg-white/10 p-4 ring-1 ring-white/10">
        <p className="text-xs font-semibold text-white">Stewardship</p>
        <p className="mt-1 text-xs leading-relaxed text-emerald-50/80">
          Every contribution, claim and payout is recorded here for transparent governance.
        </p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-primary lg:block">
        <SidebarContent />
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
            <Landmark className="h-4 w-4" aria-hidden />
          </div>
          <span className="font-heading text-sm font-bold tracking-wide text-foreground">XIKATSA SOCIETY</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm animate-in fade-in"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[calc(100vw-2rem)] bg-primary shadow-2xl animate-in slide-in-from-left duration-300">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-4 top-6 rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <main className="min-w-0 lg:pl-64">
        <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
