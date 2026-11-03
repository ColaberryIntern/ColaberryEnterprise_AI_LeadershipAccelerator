/**
 * Small pure helpers for the Ad spend page. Money is typed in dollars and stored in cents; the
 * conversion is string-based so "19.99" is 1999 cents, never 1998.9999.
 */
import type { SpendRecord, SpendSource } from '../../../../services/adSpendApi';

/** "$1,234.56" -> 123456; null when it is not a non-negative amount with at most 2 decimals. */
export function dollarsToCents(raw: string): number | null {
  const s = raw.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
}

export function centsToUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const SOURCE_LABEL: Record<SpendSource, string> = {
  meta_api: 'Meta sync',
  csv: 'Imported',
  manual: 'Typed',
};

/** "Oct 1" or "Oct 1 – 7" or "Sep 28 – Oct 4". Dates are calendar days; formatted in UTC so they never shift. */
export function periodLabel(r: Pick<SpendRecord, 'periodStart' | 'periodEnd'>): string {
  const f = (d: string, withMonth: boolean) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: withMonth ? 'short' : undefined, day: 'numeric' });
  if (r.periodStart === r.periodEnd) return f(r.periodStart, true);
  const sameMonth = r.periodStart.slice(0, 7) === r.periodEnd.slice(0, 7);
  return `${f(r.periodStart, true)} – ${f(r.periodEnd, !sameMonth)}`;
}

/** Central calendar date today, as YYYY-MM-DD, for the date inputs' defaults and max. */
export function centralTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
