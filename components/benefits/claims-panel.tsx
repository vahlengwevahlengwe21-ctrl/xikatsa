'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Plus, Wallet, X } from 'lucide-react';
import { ClaimDialog } from '@/components/benefits/claim-dialog';
import { StatusBadge } from '@/components/status-badge';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CLAIM_STATUS, formatDate, formatMoney, todayIso } from '@/lib/format';
import { databaseRequest } from '@/lib/database-api';
import type { BenefitClaim, ClaimStatus } from '@/lib/types';
import { FINANCE_RECORDING_ROLES, GOVERNANCE_ROLES, getSession } from '@/lib/auth';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type FilterValue = 'all' | ClaimStatus;

type PendingAction =
  | { type: 'reject'; claim: BenefitClaim }
  | { type: 'pay'; claim: BenefitClaim };

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'rejected', label: 'Rejected' },
];

export function ClaimsPanel({ memberId }: { memberId?: string } = {}) {
  const currentRole = getSession()?.role;
  const canReviewClaims = currentRole ? GOVERNANCE_ROLES.includes(currentRole) : false;
  const canPayClaims = currentRole ? FINANCE_RECORDING_ROLES.includes(currentRole) : false;
  const [claims, setClaims] = useState<BenefitClaim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>('pending');
  const [claimOpen, setClaimOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setClaims(await databaseRequest<BenefitClaim[]>('claims.list'));
    } catch {
      setError('We could not load benefit claims. Please try again.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    if (!claims) return [];
    return filter === 'all' ? claims : claims.filter((c) => c.status === filter);
  }, [claims, filter]);

  const counts = useMemo(() => {
    const list = claims ?? [];
    return {
      all: list.length,
      pending: list.filter((c) => c.status === 'pending').length,
      approved: list.filter((c) => c.status === 'approved').length,
      paid: list.filter((c) => c.status === 'paid').length,
      rejected: list.filter((c) => c.status === 'rejected').length,
    } as Record<FilterValue, number>;
  }, [claims]);

  async function setStatus(claim: BenefitClaim, status: ClaimStatus) {
    setBusyId(claim.id);
    let updateError = false;
    try {
      await databaseRequest('claims.setStatus', { id: claim.id, status });
    } catch {
      updateError = true;
    }
    setBusyId(null);
    if (updateError) {
      toast({ title: 'Could not update claim', description: 'Please try again.', variant: 'destructive' });
      return;
    }
    toast({ title: status === 'approved' ? 'Claim approved' : 'Claim rejected' });
    load();
  }

  async function markPaid(claim: BenefitClaim) {
    setBusyId(claim.id);
    let updateError = false;
    try {
      await databaseRequest('claims.pay', { id: claim.id });
    } catch {
      updateError = true;
    }
    setBusyId(null);
    if (updateError) {
      toast({ title: 'Payout not recorded', description: 'The claim was not marked as paid. Please try again.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Payout recorded', description: `${formatMoney(Number(claim.amount))} added to financial records.` });
    load();
  }

  async function confirmPending() {
    if (!pending) return;
    setConfirming(true);
    if (pending.type === 'reject') {
      await setStatus(pending.claim, 'rejected');
    } else {
      await markPaid(pending.claim);
    }
    setConfirming(false);
    setPending(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter claims by status">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={filter === item.value}
              onClick={() => setFilter(item.value)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
                filter === item.value
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:border-emerald-300 hover:text-foreground'
              )}
            >
              {item.label}
              <span className={cn('rounded-full px-1.5 text-xs tabular-nums', filter === item.value ? 'bg-white/20' : 'bg-muted')}>
                {counts[item.value]}
              </span>
            </button>
          ))}
        </div>
        <Button className="gap-2" onClick={() => setClaimOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New claim
        </Button>
      </div>

      <Card className="overflow-hidden rounded-2xl shadow-sm">
        {error && (
          <div role="alert" className="p-6 text-sm text-rose-700">
            {error}{' '}
            <button type="button" onClick={load} className="font-medium underline underline-offset-4">
              Try again
            </button>
          </div>
        )}

        {!error && claims === null && (
          <div className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {!error && claims !== null && visible.length === 0 && (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <p className="font-heading text-lg font-semibold">
              {claims.length === 0 ? 'No benefit claims yet' : 'Nothing in this queue'}
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {claims.length === 0
                ? (currentRole === 'member'
                  ? 'Your benefit claims and their outcomes will appear here.'
                  : 'Submit a claim once a member needs support. Benefits must exist first, so set them up in the Programs tab.')
                : 'Claims with this status will appear here.'}
            </p>
          </div>
        )}

        {!error && claims !== null && visible.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Requested</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead className="hidden lg:table-cell">Benefit</TableHead>
                  <TableHead className="hidden md:table-cell">Recipient / covered person</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(claim.requested_on)}</TableCell>
                    <TableCell>
                      <p className="text-sm font-medium text-foreground">{claim.member?.full_name ?? 'Unknown member'}</p>
                      <p className="text-xs text-muted-foreground">{claim.member?.member_number}</p>
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">{claim.program?.name ?? '—'}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {claim.dependant?.full_name
                        ? `Covered dependant: ${claim.dependant.full_name}`
                        : claim.beneficiary?.full_name
                          ? `Death beneficiary: ${claim.beneficiary.full_name}`
                          : 'Main member'}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatMoney(Number(claim.amount))}</TableCell>
                    <TableCell>
                      <StatusBadge label={CLAIM_STATUS[claim.status].label} tone={CLAIM_STATUS[claim.status].tone} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {claim.status === 'pending' && canReviewClaims && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              disabled={busyId === claim.id}
                              onClick={() => setStatus(claim, 'approved')}
                            >
                              <Check className="h-3.5 w-3.5" aria-hidden />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1.5 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                              disabled={busyId === claim.id}
                              onClick={() => setPending({ type: 'reject', claim })}
                            >
                              <X className="h-3.5 w-3.5" aria-hidden />
                              Reject
                            </Button>
                          </>
                        )}
                        {claim.status === 'approved' && canPayClaims && (
                          <Button
                            size="sm"
                            className="gap-1.5"
                            disabled={busyId === claim.id}
                            onClick={() => setPending({ type: 'pay', claim })}
                          >
                            <Wallet className="h-3.5 w-3.5" aria-hidden />
                            Mark paid
                          </Button>
                        )}
                        {(claim.status === 'paid' || claim.status === 'rejected') && (
                          <span className="text-xs text-muted-foreground">
                            {claim.status === 'paid' ? `Paid ${formatDate(claim.paid_on)}` : `Closed ${formatDate(claim.decided_on)}`}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <ClaimDialog open={claimOpen} onOpenChange={setClaimOpen} onSaved={load} memberId={memberId} />

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.type === 'pay' ? 'Record this benefit payout?' : 'Reject this claim?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.type === 'pay'
                ? `${formatMoney(Number(pending.claim.amount))} will be recorded as paid to ${pending.claim.beneficiary?.full_name ?? pending.claim.member?.full_name ?? 'the member'} in the financial records.`
                : `The claim from ${pending?.claim.member?.full_name ?? 'this member'} will be closed and no payment will be made.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmPending();
              }}
              disabled={confirming}
              className={pending?.type === 'reject' ? 'bg-rose-700 hover:bg-rose-800' : undefined}
            >
              {confirming ? 'Saving…' : pending?.type === 'pay' ? 'Record payout' : 'Reject claim'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
