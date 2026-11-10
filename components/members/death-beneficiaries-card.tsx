'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
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
import { DeathBeneficiaryDialog } from '@/components/members/death-beneficiary-dialog';
import { databaseRequest } from '@/lib/database-api';
import { formatDate } from '@/lib/format';
import type { Beneficiary } from '@/lib/types';

export function DeathBeneficiariesCard({
  memberId,
  beneficiaries,
  canEdit = true,
  canEditExisting = true,
  canRemove = false,
  onSaved,
  onRetired,
}: {
  memberId: string;
  beneficiaries: Beneficiary[];
  canEdit?: boolean;
  canEditExisting?: boolean;
  canRemove?: boolean;
  onSaved: (beneficiary: Beneficiary) => void;
  onRetired: (beneficiary: Beneficiary) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Beneficiary | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Beneficiary | null>(null);
  const [saving, setSaving] = useState(false);

  const active = beneficiaries.filter((beneficiary) => beneficiary.is_active);
  const totalShare = active.reduce((sum, beneficiary) => sum + Number(beneficiary.share_percent), 0);

  async function remove() {
    if (!pendingRemoval) return;
    setSaving(true);
    try {
      await databaseRequest('beneficiaries.delete', { id: pendingRemoval.id, deceased: false });
      onRetired({ ...pendingRemoval, is_active: false });
      setPendingRemoval(null);
      toast({ title: 'Death beneficiary removed', description: 'The nomination record is retained for history.' });
    } catch (reason) {
      toast({
        title: 'Could not remove beneficiary',
        description: reason instanceof Error ? reason.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="font-heading text-lg">Death beneficiaries</CardTitle>
          <CardDescription>
            Nominated recipients have no separate waiting period. A benefit is payable only after this main member qualifies and is recorded deceased.
            {active.length > 0 && ` Active shares total ${totalShare.toFixed(2)}%.`}
          </CardDescription>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden />
            Add beneficiary
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {beneficiaries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No death-beneficiary nominations have been recorded for this main member.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {beneficiaries.map((beneficiary) => (
              <li key={beneficiary.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{beneficiary.first_name} {beneficiary.surname}</p>
                  <p className="text-xs text-muted-foreground">
                    ID: {beneficiary.id_number ?? 'Not recorded'} · {beneficiary.relationship} · {Number(beneficiary.share_percent)}% share
                  </p>
                  <p className={`mt-1 text-xs font-medium ${beneficiary.deceased_at ? 'text-slate-500' : beneficiary.is_active ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {beneficiary.deceased_at
                      ? `Deceased ${formatDate(beneficiary.deceased_at)}`
                      : beneficiary.is_active ? 'Active nomination' : 'Nomination inactive'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canEdit && canEditExisting && beneficiary.is_active && !beneficiary.deceased_at && (
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(beneficiary); setDialogOpen(true); }} aria-label={`Edit ${beneficiary.first_name} ${beneficiary.surname}`}>
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                  {canRemove && beneficiary.is_active && !beneficiary.deceased_at && (
                    <Button variant="ghost" size="icon" className="text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => setPendingRemoval(beneficiary)} aria-label={`Remove ${beneficiary.first_name} ${beneficiary.surname}`}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {canEdit && (
        <DeathBeneficiaryDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          memberId={memberId}
          beneficiary={editing}
          onSaved={onSaved}
        />
      )}
      <AlertDialog open={pendingRemoval !== null} onOpenChange={(open) => !open && !saving && setPendingRemoval(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingRemoval?.first_name} {pendingRemoval?.surname} from nominations?</AlertDialogTitle>
            <AlertDialogDescription>This marks the nomination inactive but keeps the record and past claims.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void remove(); }}>
              {saving ? 'Removing…' : 'Remove nomination'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
