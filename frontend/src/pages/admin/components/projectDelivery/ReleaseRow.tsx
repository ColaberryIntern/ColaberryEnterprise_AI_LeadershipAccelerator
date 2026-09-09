import React from 'react';

/**
 * ReleaseRow — one release of a student's build, named the way the student sees it.
 *
 * The timeline used to label releases `r0`, `r1`, `prep` — the internal keys. The
 * readable names already existed on the task lists ("Release 0 · Initial Setup and
 * Trust Spine", "Demo prep · the dedicated week") and matched 177 of 177 release keys
 * in production; they were simply never joined in.
 *
 * Two rules the display depends on:
 *   - `lands_when` is the release's definition of done. When it is null the block is
 *     omitted entirely rather than rendering an empty quote.
 *   - Timing shows on-time, late and UNVERIFIED as three separate counts. Unverified
 *     work is not on-time work; 24 of 196 completed tasks in production carry no
 *     verification, and folding them in would overstate the on-time figure by ~14%.
 */

export interface TimingRollup {
  on_time: number;
  late: number;
  unverified: number;
  open: number;
  undated: number;
  on_time_pct: number | null;
}

export interface ReleaseSummaryLike {
  release_key: string;
  display_name?: string;
  lands_when?: string | null;
  total: number;
  complete: number;
  overdue: number;
  starts_on: string | null;
  ends_on: string | null;
  timing?: TimingRollup;
}

export const RELEASE_COLORS: Record<string, string> = {
  r0: '#6366f1', r1: '#8b5cf6', r2: '#0ea5e9', r3: '#10b981', r4: '#f59e0b',
  prep: '#64748b', unscheduled: '#cbd5e1',
};

export function releaseColor(key: string): string {
  return RELEASE_COLORS[key] ?? '#94a3b8';
}

export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

interface Props {
  release: ReleaseSummaryLike;
  children?: React.ReactNode;
}

export function TimingChips({ timing }: { timing?: TimingRollup }) {
  if (!timing) return null;
  const { on_time, late, unverified, on_time_pct } = timing;
  if (on_time + late + unverified === 0) return null;
  return (
    <span className="d-inline-flex gap-1 align-items-center flex-wrap">
      {on_time > 0 && (
        <span className="badge rounded-pill" style={{ background: '#dcfce7', color: '#15803d' }}
          title="Verified on or before the due date">{on_time} on time</span>
      )}
      {late > 0 && (
        <span className="badge rounded-pill" style={{ background: '#fee2e2', color: '#b91c1c' }}
          title="Verified after the due date">{late} late</span>
      )}
      {unverified > 0 && (
        <span className="badge rounded-pill" style={{ background: '#f1f5f9', color: '#64748b' }}
          title="Marked complete but never verified — timing cannot be judged, so it is NOT counted as on time">
          {unverified} unverified
        </span>
      )}
      {on_time_pct != null && (
        <span className="text-muted" style={{ fontSize: 11 }}
          title="Share of verifiable work that landed on time. Unverified work is excluded, not counted as late.">
          {on_time_pct}% on time
        </span>
      )}
    </span>
  );
}

export default function ReleaseRow({ release, children }: Props) {
  const name = release.display_name && release.display_name.trim()
    ? release.display_name
    : release.release_key;

  return (
    <div className="mb-3">
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <span className="fw-medium">
          <span className="d-inline-block me-2" aria-hidden="true"
            style={{ width: 10, height: 10, borderRadius: 2, background: releaseColor(release.release_key) }} />
          {name}
        </span>
        <span className="small text-muted">
          {release.complete}/{release.total} · {fmtDay(release.starts_on)}–{fmtDay(release.ends_on)}
          {release.overdue > 0 && <span className="text-danger"> · {release.overdue} overdue</span>}
        </span>
      </div>

      {/* Definition of done. Omitted entirely when absent — an empty quote block
          would imply the release has no goal rather than that none was generated. */}
      {release.lands_when && (
        <div className="small text-muted fst-italic mt-1 ps-3"
          style={{ borderLeft: '3px solid var(--bs-border-color, #dee2e6)' }}>
          Lands when: {release.lands_when}
        </div>
      )}

      <div className="mt-1"><TimingChips timing={release.timing} /></div>

      {children}
    </div>
  );
}
