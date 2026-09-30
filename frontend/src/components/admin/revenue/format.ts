export const money = (n: number): string =>
  `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const fmtAbs = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';

export const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

// "just now" / "17m ago" / "5h ago" / "yesterday" / "3d ago" / "Jul 4"
export const timeAgo = (iso: string | null): string => {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export type PlanKey = 'annual' | 'monthly' | 'comp' | 'deposit_holder' | 'other' | 'staff';

export const PLAN_LABEL: Record<PlanKey, string> = {
  annual: 'Annual',
  monthly: 'Monthly',
  comp: 'Free Access',
  deposit_holder: 'Deposit Holder',
  other: 'Other',
  staff: 'Staff',
};

// Fixed categorical color per plan, used everywhere a plan is shown (plan
// breakdown, tenure funnel, attention list, upcoming renewals) so the same
// person's subscription type reads as the same color across the page.
export const PLAN_COLOR: Record<PlanKey, string> = {
  annual: '#15803d',
  monthly: '#1f5fd0',
  comp: 'var(--text-muted)',
  deposit_holder: '#b4302a',
  other: '#8a6d3b',
  staff: '#6f42c1',
};
