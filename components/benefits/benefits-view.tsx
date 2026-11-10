'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { ClaimsPanel } from '@/components/benefits/claims-panel';
import { ProgramDialog } from '@/components/benefits/program-dialog';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FREQUENCY_LABELS, formatMoney } from '@/lib/format';
import { databaseRequest } from '@/lib/database-api';
import type { BenefitProgram } from '@/lib/types';
import { GOVERNANCE_ROLES, getSession } from '@/lib/auth';

 type BenefitsTab = 'claims' | 'programs';

export function BenefitsView() {
  const session = getSession();
  const currentRole = session?.role;
  const isMember = currentRole === 'member';
  const canManagePrograms = currentRole ? GOVERNANCE_ROLES.includes(currentRole) : false;
  const [tab, setTab] = useState<BenefitsTab>('claims');
  const [programs, setPrograms] = useState<BenefitProgram[] | null>(null);
  const [programsError, setProgramsError] = useState<string | null>(null);
  const [programDialogOpen, setProgramDialogOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<BenefitProgram | null>(null);

  const loadPrograms = useCallback(async () => {
    setProgramsError(null);
    try {
      setPrograms(await databaseRequest<BenefitProgram[]>('programs.list'));
    } catch {
      setProgramsError('We could not load benefit programs. Please try again.');
    }
  }, []);

  useEffect(() => {
    if (tab === 'programs') void loadPrograms();
  }, [tab, loadPrograms]);

  function openCreateProgram() {
    setEditingProgram(null);
    setProgramDialogOpen(true);
  }

  function openEditProgram(program: BenefitProgram) {
    setEditingProgram(program);
    setProgramDialogOpen(true);
  }

  const tabs: { id: BenefitsTab; label: string }[] = isMember
    ? [{ id: 'claims', label: 'My claims' }]
    : [
      { id: 'claims', label: 'Claims' },
      { id: 'programs', label: 'Programs' },
    ];

  return (
    <>
      <PageHeader
        eyebrow="Benefits"
        title="Benefits and claims"
        description={isMember ? 'Submit a claim and review your benefits.' : 'Manage benefit programs and review member claims.'}
        actions={tab === 'programs' && canManagePrograms ? (
          <Button onClick={openCreateProgram} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            New program
          </Button>
        ) : undefined}
      />

      <div className="mb-6 flex gap-1 border-b border-border" role="tablist" aria-label="Benefits sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            id={`benefits-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`benefits-panel-${item.id}`}
            onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === item.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'claims' ? (
        <section id="benefits-panel-claims" role="tabpanel" aria-labelledby="benefits-tab-claims">
          <ClaimsPanel memberId={isMember ? session?.memberId ?? undefined : undefined} />
        </section>
      ) : (
        <section id="benefits-panel-programs" role="tabpanel" aria-labelledby="benefits-tab-programs" className="space-y-4">
          {programsError && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              {programsError}{' '}
              <button type="button" onClick={() => void loadPrograms()} className="font-medium underline underline-offset-4">
                Try again
              </button>
            </div>
          )}

          {!programsError && programs === null && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 w-full" />)}
            </div>
          )}

          {!programsError && programs !== null && programs.length === 0 && (
            <div className="flex flex-col items-center border border-dashed border-border px-6 py-16 text-center">
              <p className="font-heading text-lg font-semibold">No benefit programs yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Create a program before members submit claims.</p>
              {canManagePrograms && (
                <Button onClick={openCreateProgram} className="mt-5 gap-2">
                  <Plus className="h-4 w-4" aria-hidden />
                  Create program
                </Button>
              )}
            </div>
          )}

          {!programsError && programs !== null && programs.length > 0 && (
            <ul className="divide-y divide-border border-y border-border">
              {programs.map((program) => (
                <li key={program.id} className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h2 className="font-medium text-foreground">{program.name}</h2>
                      <span className="text-xs text-muted-foreground">{program.is_active ? 'Active' : 'Inactive'}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatMoney(Number(program.benefit_amount))} · {FREQUENCY_LABELS[program.frequency]}
                    </p>
                    {program.description && <p className="mt-1 text-sm text-muted-foreground">{program.description}</p>}
                  </div>
                  {canManagePrograms && (
                    <Button variant="ghost" size="icon" onClick={() => openEditProgram(program)} aria-label={`Edit ${program.name}`}>
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canManagePrograms && (
        <ProgramDialog
          open={programDialogOpen}
          onOpenChange={setProgramDialogOpen}
          program={editingProgram}
          onSaved={() => { void loadPrograms(); }}
        />
      )}
    </>
  );
}
