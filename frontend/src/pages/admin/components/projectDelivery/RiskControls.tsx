import React from 'react';

/**
 * RiskControls — the "who needs help" half of the Projects board.
 *
 * The board ranks by case-study readiness, which is the right order for "who is
 * ready to showcase" and exactly the wrong one for "who needs help now": the
 * students with nothing built score lowest and therefore sit at the very bottom,
 * below everyone who is fine. This is the toggle that inverts that, plus the pill
 * that says which state a row is in.
 *
 * Lives in its own file because ProjectDeliveryView.tsx was at 491 lines against
 * CLAUDE.md's 500-line ceiling, and the rule is to split before adding.
 */

export type RiskState = 'stalled' | 'behind' | 'dormant' | 'on_track' | 'no_plan' | 'shipped';

export interface RiskAssessment {
  state: RiskState;
  attention: number;
  reason: string;
  owner_projects: number;
  owner_complete: number;
}

export type SortMode = 'readiness' | 'attention';

/** Colour and label per state. Semantic tokens only — these carry dark-theme
 *  overrides, where the hardcoded hex in the source mockup would not. */
const RISK_STYLE: Record<RiskState, { label: string; fg: string; bg: string }> = {
  stalled:  { label: 'Not started',   fg: 'var(--status-danger)',  bg: 'var(--status-danger-bg)' },
  behind:   { label: 'Behind',        fg: 'var(--status-warning)', bg: 'var(--status-warning-bg)' },
  dormant:  { label: 'Spare project', fg: 'var(--text-muted)',     bg: 'var(--surface-sunken)' },
  no_plan:  { label: 'No plan',       fg: 'var(--text-muted)',     bg: 'var(--surface-sunken)' },
  on_track: { label: 'On track',      fg: 'var(--status-success)', bg: 'var(--status-success-bg)' },
  shipped:  { label: 'Published',     fg: 'var(--status-info)',    bg: 'var(--status-info-bg)' },
};

/** States worth surfacing on a collapsed row. "On track" and "Published" are the
 *  expected case and would be 15 of 30 identical green pills — noise, not signal. */
const NOTABLE: RiskState[] = ['stalled', 'behind', 'dormant'];

export function RiskPill({ risk }: { risk?: RiskAssessment | null }) {
  if (!risk || !NOTABLE.includes(risk.state)) return null;
  const s = RISK_STYLE[risk.state];
  return (
    <span
      title={risk.reason}
      style={{
        display: 'inline-block',
        marginLeft: 8,
        padding: '1px 7px',
        borderRadius: 6,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '.02em',
        whiteSpace: 'nowrap',
        color: s.fg,
        background: s.bg,
        verticalAlign: 'middle',
      }}
    >
      {s.label}
    </span>
  );
}

/**
 * The two orderings, as a segmented control. Deliberately NOT a filter: hiding
 * the healthy projects would make the cohort look worse than it is, and the point
 * of the toggle is to change what comes first, not what exists.
 */
export function SortToggle({
  mode, onChange, attentionCount,
}: { mode: SortMode; onChange: (m: SortMode) => void; attentionCount: number }) {
  const opts: { key: SortMode; label: string; hint: string }[] = [
    { key: 'readiness', label: 'Case-study ready', hint: 'Closest to shipping first' },
    { key: 'attention', label: 'Needs attention', hint: 'Students with nothing built first' },
  ];
  return (
    <div
      role="group"
      aria-label="Order the project list"
      style={{ display: 'inline-flex', border: '0.5px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}
    >
      {opts.map((o) => {
        const on = mode === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            title={o.hint}
            aria-pressed={on}
            style={{
              border: 0,
              padding: '4px 11px',
              fontSize: 12,
              fontWeight: on ? 600 : 400,
              cursor: 'pointer',
              background: on ? 'var(--surface-sunken)' : 'transparent',
              color: on ? 'var(--text-strong)' : 'var(--text-muted)',
            }}
          >
            {o.label}
            {o.key === 'attention' && attentionCount > 0 && (
              <span
                style={{
                  marginLeft: 6, padding: '0 5px', borderRadius: 6, fontSize: 10.5, fontWeight: 600,
                  color: 'var(--status-danger)', background: 'var(--status-danger-bg)',
                }}
              >
                {attentionCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Order a copy of the rows. `attention` is computed server-side across the whole
 * portfolio — a student's spare rows cannot be told apart from a student in
 * trouble by looking at one project — so this only sorts, it never re-derives.
 */
export function sortRows<T extends { risk?: RiskAssessment | null; readiness: { score: number }; already_case_study: boolean }>(
  rows: T[], mode: SortMode
): T[] {
  if (mode === 'readiness') return rows;
  return [...rows].sort((a, b) => {
    const d = (b.risk?.attention ?? 0) - (a.risk?.attention ?? 0);
    // Readiness breaks ties so the order inside a band stays stable and familiar.
    return d !== 0 ? d : b.readiness.score - a.readiness.score;
  });
}

/** How many rows the "Needs attention" order would actually surface. */
export function countAttention(rows: { risk?: RiskAssessment | null }[]): number {
  return rows.filter((r) => r.risk?.state === 'stalled').length;
}

export { RISK_STYLE };
