'use client';

import { useEffect, useState } from 'react';
import { Save, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getSocietySettings, saveSocietySettings, type SocietySettings } from '@/lib/settings';
import { formatMoney } from '@/lib/format';
import { canManageSocietySettings, getSession } from '@/lib/auth';

export function SocietySettingsPanel() {
  const canEditSettings = Boolean(getSession()?.role && canManageSocietySettings(getSession()!.role));
  const [settings, setSettings] = useState<SocietySettings>({
    joiningFee: 0,
    defaultMonthlyContribution: 0,
    waitingPeriodMonths: 0,
  });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSocietySettings()
      .then((value) => {
        setSettings(value);
        setLoaded(true);
      })
      .catch(() => setError('Society settings could not be loaded. Check the database connection and retry.'))
      .finally(() => setLoading(false));
  }, []);

  function handleChange(key: keyof SocietySettings, value: string) {
    const next = Number(value);
    setSettings((current) => ({ ...current, [key]: Number.isFinite(next) ? next : 0 }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveSocietySettings(settings);
      setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Society settings could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="font-heading text-lg">Society settings</CardTitle>
          <CardDescription>Manage the policy defaults used across the membership register.</CardDescription>
        </div>
        <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
          <Settings2 className="h-4 w-4" aria-hidden />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Joining fee</span>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">R</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={loading ? '' : settings.joiningFee}
                disabled={loading || !loaded || !canEditSettings}
                onChange={(event) => handleChange('joiningFee', event.target.value)}
                className="pl-8"
              />
            </div>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Default monthly contribution</span>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">R</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={loading ? '' : settings.defaultMonthlyContribution}
                disabled={loading || !loaded || !canEditSettings}
                onChange={(event) => handleChange('defaultMonthlyContribution', event.target.value)}
                className="pl-8"
              />
            </div>
          </label>

          <label className="space-y-2 text-sm sm:col-span-2">
            <span className="font-medium text-foreground">Benefit waiting period</span>
            <div className="relative">
              <Input
                type="number"
                min="0"
                max="24"
                step="1"
                value={loading ? '' : settings.waitingPeriodMonths}
                disabled={loading || !loaded || !canEditSettings}
                onChange={(event) => handleChange('waitingPeriodMonths', event.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              A main member must complete this period before personal claims or death-beneficiary claims. Covered dependants have a separate fixed six-month wait.
            </p>
          </label>

        </div>

        <div className="rounded-xl border border-border bg-slate-50 p-3 text-sm text-muted-foreground">
          {loaded ? (
            <>
              <p>Most recently saved defaults:</p>
              <p className="mt-1 font-medium text-foreground">
                Joining fee {formatMoney(settings.joiningFee)} · Monthly contribution {formatMoney(settings.defaultMonthlyContribution)} · Waiting period {settings.waitingPeriodMonths} months
              </p>
            </>
          ) : <p className="font-medium text-foreground">{loading ? 'Loading stored society settings…' : 'Stored society settings are unavailable.'}</p>}
        </div>

        {!canEditSettings && (
          <p className="text-xs text-muted-foreground">
            These values are read-only for your role.             Chairperson, Deputy Chairperson, and Finance roles can update society and finance settings.
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          {canEditSettings && (
            <Button onClick={handleSave} className="gap-2" disabled={loading || saving || !loaded}>
            <Save className="h-4 w-4" aria-hidden />
            {saving ? 'Saving…' : 'Save settings'}
            </Button>
          )}
          {savedAt && <span className="text-xs text-muted-foreground">Saved at {savedAt}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
