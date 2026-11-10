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
import { databaseRequest } from '@/lib/database-api';
import { isValidIdNumber } from '@/lib/id-number';
import type { Dependant } from '@/lib/types';
import { toast } from '@/hooks/use-toast';

export const RELATIONSHIPS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Grandchild', 'Other relative', 'Friend', 'Other'];

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

export function DependantDialog({
  open,
  onOpenChange,
  memberId,
  dependant,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  dependant?: Dependant | null;
  onSaved: (dependant: Dependant) => void;
}) {
  const [form, setForm] = useState<BeneficiaryForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(
      dependant
        ? {
            first_name: dependant.first_name,
            surname: dependant.surname,
            id_number: dependant.id_number ?? '',
            relationship: dependant.relationship,
            date_of_birth: dependant.date_of_birth ?? '',
            phone: dependant.phone ?? '',
            share_percent: String(dependant.share_percent),
            is_active: dependant.is_active,
          }
        : emptyForm()
    );
    setFormError(null);
  }, [open, dependant]);

  const update = <K extends keyof BeneficiaryForm>(key: K, value: BeneficiaryForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const share = Number(form.share_percent);
    if (!form.first_name.trim() || !form.surname.trim()) {
      setFormError('Enter the dependant’s first name and surname.');
      return;
    }
    if (!isValidIdNumber(form.id_number)) {
      setFormError('Enter a valid 13-digit dependant ID number.');
      return;
    }
    if (!Number.isFinite(share) || share < 0 || share > 100) {
      setFormError('Share must be between 0 and 100 percent.');
      return;
    }

    const payload = {
      member_id: memberId,
      first_name: form.first_name.trim(),
      surname: form.surname.trim(),
      id_number: form.id_number.trim(),
      relationship: form.relationship,
      date_of_birth: form.date_of_birth || null,
      phone: form.phone.trim() || null,
      share_percent: share,
      is_active: form.is_active,
    };

    setSaving(true);
    setFormError(null);
    let data: Dependant | null = null;
    let saveError = false;
    let saveMessage = 'We could not save this dependant. Please try again.';
    try {
      data = await databaseRequest<Dependant>('dependants.save', { ...payload, id: dependant?.id });
    } catch (error) {
      saveMessage = error instanceof Error ? error.message : saveMessage;
      saveError = true;
    }
    setSaving(false);

    if (saveError || !data) {
      setFormError(saveMessage);
      return;
    }
    toast({ title: dependant ? 'Dependant updated' : 'Dependant added' });
    onSaved(data);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{dependant ? 'Edit dependant' : 'Add covered dependant'}</DialogTitle>
          <DialogDescription>
            Add a person who will be covered under this main member. Cover starts after a six-month waiting period; dependants do not sign in.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
          <FormField label="First name" htmlFor="ben_first_name" required>
            <Input id="ben_first_name" required maxLength={100} value={form.first_name} onChange={(e) => update('first_name', e.target.value)} autoFocus />
          </FormField>
          <FormField label="Surname" htmlFor="ben_surname" required>
            <Input id="ben_surname" required maxLength={100} value={form.surname} onChange={(e) => update('surname', e.target.value)} />
          </FormField>
          <FormField label="Dependant ID number" htmlFor="ben_id_number" required hint="Enter exactly 13 digits." className="sm:col-span-2">
            <Input id="ben_id_number" required maxLength={13} inputMode="numeric" pattern="[0-9]{13}" title="Enter a 13-digit beneficiary ID number." autoComplete="off" value={form.id_number} onChange={(e) => update('id_number', e.target.value)} />
          </FormField>
          <FormField label="Relationship" htmlFor="ben_relationship">
            <select
              id="ben_relationship"
              className={selectClassName}
              value={form.relationship}
              onChange={(e) => update('relationship', e.target.value)}
            >
              {RELATIONSHIPS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Date of birth" htmlFor="ben_dob">
            <Input id="ben_dob" type="date" value={form.date_of_birth} onChange={(e) => update('date_of_birth', e.target.value)} />
          </FormField>
          <FormField label="Phone" htmlFor="ben_phone">
            <Input id="ben_phone" type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
          </FormField>
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-4 sm:col-span-2">
            <div>
              <p className="text-sm font-medium text-foreground">Active dependant cover</p>
              <p className="text-xs text-muted-foreground">Cover begins after the six-month waiting period.</p>
            </div>
            <Switch checked={form.is_active} onCheckedChange={(checked) => update('is_active', checked)} aria-label="Active dependant cover" />
          </div>

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
              {saving ? 'Saving…' : dependant ? 'Save changes' : 'Add dependant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
