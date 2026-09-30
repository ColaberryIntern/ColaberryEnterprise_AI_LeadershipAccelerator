import React from 'react';

/**
 * CompactRow — the dense portfolio row from the approved dashboard mockup
 * (`project_drilldown_compact_mockup.html`).
 *
 * WHAT THIS REPLACES. The previous row was a bordered card with a date-axis Gantt
 * lane, roughly 90px tall, so about six projects fitted on screen out of thirty.
 * The mockup's answer is a table: one line per project, a segmented bar for task
 * state, and a strip of equal segments for the release spine. Twenty-plus rows fit,
 * which is what makes a portfolio scannable rather than scrollable.
 *
 * TWO DELIBERATE DEVIATIONS FROM THE MOCKUP FILE.
 *  1. Its icons are Tabler (`ti ti-chevron-right`). This app ships RemixIcon only
 *     (`colaberry/tokens/fonts.css`), so every icon is mapped to its `ri-`
 *     equivalent. Using the mockup's classes verbatim would render nothing.
 *  2. Its colours are hardcoded hex (`#FCEBEB`, `#1baf7a`). Those are light-mode
 *     values and would stay light-mode in a dark theme, so they are mapped onto the
 *     repo's `--status-*` and `--surface-*` tokens, which already carry dark
 *     overrides. The visual result matches; the theme behaviour does not regress.
 */

export interface TaskBuckets {
  total: number;
  done: number;
  overdue: number;
  due_this_week: number;
  open: number;
  /** Incomplete and unscheduled. Part of the five that sum to `total`. */
  undated: number;
  /** All unscheduled tasks, complete or not. Overlaps the buckets; used for the
   *  caption, because in production every undated task is already complete and a
   *  caption keyed on `undated` would never appear. */
  no_date: number;
}

export type ReleaseState = 'landed' | 'overdue' | 'due_soon' | 'open' | 'empty';

/** The four states the bar and strip share. Tokens, not hex, so dark mode works. */
export const STATE_COLOR: Record<string, string> = {
  done: 'var(--status-success)',
  overdue: 'var(--status-danger)',
  due_this_week: 'var(--status-warning)',
  open: 'var(--border-strong)',
  landed: 'var(--status-success)',
  due_soon: 'var(--status-warning)',
  empty: 'var(--border-subtle)',
};

/** Proportional task-state bar. Undated tasks are excluded from the proportions
 *  and reported in the caption instead — they have no schedule position, and
 *  drawing them would imply one. */
export function SegBar({ buckets }: { buckets: TaskBuckets }) {
  const dated = buckets.done + buckets.overdue + buckets.due_this_week + buckets.open;
  const parts: Array<[keyof TaskBuckets, number]> = [
    ['done', buckets.done],
    ['overdue', buckets.overdue],
    ['due_this_week', buckets.due_this_week],
    ['open', buckets.open],
  ];
  return (
    <div
      style={{
        height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', gap: 2,
        background: 'var(--surface-sunken)',
      }}
      role="img"
      aria-label={`${buckets.done} done, ${buckets.overdue} overdue, ${buckets.due_this_week} due this week, ${buckets.open} open`}
    >
      {dated === 0
        ? <span style={{ flex: 1, background: 'var(--border-subtle)' }} />
        : parts.filter(([, n]) => n > 0).map(([k, n]) => (
            <span key={k} style={{ flex: n, background: STATE_COLOR[k] }} />
          ))}
    </div>
  );
}

/** One equal-width segment per release, coloured by its state — the whole spine
 *  at a glance, without expanding the row. */
export function ReleaseStrip({ states }: { states: ReleaseState[] }) {
  if (!states.length) {
    return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>no releases</span>;
  }
  return (
    <div style={{ display: 'flex', gap: 3 }} role="img"
      aria-label={`${states.length} releases: ${states.join(', ')}`}>
      {states.map((s, i) => (
        <span key={`${s}-${i}`}
          style={{ flex: 1, height: 8, borderRadius: 2, background: STATE_COLOR[s] ?? STATE_COLOR.empty }} />
      ))}
    </div>
  );
}

export function Pill({
  children, tone = 'neutral', title,
}: { children: React.ReactNode; tone?: 'danger' | 'warning' | 'success' | 'neutral'; title?: string }) {
  const map = {
    danger: { bg: 'var(--status-danger-bg)', fg: 'var(--status-danger)' },
    warning: { bg: 'var(--status-warning-bg)', fg: 'var(--status-warning)' },
    success: { bg: 'var(--status-success-bg)', fg: 'var(--status-success)' },
    neutral: { bg: 'var(--surface-sunken)', fg: 'var(--text-body)' },
  }[tone];
  return (
    <span title={title} style={{
      display: 'inline-block', fontSize: 11, lineHeight: '18px', padding: '0 7px',
      borderRadius: 9, whiteSpace: 'nowrap', background: map.bg, color: map.fg,
    }}>{children}</span>
  );
}

const STATE_LABEL: Record<ReleaseState, { text: string; tone: 'danger' | 'warning' | 'success' | 'neutral' }> = {
  landed: { text: 'landed', tone: 'success' },
  overdue: { text: 'overdue', tone: 'danger' },
  due_soon: { text: 'due soon', tone: 'warning' },
  open: { text: 'open', tone: 'neutral' },
  empty: { text: '—', tone: 'neutral' },
};

export function StatePill({ state, overdue }: { state: ReleaseState; overdue?: number }) {
  if (state === 'overdue' && overdue) {
    return <Pill tone="danger">{overdue} overdue</Pill>;
  }
  const l = STATE_LABEL[state] ?? STATE_LABEL.empty;
  return <Pill tone={l.tone}>{l.text}</Pill>;
}

/** The colour key. Without it the segmented bar is four unexplained colours. */
export function Legend() {
  const items: Array<[string, string]> = [
    ['done', STATE_COLOR.done],
    ['overdue', STATE_COLOR.overdue],
    ['due this week', STATE_COLOR.due_this_week],
    ['open', STATE_COLOR.open],
  ];
  return (
    <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-body)', margin: '0 0 6px 10px', flexWrap: 'wrap' }}>
      {items.map(([label, color]) => (
        <span key={label}>
          <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: color, verticalAlign: -1, marginRight: 4 }} />
          {label}
        </span>
      ))}
      {/* The row icons, named. They were already rendering and were still reported missing,
          which is what an unlabelled glyph earns. Naming them here costs one line and makes
          the difference between "some rows have a squiggle" and "that row has a live site". */}
      <span style={{ color: 'var(--text-muted)' }}>
        <i className="ri-dashboard-3-line" aria-hidden="true" style={{ color: 'var(--status-info, #2f6fc8)', marginRight: 4 }} />
        Command Center
      </span>
      <span style={{ color: 'var(--text-muted)' }}>
        <i className="ri-github-fill" aria-hidden="true" style={{ marginRight: 4 }} />
        repository
      </span>
    </div>
  );
}

/** The row grid, shared by the header and every project row so the columns line up. */
/**
 * The row grid.
 *
 * TWO FLEXIBLE COLUMNS, NOT ONE. Project was previously the only `fr` track, so on a wide
 * screen it absorbed every spare pixel and left a blank band between the student's name and
 * the Tasks column — the "big gap in the middle". Releases now takes a share of the slack,
 * and that width is not decoration: `ReleaseStrip` segments are `flex: 1`, so a wider column
 * draws a longer, more readable release spine.
 *
 * CASE IS 92px BECAUSE THE PILL IS. At 52px the readiness pill overflowed and the enclosing
 * card clips with `overflow: hidden`, so the score rendered as "60 /10" — a number that is
 * wrong rather than merely cramped. The pill is also rendered `compact` in this row: the
 * column header already says "Case", so repeating "Case Study" inside every cell was what
 * made it too wide in the first place.
 */
export const ROW_GRID = '20px minmax(220px,1.2fr) 120px minmax(120px,1fr) 44px 92px';

export function RowShell({
  children, header = false, active = false, onClick,
}: { children: React.ReactNode; header?: boolean; active?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid', gridTemplateColumns: ROW_GRID, gap: 10, alignItems: 'center',
        padding: header ? '6px 10px' : '8px 10px',
        borderTop: header ? 0 : '0.5px solid var(--border-subtle)',
        fontSize: header ? 11 : 13,
        color: header ? 'var(--text-muted)' : undefined,
        background: active ? 'var(--surface-subtle)' : undefined,
        cursor: onClick ? 'pointer' : undefined,
      }}
    >{children}</div>
  );
}

/** The release sub-table grid, shared by its header and rows so columns align. */
export const RELEASE_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '20px minmax(0,1fr) 64px 100px 88px',
  gap: 10,
  alignItems: 'center',
};

interface EvidenceLineProps {
  evidence: {
    source: string;
    verification: {
      has_verification: boolean;
      verified_tasks: number;
      commits: number;
      latest_commit_sha: string | null;
      latest_commit_at: string | null;
      criteria_passed: number;
      criteria_total: number;
      outstanding_count: number;
    };
    manifests: { has_evidence: boolean; files_created: number; files_modified: number };
  } | null;
  artifactCount: number;
  loading?: boolean;
}

/** Whole days between an ISO timestamp and now, or null. */
function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

/**
 * Evidence on ONE line, per the mockup: verified count, commits, last commit age,
 * artifacts. The grid of stat cards said the same thing in six times the height,
 * which is the wrong trade on a row that is already a drill-down.
 *
 * Artifacts render in danger red at zero because that is a real gap in a
 * case-study candidate, not a neutral fact.
 */
export function EvidenceLine({ evidence, artifactCount, loading }: EvidenceLineProps) {
  if (loading) {
    return <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>Loading evidence...</div>;
  }

  const v = evidence?.verification;
  const has = !!v?.has_verification;
  const age = daysAgo(v?.latest_commit_at ?? null);

  return (
    <div style={{
      display: 'flex', gap: 16, alignItems: 'center', marginTop: 10,
      fontSize: 12, color: 'var(--text-body)', flexWrap: 'wrap',
    }}>
      <span style={{ fontWeight: 500, color: 'var(--text-strong)' }}>Evidence</span>

      {has ? (
        <>
          <span>
            <i className="ri-check-line" style={{ fontSize: 14, verticalAlign: -2 }} aria-hidden="true" />{' '}
            {v!.verified_tasks} tasks verified
          </span>
          <span>
            <i className="ri-git-commit-line" style={{ fontSize: 14, verticalAlign: -2 }} aria-hidden="true" />{' '}
            {v!.commits} commits
            {v!.criteria_total > 0 && <> · {v!.criteria_passed}/{v!.criteria_total} criteria</>}
          </span>
          {v!.latest_commit_sha && (
            <span>
              <i className="ri-time-line" style={{ fontSize: 14, verticalAlign: -2 }} aria-hidden="true" />{' '}
              last commit {v!.latest_commit_sha.slice(0, 7)}
              {age != null && <>, {age === 0 ? 'today' : age + ' days ago'}</>}
            </span>
          )}
          {v!.outstanding_count > 0 && (
            <span style={{ color: 'var(--status-warning)' }}>
              <i className="ri-error-warning-line" style={{ fontSize: 14, verticalAlign: -2 }} aria-hidden="true" />{' '}
              {v!.outstanding_count} outstanding
            </span>
          )}
        </>
      ) : (
        <span style={{ color: 'var(--text-muted)' }}>
          no repo verification recorded yet
        </span>
      )}

      <span style={{ color: artifactCount === 0 ? 'var(--status-danger)' : undefined }}>
        <i className={artifactCount === 0 ? 'ri-file-forbid-line' : 'ri-file-list-3-line'}
          style={{ fontSize: 14, verticalAlign: -2 }} aria-hidden="true" />{' '}
        {artifactCount} artifact{artifactCount === 1 ? '' : 's'}
      </span>
    </div>
  );
}
