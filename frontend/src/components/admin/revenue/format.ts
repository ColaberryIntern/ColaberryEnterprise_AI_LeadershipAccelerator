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

export const PLAN_LABEL: Record<'annual' | 'monthly' | 'comp', string> = {
  annual: 'Annual',
  monthly: 'Monthly',
  comp: 'Free Access',
};
