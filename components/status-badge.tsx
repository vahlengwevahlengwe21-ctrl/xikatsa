import { cn } from '@/lib/utils';
import type { Tone } from '@/lib/format';

const TONE_CLASSES: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-900 ring-amber-600/25',
  red: 'bg-rose-50 text-rose-800 ring-rose-600/20',
  blue: 'bg-sky-50 text-sky-900 ring-sky-600/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/20',
};

export function StatusBadge({ label, tone, className }: { label: string; tone: Tone; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONE_CLASSES[tone],
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {label}
    </span>
  );
}
