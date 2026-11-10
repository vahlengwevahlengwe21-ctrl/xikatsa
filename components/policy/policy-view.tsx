'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpenText, Clock3, Download, FilePenLine, FileText, Upload } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { ROLE_LABELS, canManagePolicy, getSession, type Role } from '@/lib/auth';
import { databaseRequest } from '@/lib/database-api';

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

interface SocietyPolicy {
  document_name: string | null;
  document_mime_type: string | null;
  document_size: number | null;
  updated_by_role: Role;
  updated_at: string;
}

interface PolicyDocument {
  document_name: string;
  document_mime_type: string;
  document_base64: string;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const codes: number[] = [];
    const end = Math.min(offset + chunkSize, bytes.length);
    for (let index = offset; index < end; index += 1) codes.push(bytes[index]);
    binary += String.fromCharCode.apply(null, codes);
  }
  return btoa(binary);
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function PolicyView() {
  const { toast } = useToast();
  const role = getSession()?.role ?? null;
  const canEdit = role !== null && canManagePolicy(role);
  const [policy, setPolicy] = useState<SocietyPolicy | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await databaseRequest<SocietyPolicy>('policy.load');
      setPolicy(data);
    } catch {
      setError('The society policy could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function chooseFile(file: File | null) {
    setFileError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const extension = file.name.toLowerCase().split('.').pop();
    if (!['pdf', 'docx'].includes(extension ?? '') ||
        (file.type && !ACCEPTED_FILE_TYPES.includes(file.type))) {
      setSelectedFile(null);
      setFileError('Choose a PDF or DOCX document.');
      return;
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      setSelectedFile(null);
      setFileError('The document must be smaller than 8 MB.');
      return;
    }
    setSelectedFile(file);
  }

  async function savePolicy() {
    if (!selectedFile || fileError) return;
    setSaving(true);
    try {
      const fileBytes = new Uint8Array(await selectedFile.arrayBuffer());
      await databaseRequest('policy.save', {
        fileName: selectedFile.name,
        documentBase64: encodeBase64(fileBytes),
      });
      setEditing(false);
      setSelectedFile(null);
      toast({ title: 'Policy document updated', description: 'The current document is now available for members to download.' });
      await load();
    } catch (saveError) {
      toast({
        title: 'Policy document could not be saved',
        description: saveError instanceof Error ? saveError.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  async function downloadPolicy() {
    setDownloading(true);
    try {
      const document = await databaseRequest<PolicyDocument>('policy.download');
      const binary = atob(document.document_base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: document.document_mime_type }));
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.document_name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      toast({
        title: 'Policy document could not be downloaded',
        description: downloadError instanceof Error ? downloadError.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  }

  const updatedAt = policy ? new Date(policy.updated_at) : null;
  const hasPublishedPolicy = Boolean(policy?.document_name);

  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Society policy"
        description="Download the current policy document and review the latest amendment information."
        actions={canEdit && !editing && policy ? (
          <Button onClick={() => setEditing(true)} className="gap-2">
            <FilePenLine className="h-4 w-4" aria-hidden />
            {hasPublishedPolicy ? 'Amend policy' : 'Add policy document'}
          </Button>
        ) : undefined}
      />

      <Card className="overflow-hidden rounded-2xl shadow-sm">
        <div className="flex items-start gap-4 border-b border-border bg-gradient-to-br from-emerald-50 via-white to-white p-6 sm:p-8">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-sm">
            <BookOpenText className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Official document</p>
            <h2 className="mt-1 font-heading text-xl font-bold tracking-tight">Xikatsa Society Policy</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              All signed-in roles can download the current policy. Amendments are restricted to authorized governance and secretary roles.
            </p>
            {hasPublishedPolicy && policy && updatedAt && Number.isFinite(updatedAt.getTime()) && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                Last amended by {ROLE_LABELS[policy.updated_by_role]} · {updatedAt.toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <div className="p-5 sm:p-8">
          {error && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              {error}{' '}
              <button type="button" onClick={() => void load()} className="font-medium underline underline-offset-4">
                Try again
              </button>
            </div>
          )}

          {loading && !error && <Skeleton className="h-48 w-full rounded-xl" />}

          {!loading && !error && editing && (
            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
                <label htmlFor="society-policy-document" className="text-sm font-semibold">Policy document</label>
                <p className="mb-3 mt-1 text-sm leading-relaxed text-muted-foreground">
                  Upload the approved policy as a PDF or DOCX, up to 8 MB. Publishing a new document replaces the current version for everyone.
                </p>
                <Input
                  id="society-policy-document"
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                  aria-describedby="policy-file-help"
                  aria-invalid={Boolean(fileError)}
                  className="h-auto min-h-11 cursor-pointer py-2 file:mr-3 file:rounded-md file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                />
                <p id="policy-file-help" className={`mt-2 text-sm ${fileError ? 'text-rose-700' : 'text-muted-foreground'}`} role={fileError ? 'alert' : undefined}>
                  {fileError ?? (selectedFile
                    ? `${selectedFile.name} · ${formatFileSize(selectedFile.size)}`
                    : policy?.document_name
                      ? `Current document: ${policy.document_name}. Choose a replacement to publish an amendment.`
                      : 'No policy document has been published yet.')}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedFile(null);
                    setFileError(null);
                    setEditing(false);
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={() => void savePolicy()} disabled={saving || !selectedFile || Boolean(fileError)} className="gap-2">
                  <Upload className="h-4 w-4" aria-hidden />
                  {saving ? 'Uploading…' : 'Publish policy document'}
                </Button>
              </div>
            </div>
          )}

          {!loading && !error && !editing && (
            hasPublishedPolicy && policy ? (
              <div className="flex flex-col gap-5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-100">
                    <FileText className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="break-all font-semibold text-foreground">{policy.document_name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {policy.document_size ? formatFileSize(Number(policy.document_size)) : 'Policy document'}
                      {policy.document_mime_type === 'application/pdf' ? ' · PDF' : ' · DOCX'}
                    </p>
                  </div>
                </div>
                <Button onClick={() => void downloadPolicy()} disabled={downloading} className="shrink-0 gap-2">
                  <Download className="h-4 w-4" aria-hidden />
                  {downloading ? 'Preparing…' : 'Download policy'}
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 px-5 py-12 text-center">
                <BookOpenText className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
                <h3 className="mt-3 font-heading text-base font-semibold">Policy document not published yet</h3>
                <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
                  An authorized governance role can attach the approved document for all members to download.
                </p>
              </div>
            )
          )}
        </div>
      </Card>
    </>
  );
}
