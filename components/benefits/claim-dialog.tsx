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
import { addCalendarMonths, formatMoney, todayIso } from '@/lib/format';
import { databaseRequest } from '@/lib/database-api';
import { getSocietySettings } from '@/lib/settings';
import type { Beneficiary, BenefitProgram, Dependant, Member } from '@/lib/types';
import { toast } from '@/hooks/use-toast';

type MemberOption = Pick<Member, 'id' | 'full_name' | 'member_number' | 'status' | 'date_joined' | 'deceased_at'>;

interface ClaimForm {
  member_id: string;
  dependant_id: string;
  death_beneficiary_id: string;
  program_id: string;
  amount: string;
  requested_on: string;
  reason: string;
}

export function ClaimDialog({
  open,
  onOpenChange,
  memberId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId?: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ClaimForm>(() => emptyClaimForm(memberId));
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [programs, setPrograms] = useState<BenefitProgram[]>([]);
  const [dependants, setDependants] = useState<Dependant[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [memberRecord, setMemberRecord] = useState<Member | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyClaimForm(memberId));
    setFormError(null);
    setLoadingOptions(true);
    const memberQuery = memberId
      ? Promise.resolve([] as MemberOption[])
      : databaseRequest<MemberOption[]>('members.list');
    Promise.all([
      memberQuery,
      databaseRequest<BenefitProgram[]>('programs.active'),
    ]).then(([memberData, programData]) => {
      setLoadingOptions(false);
      setMembers(memberData);
      setPrograms(programData);
    }).catch(() => {
      setLoadingOptions(false);
      setFormError('We could not load members or benefits. Please close and try again.');
    });
  }, [open, memberId]);

  const selectedMember = memberId ?? form.member_id;

  useEffect(() => {
    if (!open || !selectedMember) {
      setMemberRecord(null);
      setDependants([]);
      setBeneficiaries([]);
      return;
    }
    Promise.all([
      databaseRequest<{ member: Member } | null>('members.detail', { id: selectedMember }),
      databaseRequest<Dependant[]>('dependants.activeForMember', { member_id: selectedMember }),
      databaseRequest<Beneficiary[]>('beneficiaries.activeForMember', { member_id: selectedMember }),
    ]).then(([bundle, dependantData, beneficiaryData]) => {
      if (!bundle?.member) throw new Error('The selected member could not be found.');
      setMemberRecord(bundle.member);
      setDependants(dependantData);
      setBeneficiaries(beneficiaryData);
      setFormError(null);
    }).catch((reason) => {
      setMemberRecord(null);
      setDependants([]);
      setBeneficiaries([]);
      setFormError(reason instanceof Error ? reason.message : 'Related member records could not be loaded.');
    });
  }, [open, selectedMember]);

  const update = <K extends keyof ClaimForm>(key: K, value: ClaimForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function selectProgram(programId: string) {
    const program = programs.find((p) => p.id === programId);
    setForm((prev) => ({
      ...prev,
      program_id: programId,
      amount: program ? String(program.benefit_amount) : prev.amount,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!selectedMember) {
      setFormError('Choose the member making this claim.');
      return;
    }
    if (!form.program_id) {
      setFormError('Choose the benefit being claimed.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('The claim amount must be greater than zero.');
      return;
    }

    try {
      const [settings, memberBundle] = await Promise.all([
        getSocietySettings(),
        databaseRequest<{ member: Member; beneficiaries: Beneficiary[]; dependants: Dependant[] } | null>('members.detail', { id: selectedMember }),
      ]);
      if (!memberBundle?.member) {
        setFormError('We could not verify this member. Please try again.');
        return;
      }
      const member = memberBundle.member;
      const waitingMonths = settings.waitingPeriodMonths;
      const memberQualifiedOn = addCalendarMonths(member.date_joined, waitingMonths);
      if (form.death_beneficiary_id) {
        if (!member.deceased_at || memberQualifiedOn > member.deceased_at) {
          setFormError('A death beneficiary can claim only after the main member qualifies and is recorded deceased.');
          return;
        }
      } else {
        if (member.status !== 'active' || member.deceased_at) {
          setFormError('Only a living, active main member can submit a personal or dependant claim.');
          return;
        }
        if (memberQualifiedOn > todayIso()) {
          setFormError(`This member is still in the ${waitingMonths}-month waiting period and cannot submit a benefit claim yet.`);
          return;
        }
        if (form.dependant_id) {
          const dependant = memberBundle.dependants.find((item) => item.id === form.dependant_id);
          if (!dependant || !dependant.is_active || (dependant.eligible_on ?? '') > todayIso()) {
            setFormError('The selected dependant has not completed the six-month waiting period.');
            return;
          }
        }
      }
    } catch {
      setFormError('We could not verify the member’s waiting period. Please try again.');
      return;
    }

    setSaving(true);
    setFormError(null);
    let saveError: string | null = null;
    try {
      await databaseRequest('claims.create', {
        member_id: selectedMember,
        dependant_id: form.dependant_id || null,
        death_beneficiary_id: form.death_beneficiary_id || null,
        program_id: form.program_id,
        amount,
        requested_on: form.requested_on,
        reason: form.reason.trim() || null,
      });
    } catch (reason) {
      saveError = reason instanceof Error ? reason.message : 'We could not submit this claim. Please try again.';
    }
    setSaving(false);

    if (saveError) {
      setFormError(saveError);
      return;
    }
    toast({ title: 'Benefit claim submitted', description: 'It is now waiting for review.' });
    onSaved();
    onOpenChange(false);
  }

  const selectedProgram = programs.find((p) => p.id === form.program_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Submit a benefit claim</DialogTitle>
          <DialogDescription>
            Main members must qualify before claiming. Covered dependants complete a six-month wait; death beneficiaries are payable only after the qualified main member is recorded deceased.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
          {!memberId && (
            <FormField label="Member" htmlFor="claim_member" required className="sm:col-span-2">
              <select
                id="claim_member"
                className={selectClassName}
                value={form.member_id}
                onChange={(e) => {
                  setForm((prev) => ({
                    ...prev,
                    member_id: e.target.value,
                    dependant_id: '',
                    death_beneficiary_id: '',
                  }));
                  setFormError(null);
                }}
                disabled={loadingOptions}
              >
                <option value="">Select a member</option>
                {members.filter((m) => m.status === 'active' || m.deceased_at).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.member_number}){m.deceased_at ? ' — deceased' : ''}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label="Benefit" htmlFor="claim_program" required>
            <select
              id="claim_program"
              className={selectClassName}
              value={form.program_id}
              onChange={(e) => selectProgram(e.target.value)}
              disabled={loadingOptions}
            >
              <option value="">Select a benefit</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FormField>
          {memberRecord?.deceased_at ? (
            <FormField label="Death beneficiary" htmlFor="claim_death_beneficiary" required hint="No separate waiting period applies to the nominee.">
              <select
                id="claim_death_beneficiary"
                required
                className={selectClassName}
                value={form.death_beneficiary_id}
                onChange={(event) => {
                  update('death_beneficiary_id', event.target.value);
                  update('dependant_id', '');
                }}
              >
                <option value="">Select an active death beneficiary</option>
                {beneficiaries.map((beneficiary) => (
                  <option key={beneficiary.id} value={beneficiary.id}>
                    {beneficiary.first_name} {beneficiary.surname} ({beneficiary.relationship}) — {Number(beneficiary.share_percent)}%
                  </option>
                ))}
              </select>
            </FormField>
          ) : (
            <FormField label="Claim for" htmlFor="claim_dependant" hint="Main member or a covered dependant">
              <select
                id="claim_dependant"
                className={selectClassName}
                value={form.dependant_id}
                onChange={(event) => {
                  update('dependant_id', event.target.value);
                  update('death_beneficiary_id', '');
                }}
                disabled={!selectedMember}
              >
                <option value="">The main member</option>
                {dependants.map((dependant) => (
                  <option key={dependant.id} value={dependant.id} disabled={!dependant.eligible_on || dependant.eligible_on > todayIso()}>
                    {dependant.first_name} {dependant.surname} ({dependant.relationship}) — {!dependant.eligible_on || dependant.eligible_on > todayIso()
                      ? `waiting until ${dependant.eligible_on ?? 'eligibility date unavailable'}`
                      : 'covered'}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label="Amount" htmlFor="claim_amount" required hint={selectedProgram ? `Standard amount: ${formatMoney(Number(selectedProgram.benefit_amount))}` : undefined}>
            <Input id="claim_amount" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => update('amount', e.target.value)} />
          </FormField>
          <FormField label="Date requested" htmlFor="claim_date">
            <Input id="claim_date" type="date" value={form.requested_on} onChange={(e) => update('requested_on', e.target.value)} />
          </FormField>
          <FormField label="Reason or supporting detail" htmlFor="claim_reason" className="sm:col-span-2">
            <Textarea id="claim_reason" rows={3} value={form.reason} onChange={(e) => update('reason', e.target.value)} placeholder="Context for the committee, such as a date of event or reference number" />
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
            <Button type="submit" disabled={saving || loadingOptions}>
              {saving ? 'Submitting…' : 'Submit claim'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function emptyClaimForm(memberId?: string): ClaimForm {
  return {
    member_id: memberId ?? '',
    dependant_id: '',
    death_beneficiary_id: '',
    program_id: '',
    amount: '',
    requested_on: todayIso(),
    reason: '',
  };
}
