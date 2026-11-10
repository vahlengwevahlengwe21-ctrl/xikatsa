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
import { Textarea } from '@/components/ui/textarea';
import { FREQUENCY_LABELS } from '@/lib/format';
import { databaseRequest } from '@/lib/database-api';
import type { BenefitFrequency, BenefitProgram } from '@/lib/types';
import { toast } from '@/hooks/use-toast';

interface ProgramForm {
  name: string;
  description: string;
  benefit_amount: string;
  frequency: BenefitFrequency;
  eligibility: string;
  is_active: boolean;
}

function toForm(program?: BenefitProgram | null): ProgramForm {
  if (!program) {
    return { name: '', description: '', benefit_amount: '', frequency: 'one_time', eligibility: '', is_active: true };
  }
  return {
    name: program.name,
    description: program.description ?? '',
    benefit_amount: String(program.benefit_amount),
    frequency: program.frequency,
    eligibility: program.eligibility ?? '',
    is_active: program.is_active,
  };
}

export function ProgramDialog({
  open,
  onOpenChange,
  program,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  program?: BenefitProgram | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ProgramForm>(() => toForm(program));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(toForm(program));
      setFormError(null);
    }
  }, [open, program]);

  const update = <K extends keyof ProgramForm>(key: K, value: ProgramForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(form.benefit_amount);
    if (!form.name.trim()) {
      setFormError('Give the benefit a name.');
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setFormError('The benefit amount must be zero or more.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      benefit_amount: amount,
      frequency: form.frequency,
      eligibility: form.eligibility.trim() || null,
      is_active: form.is_active,
    };

    setSaving(true);
    setFormError(null);
    let saveError = false;
    try {
      await databaseRequest('programs.save', { ...payload, id: program?.id });
    } catch {
      saveError = true;
    }
    setSaving(false);

    if (saveError) {
      setFormError('We could not save this benefit. Please try again.');
      return;
    }
    toast({ title: program ? 'Benefit updated' : 'Benefit created', description: payload.name });
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{program ? 'Edit benefit' : 'New benefit programme'}</DialogTitle>
          <DialogDescription>Set the standard amount, how often it is paid, and who qualifies.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
          <FormField label="Benefit name" htmlFor="prog_name" required className="sm:col-span-2">
            <Input id="prog_name" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Funeral support" autoFocus />
          </FormField>
          <FormField label="Standard amount" htmlFor="prog_amount" required>
            <Input id="prog_amount" type="number" min="0" step="0.01" value={form.benefit_amount} onChange={(e) => update('benefit_amount', e.target.value)} />
          </FormField>
          <FormField label="Frequency" htmlFor="prog_frequency">
            <select id="prog_frequency" className={selectClassName} value={form.frequency} onChange={(e) => update('frequency', e.target.value as BenefitFrequency)}>
              {(Object.keys(FREQUENCY_LABELS) as BenefitFrequency[]).map((item) => (
                <option key={item} value={item}>
                  {FREQUENCY_LABELS[item]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Description" htmlFor="prog_description" className="sm:col-span-2">
            <Textarea id="prog_description" rows={2} value={form.description} onChange={(e) => update('description', e.target.value)} />
          </FormField>
          <FormField label="Eligibility" htmlFor="prog_eligibility" className="sm:col-span-2" hint="Who qualifies and what they must provide">
            <Textarea id="prog_eligibility" rows={2} value={form.eligibility} onChange={(e) => update('eligibility', e.target.value)} />
          </FormField>
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-4 sm:col-span-2">
            <div>
              <p className="text-sm font-medium text-foreground">Accepting new claims</p>
              <p className="text-xs text-muted-foreground">Inactive benefits stay on record but cannot be claimed.</p>
            </div>
            <Switch checked={form.is_active} onCheckedChange={(checked) => update('is_active', checked)} aria-label="Accepting new claims" />
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
              {saving ? 'Saving…' : program ? 'Save changes' : 'Create benefit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
