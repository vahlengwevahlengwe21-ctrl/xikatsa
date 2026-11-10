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
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { databaseRequest } from '@/lib/database-api';
import { isValidIdNumber } from '@/lib/id-number';
import type { Beneficiary } from '@/lib/types';
import { RELATIONSHIPS } from '@/components/members/dependant-dialog';

interface BeneficiaryForm {
  first_name: string;
  surname: string;
  id_number: string;
  relationship: string;
  date_of_birth: string;
  phone: string;
  share_percent: string;
  is_active: boolean;
}

function emptyForm(): BeneficiaryForm {
  return {
    first_name: '',
    surname: '',
    id_number: '',
    relationship: 'Spouse',
    date_of_birth: '',
    phone: '',
    share_percent: '100',
    is_active: true,
  };
}

export function DeathBeneficiaryDialog({
  open,
  onOpenChange,
  memberId,
  beneficiary,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  beneficiary?: Beneficiary | null;
  onSaved: (beneficiary: Beneficiary) => void;
}) {
  const [form, setForm] = useState<BeneficiaryForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(beneficiary
      ? {
          first_name: beneficiary.first_name,
          surname: beneficiary.surname,
          id_number: beneficiary.id_number ?? '',
          relationship: beneficiary.relationship,
          date_of_birth: beneficiary.date_of_birth ?? '',
          phone: beneficiary.phone ?? '',
          share_percent: String(beneficiary.share_percent),
          is_active: beneficiary.is_active,
        }
      : emptyForm());
    setFormError(null);
  }, [open, beneficiary]);

  const update = <K extends keyof BeneficiaryForm>(key: K, value: BeneficiaryForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const share = Number(form.share_percent);
    if (!form.first_name.trim() || !form.surname.trim()) {
      setFormError('Enter the beneficiary’s first name and surname.');
      return;
    }
    if (!isValidIdNumber(form.id_number)) {
      setFormError('Enter a valid 13-digit beneficiary ID number.');
      return;
    }
    if (!Number.isFinite(share) || share <= 0 || share > 100) {
      setFormError('Share must be greater than 0 and no more than 100 percent.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const saved = await databaseRequest<Beneficiary>('beneficiaries.save', {
        id: beneficiary?.id,
        member_id: memberId,
        first_name: form.first_name.trim(),
        surname: form.surname.trim(),
        id_number: form.id_number.trim(),
        relationship: form.relationship,
        date_of_birth: form.date_of_birth || null,
        phone: form.phone.trim() || null,
        share_percent: share,
        is_active: form.is_active,
      });
      toast({ title: beneficiary ? 'Death beneficiary updated' : 'Death beneficiary added' });
      onSaved(saved);
      onOpenChange(false);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'The death beneficiary could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{beneficiary ? 'Edit death beneficiary' : 'Add death beneficiary'}</DialogTitle>
          <DialogDescription>
            This person is nominated to receive a benefit only if the main member dies after qualifying for cover. The nominee does not have a separate waiting period.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
          <FormField label="First name" htmlFor="death_beneficiary_first_name" required>
            <Input id="death_beneficiary_first_name" required maxLength={100} value={form.first_name} onChange={(event) => update('first_name', event.target.value)} />
          </FormField>
          <FormField label="Surname" htmlFor="death_beneficiary_surname" required>
            <Input id="death_beneficiary_surname" required maxLength={100} value={form.surname} onChange={(event) => update('surname', event.target.value)} />
          </FormField>
          <FormField label="13-digit ID number" htmlFor="death_beneficiary_id_number" required hint="Enter exactly 13 digits." className="sm:col-span-2">
            <Input id="death_beneficiary_id_number" required maxLength={13} inputMode="numeric" pattern="[0-9]{13}" value={form.id_number} onChange={(event) => update('id_number', event.target.value)} />
          </FormField>
          <FormField label="Relationship" htmlFor="death_beneficiary_relationship">
            <select id="death_beneficiary_relationship" className={selectClassName} value={form.relationship} onChange={(event) => update('relationship', event.target.value)}>
              {RELATIONSHIPS.map((relationship) => <option key={relationship} value={relationship}>{relationship}</option>)}
            </select>
          </FormField>
          <FormField label="Share of benefit (%)" htmlFor="death_beneficiary_share" hint="Active nominee shares should total 100%.">
            <Input id="death_beneficiary_share" type="number" min="0.01" max="100" step="0.01" value={form.share_percent} onChange={(event) => update('share_percent', event.target.value)} />
          </FormField>
          <FormField label="Date of birth" htmlFor="death_beneficiary_dob">
            <Input id="death_beneficiary_dob" type="date" value={form.date_of_birth} onChange={(event) => update('date_of_birth', event.target.value)} />
          </FormField>
          <FormField label="Phone" htmlFor="death_beneficiary_phone">
            <Input id="death_beneficiary_phone" type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} />
          </FormField>
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-4 sm:col-span-2">
            <div>
              <p className="text-sm font-medium text-foreground">Active nomination</p>
              <p className="text-xs text-muted-foreground">Benefits can only be claimed after the main member is recorded deceased.</p>
            </div>
            <Switch checked={form.is_active} onCheckedChange={(checked) => update('is_active', checked)} aria-label="Active death-beneficiary nomination" />
          </div>
          {formError && <p role="alert" className="text-sm text-rose-700 sm:col-span-2">{formError}</p>}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : beneficiary ? 'Save changes' : 'Add beneficiary'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
