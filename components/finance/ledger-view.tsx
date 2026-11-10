'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CircleDollarSign, Download, Plus, Search, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { TransactionDialog } from '@/components/finance/transaction-dialog';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { selectClassName } from '@/components/form-field';
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
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { addCalendarMonths, toCents, TRANSACTION_KIND, formatDate, formatMoney, toIsoDate } from '@/lib/format';
import { databaseRequest } from '@/lib/database-api';
import { FINANCE_CONTROL_ROLES, ROLE_LABELS, canRecordFinance, getSession } from '@/lib/auth';
import type { Transaction, TransactionKind } from '@/lib/types';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

type KindFilter = 'all' | TransactionKind;

interface FinanceMember {
  id: string;
  full_name: string;
  member_number: string;
  monthly_contribution: number;
}

interface FinanceMemberSummary {
  members: FinanceMember[];
  excludedMemberIds: string[];
}

interface FinanceControls {
  openingBalance: { amount: number; effectiveMonth: string } | null;
}

function escapeCsv(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(rows: Transaction[]) {
  const header = ['Date', 'Type', 'Description', 'Member', 'Category', 'Reference', 'Money in', 'Money out'];
  const lines = rows.map((tx) => {
    const income = TRANSACTION_KIND[tx.kind].income;
    return [
      tx.occurred_on,
      TRANSACTION_KIND[tx.kind].label,
      tx.description,
      tx.member?.full_name ?? 'Society',
      tx.category,
      tx.reference,
      income ? Number(tx.amount).toFixed(2) : '',
      income ? '' : Number(tx.amount).toFixed(2),
    ]
      .map(escapeCsv)
      .join(',');
  });
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `xikatsa-financial-records-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function LedgerView() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [members, setMembers] = useState<FinanceMember[] | null>(null);
  const [controls, setControls] = useState<FinanceControls | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const [excludedMemberIds, setExcludedMemberIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [memberLoadError, setMemberLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => toIsoDate(new Date()).slice(0, 7));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [entryPreset, setEntryPreset] = useState<'year-end-function' | 'fine' | undefined>();
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [openingMonth, setOpeningMonth] = useState(() => toIsoDate(new Date()).slice(0, 7));
  const [savingOpeningBalance, setSavingOpeningBalance] = useState(false);
  const sessionRole = getSession()?.role;
  const canRecord = sessionRole ? canRecordFinance(sessionRole) : false;
  const canDeleteTransactions = sessionRole === 'super-administrator' || sessionRole === 'chairperson';
  const canManageFinanceControls = sessionRole ? FINANCE_CONTROL_ROLES.includes(sessionRole) : false;

  const load = useCallback(async () => {
    setError(null);
    setMemberLoadError(null);
    const [transactionResult, memberResult, controlsResult] = await Promise.allSettled([
      databaseRequest<Transaction[]>('transactions.list'),
      databaseRequest<FinanceMemberSummary>('finance.memberSummary'),
      databaseRequest<FinanceControls>('finance.controls.load'),
    ]);

    if (transactionResult.status === 'fulfilled') {
      setTransactions(transactionResult.value);
    } else {
      setTransactions(null);
      setError('Financial records could not be loaded. Please try again.');
    }

    if (memberResult.status === 'fulfilled') {
      setMembers(memberResult.value.members);
      setExcludedMemberIds(memberResult.value.excludedMemberIds);
    } else {
      setMembers(null);
      setExcludedMemberIds([]);
      setMemberLoadError('Member dues and the per-member list are temporarily unavailable. The ledger totals below still include recorded contributions.');
    }
    if (controlsResult.status === 'fulfilled') {
      setControls(controlsResult.value);
      setOpeningAmount(controlsResult.value.openingBalance ? String(controlsResult.value.openingBalance.amount) : '');
      setOpeningMonth(controlsResult.value.openingBalance?.effectiveMonth ?? toIsoDate(new Date()).slice(0, 7));
      setControlError(null);
    } else {
      setControls(null);
      setControlError('The opening balance could not be loaded. Monthly balances are unavailable until finance settings load successfully.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ledgerTransactions = useMemo(() => {
    if (!transactions) return [];
    return [...transactions].sort(
      (a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at),
    );
  }, [transactions]);

  const filtered = useMemo(() => {
    if (!transactions) return [];
    const term = search.trim().toLowerCase();
    return ledgerTransactions.filter((tx) => {
      if (kindFilter !== 'all' && tx.kind !== kindFilter) return false;
      if (from && tx.occurred_on < from) return false;
      if (to && tx.occurred_on > to) return false;
      if (!term) return true;
      return [tx.description, tx.category ?? '', tx.reference ?? '', tx.member?.full_name ?? '']
        .some((field) => field.toLowerCase().includes(term));
    });
  }, [transactions, ledgerTransactions, search, kindFilter, from, to]);

  const totals = useMemo(() => {
    let incomeCents = 0;
    let contributionsCents = 0;
    let expensesCents = 0;
    for (const tx of filtered) {
      const amountCents = toCents(Number(tx.amount));
      if (TRANSACTION_KIND[tx.kind].income) incomeCents += amountCents;
      if (tx.kind === 'contribution') contributionsCents += amountCents;
      if (!TRANSACTION_KIND[tx.kind].income) expensesCents += amountCents;
    }
    return {
      income: incomeCents / 100,
      expenses: expensesCents / 100,
      netPosition: (contributionsCents - expensesCents) / 100,
    };
  }, [filtered]);

  const monthlySummary = useMemo(() => {
    if (!controls) return null;
    const [year, month] = selectedMonth.split('-').map(Number);
    if (!year || !month || month < 1 || month > 12) return null;

    const monthStart = `${selectedMonth}-01`;
    const nextMonthStart = addCalendarMonths(`${selectedMonth}-01`, 1);
    const monthTransactions = ledgerTransactions.filter(
      (transaction) => transaction.occurred_on >= monthStart && transaction.occurred_on < nextMonthStart,
    );
    const previousTransactions = ledgerTransactions.filter(
      (transaction) => transaction.occurred_on < monthStart,
    );
    const incomeOf = (items: Transaction[]) => items.reduce(
      (sum, transaction) => sum + (TRANSACTION_KIND[transaction.kind].income ? toCents(Number(transaction.amount)) : 0),
      0,
    );
    const expensesOf = (items: Transaction[]) => items.reduce(
      (sum, transaction) => sum + (TRANSACTION_KIND[transaction.kind].income ? 0 : toCents(Number(transaction.amount))),
      0,
    );
    const cutoverMonth = controls.openingBalance?.effectiveMonth;
    const hasOpeningBalanceCutover = controls.openingBalance !== null &&
      selectedMonth >= controls.openingBalance.effectiveMonth;
    const openingActivity = hasOpeningBalanceCutover && cutoverMonth
      ? previousTransactions.filter((transaction) => transaction.occurred_on >= `${cutoverMonth}-01`)
      : previousTransactions;
    const openingBalance = hasOpeningBalanceCutover && controls.openingBalance
      ? controls.openingBalance.amount + (incomeOf(openingActivity) - expensesOf(openingActivity)) / 100
      : (incomeOf(openingActivity) - expensesOf(openingActivity)) / 100;
    const contributionsCents = monthTransactions
      .filter((transaction) => transaction.kind === 'contribution')
      .reduce((sum, transaction) => sum + toCents(Number(transaction.amount)), 0);
    const fineIncomeCents = monthTransactions
      .filter((transaction) => transaction.kind === 'fine')
      .reduce((sum, transaction) => sum + toCents(Number(transaction.amount)), 0);
    const otherIncomeCents = monthTransactions
      .filter((transaction) => transaction.kind !== 'contribution' && transaction.kind !== 'fine' && TRANSACTION_KIND[transaction.kind].income)
      .reduce((sum, transaction) => sum + toCents(Number(transaction.amount)), 0);
    const expensesCents = expensesOf(monthTransactions);
    const incomeCents = contributionsCents + fineIncomeCents + otherIncomeCents;
    const contributions = contributionsCents / 100;
    const fineIncome = fineIncomeCents / 100;
    const otherIncome = otherIncomeCents / 100;
    const expenses = expensesCents / 100;
    const income = incomeCents / 100;
    const closingBalance = openingBalance + (incomeCents - expensesCents) / 100;
    const expectedContributionsCents = (members ?? []).reduce(
      (sum, member) => sum + toCents(Number(member.monthly_contribution)),
      0,
    );
    const receivedByMember = new Map<string, number>();
    let unassignedContributions = 0;
    for (const transaction of monthTransactions) {
      if (transaction.kind !== 'contribution') continue;
      if (!transaction.member_id) {
        unassignedContributions += toCents(Number(transaction.amount));
        continue;
      }
      receivedByMember.set(
        transaction.member_id,
        (receivedByMember.get(transaction.member_id) ?? 0) + toCents(Number(transaction.amount)),
      );
    }
    let memberContributionsCents = 0;
    receivedByMember.forEach((amount) => { memberContributionsCents += amount; });
    const memberContributions = memberContributionsCents / 100;
    unassignedContributions /= 100;

    const excludedMemberIdSet = new Set(excludedMemberIds);
    const memberNamesFromTransactions = new Map<string, { full_name: string; member_number: string }>();
    for (const transaction of monthTransactions) {
      if (transaction.member_id && transaction.member && !excludedMemberIdSet.has(transaction.member_id)) {
        memberNamesFromTransactions.set(transaction.member_id, transaction.member);
      }
    }
    const memberIds = new Set(members === null ? [] : [
      ...members.map((member) => member.id),
      ...Array.from(receivedByMember.keys()).filter((id) => !excludedMemberIdSet.has(id)),
    ]);
    const memberRows = Array.from(memberIds)
      .map((id) => {
        const member = (members ?? []).find((item) => item.id === id);
        const transactionMember = memberNamesFromTransactions.get(id);
        if (!member && !transactionMember) return null;
        return {
          member: member ?? { id, ...transactionMember!, monthly_contribution: 0 },
          received: (receivedByMember.get(id) ?? 0) / 100,
          expected: member ? toCents(Number(member.monthly_contribution)) / 100 : null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.received - a.received || a.member.full_name.localeCompare(b.member.full_name));

    return {
      monthStart,
      openingBalance,
      contributions,
      fineIncome,
      otherIncome,
      income,
      expenses,
      openingBasis: cutoverMonth && selectedMonth >= cutoverMonth
        ? `Verified opening balance at ${cutoverMonth}`
        : 'Recorded activity before this month',
      closingBalance,
      expectedContributions: members === null ? null : expectedContributionsCents / 100,
      memberContributions,
      unassignedContributions,
      outstandingContributions: members !== null
        ? Math.max(0, expectedContributionsCents / 100 - memberContributions)
        : null,
      collectionRate: members !== null && expectedContributionsCents > 0
        ? Math.min(100, (memberContributions / (expectedContributionsCents / 100)) * 100)
        : null,
      memberRows,
    };
  }, [ledgerTransactions, controls, members, excludedMemberIds, selectedMonth]);

  const hasFilters = search !== '' || kindFilter !== 'all' || from !== '' || to !== '';
  const selectedMonthLabel = new Date(`${selectedMonth}-01T00:00:00Z`).toLocaleDateString('en-ZA', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  function clearFilters() {
    setSearch('');
    setKindFilter('all');
    setFrom('');
    setTo('');
  }

  async function saveOpeningBalance() {
    setSavingOpeningBalance(true);
    setControlError(null);
    try {
      await databaseRequest('finance.openingBalance.save', {
        amount: openingAmount,
        effectiveMonth: openingMonth,
      });
      await load();
      toast({ title: 'Opening balance saved', description: 'Post-cutover balances now use this verified amount.' });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Opening balance could not be saved.';
      setControlError(message);
      toast({ title: 'Could not save opening balance', description: message, variant: 'destructive' });
    } finally {
      setSavingOpeningBalance(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    let deleteError = false;
    try {
      await databaseRequest('transactions.delete', { id: pendingDelete.id });
    } catch {
      deleteError = true;
    }

    setDeleting(false);
    if (deleteError) {
      toast({ title: 'Could not delete entry', description: 'Please try again.', variant: 'destructive' });
      return;
    }
    setTransactions((prev) => (prev ? prev.filter((tx) => tx.id !== pendingDelete.id) : prev));
    toast({ title: 'Entry deleted' });
    setPendingDelete(null);
  }

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Financial records"
        description="Every rand entering or leaving the society, with the reasoning and reference behind it."
        actions={
          <>
            <Button
              variant="outline"
              className="gap-2"
              disabled={!filtered.length}
              onClick={() => downloadCsv(filtered)}
            >
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </Button>
            {canRecord && (
              <>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setEntryPreset('fine');
                    setDialogOpen(true);
                  }}
                >
                  <CircleDollarSign className="h-4 w-4" aria-hidden />
                  Record fine payment
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setEntryPreset('year-end-function');
                    setDialogOpen(true);
                  }}
                >
                  <CalendarDays className="h-4 w-4" aria-hidden />
                  Year-end function expense
                </Button>
                <Button
                  className="gap-2"
                  onClick={() => {
                    setEntryPreset(undefined);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Record entry
                </Button>
              </>
            )}
          </>
        }
      />

      <section aria-labelledby="monthly-summary-heading" className="mb-8 space-y-4">
        {canManageFinanceControls && (
          <Card className="rounded-2xl border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <h2 className="font-heading text-base font-semibold">Set the society’s verified opening balance</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Enter the combined cash and bank balance at the start of the selected month. Earlier transactions stay in the history but are not counted again after this cutover; transactions in the cutover month are counted as usual.
                </p>
                {controls && !controls.openingBalance && (
                  <p className="mt-2 text-sm font-medium text-amber-800">
                    No opening balance is set yet. Until you set one, balances are calculated from the recorded transaction history starting at zero.
                  </p>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(150px,1fr)_minmax(175px,1fr)_auto] lg:min-w-[520px]">
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Verified balance (R)
                  <Input
                    type="number"
                    step="0.01"
                    value={openingAmount}
                    onChange={(event) => setOpeningAmount(event.target.value)}
                    disabled={!controls || savingOpeningBalance}
                    aria-label="Verified opening balance amount"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Balance is at start of
                  <Input
                    type="month"
                    value={openingMonth}
                    onChange={(event) => setOpeningMonth(event.target.value)}
                    disabled={!controls || savingOpeningBalance}
                    aria-label="Opening balance effective month"
                  />
                </label>
                <Button
                  onClick={saveOpeningBalance}
                  disabled={!controls || !openingAmount || !openingMonth || savingOpeningBalance}
                  className="self-end"
                >
                  {savingOpeningBalance ? 'Saving…' : 'Save opening balance'}
                </Button>
              </div>
            </div>
          </Card>
        )}
        {controlError && (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {controlError}{' '}
            <button type="button" onClick={load} className="font-semibold underline underline-offset-2">
              Try again
            </button>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Monthly close</p>
            <h2 id="monthly-summary-heading" className="mt-1 font-heading text-2xl font-bold tracking-tight">
              {selectedMonthLabel} cash flow
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Opening balance plus contributions and other receipts, less expenses, gives the closing balance.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <CalendarDays className="h-4 w-4 text-emerald-700" aria-hidden />
            <span className="sr-only">Summary month</span>
            <Input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="w-auto"
              aria-label="Summary month"
            />
          </label>
        </div>

        {monthlySummary && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-7">
              <div className="surface-card p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Wallet className="h-4 w-4" aria-hidden />
                  Opening balance
                </div>
                <p className="mt-2 font-heading text-xl font-bold tabular-nums">{formatMoney(monthlySummary.openingBalance)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{monthlySummary.openingBasis}</p>
              </div>
              <div className="surface-card border-emerald-200 bg-emerald-50/50 p-4">
                <div className="flex items-center gap-2 text-sm text-emerald-800">
                  <TrendingUp className="h-4 w-4" aria-hidden />
                  Member contributions
                </div>
                <p className="mt-2 font-heading text-xl font-bold tabular-nums text-emerald-800">{formatMoney(monthlySummary.contributions)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Recorded for {selectedMonthLabel}</p>
              </div>
              <div className="surface-card border-amber-200 bg-amber-50/50 p-4">
                <div className="flex items-center gap-2 text-sm text-amber-900">
                  <TrendingUp className="h-4 w-4" aria-hidden />
                  Fines received
                </div>
                <p className="mt-2 font-heading text-xl font-bold tabular-nums text-amber-900">{formatMoney(monthlySummary.fineIncome)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Member-linked fine payments for {selectedMonthLabel}</p>
              </div>
              <div className="surface-card p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4" aria-hidden />
                  Total received
                </div>
                <p className="mt-2 font-heading text-xl font-bold tabular-nums">{formatMoney(monthlySummary.income)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Contributions + fines + other receipts</p>
              </div>
              <div className="surface-card p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingDown className="h-4 w-4" aria-hidden />
                  Total expenses
                </div>
                <p className="mt-2 font-heading text-xl font-bold tabular-nums text-rose-700">{formatMoney(monthlySummary.expenses)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Recorded expenses and benefit payouts</p>
              </div>
              <div className={cn(
                'surface-card p-4',
                monthlySummary.closingBalance >= 0 ? 'border-primary/20 bg-primary/[0.04]' : 'border-rose-200 bg-rose-50/60',
              )}>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Wallet className="h-4 w-4" aria-hidden />
                  Closing balance
                </div>
                <p className={cn(
                  'mt-2 font-heading text-xl font-bold tabular-nums',
                  monthlySummary.closingBalance < 0 && 'text-rose-700',
                )}>
                  {formatMoney(monthlySummary.closingBalance)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Opening balance + funds received − expenses</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <Card className="rounded-2xl p-5 shadow-sm">
                <h3 className="font-heading text-base font-semibold">Contribution progress</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {members === null
                    ? 'Current active-member count is unavailable'
                    : `Estimated dues from ${members.length} currently active members`}
                </p>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Expected this month</p>
                    <p className="mt-1 font-heading text-xl font-bold tabular-nums">
                      {monthlySummary.expectedContributions === null
                        ? 'Unavailable'
                        : formatMoney(monthlySummary.expectedContributions)}
                    </p>
                  </div>
                  <p className="text-right text-sm font-semibold text-emerald-700">
                    {members === null
                      ? 'Unavailable'
                      : monthlySummary.collectionRate === null
                        ? 'No dues set'
                        : `${monthlySummary.collectionRate.toFixed(0)}% collected`}
                  </p>
                </div>
                {monthlySummary.collectionRate !== null && (
                  <div
                    className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label="Monthly contribution collection rate"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(monthlySummary.collectionRate)}
                  >
                    <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${monthlySummary.collectionRate}%` }} />
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
                  <span className="text-muted-foreground">Estimated outstanding</span>
                  <span className="font-semibold tabular-nums">
                    {monthlySummary.outstandingContributions === null
                      ? 'Unavailable'
                      : formatMoney(monthlySummary.outstandingContributions)}
                  </span>
                </div>
                {memberLoadError && (
                  <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                    {memberLoadError}{' '}
                    <button type="button" onClick={load} className="font-semibold underline underline-offset-2">
                      Try again
                    </button>
                  </p>
                )}
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Estimate uses current active members and their current monthly amounts; historical membership changes are not tracked. Collection progress counts payments linked to a member.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Food provision uses the current active main-member count for historical months because past membership status is not recorded.
                </p>
              </Card>

              <Card className="overflow-hidden rounded-2xl shadow-sm">
                <div className="border-b border-border px-5 py-4">
                  <h3 className="font-heading text-base font-semibold">Member contributions</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Recorded payments for {selectedMonthLabel}; unpaid amounts are estimates.
                  </p>
                </div>
                {members === null ? (
                  <p className="p-5 text-sm text-muted-foreground">Member details could not be loaded. Recorded contribution totals remain included above.</p>
                ) : monthlySummary.memberRows.length === 0 && monthlySummary.unassignedContributions === 0 ? (
                  <p className="p-5 text-sm text-muted-foreground">No active members or recorded member contributions for this month.</p>
                ) : (
                  <div className="max-h-80 overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Member</TableHead>
                          <TableHead className="text-right">Received</TableHead>
                          <TableHead className="text-right">Expected</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthlySummary.memberRows.map(({ member, received, expected }) => {
                          const outstanding = expected === null ? 0 : Math.max(0, expected - received);
                          const paymentStatus = expected === null
                            ? 'Historical'
                            : expected === 0
                              ? 'No amount set'
                              : received >= expected
                                ? 'Complete'
                                : received > 0
                                  ? 'Partial'
                                  : 'Unpaid';
                          return (
                            <TableRow key={member.id}>
                              <TableCell>
                                <p className="font-medium">{member.full_name}</p>
                                <p className="text-xs text-muted-foreground">{member.member_number}</p>
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{formatMoney(received)}</TableCell>
                              <TableCell className="whitespace-nowrap text-right tabular-nums">
                                {expected === null ? '—' : formatMoney(expected)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-right">
                                <span className={cn(
                                  'text-xs font-semibold',
                                  paymentStatus === 'Complete' && 'text-emerald-700',
                                  paymentStatus === 'Partial' && 'text-amber-700',
                                  paymentStatus === 'Unpaid' && 'text-rose-700',
                                  (paymentStatus === 'Historical' || paymentStatus === 'No amount set') && 'text-muted-foreground',
                                )}>
                                  {paymentStatus}
                                </span>
                                {outstanding > 0 && (
                                  <span className="block text-xs text-muted-foreground">{formatMoney(outstanding)} due</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {monthlySummary.unassignedContributions > 0 && (
                          <TableRow>
                            <TableCell>
                              <p className="font-medium">Society-level contribution</p>
                              <p className="text-xs text-muted-foreground">Not linked to an individual member</p>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                              {formatMoney(monthlySummary.unassignedContributions)}
                            </TableCell>
                            <TableCell className="text-right">—</TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">Unassigned</TableCell>
                          </TableRow>
                        )}
                        <TableRow className="bg-muted/50 font-semibold hover:bg-muted/50">
                          <TableCell>Total recorded contributions</TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">
                            {formatMoney(monthlySummary.contributions)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">
                            {monthlySummary.expectedContributions === null
                              ? 'Unavailable'
                              : formatMoney(monthlySummary.expectedContributions)}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">For month</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </section>

      <div className="mb-3">
        <h2 className="font-heading text-lg font-semibold">Ledger totals</h2>
        <p className="text-sm text-muted-foreground">Totals below reflect the ledger filters selected here.</p>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Money in</p>
          <p className="font-heading mt-2 text-2xl font-bold text-emerald-700">{formatMoney(totals.income)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Money out</p>
          <p className="font-heading mt-2 text-2xl font-bold text-rose-700">{formatMoney(totals.expenses)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Net position</p>
          <p className={cn('font-heading mt-2 text-2xl font-bold', totals.netPosition >= 0 ? 'text-foreground' : 'text-rose-700')}>
            {formatMoney(totals.netPosition)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Member contributions less all expenses in this selection</p>
        </div>
      </div>

      {!canRecord && (
        <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <p className="font-medium">Read-only access</p>
          <p className="mt-1">The Finance team can record money entries. Staff can review the ledger; transaction deletion is restricted to authorized roles.</p>
        </div>
      )}

      <Card className="overflow-hidden rounded-2xl shadow-sm">
        <div className="grid gap-3 border-b border-border p-4 lg:grid-cols-[1fr_200px_160px_160px_auto] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description, member, category or reference"
              className="pl-9"
              aria-label="Search records"
            />
          </div>
          <select className={selectClassName} value={kindFilter} onChange={(e) => setKindFilter(e.target.value as KindFilter)} aria-label="Filter by type">
            <option value="all">All types</option>
            {(Object.keys(TRANSACTION_KIND) as TransactionKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {TRANSACTION_KIND[kind].label}
              </option>
            ))}
          </select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          {hasFilters ? (
            <Button variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          ) : (
            <span className="hidden lg:block" />
          )}
        </div>

        {error && (
          <div role="alert" className="p-6 text-sm text-rose-700">
            {error}{' '}
            <button type="button" onClick={load} className="font-medium underline underline-offset-4">
              Try again
            </button>
          </div>
        )}

        {!error && transactions === null && (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {!error && transactions !== null && filtered.length === 0 && (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <p className="font-heading text-lg font-semibold">
              {transactions.length === 0 ? 'No financial records yet' : 'No records match these filters'}
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {transactions.length === 0
                ? 'Record the first contribution or expense to start the ledger.'
                : 'Adjust the search, type or date range to see more.'}
            </p>
            {transactions.length === 0 && canRecord && (
              <Button onClick={() => setDialogOpen(true)} className="mt-6 gap-2">
                <Plus className="h-4 w-4" aria-hidden />
                Record first entry
              </Button>
            )}
          </div>
        )}

        {!error && transactions !== null && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead className="hidden lg:table-cell">Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((tx) => {
                  const meta = TRANSACTION_KIND[tx.kind];
                  const isPayout = tx.kind === 'benefit_payout';
                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(tx.occurred_on)}</TableCell>
                      <TableCell>
                        <p className="text-sm font-medium text-foreground">{tx.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx.member?.full_name ?? 'Society'}
                          {tx.category ? ` · ${tx.category}` : ''}
                        </p>
                        <div className="mt-1 md:hidden">
                          <StatusBadge label={meta.label} tone={meta.tone} />
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <StatusBadge label={meta.label} tone={meta.tone} />
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">{tx.reference ?? '—'}</TableCell>
                      <TableCell className={cn('whitespace-nowrap text-right font-semibold tabular-nums', meta.income ? 'text-emerald-700' : 'text-rose-700')}>
                        {meta.income ? '+' : '-'}
                        {formatMoney(Number(tx.amount))}
                      </TableCell>
                      <TableCell>
                        {!isPayout && canDeleteTransactions && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => setPendingDelete(tx)}
                            aria-label={`Delete ${tx.description}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <TransactionDialog
        open={dialogOpen}
        preset={entryPreset}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEntryPreset(undefined);
        }}
        onSaved={load}
      />

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.description} ({formatMoney(Number(pendingDelete?.amount ?? 0))}) will be removed from the financial records. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep entry</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-rose-700 hover:bg-rose-800"
            >
              {deleting ? 'Deleting…' : 'Delete entry'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
