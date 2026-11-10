'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, HeartHandshake, Scale, Users, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { DeathBeneficiariesCard } from '@/components/members/death-beneficiaries-card';
import { DependantsCard } from '@/components/members/dependants-card';
import { StatusBadge } from '@/components/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { MAX_ACTIVE_DEPENDANTS, toCents, TRANSACTION_KIND, formatDate, formatMoney, toIsoDate } from '@/lib/format';
import { databaseRequest } from '@/lib/database-api';
import { ROLE_DASHBOARD_COPY, getSession } from '@/lib/auth';
import type { Announcement, Beneficiary, Dependant, Transaction } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MemberSnapshot {
  id: string;
  status: string;
  monthly_contribution: number;
}

interface DashboardData {
  members: MemberSnapshot[];
  transactions: Transaction[];
  openClaims: { id: string; amount: number }[];
  announcements: Announcement[];
  waitingPeriodMonths: number;
  openingBalance: { amount: number; effectiveMonth: string } | null;
  memberId?: string;
  dependants?: Dependant[];
  beneficiaries?: Beneficiary[];
}

interface MonthlyPoint {
  month: string;
  income: number;
  expense: number;
}

function buildMonthlySeries(transactions: Transaction[], now: Date): MonthlyPoint[] {
  const points: MonthlyPoint[] = [];
  const [currentYear, currentMonth] = toIsoDate(now).split('-').map(Number);
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(currentYear, currentMonth - 1 - offset, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    let incomeCents = 0;
    let expenseCents = 0;
    for (const tx of transactions) {
      if (tx.occurred_on.slice(0, 7) !== key) continue;
      const amountCents = toCents(Number(tx.amount));
      if (TRANSACTION_KIND[tx.kind].income) incomeCents += amountCents;
      else expenseCents += amountCents;
    }
    points.push({
      month: date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
      income: incomeCents / 100,
      expense: expenseCents / 100,
    });
  }
  return points;
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Users;
  tone: 'emerald' | 'sky' | 'amber' | 'rose';
}) {
  const toneClasses = {
    emerald: 'bg-emerald-50 text-emerald-700',
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
  }[tone];

  return (
    <div className="surface-card group p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110', toneClasses)}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
      <p className="font-heading mt-4 text-2xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMember = getSession()?.role === 'member';

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await databaseRequest<DashboardData>('overview.load'));
    } catch {
      setError('We could not load the overview. Please refresh the page to try again.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const thisMonthKey = toIsoDate(now).slice(0, 7);
    const allTransactions = [...data.transactions].sort(
      (a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at),
    );
    let contributionsCents = 0;
    let expensesCents = 0;
    let monthIncomeCents = 0;
    let monthExpensesCents = 0;
    for (const tx of allTransactions) {
      const isIncome = TRANSACTION_KIND[tx.kind].income;
      const amountCents = toCents(Number(tx.amount));
      if (tx.kind === 'contribution') contributionsCents += amountCents;
      if (!isIncome) expensesCents += amountCents;
      if (tx.occurred_on.slice(0, 7) === thisMonthKey) {
        if (isIncome) monthIncomeCents += amountCents;
        else monthExpensesCents += amountCents;
      }
    }
    const activeMembers = data.members.filter((m) => m.status === 'active');
    const expectedMonthlyCents = activeMembers.reduce((sum, m) => sum + toCents(Number(m.monthly_contribution)), 0);
    const monthlyContributionsCents = allTransactions
      .filter((tx) => tx.kind === 'contribution' && tx.occurred_on.slice(0, 7) === thisMonthKey)
      .reduce((sum, tx) => sum + toCents(Number(tx.amount)), 0);
    const openClaimsAmount = data.openClaims.reduce((sum, c) => sum + Number(c.amount), 0);
    return {
      totalMembers: data.members.length,
      activeMembers: activeMembers.length,
      expectedMonthly: expectedMonthlyCents / 100,
      monthlyContributions: monthlyContributionsCents / 100,
      netPosition: (contributionsCents - expensesCents) / 100,
      monthNet: (monthIncomeCents - monthExpensesCents) / 100,
      openClaimsCount: data.openClaims.length,
      openClaimsAmount,
      series: buildMonthlySeries(allTransactions, now),
      recent: allTransactions.slice(0, 6),
    };
  }, [data]);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Society at a glance"
        description={
          getSession()?.role
            ? ROLE_DASHBOARD_COPY[getSession()!.role]
            : "A live picture of membership, the society's finances and benefits that are waiting for a decision."
        }
        actions={
          !isMember ? <>
            <Link href="/members" className={buttonVariants({ variant: 'outline' })}>
              Manage members
            </Link>
            <Link href="/finance" className={buttonVariants({ variant: 'default' })}>
              Record entry
            </Link>
          </> : undefined
        }
      />

      {error && (
        <div role="alert" className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
          <Button variant="link" className="ml-2 h-auto p-0 text-rose-800" onClick={load}>
            Try again
          </Button>
        </div>
      )}

      {!summary || !data ? null : data.announcements.length > 0 ? (
        <Alert className="mb-6 border-amber-200 bg-amber-50 text-amber-900">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{data.announcements[0].title}</p>
              <p className="mt-0.5 text-sm text-amber-800">{data.announcements[0].body}</p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
              {data.announcements[0].severity}
            </span>
          </div>
        </Alert>
      ) : null}

      {!summary || !data ? null : getSession()?.role === 'member' ? (
        <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <p className="font-medium">Member access</p>
          <p className="mt-1">You can manage covered dependants and nominate death beneficiaries. Dependants complete a six-month waiting period; beneficiary claims are payable only after you qualify and are recorded deceased.</p>
          <Link href="/benefits" className="mt-3 inline-flex font-medium text-sky-800 underline underline-offset-4">
            Submit or review a benefit claim
          </Link>
        </div>
      ) : null}

      {!summary || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : isMember ? (
        <div className="space-y-6">
          {data.memberId && (
            <div className="space-y-6">
              <DependantsCard
                memberId={data.memberId}
                dependants={data.dependants ?? []}
                canEditExisting={false}
                onSaved={(dependant) => {
                  setData((current) => current ? {
                    ...current,
                    dependants: [
                      ...(current.dependants ?? []).filter((item) => item.id !== dependant.id),
                      dependant,
                    ],
                  } : current);
                }}
                onRetired={(dependant) => {
                  setData((current) => current ? {
                    ...current,
                    dependants: (current.dependants ?? []).map((item) => item.id === dependant.id ? dependant : item),
                  } : current);
                }}
              />
              <DeathBeneficiariesCard
                memberId={data.memberId}
                beneficiaries={data.beneficiaries ?? []}
                canEditExisting={false}
                onSaved={(beneficiary) => {
                  setData((current) => current ? {
                    ...current,
                    beneficiaries: [
                      ...(current.beneficiaries ?? []).filter((item) => item.id !== beneficiary.id),
                      beneficiary,
                    ],
                  } : current);
                }}
                onRetired={(beneficiary) => {
                  setData((current) => current ? {
                    ...current,
                    beneficiaries: (current.beneficiaries ?? []).map((item) => item.id === beneficiary.id ? beneficiary : item),
                  } : current);
                }}
              />
            </div>
          )}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="font-heading text-lg">Society updates</CardTitle>
              <CardDescription>Current notices published for society members.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.announcements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No announcements are currently active.</p>
              ) : (
                <ul className="space-y-3">
                  {data.announcements.map((announcement) => (
                    <li key={announcement.id} className="rounded-xl border border-border p-3">
                      <p className="font-medium text-foreground">{announcement.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{announcement.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {data.memberId && (
            <Card className="rounded-2xl border-emerald-200 bg-emerald-50/60 shadow-sm">
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-heading font-semibold text-emerald-950">Your group membership</p>
                  <p className="mt-1 text-sm text-emerald-900/80">
                    Your role account is also a main membership. View your contribution, dependants, and benefit claims.
                  </p>
                </div>
                <Link href={`/members/${data.memberId}`} className={buttonVariants({ variant: 'outline' })}>
                  View my membership
                </Link>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              label="Active members"
              value={String(summary.activeMembers)}
              hint={`${summary.totalMembers} registered in total`}
              icon={Users}
              tone="emerald"
            />
            <KpiCard
              label="Net position"
              value={formatMoney(summary.netPosition)}
              hint="All member contributions less all expenses"
              icon={Scale}
              tone="sky"
            />
            <KpiCard
              label="This month"
              value={formatMoney(summary.monthNet)}
              hint={`${formatMoney(summary.expectedMonthly)} expected in monthly contributions`}
              icon={summary.monthNet >= 0 ? ArrowUpRight : ArrowDownRight}
              tone={summary.monthNet >= 0 ? 'emerald' : 'rose'}
            />
            <KpiCard
              label="Contributions received"
              value={formatMoney(summary.monthlyContributions)}
              hint={`of ${formatMoney(summary.expectedMonthly)} expected this month`}
              icon={Wallet}
              tone="emerald"
            />
            <KpiCard
              label="Open benefit claims"
              value={String(summary.openClaimsCount)}
              hint={`${formatMoney(summary.openClaimsAmount)} awaiting a decision or payment`}
              icon={HeartHandshake}
              tone="amber"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="font-heading text-lg">Society policy</CardTitle>
                <CardDescription>Rules that keep the membership structure fair and accountable.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                  <p className="font-medium">Main member cover</p>
                  <p className="mt-1">Each main member may carry up to {MAX_ACTIVE_DEPENDANTS} active dependants.</p>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sky-900">
                  <p className="font-medium">Joining fee</p>
                  <p className="mt-1">A one-time joining fee is recorded as a separate ledger entry when a member joins.</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <p className="font-medium">Monthly contribution</p>
                  <p className="mt-1">Every active member has a recurring monthly contribution that is expected each cycle.</p>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">
                  <p className="font-medium">Waiting period</p>
                  <p className="mt-1">Members cannot submit a benefit claim or receive a lamp before completing {data.waitingPeriodMonths} months of membership.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="font-heading text-lg">Upcoming announcements</CardTitle>
                <CardDescription>Current notices published for society members.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.announcements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No announcements are currently active.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.announcements.slice(0, 3).map((announcement) => (
                      <li key={announcement.id} className="rounded-xl border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-foreground">{announcement.title}</p>
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-emerald-800">
                            {announcement.severity}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{announcement.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid min-w-0 gap-6 xl:grid-cols-3">
            <Card className="min-w-0 rounded-2xl shadow-sm xl:col-span-2">
              <CardHeader>
                <CardTitle className="font-heading text-lg">Cash flow, last six months</CardTitle>
                <CardDescription>Contributions and other funds received compared with expenses and benefit payouts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={6}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(150 10% 88%)" />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'hsl(160 8% 38%)' }} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 12, fill: 'hsl(160 8% 38%)' }}
                        tickFormatter={(v) => Number(v) >= 1000 ? `R${Math.round(Number(v) / 1000)}k` : formatMoney(Number(v))}
                        width={56}
                      />
                      <Tooltip
                        cursor={{ fill: 'hsl(150 12% 95%)' }}
                        formatter={(value) => formatMoney(Number(value))}
                        contentStyle={{ borderRadius: 12, border: '1px solid hsl(150 10% 88%)', fontSize: 13 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 13 }} />
                      <Bar name="Funds received" dataKey="income" fill="#059669" radius={[6, 6, 0, 0]} />
                      <Bar name="Expenses" dataKey="expense" fill="#e11d48" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="font-heading text-lg">Recent activity</CardTitle>
                  <CardDescription>Latest financial records</CardDescription>
                </div>
                <Link href="/finance" className="text-sm font-medium text-emerald-700 hover:text-emerald-900">
                  View all
                </Link>
              </CardHeader>
              <CardContent>
                {summary.recent.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No financial records yet. Record a contribution to get started.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {summary.recent.map((tx) => {
                      const isIncome = TRANSACTION_KIND[tx.kind].income;
                      return (
                        <li key={tx.id} className="flex items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{tx.description}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {tx.member?.full_name ?? 'Society'} · {formatDate(tx.occurred_on)}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={cn('text-sm font-semibold', isIncome ? 'text-emerald-700' : 'text-rose-700')}>
                              {isIncome ? '+' : '-'}
                              {formatMoney(tx.amount)}
                            </p>
                            <StatusBadge label={TRANSACTION_KIND[tx.kind].label} tone={TRANSACTION_KIND[tx.kind].tone} className="mt-1" />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
