'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, Plus, Search, UserRoundX, Users } from 'lucide-react';
import { MemberFormDialog } from '@/components/members/member-form-dialog';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { addCalendarMonths, formatDate, formatMoney, MEMBER_STATUS, todayIso, toCents } from '@/lib/format';
import { canManageMembers, getSession } from '@/lib/auth';
import { databaseRequest } from '@/lib/database-api';
import { getSocietySettings } from '@/lib/settings';
import type { Member, MemberStatus } from '@/lib/types';
import { selectClassName } from '@/components/form-field';

type StatusFilter = 'all' | MemberStatus;

function escapeCsv(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadMembersCsv(members: Member[]) {
  const header = ['Member number', 'Full name', 'Email', 'Phone', 'Date joined', 'Status', 'Monthly contribution'];
  const rows = members.map((member) => [
    member.member_number,
    member.full_name,
    member.email,
    member.phone,
    member.date_joined,
    MEMBER_STATUS[member.status].label,
    Number(member.monthly_contribution).toFixed(2),
  ]);
  const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `xikatsa-members-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function MembersView() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [waitingMonths, setWaitingMonths] = useState<number | null>(null);
  const sessionRole = getSession()?.role;
  const canManage = Boolean(sessionRole && canManageMembers(sessionRole));

  const load = useCallback(async () => {
    setError(null);
    try {
      const [memberRows, settings] = await Promise.all([
        databaseRequest<Member[]>('members.list'),
        getSocietySettings(),
      ]);
      setMembers(memberRows);
      setWaitingMonths(settings.waitingPeriodMonths);
    } catch {
      setError('We could not load members. Please try again.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!members) return [];
    const term = search.trim().toLowerCase();
    return members.filter((member) => {
      if (statusFilter !== 'all' && member.status !== statusFilter) return false;
      if (!term) return true;
      return [
        member.full_name,
        member.member_number,
        member.email ?? '',
        member.phone ?? '',
        member.alternate_phone ?? '',
      ]
        .some((field) => field.toLowerCase().includes(term));
    });
  }, [members, search, statusFilter]);

  const stats = useMemo(() => {
    const list = members ?? [];
    return {
      total: list.length,
      active: list.filter((m) => m.status === 'active').length,
      suspended: list.filter((m) => m.status === 'suspended').length,
      monthly: list.filter((m) => m.status === 'active')
        .reduce((sum, m) => sum + toCents(Number(m.monthly_contribution)), 0) / 100,
    };
  }, [members]);

  function handleSaved(saved: Member) {
    setMembers((prev) => {
      if (!prev) return [saved];
      const exists = prev.some((m) => m.id === saved.id);
      const next = exists ? prev.map((m) => (m.id === saved.id ? saved : m)) : [...prev, saved];
      return next.sort((a, b) => a.member_number.localeCompare(b.member_number));
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Membership"
        title="Members"
        description="The society's register. Member registration and editing are limited to authorized governance roles; other staff roles can view records."
        actions={
          <>
            <Button variant="outline" onClick={() => members && downloadMembersCsv(members)} disabled={!members?.length} className="gap-2">
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </Button>
            {canManage && (
              <Button onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" aria-hidden />
                Register member
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Total members', value: String(stats.total) },
          { label: 'Active', value: String(stats.active) },
          { label: 'Suspended', value: String(stats.suspended) },
          { label: 'Monthly contributions due', value: formatMoney(stats.monthly) },
        ].map((item) => (
          <div key={item.label} className="surface-card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{item.label}</p>
            <p className="font-heading mt-2 text-xl font-bold text-foreground">{item.value}</p>
          </div>
        ))}
      </div>

      <Card className="overflow-hidden rounded-2xl shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, number, email or phone"
              className="pl-9"
              aria-label="Search members"
            />
          </div>
          <select
            className={`${selectClassName} sm:w-44`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {(Object.keys(MEMBER_STATUS) as MemberStatus[]).map((status) => (
              <option key={status} value={status}>
                {MEMBER_STATUS[status].label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div role="alert" className="p-6 text-sm text-rose-700">
            {error}{' '}
            <button type="button" onClick={load} className="font-medium underline underline-offset-4">
              Try again
            </button>
          </div>
        )}

        {!error && members === null && (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {!error && members !== null && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              {members.length === 0 ? <Users className="h-6 w-6" aria-hidden /> : <UserRoundX className="h-6 w-6" aria-hidden />}
            </div>
            <p className="font-heading text-lg font-semibold text-foreground">
              {members.length === 0 ? 'No members yet' : 'No members match your search'}
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {members.length === 0
                ? 'Register your first member to start building the society register.'
                : 'Try a different name, number or status.'}
            </p>
            {members.length === 0 && canManage && (
              <Button onClick={() => setDialogOpen(true)} className="mt-6 gap-2">
                <Plus className="h-4 w-4" aria-hidden />
                Register first member
              </Button>
            )}
          </div>
        )}

        {!error && members !== null && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Member</TableHead>
                  <TableHead className="hidden md:table-cell">Contact</TableHead>
                  <TableHead className="hidden sm:table-cell">Joined</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((member) => {
                  const eligibleWaitingMonths = waitingMonths;
                  const eligible = eligibleWaitingMonths !== null &&
                    addCalendarMonths(member.date_joined, eligibleWaitingMonths) <= todayIso();

                  return (
                    <TableRow
                      key={member.id}
                      onClick={() => router.push(`/members/${member.id}`)}
                      className="cursor-pointer transition-colors duration-150 hover:bg-emerald-50/60"
                    >
                      <TableCell>
                        <div className="space-y-1.5">
                          <Link href={`/members/${member.id}`} className="font-medium text-foreground hover:text-emerald-800" onClick={(e) => e.stopPropagation()}>
                            {member.full_name}
                          </Link>
                          <p className="text-xs text-muted-foreground">{member.member_number}</p>
                          <StatusBadge
                            label={eligibleWaitingMonths === null
                              ? 'Checking eligibility'
                              : eligible
                                ? 'Eligible for lamp'
                                : `Waiting ${eligibleWaitingMonths}m`}
                            tone={eligible ? 'green' : 'amber'}
                            className="w-fit"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="text-sm text-foreground">{member.email ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          {[member.phone, member.alternate_phone].filter(Boolean).join(' · ')}
                        </p>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{formatDate(member.date_joined)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(Number(member.monthly_contribution))}</TableCell>
                      <TableCell>
                        <StatusBadge label={MEMBER_STATUS[member.status].label} tone={MEMBER_STATUS[member.status].tone} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {canManage && (
        <MemberFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={handleSaved} />
      )}
    </>
  );
}
