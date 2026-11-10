'use client';

import { useEffect, useState } from 'react';
import { KeyRound, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { databaseRequest } from '@/lib/database-api';
import { getSession, ROLE_DASHBOARD_COPY, ROLE_LABELS, type Role } from '@/lib/auth';
import { isValidIdNumber } from '@/lib/id-number';

interface UserAccount {
  id: string;
  full_name: string;
  contact_number: string | null;
  login_id: string | null;
  member_id: string | null;
  role: Role;
  is_active: boolean | number;
  created_at: string;
}

interface RoleOption {
  role_key: Role;
  label: string;
}

export function UsersRolesPanel() {
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [fullName, setFullName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<Role>('chairperson');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUserId = getSession()?.id;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [userData, roleData] = await Promise.all([
        databaseRequest<UserAccount[]>('users.list'),
        databaseRequest<RoleOption[]>('roles.list'),
      ]);
      setAccounts(userData.filter((account) => account.role !== 'super-administrator'));
      setRoles(roleData.filter((item) => item.role_key !== 'super-administrator'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Users and roles could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (getSession()?.role === 'super-administrator') void load();
  }, []);

  if (getSession()?.role !== 'super-administrator') return null;

  function resetForm() {
    setEditing(null);
    setFullName('');
    setLoginId('');
    setContactNumber('');
    setPassword('');
    setConfirmPassword('');
    setRole('chairperson');
    setActive(true);
  }

  function editAccount(account: UserAccount) {
    setEditing(account);
    setFullName(account.full_name);
    setLoginId(account.login_id ?? '');
    setContactNumber(account.contact_number ?? '');
    setPassword('');
    setConfirmPassword('');
    setRole(account.role);
    setActive(Boolean(Number(account.is_active)));
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidIdNumber(loginId)) {
      setError('Enter a valid 13-digit ID number.');
      return;
    }
    if (!contactNumber.trim() || contactNumber.trim().length > 40) {
      setError('Enter a contact number of no more than 40 characters.');
      return;
    }
    if ((!editing || password) && password !== confirmPassword) {
      setError('The password and confirmation do not match.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await databaseRequest('users.update', {
          id: editing.id,
          full_name: fullName.trim(),
          login_id: loginId.trim(),
          contact_number: contactNumber.trim(),
          role,
          is_active: active,
          password: password || null,
        });
      } else {
        await databaseRequest('users.create', {
          full_name: fullName.trim(),
          login_id: loginId.trim(),
          contact_number: contactNumber.trim(),
          role,
          password,
        });
      }
      resetForm();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The account could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><Users className="h-4 w-4" aria-hidden /></div>
          <div>
            <CardTitle className="font-heading text-lg">User accounts and roles</CardTitle>
            <CardDescription>Operational role accounts are linked to main memberships. At the annual committee review, retain a role, move an office-holder to another role, or return them to the Member role; members returned to the Member role leave the committee roster until assigned again. New passwords must be at least 12 characters; leave password fields blank when editing to keep the current password.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}

        <section aria-label="Role responsibilities" className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <h3 className="font-heading text-sm font-semibold">Role responsibilities</h3>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {roles.filter((item) => item.role_key !== 'member' && item.role_key !== 'super-administrator').map((item) => (
              <li key={item.role_key}>
                <span className="font-medium">{item.label || ROLE_LABELS[item.role_key]}:</span>{' '}
                <span className="text-muted-foreground">{ROLE_DASHBOARD_COPY[item.role_key]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Main members can view their own member services, submit claims, and read announcements and policy.
          </p>
        </section>

        <form onSubmit={handleSubmit} className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium">Full name</span>
            <Input
              required
              maxLength={200}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium">13-digit ID number (used to sign in)</span>
            <Input
              required
              type="text"
              maxLength={13}
              inputMode="numeric"
              pattern="[0-9]{13}"
              title="Enter a 13-digit ID number."
              value={editing?.member_id ? editing.login_id ?? '' : loginId}
              onChange={(event) => setLoginId(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium">Contact number</span>
            <Input
              required
              type="tel"
              maxLength={40}
              autoComplete="tel"
              value={contactNumber}
              onChange={(event) => setContactNumber(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium">{editing ? 'New password (optional)' : 'Password'}</span>
            <Input
              required={!editing}
              disabled={editing?.id === currentUserId}
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {(!editing || password.length > 0) && (
            <label className="space-y-2 text-sm">
              <span className="font-medium">Confirm {editing ? 'new ' : ''}password</span>
              <Input
                required
                disabled={editing?.id === currentUserId}
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          )}
          <label className="space-y-2 text-sm">
            <span className="font-medium">Role</span>
            <select
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={role}
              disabled={editing?.id === currentUserId}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              {roles
                .filter((item) => item.role_key !== 'member' || Boolean(editing?.member_id))
                .map((item) => <option key={item.role_key} value={item.role_key}>{item.label || ROLE_LABELS[item.role_key]}</option>)}
            </select>
          </label>
          {editing && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={active}
                disabled={editing.id === currentUserId}
                onChange={(event) => setActive(event.target.checked)}
              />
              Account active
            </label>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" className="gap-2" disabled={saving || loading}>
              {editing ? <KeyRound className="h-4 w-4" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
              {saving ? 'Saving…' : editing ? 'Save account' : 'Create account'}
            </Button>
            {editing && <Button type="button" variant="outline" onClick={resetForm}>Cancel edit</Button>}
          </div>
        </form>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading accounts…</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No user accounts have been created.</p>
        ) : (
          <div className="divide-y rounded-xl border border-border">
            {accounts.map((account) => (
              <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{account.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    ID: {account.login_id ?? 'not set'} · {account.contact_number ?? 'No contact number'} · {ROLE_LABELS[account.role]}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium ${Boolean(Number(account.is_active)) ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {Boolean(Number(account.is_active)) ? 'Active' : 'Disabled'}
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={() => editAccount(account)}>Manage</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
