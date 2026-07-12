/**
 * trust.ts — shared types + helpers for the page-level Trust layer.
 *
 * Implements the TBI drill-down model (Basecamp todo 10027085963):
 *   L0 overall level/score -> L1 pillars -> L2 evidence rows -> L3 raw pointers.
 * Every admin page declares a TrustSignal; <TrustBadge> renders the L0 chip and
 * expands through the levels. The Trust Center aggregates these into one hub.
 */

export type TrustLevel = 'verified' | 'live' | 'stale' | 'unverified' | 'error';

/** L2/L3: a single piece of evidence behind a pillar, optionally linking to raw. */
export interface TrustEvidence {
  label: string;
  value?: string;
  href?: string; // L3 — pointer to the raw rows / source record
}

/** L1: a scored dimension of trust (e.g. Freshness, Source, Completeness). */
export interface TrustPillar {
  name: string;
  status?: TrustLevel;
  score?: number; // 0–100
  evidence?: TrustEvidence[];
}

/** L0: the page's overall trust signal. */
export interface TrustSignal {
  level: TrustLevel;
  score?: number; // 0–100 overall
  source?: string; // primary data source label
  updatedAt?: string | null; // ISO timestamp of last refresh
  summary?: string; // one-line plain-language explanation
  pillars?: TrustPillar[];
  href?: string; // deep link into the Trust Center detail
}

interface LevelMeta {
  label: string;
  icon: string; // RemixIcon name (without the ri- prefix)
  /** Bootstrap-ish semantic token used for the chip accent. */
  color: string;
  bg: string;
}

const LEVEL_META: Record<TrustLevel, LevelMeta> = {
  verified: { label: 'Verified', icon: 'shield-check-line', color: 'var(--status-success)', bg: 'var(--status-success-bg)' },
  live: { label: 'Live', icon: 'broadcast-line', color: 'var(--status-info)', bg: 'var(--status-info-bg)' },
  stale: { label: 'Stale', icon: 'time-line', color: 'var(--status-warning)', bg: 'var(--status-warning-bg)' },
  unverified: { label: 'Unverified', icon: 'question-line', color: 'var(--text-muted)', bg: 'var(--surface-subtle)' },
  error: { label: 'Trust error', icon: 'error-warning-line', color: 'var(--status-danger)', bg: 'var(--status-danger-bg)' },
};

export function levelMeta(level: TrustLevel): LevelMeta {
  return LEVEL_META[level] || LEVEL_META.unverified;
}

/** Compact relative time, e.g. "3m ago", "2h ago", "just now". */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'unknown';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'unknown';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

/** Map a 0–100 score to a level when an explicit level is not supplied. */
export function levelFromScore(score: number): TrustLevel {
  if (score >= 95) return 'verified';
  if (score >= 80) return 'live';
  if (score >= 50) return 'stale';
  return 'unverified';
}
