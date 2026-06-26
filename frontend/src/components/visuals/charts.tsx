import * as React from 'react';

/* ============================================================
   Colaberry — on-brand SVG chart primitives
   Self-contained: each scopes its own <style> with DS token
   values, uses semantic tokens + the tuned --chart-N / brand
   palette, is responsive (viewBox + width:100%), and carries
   role/aria so screen readers get a text equivalent.
   All props are optional-friendly: components render safe,
   non-crashing fallbacks when data is empty/missing.
   ============================================================ */

/* ---------- shared helpers ---------- */

/** A stable id scope so multiple instances on a page never collide
 *  on <style>/<title> ids. Falls back to a counter if the runtime
 *  lacks crypto.randomUUID. */
let __cbChartSeq = 0;
function useChartId(prefix: string): string {
  const reactId =
    typeof (React as { useId?: () => string }).useId === 'function'
      ? (React as { useId: () => string }).useId()
      : null;
  const fallback = React.useRef<string>('');
  if (!fallback.current) {
    __cbChartSeq += 1;
    fallback.current = `${prefix}-${__cbChartSeq}`;
  }
  const raw = reactId ?? fallback.current;
  // React's useId returns ":r0:"-style ids that are invalid in CSS/SVG
  // id selectors; normalize to a safe token.
  return `${prefix}-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

/* ============================================================
   1) DonutStat — a ring with a center % and a label.
   ============================================================ */

export interface DonutStatProps {
  /** Percentage value, 0–100 (clamped). Non-finite → 0. */
  value: number;
  /** Caption beneath the ring. */
  label: string;
  /** Optional second line under the label (e.g. "of cohort"). */
  sub?: string;
  /** Ring color — any CSS color. @default var(--chart-1) (berry blue) */
  color?: string;
}

export function DonutStat({
  value,
  label,
  sub,
  color = 'var(--chart-1)',
}: DonutStatProps): JSX.Element {
  const id = useChartId('cb-donut');
  const pct = clampPct(value);
  const size = 120;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const rounded = Math.round(pct);
  const ariaLabel = `${label}: ${rounded} percent${sub ? `, ${sub}` : ''}`;

  return (
    <div className={id}>
      <style>{`
        .${id} {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-2, 8px);
          font-family: var(--font-body, 'Roboto', system-ui, sans-serif);
          color: var(--text-body, #2B2B2B);
          max-width: 100%;
        }
        .${id} svg { width: 100%; height: auto; max-width: 120px; display: block; }
        .${id} .cb-donut-track { stroke: var(--surface-sunken, #F1F1F0); }
        .${id} .cb-donut-arc {
          transition: stroke-dashoffset var(--dur-slow, 360ms) var(--ease-out, cubic-bezier(0.22,1,0.36,1));
        }
        .${id} .cb-donut-val {
          fill: var(--text-strong, #1A1A1A);
          font-weight: var(--fw-bold, 700);
          font-size: 26px;
        }
        .${id} .cb-donut-label {
          font-size: var(--fs-body-sm, 16px);
          font-weight: var(--fw-medium, 500);
          color: var(--text-strong, #1A1A1A);
          text-align: center;
          line-height: var(--lh-snug, 1.25);
        }
        .${id} .cb-donut-sub {
          font-size: var(--fs-caption, 14px);
          color: var(--text-muted, #6B6B6B);
          text-align: center;
        }
        @media (prefers-reduced-motion: reduce) {
          .${id} .cb-donut-arc { transition: none; }
        }
      `}</style>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaLabel}
      >
        <circle
          className="cb-donut-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="cb-donut-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeDashoffset={0}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          className="cb-donut-val"
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {rounded}%
        </text>
      </svg>
      <div className="cb-donut-label">{label}</div>
      {sub ? <div className="cb-donut-sub">{sub}</div> : null}
    </div>
  );
}

/* ============================================================
   2) BarChart — horizontal labelled bars.
   ============================================================ */

export interface BarChartDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  /** Series to plot. Empty/missing → an accessible empty state. */
  data?: BarChartDatum[];
  /** Unit suffix appended to value labels (e.g. "%", "k", " hrs"). */
  unit?: string;
  /** Bar fill — any CSS color. @default var(--chart-3) (leaf green) */
  color?: string;
}

export function BarChart({
  data,
  unit = '',
  color = 'var(--chart-3)',
}: BarChartProps): JSX.Element {
  const id = useChartId('cb-bar');
  const rows = Array.isArray(data) ? data.filter((d) => d && Number.isFinite(d.value)) : [];

  if (rows.length === 0) {
    return (
      <div className={id} role="img" aria-label="Bar chart: no data available">
        <style>{`
          .${id} {
            font-family: var(--font-body, 'Roboto', system-ui, sans-serif);
            color: var(--text-muted, #6B6B6B);
            font-size: var(--fs-body-sm, 16px);
            padding: var(--space-4, 16px);
            border: var(--border-1, 1px) dashed var(--border-default, #D8D8D8);
            border-radius: var(--radius-md, 12px);
            text-align: center;
          }
        `}</style>
        No data
      </div>
    );
  }

  const max = Math.max(...rows.map((d) => Math.abs(d.value)), 0) || 1;
  const summary = `Bar chart with ${rows.length} ${rows.length === 1 ? 'bar' : 'bars'}: ${rows
    .map((d) => `${d.label} ${d.value}${unit}`)
    .join(', ')}`;

  return (
    <div className={id} role="img" aria-label={summary}>
      <style>{`
        .${id} {
          display: flex;
          flex-direction: column;
          gap: var(--space-3, 12px);
          font-family: var(--font-body, 'Roboto', system-ui, sans-serif);
          width: 100%;
        }
        .${id} .cb-bar-row { display: grid; gap: var(--space-1, 4px); }
        .${id} .cb-bar-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: var(--space-3, 12px);
        }
        .${id} .cb-bar-label {
          font-size: var(--fs-body-sm, 16px);
          color: var(--text-body, #2B2B2B);
          font-weight: var(--fw-medium, 500);
        }
        .${id} .cb-bar-value {
          font-size: var(--fs-body-sm, 16px);
          color: var(--text-strong, #1A1A1A);
          font-weight: var(--fw-bold, 700);
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .${id} .cb-bar-track {
          height: 12px;
          border-radius: var(--radius-pill, 999px);
          background: var(--surface-sunken, #F1F1F0);
          overflow: hidden;
        }
        .${id} .cb-bar-fill {
          height: 100%;
          border-radius: var(--radius-pill, 999px);
          transition: width var(--dur-slow, 360ms) var(--ease-out, cubic-bezier(0.22,1,0.36,1));
        }
        @media (prefers-reduced-motion: reduce) {
          .${id} .cb-bar-fill { transition: none; }
        }
      `}</style>
      {rows.map((d, i) => {
        const w = clampPct((Math.abs(d.value) / max) * 100);
        return (
          <div className="cb-bar-row" key={`${d.label}-${i}`}>
            <div className="cb-bar-head">
              <span className="cb-bar-label">{d.label}</span>
              <span className="cb-bar-value">
                {d.value}
                {unit}
              </span>
            </div>
            <div className="cb-bar-track">
              <div
                className="cb-bar-fill"
                style={{ width: `${w}%`, background: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   3) StatCounter — a big number + label tile.
   ============================================================ */

export interface StatCounterProps {
  /** Pre-formatted display value (e.g. "12k", "98%", "$1.2M"). */
  value: string;
  /** Caption under the number. */
  label: string;
  /** Accent color for the number + top rule. @default var(--brand-accent) (cherry) */
  accent?: string;
}

export function StatCounter({
  value,
  label,
  accent = 'var(--brand-accent)',
}: StatCounterProps): JSX.Element {
  const id = useChartId('cb-stat');
  return (
    <div
      className={id}
      role="figure"
      aria-label={`${value} ${label}`}
      style={{ ['--cb-stat-accent' as string]: accent }}
    >
      <style>{`
        .${id} {
          display: flex;
          flex-direction: column;
          gap: var(--space-1, 4px);
          padding: var(--space-6, 24px);
          background: var(--surface-card, #FFFFFF);
          border: var(--border-1, 1px) solid var(--border-subtle, #E4E4E3);
          border-top: var(--border-3, 3px) solid var(--cb-stat-accent, #FB2832);
          border-radius: var(--radius-lg, 16px);
          box-shadow: var(--shadow-sm, 0 1px 2px rgba(26,26,26,0.05));
          font-family: var(--font-body, 'Roboto', system-ui, sans-serif);
          min-width: 0;
        }
        .${id} .cb-stat-value {
          font-family: var(--font-display, 'Roboto', system-ui, sans-serif);
          font-weight: var(--fw-black, 900);
          font-size: var(--fs-h2, 36px);
          line-height: var(--lh-tight, 1.1);
          letter-spacing: var(--ls-tight, -0.01em);
          color: var(--cb-stat-accent, #FB2832);
          word-break: break-word;
        }
        .${id} .cb-stat-label {
          font-size: var(--fs-body-sm, 16px);
          color: var(--text-muted, #6B6B6B);
          font-weight: var(--fw-medium, 500);
          line-height: var(--lh-snug, 1.25);
        }
      `}</style>
      <span className="cb-stat-value" aria-hidden="true">
        {value}
      </span>
      <span className="cb-stat-label" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}

/* ============================================================
   4) PhaseBand — the 4 program phases as connected segments.
   ============================================================ */

export interface PhaseBandPhase {
  label: string;
  color: string;
}

export interface PhaseBandProps {
  /** Override the default 4 program phases (rare). */
  phases?: PhaseBandPhase[];
  /** Index of the active phase (0-based) for emphasis. */
  activeIndex?: number;
}

const DEFAULT_PHASES: PhaseBandPhase[] = [
  { label: 'Build Foundation', color: 'var(--chart-1)' }, // berry blue
  { label: 'Create AI Team', color: 'var(--chart-3)' }, // leaf green
  { label: 'Connect to Real World', color: 'var(--chart-4)' }, // amber
  { label: 'Design AI That Scales', color: 'var(--brand-accent)' }, // cherry
];

export function PhaseBand({
  phases = DEFAULT_PHASES,
  activeIndex,
}: PhaseBandProps): JSX.Element {
  const id = useChartId('cb-phase');
  const list = Array.isArray(phases) && phases.length > 0 ? phases : DEFAULT_PHASES;
  const summary = `Program phases: ${list.map((p, i) => `${i + 1}. ${p.label}`).join(', ')}`;

  return (
    <ol className={id} aria-label={summary}>
      <style>{`
        .${id} {
          display: flex;
          flex-wrap: wrap;
          list-style: none;
          margin: 0;
          padding: 0;
          gap: var(--space-1, 4px);
          font-family: var(--font-body, 'Roboto', system-ui, sans-serif);
          width: 100%;
        }
        .${id} .cb-phase-seg {
          flex: 1 1 160px;
          display: flex;
          align-items: center;
          gap: var(--space-2, 8px);
          min-width: 0;
          padding: var(--space-3, 12px) var(--space-4, 16px);
          color: var(--text-on-accent, #FFFFFF);
          background: var(--cb-seg-color, var(--chart-1));
          font-weight: var(--fw-medium, 500);
          font-size: var(--fs-body-sm, 16px);
          line-height: var(--lh-snug, 1.25);
          position: relative;
          opacity: 0.92;
          transition: opacity var(--dur-base, 220ms) var(--ease-out, cubic-bezier(0.22,1,0.36,1)),
                      transform var(--dur-base, 220ms) var(--ease-out, cubic-bezier(0.22,1,0.36,1));
        }
        .${id} .cb-phase-seg:first-child {
          border-top-left-radius: var(--radius-pill, 999px);
          border-bottom-left-radius: var(--radius-pill, 999px);
          padding-left: var(--space-5, 20px);
        }
        .${id} .cb-phase-seg:last-child {
          border-top-right-radius: var(--radius-pill, 999px);
          border-bottom-right-radius: var(--radius-pill, 999px);
        }
        .${id} .cb-phase-seg.is-active {
          opacity: 1;
          transform: translateY(-2px);
          box-shadow: var(--shadow-md, 0 3px 8px rgba(26,26,26,0.06));
          z-index: 1;
          font-weight: var(--fw-bold, 700);
        }
        .${id} .cb-phase-num {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          width: 24px;
          height: 24px;
          border-radius: var(--radius-circle, 50%);
          background: color-mix(in srgb, #FFFFFF 28%, transparent);
          font-weight: var(--fw-bold, 700);
          font-size: var(--fs-caption, 14px);
          font-variant-numeric: tabular-nums;
        }
        .${id} .cb-phase-text { min-width: 0; }
        @media (prefers-reduced-motion: reduce) {
          .${id} .cb-phase-seg { transition: none; }
          .${id} .cb-phase-seg.is-active { transform: none; }
        }
      `}</style>
      {list.map((p, i) => {
        const active = activeIndex === i;
        return (
          <li
            key={`${p.label}-${i}`}
            className={`cb-phase-seg${active ? ' is-active' : ''}`}
            style={{ ['--cb-seg-color' as string]: p.color }}
            aria-current={active ? 'step' : undefined}
          >
            <span className="cb-phase-num" aria-hidden="true">
              {i + 1}
            </span>
            <span className="cb-phase-text">{p.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
