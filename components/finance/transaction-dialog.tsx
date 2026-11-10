'use client';

import { useEffect, useState } from 'react';
import { FormField, selectClassName } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatMoney, MANUAL_TRANSACTION_KINDS, TRANSACTION_KIND, todayIso } from '@/lib/format';
import { databaseRequest } from '@/lib/database-api';
import { canRecordFinance, getSession } from '@/lib/auth';
import { getSocietySettings } from '@/lib/settings';
import type { Member, TransactionKind } from '@/lib/types';
import { toast } from '@/hooks/use-toast';

interface TransactionForm {
  kind: TransactionKind;
  amount: string;
  occurred_on: string;
  description: string;
  category: string;
  reference: string;
  member_id: string;
}

type EntryPreset = 'year-end-function' | 'fine';

function emptyForm(memberId?: string, preset?: EntryPreset): TransactionForm {
  return {
    kind: preset === 'year-end-function' ? 'expense' : preset === 'fine' ? 'fine' : 'contribution',
    amount: '',
    occurred_on: todayIso(),
    description: preset === 'year-end-function' ? 'Christmas / year-end function' : '',
    category: preset === 'year-end-function' ? 'Year-end function' : preset === 'fine' ? 'Fine' : '',
    reference: '',
    member_id: memberId ?? '',
  };
}

export function TransactionDialog({
  open,
  onOpenChange,
  memberId,
  preset,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId?: string;
  preset?: EntryPreset;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<TransactionForm>(() => emptyForm(memberId));
  const [members, setMembers] = useState<Pick<Member, 'id' | 'full_name' | 'member_number'>[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingJoiningFee, setLoadingJoiningFee] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const allowRecord = getSession()?.role ? canRecordFinance(getSession()!.role) : false;

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm(memberId, preset));
    setFormError(null);
    if (memberId) return;
    databaseRequest<Pick<Member, 'id' | 'full_name' | 'member_number'>[]>('members.list')
      .then((data) => setMembers(data))
      .catch(() => setFormError('We could not load the member list. You can still record a society-level entry.'));
  }, [open, memberId, preset]);

  const update = <K extends keyof TransactionForm>(key: K, value: TransactionForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handleKindChange(kind: TransactionKind) {
    setForm((current) => ({
      ...current,
      kind,
      ...(kind === 'fine' && !current.category ? { category: 'Fine' } : {}),
    }));
    setFormError(null);
    if (kind !== 'joining_fee') {
      setLoadingJoiningFee(false);
      return;
    }

    setLoadingJoiningFee(true);
    try {
      const settings = await getSocietySettings();
      setForm((current) => current.kind === kind
        ? { ...current, amount: String(settings.joiningFee) }
        : current);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'The joining fee setting could not be loaded.');
    } finally {
      setLoadingJoiningFee(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Enter an amount greater than zero.');
      return;
    }
    if (!form.description.trim()) {
      setFormError('Add a short description so this entry is easy to find later.');
      return;
    }
    if (!form.occurred_on) {
      setFormError('Choose the date this happened.');
      return;
    }
    if (form.kind === 'fine' && !form.member_id) {
      setFormError('Select the member who paid this fine so it appears in the correct monthly record.');
      return;
    }

    setSaving(true);
    setFormError(null);
    let saveError = false;
    try {
      await databaseRequest('transactions.save', {
        kind: form.kind,
        amount,
        occurred_on: form.occurred_on,
        description: form.description.trim(),
        category: form.category.trim() || null,
        reference: form.reference.trim() || null,
        member_id: form.member_id || null,
        recorded_by_role: getSession()?.role ?? 'finance',
      });
    } catch {
      saveError = true;
    }
    setSaving(false);

    if (saveError) {
      setFormError('We could not save this entry. Please try again.');
      return;
    }
    toast({ title: 'Financial record saved', description: `${TRANSACTION_KIND[form.kind].label} of ${formatMoney(amount)} recorded.` });
    onSaved();
    onOpenChange(false);
  }

  if (!allowRecord) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {preset === 'year-end-function'
              ? 'Record a year-end function expense'
              : preset === 'fine' ? 'Record a fine payment' : 'Record a financial entry'}
          </DialogTitle>
          <DialogDescription>
            {preset === 'year-end-function'
              ? 'Record each payment for the Christmas or year-end function separately. It will be recorded as a society expense and deducted from the society balance for the selected date.'
              : preset === 'fine'
                ? 'Record the member, amount, date, and reason for each fine. Fine payments are tracked separately and included in that month’s money received.'
              : 'Member contributions, fine payments, joining fees, donations, other receipts, and society expenses.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
          <FormField label="Type" htmlFor="tx_kind" required>
            <select
              id="tx_kind"
              className={selectClassName}
              value={form.kind}
              onChange={(e) => void handleKindChange(e.target.value as TransactionKind)}
              disabled={preset !== undefined}
            >
              {MANUAL_TRANSACTION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {TRANSACTION_KIND[kind].label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Amount"
            htmlFor="tx_amount"
            required
            hint={form.kind === 'joining_fee' ? 'Prefilled from the current society setting; adjust if needed.' : undefined}
          >
            <Input id="tx_amount" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => update('amount', e.target.value)} placeholder="0.00" disabled={loadingJoiningFee} autoFocus />
          </FormField>
          <FormField label="Description" htmlFor="tx_description" required className="sm:col-span-2">
            <Input
              id="tx_description"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder={
                form.kind === 'expense'
                  ? 'e.g. Venue hire for annual general meeting'
                  : form.kind === 'joining_fee'
                    ? 'e.g. One-time joining fee for member XS-0001'
                    : 'e.g. Monthly contribution for November'
              }
            />
          </FormField>
          <FormField label="Date" htmlFor="tx_date" required>
            <Input id="tx_date" type="date" value={form.occurred_on} onChange={(e) => update('occurred_on', e.target.value)} />
          </FormField>
          <FormField label="Category" htmlFor="tx_category" hint={preset === 'year-end-function' ? 'Keep this category so all function spending can be found together.' : 'Optional, e.g. Events, Utilities'}>
            <Input
              id="tx_category"
              value={form.category}
              onChange={(e) => update('category', e.target.value)}
              readOnly={preset === 'fine'}
            />
          </FormField>
          {!memberId && preset !== 'year-end-function' && (
            <FormField
              label="Member"
              htmlFor="tx_member"
              required={form.kind === 'fine'}
              hint={form.kind === 'fine' ? 'Required: fines must be linked to the member who paid.' : 'Leave blank for a society-level entry'}
            >
              <select id="tx_member" className={selectClassName} value={form.member_id} onChange={(e) => update('member_id', e.target.value)}>
                <option value="">{form.kind === 'fine' ? 'Select the member' : 'Society-level entry'}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.member_number})
                  </option>
                ))}
              </select>
            </FormField>
          )}
          {preset === 'year-end-function' && (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              This is recorded against the society account, not an individual member. Keep the receipt or payment reference for audit purposes.
            </p>
          )}
          <FormField
            label="Reference"
            htmlFor="tx_reference"
            hint={preset === 'year-end-function' ? 'Receipt, supplier invoice, bank or M-Pesa reference (if available)' : 'Receipt, bank or M-Pesa reference'}
          >
            <Input id="tx_reference" value={form.reference} onChange={(e) => update('reference', e.target.value)} />
          </FormField>

          {formError && (
            <p role="alert" className="text-sm text-rose-700 sm:col-span-2">
              {formError}
            </p>
          )}

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save entry'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
