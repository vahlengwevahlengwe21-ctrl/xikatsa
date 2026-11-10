'use client';

import { useCallback, useEffect, useState } from 'react';
import { Archive, Megaphone, Plus } from 'lucide-react';
import { FormField, selectClassName } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/format';
import { databaseRequest } from '@/lib/database-api';
import { ROLE_LABELS, canManageAnnouncements, getSession } from '@/lib/auth';
import type { Announcement, AnnouncementSeverity } from '@/lib/types';
import { toast } from '@/hooks/use-toast';

interface AnnouncementForm {
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  expires_on: string;
}

const SEVERITY_LABELS: Record<AnnouncementSeverity, string> = {
  notice: 'Notice',
  important: 'Important',
  urgent: 'Urgent',
};

const SEVERITY_STYLES: Record<AnnouncementSeverity, string> = {
  notice: 'bg-sky-50 text-sky-800',
  important: 'bg-amber-50 text-amber-800',
  urgent: 'bg-rose-50 text-rose-800',
};

function emptyForm(): AnnouncementForm {
  return { title: '', body: '', severity: 'notice', expires_on: '' };
}

export function AnnouncementsView() {
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AnnouncementForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const sessionRole = getSession()?.role;
  const canManage = sessionRole ? canManageAnnouncements(sessionRole) : false;

  const load = useCallback(async () => {
    setError(null);
    try {
      setAnnouncements(await databaseRequest<Announcement[]>('announcements.list'));
    } catch {
      setError('We could not load announcements. Please try again.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openComposer() {
    setForm(emptyForm());
    setDialogOpen(true);
  }

  async function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await databaseRequest('announcements.create', {
        title: form.title.trim(),
        body: form.body.trim(),
        severity: form.severity,
        expires_on: form.expires_on || null,
        published_by_role: sessionRole ?? 'secretary',
      });
      setDialogOpen(false);
      toast({ title: 'Announcement published' });
      await load();
    } catch (requestError) {
      toast({
        title: 'Could not publish announcement',
        description: requestError instanceof Error ? requestError.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  async function archive(announcement: Announcement) {
    setArchivingId(announcement.id);
    try {
      await databaseRequest('announcements.archive', { id: announcement.id });
      setAnnouncements((current) => current?.filter((item) => item.id !== announcement.id) ?? current);
      toast({ title: 'Announcement archived' });
    } catch {
      toast({ title: 'Could not archive announcement', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Society communications"
        title="Announcements"
        description="Keep members informed about meetings, contribution dates, program changes, and urgent updates."
        actions={canManage ? (
          <Button onClick={openComposer} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            New announcement
          </Button>
        ) : undefined}
      />

      {error && (
        <div role="alert" className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}{' '}
          <button type="button" onClick={() => void load()} className="font-medium underline underline-offset-4">Try again</button>
        </div>
      )}

      {!error && announcements === null && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />)}
        </div>
      )}

      {!error && announcements?.length === 0 && (
        <div className="flex flex-col items-center border border-dashed border-border px-6 py-16 text-center">
          <Megaphone className="mb-4 h-6 w-6 text-emerald-700" aria-hidden />
          <p className="font-heading text-lg font-semibold">No active announcements</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Published notices will appear here until they expire or are archived.</p>
          {canManage && (
            <Button onClick={openComposer} className="mt-5 gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              Publish the first notice
            </Button>
          )}
        </div>
      )}

      {!error && announcements && announcements.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {announcements.map((announcement) => (
            <li key={announcement.id} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between">
              <article className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SEVERITY_STYLES[announcement.severity]}`}>
                    {SEVERITY_LABELS[announcement.severity]}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-700">
                    {ROLE_LABELS[(announcement as Announcement & { role?: keyof typeof ROLE_LABELS }).role ?? 'member']}
                  </span>
                  <span className="text-xs text-muted-foreground">Posted {formatDate(announcement.published_at.slice(0, 10))}</span>
                  {announcement.expires_on && <span className="text-xs text-muted-foreground">· Expires {formatDate(announcement.expires_on)}</span>}
                </div>
                <h2 className="font-heading text-lg font-semibold text-foreground">{announcement.title}</h2>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{announcement.body}</p>
              </article>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-2 self-start"
                  onClick={() => void archive(announcement)}
                  disabled={archivingId === announcement.id}
                  aria-label={`Archive ${announcement.title}`}
                >
                  <Archive className="h-4 w-4" aria-hidden />
                  Archive
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">New announcement</DialogTitle>
            <DialogDescription>Published announcements are visible to everyone using the society app.</DialogDescription>
          </DialogHeader>
          <form onSubmit={publish} className="grid gap-5">
            <FormField label="Title" htmlFor="announcement_title" required>
              <Input
                id="announcement_title"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                maxLength={180}
                required
                autoFocus
              />
            </FormField>
            <FormField label="Message" htmlFor="announcement_body" required>
              <Textarea
                id="announcement_body"
                value={form.body}
                onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
                rows={5}
                required
              />
            </FormField>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Priority" htmlFor="announcement_severity">
                <select
                  id="announcement_severity"
                  className={selectClassName}
                  value={form.severity}
                  onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value as AnnouncementSeverity }))}
                >
                  <option value="notice">Notice</option>
                  <option value="important">Important</option>
                  <option value="urgent">Urgent</option>
                </select>
              </FormField>
              <FormField label="Expiry date" htmlFor="announcement_expiry" hint="Optional">
                <Input
                  id="announcement_expiry"
                  type="date"
                  value={form.expires_on}
                  onChange={(event) => setForm((current) => ({ ...current, expires_on: event.target.value }))}
                />
              </FormField>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Publishing…' : 'Publish announcement'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
        </Dialog>
      )}
    </>
  );
}
