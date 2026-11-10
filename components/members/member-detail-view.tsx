'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BadgeDollarSign, HeartHandshake, Pencil, Plus, ReceiptText, Trash2, UserRoundX, Wallet } from 'lucide-react';
import { DeathBeneficiariesCard } from '@/components/members/death-beneficiaries-card';
import { DependantsCard } from '@/components/members/dependants-card';
import { MemberFormDialog } from '@/components/members/member-form-dialog';
import { ClaimDialog } from '@/components/benefits/claim-dialog';
import { TransactionDialog } from '@/components/finance/transaction-dialog';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { addCalendarMonths, CLAIM_STATUS, MAX_ACTIVE_DEPENDANTS, MEMBER_STATUS, toCents, todayIso, TRANSACTION_KIND, formatDate, formatMoney, toIsoDate } from '@/lib/format';
import { databaseRequest } from '@/lib/database-api';
import { canManageMembers, canRemoveBeneficiaries, getSession, GOVERNANCE_ROLES } from '@/lib/auth';
import { getSocietySettings } from '@/lib/settings';
import type { Beneficiary, BenefitClaim, Dependant, Member, Transaction } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MemberBundle {
  member: Member;
  dependants: Dependant[];
  beneficiaries: Beneficiary[];
  claims: BenefitClaim[];
  transactions: Transaction[];
}

export function MemberDetailView({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [bundle, setBundle] = useState<MemberBundle | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [editOpen, setEditOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [contributionOpen, setContributionOpen] = useState(false);
  const [pendingMemberAction, setPendingMemberAction] = useState<'delete' | 'deceased' | null>(null);
  const [savingMemberAction, setSavingMemberAction] = useState(false);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const [waitingMonths, setWaitingMonths] = useState<number | null>(null);
  const canManage = Boolean(getSession()?.role && canManageMembers(getSession()!.role));

  const load = useCallback(async () => {
    try {
      const [data, settings] = await Promise.all([
        databaseRequest<MemberBundle | null>('members.detail', { id: memberId }),
        getSocietySettings(),
      ]);
      if (!data) {
        setStatus('missing');
        return;
      }
      setBundle(data);
      setWaitingMonths(settings.waitingPeriodMonths);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [memberId]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    if (!bundle) return null;
    const monthKey = toIsoDate(new Date()).slice(0, 7);
    const contributedCents = bundle.transactions
      .filter((t) => t.kind === 'contribution' || t.kind === 'joining_fee' || t.kind === 'donation')
      .reduce((sum, t) => sum + toCents(Number(t.amount)), 0);
    const monthlyPaidCents = bundle.transactions
      .filter((transaction) => transaction.kind === 'contribution' && transaction.occurred_on.slice(0, 7) === monthKey)
      .reduce((sum, transaction) => sum + toCents(Number(transaction.amount)), 0);
    const paidOutCents = bundle.claims.filter((c) => c.status === 'paid').reduce((sum, c) => sum + toCents(Number(c.amount)), 0);
    const openClaims = bundle.claims.filter((c) => c.status === 'pending' || c.status === 'approved').length;
    const monthlyExpected = Number(bundle.member.monthly_contribution);
    const activeDependants = bundle.dependants.filter((dependant) => dependant.is_active).length;
    if (waitingMonths === null) return null;
    const monthlyExpectedCents = toCents(monthlyExpected);
    const qualificationDate = bundle.member.deceased_at?.slice(0, 10) ?? todayIso();
    const eligibleForLamp = addCalendarMonths(bundle.member.date_joined, waitingMonths) <= qualificationDate;
    return {
      contributed: contributedCents / 100,
      paidOut: paidOutCents / 100,
      openClaims,
      monthlyPaid: monthlyPaidCents / 100,
      monthlyExpected,
      monthlyDue: Math.max(0, monthlyExpectedCents - monthlyPaidCents) / 100,
      activeDependants,
      eligibleForLamp,
      waitingMonths,
    };
  }, [bundle, waitingMonths]);

  if (status === 'loading') {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (status === 'missing' || status === 'error' || !bundle || !totals) {
    return (
      <div className="surface-card flex flex-col items-center px-6 py-16 text-center">
        <p className="font-heading text-lg font-semibold">
          {status === 'missing' ? 'This member could not be found' : 'We could not load this member'}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">They may have been removed, or the connection failed.</p>
        <Link href="/members" className={cn(buttonVariants({ variant: 'outline' }), 'mt-6')}>
          Back to members
        </Link>
      </div>
    );
  }

  const { member, dependants, beneficiaries, claims, transactions } = bundle;
  const statusMeta = MEMBER_STATUS[member.status];

  function upsertDependant(saved: Dependant) {
    setBundle((prev) => {
      if (!prev) return prev;
      const exists = prev.dependants.some((dependant) => dependant.id === saved.id);
      const next = exists
        ? prev.dependants.map((dependant) => dependant.id === saved.id ? saved : dependant)
        : [...prev.dependants, saved];
      return { ...prev, dependants: next };
    });
  }

  function upsertBeneficiary(saved: Beneficiary) {
    setBundle((prev) => {
      if (!prev) return prev;
      const exists = prev.beneficiaries.some((b) => b.id === saved.id);
      const next = exists
        ? prev.beneficiaries.map((b) => (b.id === saved.id ? saved : b))
        : [...prev.beneficiaries, saved];
      return { ...prev, beneficiaries: next };
    });
  }

  async function confirmMemberAction() {
    if (!pendingMemberAction) return;
    setSavingMemberAction(true);
    setMemberActionError(null);
    try {
      if (pendingMemberAction === 'delete') {
        await databaseRequest('members.delete', { id: member.id });
        router.replace('/members');
        return;
      }
      await databaseRequest('members.markDeceased', { id: member.id });
      setBundle((current) => current
        ? { ...current, member: { ...current.member, status: 'inactive', deceased_at: todayIso() } }
        : current);
      setPendingMemberAction(null);
    } catch (reason) {
      setMemberActionError(reason instanceof Error ? reason.message : 'The member could not be updated.');
    } finally {
      setSavingMemberAction(false);
    }
  }

  return (
    <>
      <Link href="/members" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All members
      </Link>

      <PageHeader
        eyebrow={member.member_number}
        title={member.full_name}
        actions={
          <>
            {canManage && !member.deceased_at && (
              <Button variant="outline" className="gap-2" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" aria-hidden />
                Edit details
              </Button>
            )}
            {getSession()?.role && GOVERNANCE_ROLES.includes(getSession()!.role) && !member.deceased_at && (
              <Button variant="outline" className="gap-2" onClick={() => { setMemberActionError(null); setPendingMemberAction('deceased'); }}>
                <UserRoundX className="h-4 w-4" aria-hidden />
                Record death
              </Button>
            )}
            {canManage && (
              <Button variant="outline" className="gap-2 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => { setMemberActionError(null); setPendingMemberAction('delete'); }}>
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete member
              </Button>
            )}
            <Button variant="outline" className="gap-2" onClick={() => setContributionOpen(true)}>
              <Wallet className="h-4 w-4" aria-hidden />
              Record payment
            </Button>
            <Button className="gap-2" onClick={() => setClaimOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              New benefit claim
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Monthly due', value: formatMoney(totals.monthlyDue), hint: `${formatMoney(totals.monthlyPaid)} received of ${formatMoney(totals.monthlyExpected)} expected`, icon: BadgeDollarSign },
          { label: 'Total contributed', value: formatMoney(totals.contributed), icon: Wallet },
          { label: 'Benefits received', value: formatMoney(totals.paidOut), icon: HeartHandshake },
          { label: 'Open claims', value: String(totals.openClaims), icon: ReceiptText },
        ].map((item) => (
          <div key={item.label} className="surface-card flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <item.icon className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
              <p className="font-heading text-lg font-bold text-foreground">{item.value}</p>
              {'hint' in item && item.hint && <p className="mt-0.5 text-xs text-muted-foreground">{item.hint}</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="rounded-2xl shadow-sm xl:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-heading text-lg">Profile</CardTitle>
              <StatusBadge label={totals?.activeDependants ? 'Main member' : 'Member'} tone={totals?.activeDependants ? 'green' : 'slate'} />
            </div>
            <CardDescription>Joined {formatDate(member.date_joined)}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-medium">Membership policy</p>
              <p className="mt-1">{totals?.activeDependants ?? 0} of {MAX_ACTIVE_DEPENDANTS} active dependants covered.</p>
              <p className="mt-1">
                {member.deceased_at
                  ? totals?.eligibleForLamp ? 'Qualified for benefits at date of death' : 'Had not completed the waiting period at date of death'
                  : totals?.eligibleForLamp ? 'Eligible for lamp access' : `Waiting period active: ${totals?.waitingMonths ?? 6} months`}
              </p>
              {member.deceased_at && <p className="mt-1">Recorded deceased {formatDate(member.deceased_at)}. Death-beneficiary claims may be submitted if the member qualified on that date.</p>}
            </div>
            <dl className="space-y-4 text-sm">
              {(canManage ? [
                { label: 'ID number', value: member.id_number },
              ] : []).concat([
                { label: 'Email', value: member.email },
                { label: 'Contact number', value: member.phone },
                { label: 'Alternative contact number', value: member.alternate_phone },
                { label: 'Address', value: member.address },
                { label: 'Notes', value: member.notes },
              ]).map((row) => (
                <div key={row.label}>
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{row.label}</dt>
                  <dd className="mt-1 whitespace-pre-line text-foreground">{row.value || '—'}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <div className="xl:col-span-2">
          <div className="space-y-6">
            <DependantsCard
              memberId={member.id}
              dependants={dependants}
              canEdit
              canEditExisting={getSession()?.role !== 'member'}
              canRemove={Boolean(getSession()?.role && canRemoveBeneficiaries(getSession()!.role))}
              onSaved={upsertDependant}
              onRetired={(retired) => {
                setBundle((prev) => prev
                  ? { ...prev, dependants: prev.dependants.map((item) => item.id === retired.id ? retired : item) }
                  : prev);
              }}
            />
            <DeathBeneficiariesCard
              memberId={member.id}
              beneficiaries={beneficiaries}
              canEdit
              canEditExisting={getSession()?.role !== 'member'}
              canRemove={Boolean(getSession()?.role && canRemoveBeneficiaries(getSession()!.role))}
              onSaved={upsertBeneficiary}
              onRetired={(retired) => {
                setBundle((prev) => prev
                  ? { ...prev, beneficiaries: prev.beneficiaries.map((item) => item.id === retired.id ? retired : item) }
                  : prev);
              }}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6">
        <Card className="overflow-hidden rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-lg">Benefit claims</CardTitle>
            <CardDescription>Every request this member has made, and its outcome</CardDescription>
          </CardHeader>
          {claims.length === 0 ? (
            <p className="px-6 pb-8 text-sm text-muted-foreground">No benefit claims yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Requested</TableHead>
                    <TableHead>Benefit</TableHead>
                    <TableHead className="hidden md:table-cell">For</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claims.map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell className="text-sm">{formatDate(claim.requested_on)}</TableCell>
                      <TableCell className="font-medium">{claim.program?.name ?? '—'}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {claim.dependant?.full_name ?? claim.beneficiary?.full_name ?? 'Member'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(Number(claim.amount))}</TableCell>
                      <TableCell>
                        <StatusBadge label={CLAIM_STATUS[claim.status].label} tone={CLAIM_STATUS[claim.status].tone} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-lg">Payment history</CardTitle>
            <CardDescription>Contributions and other financial records linked to this member</CardDescription>
          </CardHeader>
          {transactions.length === 0 ? (
            <p className="px-6 pb-8 text-sm text-muted-foreground">No payments recorded for this member yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-sm">{formatDate(tx.occurred_on)}</TableCell>
                      <TableCell className="text-sm">{tx.description}</TableCell>
                      <TableCell>
                        <StatusBadge label={TRANSACTION_KIND[tx.kind].label} tone={TRANSACTION_KIND[tx.kind].tone} />
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-medium tabular-nums',
                          TRANSACTION_KIND[tx.kind].income ? 'text-emerald-700' : 'text-rose-700'
                        )}
                      >
                        {formatMoney(Number(tx.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      {canManage && (
        <MemberFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          member={member}
          onSaved={(saved) => setBundle((prev) => (prev ? { ...prev, member: saved } : prev))}
        />
      )}
      <ClaimDialog
        open={claimOpen}
        onOpenChange={setClaimOpen}
        memberId={member.id}
        onSaved={load}
      />
      <TransactionDialog
        open={contributionOpen}
        onOpenChange={setContributionOpen}
        memberId={member.id}
        onSaved={load}
      />
      <AlertDialog open={pendingMemberAction !== null} onOpenChange={(open) => !open && !savingMemberAction && setPendingMemberAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingMemberAction === 'delete'
                ? `Permanently delete ${member.full_name}?`
                : `Record ${member.full_name} as deceased?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingMemberAction === 'delete'
                ? 'This permanently removes the member account, dependants, death-beneficiary nominations, and claim history. Financial transactions are retained but no longer linked to this member. This cannot be undone.'
                : 'This closes the membership, disables sign-in, and preserves contribution and claim history. Death-beneficiary claims can then be submitted if the member had completed the membership waiting period.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {memberActionError && <p role="alert" className="text-sm text-rose-700">{memberActionError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingMemberAction}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingMemberAction}
              className={pendingMemberAction === 'delete' ? 'bg-rose-700 hover:bg-rose-800' : undefined}
              onClick={(event) => { event.preventDefault(); void confirmMemberAction(); }}
            >
              {savingMemberAction
                ? 'Saving…'
                : pendingMemberAction === 'delete' ? 'Delete member permanently' : 'Confirm death'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
