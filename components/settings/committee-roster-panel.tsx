'use client';

import { useCallback, useEffect, useState } from 'react';
import { HeartPulse, UserRoundX } from 'lucide-react';
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
import { databaseRequest } from '@/lib/database-api';
import { formatDate, formatMoney } from '@/lib/format';
import { GOVERNANCE_ROLES, getSession, ROLE_LABELS, type Role } from '@/lib/auth';

interface CommitteeMember {
  user_id: string;
  member_id: string | null;
  full_name: string;
  login_id: string;
  is_active: boolean | number;
  role: Role;
  member_number: string | null;
  date_joined: string | null;
  monthly_contribution: number | null;
  member_status: string | null;
  deceased_at: string | null;
}

export function CommitteeRosterPanel() {
  const role = getSession()?.role;
  const canRecordDeath = role ? GOVERNANCE_ROLES.includes(role) : false;
  const [members, setMembers] = useState<CommitteeMember[]>([]);
  const [selected, setSelected] = useState<CommitteeMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMembers(await databaseRequest<CommitteeMember[]>('committee.list'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The committee roster could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markDeceased() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await databaseRequest('committee.markDeceased', { user_id: selected.user_id });
      setSelected(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The member could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
              <HeartPulse className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <CardTitle className="font-heading text-lg">Committee membership</CardTitle>
              <CardDescription>
                Review the six offices annually. Retain or reassign a role in User accounts and roles; moving someone to the Member role removes them from this roster until they are appointed again.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {error}
              <button type="button" className="ml-2 underline" onClick={() => void load()}>Try again</button>
            </div>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading committee membership…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No committee accounts are configured yet.</p>
          ) : (
            <ul className="divide-y rounded-xl border border-border">
              {members.map((member) => {
                const deceased = Boolean(member.deceased_at);
                const active = Boolean(Number(member.is_active)) && member.member_status === 'active' && !deceased;
                return (
                  <li key={member.user_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">{member.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {ROLE_LABELS[member.role]} · {member.member_number ?? 'Membership not linked'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {member.monthly_contribution === null
                          ? 'Apply the membership migration to link this role-holder.'
                          : `${formatMoney(Number(member.monthly_contribution))} monthly · joined ${member.date_joined ? formatDate(member.date_joined) : '—'}`}
                        {deceased && member.deceased_at ? ` · recorded deceased ${formatDate(member.deceased_at)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium ${active ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {deceased ? 'Deceased' : active ? 'Active member' : 'Inactive'}
                      </span>
                      {canRecordDeath && !deceased && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!member.member_id || saving}
                          onClick={() => setSelected(member)}
                          className="gap-1.5"
                        >
                          <UserRoundX className="h-4 w-4" aria-hidden />
                          Record death
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Recording a death closes the membership and disables that account’s sign-in, while preserving its contribution, dependant, and claim history. The role can then be assigned to a replacement account.
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={selected !== null} onOpenChange={(open) => !open && !saving && setSelected(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Record {selected?.full_name} as deceased?</AlertDialogTitle>
            <AlertDialogDescription>
              This ends their active membership, disables sign-in, and preserves their records. This action cannot be undone here; a replacement can be created separately for the vacant committee role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(event) => {
              event.preventDefault();
              void markDeceased();
            }}>
              {saving ? 'Saving…' : 'Confirm deceased'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
