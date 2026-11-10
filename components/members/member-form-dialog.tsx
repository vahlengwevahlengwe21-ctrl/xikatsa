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
import { MEMBER_STATUS, todayIso } from '@/lib/format';
import { databaseRequest } from '@/lib/database-api';
import type { Member, MemberStatus } from '@/lib/types';
import { isValidIdNumber } from '@/lib/id-number';
import { getSocietySettings } from '@/lib/settings';
import { toast } from '@/hooks/use-toast';

interface MemberForm {
  first_name: string;
  surname: string;
  id_number: string;
  email: string;
  phone: string;
  alternate_phone: string;
  address: string;
  date_joined: string;
  monthly_contribution: string;
  status: MemberStatus;
  notes: string;
  password: string;
  confirm_password: string;
}

function emptyForm(): MemberForm {
  return {
    first_name: '',
    surname: '',
    id_number: '',
    email: '',
    phone: '',
    alternate_phone: '',
    address: '',
    date_joined: todayIso(),
    monthly_contribution: '',
    status: 'active',
    notes: '',
    password: '',
    confirm_password: '',
  };
}

function toForm(member: Member): MemberForm {
  return {
    first_name: member.first_name ?? '',
    surname: member.surname ?? '',
    id_number: member.id_number ?? '',
    email: member.email ?? '',
    phone: member.phone ?? '',
    alternate_phone: member.alternate_phone ?? '',
    address: member.address ?? '',
    date_joined: member.date_joined,
    monthly_contribution: String(member.monthly_contribution),
    status: member.status,
    notes: member.notes ?? '',
    password: '',
    confirm_password: '',
  };
}

export function MemberFormDialog({
  open,
  onOpenChange,
  member,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member?: Member | null;
  onSaved: (member: Member) => void;
}) {
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(member ? toForm(member) : emptyForm());
      setFormError(null);
      setSettingsFailed(false);
      setSettingsLoading(false);
      if (!member) {
        let active = true;
        setSettingsLoading(true);
        getSocietySettings()
          .then((settings) => {
            if (active) {
              setForm((current) => ({ ...current, monthly_contribution: String(settings.defaultMonthlyContribution) }));
            }
          })
          .catch(() => {
            if (active) {
              setSettingsFailed(true);
              setFormError('Society settings could not be loaded. Check the database connection and retry.');
            }
          })
          .finally(() => {
            if (active) setSettingsLoading(false);
          });
        return () => { active = false; };
      }
    }
  }, [open, member]);

  const update = <K extends keyof MemberForm>(key: K, value: MemberForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member && (settingsLoading || settingsFailed)) return;
    const monthly = Number(form.monthly_contribution);
    if (!form.first_name.trim() || !form.surname.trim()) {
      setFormError('Enter both the member’s first name and surname.');
      return;
    }
    if (!form.phone.trim()) {
      setFormError('Enter the member’s contact number.');
      return;
    }
    if (!isValidIdNumber(form.id_number)) {
      setFormError('Enter a valid 13-digit ID number.');
      return;
    }
    if (!member && form.password.length < 12) {
      setFormError('The member password must contain at least 12 characters.');
      return;
    }
    if (!member && form.password !== form.confirm_password) {
      setFormError('The password and confirmation do not match.');
      return;
    }
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setFormError('That email address does not look right.');
      return;
    }
    if (!Number.isFinite(monthly) || monthly < 0) {
      setFormError('Monthly contribution must be zero or a positive amount.');
      return;
    }

    const payload = {
      first_name: form.first_name.trim(),
      surname: form.surname.trim(),
      id_number: form.id_number.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      alternate_phone: form.alternate_phone.trim() || null,
      address: form.address.trim() || null,
      date_joined: form.date_joined,
      monthly_contribution: monthly,
      status: form.status,
      notes: form.notes.trim() || null,
      ...(!member ? { password: form.password, confirm_password: form.confirm_password } : {}),
    };

    setSaving(true);
    setFormError(null);
    let data: Member | null = null;
    let saveError = false;
    let saveMessage = 'We could not save this member. Please try again.';
    try {
      data = await databaseRequest<Member>('members.save', { ...payload, id: member?.id });
    } catch (reason) {
      saveError = true;
      saveMessage = reason instanceof Error ? reason.message : saveMessage;
    }
    setSaving(false);

    if (saveError || !data) {
      setFormError(saveMessage);
      return;
    }
    toast({
      title: member ? 'Member updated' : 'Member added',
      description: `${payload.first_name} ${payload.surname} has been saved.`,
    });
    onSaved(data as Member);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{member ? 'Edit member' : 'Register a new member'}</DialogTitle>
          <DialogDescription>
            {member
              ? 'Update the member identity and contact details, contribution amount or membership status.'
              : 'A Member-role account is created at registration. The member can sign in using their ID number and password.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
          {!member && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 sm:col-span-2">
              Member registration is limited to authorized governance roles.
            </div>
          )}
          <FormField label="First name" htmlFor="first_name" required>
            <Input id="first_name" required maxLength={100} value={form.first_name} onChange={(e) => update('first_name', e.target.value)} autoFocus />
          </FormField>
          <FormField label="Surname" htmlFor="surname" required>
            <Input id="surname" required maxLength={100} value={form.surname} onChange={(e) => update('surname', e.target.value)} />
          </FormField>
          <FormField label="ID number" htmlFor="id_number" required hint="Enter exactly 13 digits.">
            <Input id="id_number" required maxLength={13} inputMode="numeric" pattern="[0-9]{13}" title="Enter a 13-digit ID number." autoComplete="off" value={form.id_number} onChange={(e) => update('id_number', e.target.value)} />
          </FormField>
          <FormField label="Contact number" htmlFor="phone" required>
            <Input id="phone" required type="tel" maxLength={40} autoComplete="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
          </FormField>
          <FormField label="Alternative contact number (optional)" htmlFor="alternate_phone">
            <Input id="alternate_phone" type="tel" maxLength={40} value={form.alternate_phone} onChange={(e) => update('alternate_phone', e.target.value)} />
          </FormField>
          {!member && (
            <>
              <FormField label="Password" htmlFor="member_password" required hint="Use at least 12 characters.">
                <Input
                  id="member_password"
                  required
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                />
              </FormField>
              <FormField label="Confirm password" htmlFor="confirm_password" required>
                <Input
                  id="confirm_password"
                  required
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={form.confirm_password}
                  onChange={(e) => update('confirm_password', e.target.value)}
                />
              </FormField>
            </>
          )}
          <FormField label="Email" htmlFor="email">
            <Input id="email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="name@example.com" />
          </FormField>
          <FormField label="Address" htmlFor="address" className="sm:col-span-2">
            <Input id="address" value={form.address} onChange={(e) => update('address', e.target.value)} placeholder="Street, city, country" />
          </FormField>
          <FormField label="Date joined" htmlFor="date_joined">
            <Input id="date_joined" type="date" value={form.date_joined} onChange={(e) => update('date_joined', e.target.value)} />
          </FormField>
          <FormField label="Monthly contribution" htmlFor="monthly_contribution" hint="Expected amount per month">
            <Input id="monthly_contribution" type="number" min="0" step="0.01" value={form.monthly_contribution} onChange={(e) => update('monthly_contribution', e.target.value)} />
          </FormField>
          <FormField label="Status" htmlFor="status">
            <select id="status" className={selectClassName} value={form.status} onChange={(e) => update('status', e.target.value as MemberStatus)}>
              {(Object.keys(MEMBER_STATUS) as MemberStatus[]).map((status) => (
                <option key={status} value={status}>
                  {MEMBER_STATUS[status].label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Notes" htmlFor="notes" className="sm:col-span-2">
            <Textarea id="notes" rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Anything the committee should know" />
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
            <Button type="submit" disabled={saving || settingsLoading || settingsFailed}>
              {saving ? 'Saving…' : settingsLoading ? 'Loading policy…' : member ? 'Save changes' : 'Register member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
