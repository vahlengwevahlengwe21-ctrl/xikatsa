'use client';

import { useState } from 'react';
import { DependantDialog } from '@/components/members/dependant-dialog';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { databaseRequest } from '@/lib/database-api';
import type { Dependant } from '@/lib/types';
import { toast } from '@/hooks/use-toast';
import { DEPENDANT_WAITING_PERIOD_MONTHS, formatDate, MAX_ACTIVE_DEPENDANTS, todayIso } from '@/lib/format';
import { Pencil, Plus, Trash2 } from 'lucide-react';

export function DependantsCard({
  memberId,
  dependants,
  canEdit = true,
  canEditExisting = true,
  canRemove = false,
  onSaved,
  onRetired,
}: {
  memberId: string;
  dependants: Dependant[];
  canEdit?: boolean;
  canEditExisting?: boolean;
  canRemove?: boolean;
  onSaved: (dependant: Dependant) => void;
  onRetired: (dependant: Dependant) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Dependant | null>(null);
  const [pendingRetirement, setPendingRetirement] = useState<Dependant | null>(null);
  const [markDeceased, setMarkDeceased] = useState(false);
  const [retiring, setRetiring] = useState(false);

  const activeDependants = dependants.filter((dependant) => dependant.is_active).length;
  const dependantLimitReached = activeDependants >= MAX_ACTIVE_DEPENDANTS;
  const today = todayIso();

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(dependant: Dependant) {
    setEditing(dependant);
    setDialogOpen(true);
  }

  async function confirmRetirement() {
    if (!pendingRetirement) return;
    setRetiring(true);
    try {
      await databaseRequest('dependants.delete', {
        id: pendingRetirement.id,
        deceased: markDeceased,
      });
      onRetired({
        ...pendingRetirement,
        is_active: false,
        deceased_at: markDeceased ? today : pendingRetirement.deceased_at,
      });
      toast({
        title: markDeceased ? 'Dependant marked deceased' : 'Dependant removed from active cover',
        description: 'The record is retained and the active dependant place is now available.',
      });
      setPendingRetirement(null);
    } catch (reason) {
      toast({
        title: 'Could not remove dependant',
        description: reason instanceof Error ? reason.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRetiring(false);
    }
  }

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
        <div>
          <CardTitle className="font-heading text-lg">Covered dependants</CardTitle>
          <CardDescription>
            {activeDependants} of {MAX_ACTIVE_DEPENDANTS} active places used
            {` · Each dependant completes a ${DEPENDANT_WAITING_PERIOD_MONTHS}-month waiting period`}
          </CardDescription>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreate} disabled={dependantLimitReached} className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden />
            Add dependant
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {dependants.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No covered dependants have been registered for this main member.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {dependants.map((dependant) => {
              const eligibleOn = dependant.eligible_on ?? '';
              const isEligible = dependant.is_active && eligibleOn !== '' && eligibleOn <= today;
              const status = dependant.deceased_at
                ? `Deceased ${formatDate(dependant.deceased_at)}`
                : !dependant.is_active
                  ? 'Removed from active cover'
                  : isEligible ? 'Cover active' : `Waiting period until ${eligibleOn ? formatDate(eligibleOn) : 'date unavailable'}`;
              return (
                <li key={dependant.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {dependant.first_name} {dependant.surname}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ID: {dependant.id_number ?? 'Not recorded'} · {dependant.relationship}
                    </p>
                    <p className={`mt-1 text-xs font-medium ${isEligible ? 'text-emerald-700' : dependant.is_active ? 'text-amber-700' : 'text-slate-500'}`}>
                      {status}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {canEdit && canEditExisting && !dependant.deceased_at && (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={!dependant.is_active}
                        onClick={() => openEdit(dependant)}
                        aria-label={`Edit ${dependant.first_name} ${dependant.surname}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                    )}
                    {canRemove && dependant.is_active && !dependant.deceased_at && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                        onClick={() => {
                          setMarkDeceased(false);
                          setPendingRetirement(dependant);
                        }}
                        aria-label={`Remove ${dependant.first_name} ${dependant.surname} from active cover`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {canEdit && (
        <DependantDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          memberId={memberId}
          dependant={editing}
          onSaved={onSaved}
        />
      )}

      <AlertDialog open={pendingRetirement !== null} onOpenChange={(open) => !open && setPendingRetirement(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingRetirement?.first_name} {pendingRetirement?.surname} from active cover?</AlertDialogTitle>
            <AlertDialogDescription>
              This keeps the record and past claims in MariaDB but frees an active dependant place.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={markDeceased}
              onChange={(event) => setMarkDeceased(event.target.checked)}
            />
            <span>Mark this dependant as deceased</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={retiring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmRetirement();
              }}
              disabled={retiring}
              className="bg-rose-700 hover:bg-rose-800"
            >
              {retiring ? 'Removing…' : 'Remove from cover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
