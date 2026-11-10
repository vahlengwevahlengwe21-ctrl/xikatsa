export interface SocietySettings {
  joiningFee: number;
  defaultMonthlyContribution: number;
  waitingPeriodMonths: number;
}

export async function getSocietySettings(): Promise<SocietySettings> {
  const response = await fetch('/api/database', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ operation: 'settings.load', input: {} }),
  });
  const payload = (await response.json().catch(() => null)) as {
    data?: Partial<SocietySettings>;
    error?: string;
  } | null;
  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error ?? 'Society settings could not be loaded.');
  }
  const settings = payload.data;
  const value = {
    joiningFee: Number(settings.joiningFee),
    defaultMonthlyContribution: Number(settings.defaultMonthlyContribution),
    waitingPeriodMonths: Number(settings.waitingPeriodMonths),
  };
  if (
    !Number.isFinite(value.joiningFee) || value.joiningFee < 0 ||
    !Number.isFinite(value.defaultMonthlyContribution) || value.defaultMonthlyContribution < 0 ||
    !Number.isFinite(value.waitingPeriodMonths) || value.waitingPeriodMonths < 0
  ) {
    throw new Error('Society settings returned invalid values.');
  }
  return value;
}

export async function saveSocietySettings(settings: SocietySettings) {
  const value = {
    joiningFee: Number(settings.joiningFee),
    defaultMonthlyContribution: Number(settings.defaultMonthlyContribution),
    waitingPeriodMonths: Number(settings.waitingPeriodMonths),
  };

  const response = await fetch('/api/database', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ operation: 'settings.save', input: value }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Society settings could not be saved.');
  }
}
