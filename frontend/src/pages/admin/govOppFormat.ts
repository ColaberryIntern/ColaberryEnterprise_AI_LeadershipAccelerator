/**
 * Pure display formatters for government discovery opportunities — shared by the discovery dashboard
 * (AdminGovOpportunitiesPage) and the decoupled Qualify workspace's "discovery details" card
 * (AdminGovQualificationPage), so both render the legacy score band, value, and close date identically.
 * No IO; deterministic; safe to unit-test and import anywhere.
 */

export type Band = { label: 'High' | 'Med' | 'Low'; tone: 'success' | 'warning' | 'danger' };

/** Legacy discovery score → High/Med/Low band (advisory only, never a verified fit). */
export const band = (score: number | null | undefined): Band => {
  const s = typeof score === 'number' ? score : -1;
  if (s >= 75) return { label: 'High', tone: 'success' };
  if (s >= 60) return { label: 'Med', tone: 'warning' };
  return { label: 'Low', tone: 'danger' };
};

export const subtle = (tone: 'success' | 'warning' | 'danger' | 'secondary'): string => `bg-${tone}-subtle text-${tone}-emphasis`;

export const fmtValue = (v: number | null | undefined): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
};

export const shortValue = (v: number | null | undefined): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
};

/** Whole days from today (UTC date math) to a YYYY-MM-DD close date; null when unknown. */
export const daysLeft = (dateStr: string | null | undefined): number | null => {
  if (!dateStr) return null;
  const d = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d)) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((d - todayUtc) / 86_400_000);
};

export const closeLabel = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'TBD';
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};
