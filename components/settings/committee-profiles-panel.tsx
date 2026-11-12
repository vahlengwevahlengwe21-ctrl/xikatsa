'use client';

import { useCallback, useEffect, useState } from 'react';
import { ImagePlus, LoaderCircle, Trash2, Upload, UsersRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { databaseRequest } from '@/lib/database-api';
import {
  COMMITTEE_OFFICE_ROLES,
  GALLERY_MANAGEMENT_ROLES,
  ROLE_LABELS,
  getSession,
  type CommitteeOfficeRole,
} from '@/lib/auth';

const MAX_FILE_SIZE = 3 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface CommitteeProfile {
  role_key: CommitteeOfficeRole;
  label: string;
  user_id: string | null;
  full_name: string | null;
  bio: string;
  has_photo: boolean | number;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    const codes: number[] = [];
    for (let index = offset; index < Math.min(offset + 0x8000, bytes.length); index += 1) {
      codes.push(bytes[index]);
    }
    binary += String.fromCharCode.apply(null, codes);
  }
  return btoa(binary);
}

export function CommitteeProfilesPanel() {
  const [profiles, setProfiles] = useState<CommitteeProfile[] | null>(null);
  const [bios, setBios] = useState<Partial<Record<CommitteeOfficeRole, string>>>({});
  const [files, setFiles] = useState<Partial<Record<CommitteeOfficeRole, File>>>({});
  const [consent, setConsent] = useState<Partial<Record<CommitteeOfficeRole, boolean>>>({});
  const [busyRole, setBusyRole] = useState<CommitteeOfficeRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = GALLERY_MANAGEMENT_ROLES.includes(getSession()?.role ?? 'member');

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await databaseRequest<CommitteeProfile[]>('committee.profiles.list');
      setProfiles(result);
      setBios(Object.fromEntries(result.map((profile) => [profile.role_key, profile.bio])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Committee profiles could not be loaded.');
    }
  }, []);

  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);

  if (!canManage) return null;

  function chooseFile(role: CommitteeOfficeRole, file: File | undefined) {
    if (!file) {
      setFiles((current) => ({ ...current, [role]: undefined }));
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type) || file.size === 0 || file.size > MAX_FILE_SIZE) {
      toast({
        title: 'Photo could not be selected',
        description: 'Choose a JPEG, PNG or WebP image no larger than 3 MB.',
        variant: 'destructive',
      });
      return;
    }
    setFiles((current) => ({ ...current, [role]: file }));
  }

  async function saveProfile(profile: CommitteeProfile) {
    const role = profile.role_key;
    if (!profile.user_id) return;
    if (!consent[role]) {
      toast({
        title: 'Approval required',
        description: 'Confirm that the office-holder has approved public display of their name, bio and photo.',
        variant: 'destructive',
      });
      return;
    }

    setBusyRole(role);
    try {
      const file = files[role];
      await databaseRequest('committee.profile.save', {
        role_key: role,
        bio: bios[role] ?? '',
        ...(file ? {
          mime_type: file.type,
          image_base64: encodeBase64(new Uint8Array(await file.arrayBuffer())),
        } : {}),
      });
      setFiles((current) => ({ ...current, [role]: undefined }));
      setConsent((current) => ({ ...current, [role]: false }));
      await load();
      toast({ title: `${profile.label} profile published` });
    } catch (reason) {
      toast({
        title: 'Profile could not be published',
        description: reason instanceof Error ? reason.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBusyRole(null);
    }
  }

  async function removePhoto(profile: CommitteeProfile) {
    setBusyRole(profile.role_key);
    try {
      await databaseRequest('committee.profile.deletePhoto', { role_key: profile.role_key });
      await load();
      toast({ title: `${profile.label} photo removed` });
    } catch (reason) {
      toast({
        title: 'Photo could not be removed',
        description: reason instanceof Error ? reason.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBusyRole(null);
    }
  }

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
            <UsersRound className="h-4 w-4" aria-hidden />
          </div>
          <div>
            <CardTitle className="font-heading text-lg">Public committee profiles</CardTitle>
            <CardDescription>
              Add a short bio and portrait for the six office-holders. Published profiles appear on the public About us page.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
          Publish names, bios, and portraits only with the office-holder&apos;s approval. Photos must be JPEG, PNG, or WebP and no larger than 3 MB.
        </p>
        {error && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}{' '}
            <button type="button" className="underline" onClick={() => void load()}>Try again</button>
          </div>
        )}
        {profiles === null && !error && (
          <p className="text-sm text-muted-foreground">Loading committee profiles…</p>
        )}
        {profiles && (
          <div className="grid gap-4 lg:grid-cols-2">
            {COMMITTEE_OFFICE_ROLES.map((role) => {
              const profile = profiles.find((item) => item.role_key === role);
              if (!profile) return null;
              const saving = busyRole === role;
              const hasPhoto = Boolean(Number(profile.has_photo));
              return (
                <section key={role} className="space-y-3 rounded-xl border border-border p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-50 text-emerald-700">
                      {hasPhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/committee/${role}/photo`} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImagePlus className="h-5 w-5" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold">{profile.label || ROLE_LABELS[role]}</h3>
                      <p className="truncate text-sm text-muted-foreground">
                        {profile.full_name ?? 'No active office-holder assigned'}
                      </p>
                    </div>
                  </div>
                  <label className="block space-y-1.5 text-sm font-medium">
                    Short bio
                    <Textarea
                      value={bios[role] ?? ''}
                      maxLength={280}
                      disabled={!profile.user_id || saving}
                      onChange={(event) => setBios((current) => ({ ...current, [role]: event.target.value }))}
                      placeholder="A short introduction about this office-holder."
                      className="min-h-20 resize-y"
                    />
                    <span className="block text-right text-xs font-normal text-muted-foreground">
                      {(bios[role] ?? '').length}/280
                    </span>
                  </label>
                  <label className="block space-y-1.5 text-sm font-medium">
                    Portrait
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={!profile.user_id || saving}
                      onChange={(event) => chooseFile(role, event.target.files?.[0])}
                      className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-emerald-800"
                    />
                    {files[role] && <span className="block truncate text-xs text-muted-foreground">{files[role]?.name}</span>}
                  </label>
                  <label className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={Boolean(consent[role])}
                      disabled={!profile.user_id || saving}
                      onChange={(event) => setConsent((current) => ({ ...current, [role]: event.target.checked }))}
                      className="mt-0.5 accent-emerald-800"
                    />
                    The office-holder has approved public display of their name, bio and photo.
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" disabled={!profile.user_id || saving} onClick={() => void saveProfile(profile)}>
                      {saving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Upload className="mr-2 h-4 w-4" aria-hidden />}
                      Publish profile
                    </Button>
                    {hasPhoto && (
                      <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void removePhoto(profile)}>
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                        Remove photo
                      </Button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
