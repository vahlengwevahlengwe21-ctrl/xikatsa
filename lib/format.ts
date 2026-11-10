import type {
  BenefitFrequency,
  ClaimStatus,
  MemberStatus,
  TransactionKind,
} from '@/lib/types';

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'slate';

export const MAX_ACTIVE_DEPENDANTS = 6;
export const DEPENDANT_WAITING_PERIOD_MONTHS = 6;
const SOCIETY_TIME_ZONE = 'Africa/Johannesburg';

export const currencyFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
});

export function formatMoney(value: number): string {
  return currencyFormatter.format(value);
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: SOCIETY_TIME_ZONE,
  });
}

export function toIsoDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SOCIETY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function dateOnly(value: string | Date): string {
  if (value instanceof Date) return toIsoDate(value);
  if (/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    const timestamp = new Date(value);
    if (!Number.isFinite(timestamp.getTime())) throw new Error('Invalid calendar date.');
    return toIsoDate(timestamp);
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (!match || !isValidIsoDate(match[1])) {
    throw new Error('Invalid calendar date.');
  }
  return match[1];
}

export function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function addCalendarMonths(value: string | Date, months: number): string {
  if (!Number.isInteger(months)) throw new Error('Month offset must be an integer.');
  const [year, month, day] = dateOnly(value).split('-').map(Number);
  const targetMonth = new Date(0);
  targetMonth.setUTCHours(0, 0, 0, 0);
  targetMonth.setUTCFullYear(year, month - 1 + months, 1);
  const endOfMonth = new Date(0);
  endOfMonth.setUTCHours(0, 0, 0, 0);
  endOfMonth.setUTCFullYear(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0);
  const lastDay = endOfMonth.getUTCDate();
  targetMonth.setUTCDate(Math.min(day, lastDay));
  return [
    String(targetMonth.getUTCFullYear()).padStart(4, '0'),
    String(targetMonth.getUTCMonth() + 1).padStart(2, '0'),
    String(targetMonth.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export const MEMBER_STATUS: Record<MemberStatus, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'green' },
  inactive: { label: 'Inactive', tone: 'slate' },
  suspended: { label: 'Suspended', tone: 'red' },
};

export const CLAIM_STATUS: Record<ClaimStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pending review', tone: 'amber' },
  approved: { label: 'Approved', tone: 'blue' },
  rejected: { label: 'Rejected', tone: 'red' },
  paid: { label: 'Paid', tone: 'green' },
};

export const FREQUENCY_LABELS: Record<BenefitFrequency, string> = {
  one_time: 'One-time',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

export const TRANSACTION_KIND: Record<TransactionKind, { label: string; tone: Tone; income: boolean }> = {
  contribution: { label: 'Contribution', tone: 'green', income: true },
  joining_fee: { label: 'Joining fee', tone: 'blue', income: true },
  donation: { label: 'Donation', tone: 'blue', income: true },
  fine: { label: 'Fine payment', tone: 'amber', income: true },
  other_income: { label: 'Other receipt', tone: 'slate', income: true },
  expense: { label: 'Expense', tone: 'red', income: false },
  benefit_payout: { label: 'Benefit payout', tone: 'amber', income: false },
};

export const MANUAL_TRANSACTION_KINDS: TransactionKind[] = [
  'contribution',
  'joining_fee',
  'donation',
  'fine',
  'other_income',
  'expense',
];
