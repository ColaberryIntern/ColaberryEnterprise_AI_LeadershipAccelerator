import React, { useId } from 'react';

/**
 * ProgramRoadmap — the flagship "12-Week Architect Roadmap".
 *
 * Renders the SINGLE, continuous 12-week Architect program as one flowing
 * horizontal SVG path with 12 numbered week nodes (W1..W12). The four phases
 * are GROUPINGS of weeks within the 12 — never standalone classes. Two dotted
 * accent lanes (a cherry "project" lane and an amber "CCA-F certification"
 * lane) branch off the path and converge on a single highlighted finish marker:
 * "Certified Anthropic AI Systems Architect".
 *
 * Self-contained: a scoped <style> block carries semantic design-system token
 * values; the only literal hex values are inside the SVG data-viz fills, which
 * the design system explicitly permits (brand cherry / leaf / berry / amber).
 *
 * Accessibility:
 *  - The <svg> carries role="img" + an aria-label summarizing the whole path.
 *  - Decorative inner geometry is aria-hidden; an off-screen <ol> mirrors the
 *    12 weeks + phases so screen readers get a linear timeline.
 *  - All animation is gated behind prefers-reduced-motion.
 *  - On narrow viewports the SVG scrolls horizontally; an additional CSS-only
 *    vertical timeline fallback renders for very small screens.
 *
 * No required props. Optional `compact` tightens vertical rhythm for dense
 * placements (e.g. a sidebar or a pricing card).
 */

export interface ProgramRoadmapProps {
  /** Tighten vertical rhythm + hide the left header block for dense layouts. */
  compact?: boolean;
}

/* ----------------------------------------------------------------------------
 * Static program model — single source of truth for both the SVG and the
 * screen-reader timeline. weeksComplete drives the leaf-green "done" styling.
 * ------------------------------------------------------------------------- */

type PhaseKey = 'foundation' | 'team' | 'realworld' | 'scale';

interface Phase {
  key: PhaseKey;
  /** Pill label, e.g. "1 · Build Your AI Foundation". */
  label: string;
  /** Inclusive 1-based week range this phase groups. */
  from: number;
  to: number;
  /** Brand hex used for the pill tint + node accent within the phase. */
  hex: string;
}

const PHASES: Phase[] = [
  { key: 'foundation', label: '1 · Build Your AI Foundation', from: 1, to: 3, hex: '#FB2832' },
  { key: 'team', label: '2 · Create Your AI Team', from: 4, to: 6, hex: '#5BA63C' },
  { key: 'realworld', label: '3 · Connect AI to the Real World', from: 7, to: 9, hex: '#367895' },
  { key: 'scale', label: '4 · Design AI That Scales', from: 10, to: 12, hex: '#E8920C' },
];

const TOTAL_WEEKS = 12;
/** Weeks rendered as "complete" (leaf-green) — drives the readiness donut too. */
const WEEKS_COMPLETE = 4;

/* SVG geometry (a 1160 × 360 viewBox; the path waves gently across it). */
const VB_W = 1160;
const VB_H = 360;
const PATH_LEFT = 150;
const PATH_RIGHT = 1070;
const BASE_Y = 232;
const WAVE = 30; // peak-to-trough offset of the wavy spine

/** Even horizontal spacing for the 12 week nodes across the spine. */
function nodeX(week: number): number {
  const span = PATH_RIGHT - PATH_LEFT;
  return PATH_LEFT + (span * (week - 1)) / (TOTAL_WEEKS - 1);
}

/** Gentle sine wave so the spine flows rather than runs flat. */
function nodeY(week: number): number {
  const t = (week - 1) / (TOTAL_WEEKS - 1);
  return BASE_Y + Math.sin(t * Math.PI * 2) * WAVE;
}

/** Smooth cubic path through all 12 node points (Catmull-Rom → Bézier). */
function spinePath(): string {
  const pts = Array.from({ length: TOTAL_WEEKS }, (_, i) => ({
    x: nodeX(i + 1),
    y: nodeY(i + 1),
  }));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function phaseForWeek(week: number): Phase {
  return PHASES.find((p) => week >= p.from && week <= p.to) ?? PHASES[0];
}

const ProgramRoadmap: React.FC<ProgramRoadmapProps> = ({ compact = false }) => {
  const uid = useId().replace(/:/g, '');
  const spine = spinePath();

  const finishX = nodeX(TOTAL_WEEKS);
  const finishY = nodeY(TOTAL_WEEKS);

  // Readiness donut maths.
  const donutR = 26;
  const donutC = 2 * Math.PI * donutR;
  const donutPct = WEEKS_COMPLETE / TOTAL_WEEKS;

  // Lane control points — both lanes leave the spine early and arc to the finish.
  const projStartX = nodeX(2);
  const projStartY = nodeY(2);
  const certStartX = nodeX(3);
  const certStartY = nodeY(3);

  const ariaLabel =
    'Twelve-week AI Systems Architect roadmap: one continuous program of 12 weekly milestones (W1 through W12), grouped into four phases — Build Your AI Foundation, Create Your AI Team, Connect AI to the Real World, and Design AI That Scales. A project build lane and a CCA-F certification lane run alongside the weeks and converge at the finish: Certified Anthropic AI Systems Architect.';

  return (
    <div className={`pr-root${compact ? ' pr-compact' : ''}`} data-uid={uid}>
      <style>{`
        .pr-root {
          --pr-leaf: #5BA63C;
          --pr-leaf-soft: var(--surface-green-subtle, #F1F9EA);
          --pr-cherry: #FB2832;
          --pr-cherry-soft: var(--surface-brand-subtle, #FFF0F1);
          --pr-berry: #367895;
          --pr-berry-soft: var(--surface-blue-subtle, #EAF2F6);
          --pr-amber: #E8920C;
          --pr-amber-soft: #FCF1DD;
          --pr-neutral: var(--border-default, #D8D8D8);
          --pr-track: var(--surface-sunken, #F1F1F0);

          display: flex;
          flex-direction: column;
          gap: var(--space-6, 24px);
          width: 100%;
          max-width: var(--container-xl, 1280px);
          margin-inline: auto;
          padding: var(--space-6, 24px);
          background: var(--surface-card, #fff);
          border: var(--border-1, 1px) solid var(--border-subtle, #E4E4E3);
          border-radius: var(--radius-2xl, 32px);
          box-shadow: var(--shadow-lg, 0 8px 20px rgba(26,26,26,0.07));
          color: var(--text-body, #2B2B2B);
          font-family: var(--font-body, 'Roboto', system-ui, sans-serif);
          box-sizing: border-box;
        }
        .pr-compact { padding: var(--space-4, 16px); gap: var(--space-4, 16px); }

        /* ---- Left header block: readiness donut + caption ---- */
        .pr-header {
          display: flex;
          align-items: center;
          gap: var(--space-4, 16px);
        }
        .pr-compact .pr-header { display: none; }
        .pr-donut { flex: 0 0 auto; }
        .pr-donut-pct {
          font-family: var(--font-display, 'Roboto', sans-serif);
          font-weight: 900;
          font-size: 18px;
          fill: var(--text-strong, #1A1A1A);
        }
        .pr-donut-sub { font-size: 9px; fill: var(--text-muted, #6B6B6B); font-weight: 700; letter-spacing: .08em; }
        .pr-header-text { display: flex; flex-direction: column; gap: 2px; }
        .pr-eyebrow {
          text-transform: uppercase;
          letter-spacing: var(--ls-overline, 0.08em);
          font-size: var(--fs-overline, 12px);
          font-weight: 700;
          color: var(--brand-accent, #FB2832);
        }
        .pr-caption {
          font-family: var(--font-display, 'Roboto', sans-serif);
          font-weight: 900;
          font-size: var(--fs-h4, 22px);
          line-height: var(--lh-snug, 1.25);
          color: var(--text-strong, #1A1A1A);
          margin: 0;
        }
        .pr-subcaption { font-size: var(--fs-body-sm, 16px); color: var(--text-muted, #6B6B6B); margin: 0; }

        /* ---- Scroll viewport for the SVG ---- */
        .pr-scroll {
          width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
        }
        .pr-svg {
          display: block;
          width: 100%;
          min-width: 860px;
          height: auto;
        }

        /* ---- SVG primitives ---- */
        .pr-spine { fill: none; stroke: var(--pr-track); stroke-width: 14; stroke-linecap: round; }
        .pr-spine-done {
          fill: none; stroke: var(--pr-leaf); stroke-width: 14; stroke-linecap: round;
          stroke-dasharray: var(--pr-done-len) var(--pr-spine-len);
        }
        .pr-node-ring { fill: var(--surface-card, #fff); stroke: var(--pr-neutral); stroke-width: 3; }
        .pr-node-done .pr-node-ring { stroke: var(--pr-leaf); fill: var(--pr-leaf); }
        .pr-node-num {
          font-family: var(--font-display, 'Roboto', sans-serif);
          font-weight: 900; font-size: 17px; text-anchor: middle; dominant-baseline: central;
          fill: var(--text-strong, #1A1A1A);
        }
        .pr-node-done .pr-node-num { fill: #fff; }
        .pr-node-wk {
          font-family: var(--font-body, 'Roboto', sans-serif);
          font-weight: 700; font-size: 10px; text-anchor: middle; letter-spacing: .04em;
          fill: var(--text-muted, #6B6B6B);
        }

        /* ---- Phase pill chips ---- */
        .pr-pill-shape { rx: 16; }
        .pr-pill-text {
          font-family: var(--font-display, 'Roboto', sans-serif);
          font-weight: 700; font-size: 13px; text-anchor: middle; dominant-baseline: central;
        }
        .pr-pill-tick { stroke-width: 2; stroke-linecap: round; opacity: .55; }

        /* ---- Dotted accent lanes ---- */
        .pr-lane { fill: none; stroke-width: 3; stroke-dasharray: 2 8; stroke-linecap: round; }
        .pr-lane-proj { stroke: var(--pr-cherry); }
        .pr-lane-cert { stroke: var(--pr-amber); }
        .pr-lane-label {
          font-family: var(--font-body, 'Roboto', sans-serif);
          font-weight: 700; font-size: 12px;
        }

        /* ---- Finish marker ---- */
        .pr-finish-glow { fill: var(--pr-amber); opacity: .16; }
        .pr-finish-core { fill: var(--surface-card, #fff); stroke: var(--pr-amber); stroke-width: 4; }
        .pr-finish-star { fill: var(--pr-amber); }
        .pr-finish-label {
          font-family: var(--font-display, 'Roboto', sans-serif);
          font-weight: 900; font-size: 15px; text-anchor: middle;
          fill: var(--text-strong, #1A1A1A);
        }
        .pr-finish-sub {
          font-family: var(--font-body, 'Roboto', sans-serif);
          font-weight: 700; font-size: 11px; text-anchor: middle; letter-spacing: .06em;
          fill: var(--pr-amber);
        }

        /* ---- Legend ---- */
        .pr-legend {
          display: flex; flex-wrap: wrap; gap: var(--space-2, 8px) var(--space-5, 20px);
          align-items: center; font-size: var(--fs-caption, 14px); color: var(--text-muted, #6B6B6B);
        }
        .pr-legend-item { display: inline-flex; align-items: center; gap: var(--space-2, 8px); }
        .pr-swatch { width: 14px; height: 14px; border-radius: var(--radius-xs, 4px); flex: 0 0 auto; }
        .pr-swatch-dot { width: 22px; border-radius: 999px; height: 3px; }
        .pr-dotted { background-image: repeating-linear-gradient(90deg, currentColor 0 3px, transparent 3px 7px); height: 3px; }

        /* ---- Mobile vertical timeline fallback (very narrow only) ---- */
        .pr-vertical { display: none; }
        @media (max-width: 540px) {
          .pr-scroll { display: none; }
          .pr-legend { display: none; }
          .pr-vertical { display: block; }
          .pr-vrow {
            display: grid; grid-template-columns: 40px 1fr; gap: var(--space-3, 12px);
            align-items: start; padding-block: var(--space-2, 8px); position: relative;
          }
          .pr-vrow::before {
            content: ''; position: absolute; left: 19px; top: 0; bottom: 0;
            width: 2px; background: var(--pr-track);
          }
          .pr-vrow:last-child::before { display: none; }
          .pr-vdot {
            width: 40px; height: 40px; border-radius: 999px; display: grid; place-items: center;
            font-family: var(--font-display, 'Roboto', sans-serif); font-weight: 900; font-size: 15px;
            background: var(--surface-card, #fff); border: 3px solid var(--pr-neutral);
            color: var(--text-strong, #1A1A1A); z-index: 1;
          }
          .pr-vdot.done { background: var(--pr-leaf); border-color: var(--pr-leaf); color: #fff; }
          .pr-vbody { padding-top: 2px; }
          .pr-vphase {
            display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 10px;
            border-radius: 999px; margin-bottom: 2px;
          }
          .pr-vweek { font-weight: 700; color: var(--text-strong, #1A1A1A); font-size: var(--fs-body-sm, 16px); }
          .pr-vfinish {
            margin-top: var(--space-3, 12px); padding: var(--space-3, 12px) var(--space-4, 16px);
            border-radius: var(--radius-lg, 16px); border: 2px solid var(--pr-amber);
            background: var(--pr-amber-soft); font-weight: 900; color: var(--text-strong, #1A1A1A);
          }
          .pr-vfinish small { display: block; font-weight: 700; color: var(--pr-amber); letter-spacing: .06em; }
        }

        /* ---- Motion ---- */
        @media (prefers-reduced-motion: no-preference) {
          .pr-spine-done { animation: prGrow 1100ms var(--ease-emphasized, cubic-bezier(0.16,1,0.3,1)) both; }
          .pr-node { opacity: 0; animation: prPop 420ms var(--ease-spring, cubic-bezier(0.34,1.56,0.64,1)) both; }
          .pr-finish-glow { transform-box: fill-box; transform-origin: center; animation: prPulse 2600ms ease-in-out infinite; }
        }
        @keyframes prGrow { from { stroke-dashoffset: var(--pr-done-len); } to { stroke-dashoffset: 0; } }
        @keyframes prPop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes prPulse { 0%,100% { opacity: .14; } 50% { opacity: .28; } }

        .pr-sr {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
        }
      `}</style>

      {/* Left header block: readiness donut + caption */}
      <div className="pr-header">
        <svg className="pr-donut" width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
          <circle cx="38" cy="38" r={donutR} fill="none" stroke="var(--pr-track)" strokeWidth="8" />
          <circle
            cx="38"
            cy="38"
            r={donutR}
            fill="none"
            stroke="var(--pr-leaf)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(donutC * donutPct).toFixed(1)} ${donutC.toFixed(1)}`}
            transform="rotate(-90 38 38)"
          />
          <text x="38" y="36" className="pr-donut-pct" textAnchor="middle">
            {WEEKS_COMPLETE}/{TOTAL_WEEKS}
          </text>
          <text x="38" y="50" className="pr-donut-sub" textAnchor="middle">
            WEEKS
          </text>
        </svg>
        <div className="pr-header-text">
          <span className="pr-eyebrow">Your 12-week path</span>
          <p className="pr-caption">12-Week Architect Roadmap</p>
          <p className="pr-subcaption">One continuous program · four phases · one certification</p>
        </div>
      </div>

      {/* Horizontally-scrollable SVG (the primary visual) */}
      <div className="pr-scroll">
        <svg
          className="pr-svg"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          role="img"
          aria-label={ariaLabel}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id={`finishGrad-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F0A93A" />
              <stop offset="100%" stopColor="#E8920C" />
            </linearGradient>
          </defs>

          {/* Phase pill chips above the path */}
          <g aria-hidden="true">
            {PHASES.map((phase) => {
              const x1 = nodeX(phase.from);
              const x2 = nodeX(phase.to);
              const cx = (x1 + x2) / 2;
              const pillW = Math.max(x2 - x1 + 96, 150);
              const pillY = 30;
              const pillH = 34;
              return (
                <g key={phase.key}>
                  <rect
                    x={cx - pillW / 2}
                    y={pillY}
                    width={pillW}
                    height={pillH}
                    rx={pillH / 2}
                    fill={`color-mix(in srgb, ${phase.hex} 14%, white)`}
                    stroke={`color-mix(in srgb, ${phase.hex} 38%, white)`}
                    strokeWidth={1.5}
                  />
                  <text
                    x={cx}
                    y={pillY + pillH / 2}
                    className="pr-pill-text"
                    fill={`color-mix(in srgb, ${phase.hex} 78%, black)`}
                  >
                    {phase.label}
                  </text>
                  {/* tick connecting the pill to the week span below */}
                  <line
                    className="pr-pill-tick"
                    x1={cx}
                    y1={pillY + pillH}
                    x2={cx}
                    y2={pillY + pillH + 14}
                    stroke={phase.hex}
                  />
                </g>
              );
            })}
          </g>

          {/* Dotted accent lanes — branch off the spine, converge at finish */}
          <g aria-hidden="true">
            <path
              className="pr-lane pr-lane-proj"
              d={`M ${projStartX} ${projStartY} C ${projStartX + 120} ${projStartY + 78}, ${finishX - 180} ${finishY + 92}, ${finishX} ${finishY + 6}`}
            />
            <path
              className="pr-lane pr-lane-cert"
              d={`M ${certStartX} ${certStartY} C ${certStartX + 140} ${certStartY - 96}, ${finishX - 200} ${finishY - 104}, ${finishX} ${finishY - 6}`}
            />
            <text
              className="pr-lane-label"
              x={projStartX + 150}
              y={projStartY + 92}
              fill="var(--pr-cherry)"
            >
              Project lane — your build
            </text>
            <text
              className="pr-lane-label"
              x={certStartX + 170}
              y={certStartY - 102}
              fill="var(--pr-amber)"
            >
              CCA-F certification lane
            </text>
          </g>

          {/* The spine: neutral track + leaf-green completed overlay */}
          <path className="pr-spine" d={spine} aria-hidden="true" />
          <path
            className="pr-spine-done"
            d={spine}
            aria-hidden="true"
            ref={(el) => {
              if (!el) return;
              const total = el.getTotalLength();
              const doneAt = nodeX(WEEKS_COMPLETE);
              // Approximate completed length by fraction of total path span.
              const frac = (doneAt - PATH_LEFT) / (PATH_RIGHT - PATH_LEFT);
              const doneLen = total * frac;
              el.style.setProperty('--pr-spine-len', `${total}`);
              el.style.setProperty('--pr-done-len', `${doneLen}`);
              el.style.strokeDasharray = `${doneLen} ${total}`;
            }}
          />

          {/* 12 numbered week nodes */}
          <g>
            {Array.from({ length: TOTAL_WEEKS }, (_, i) => {
              const week = i + 1;
              const x = nodeX(week);
              const y = nodeY(week);
              const done = week <= WEEKS_COMPLETE;
              const phase = phaseForWeek(week);
              return (
                <g
                  key={week}
                  className={`pr-node${done ? ' pr-node-done' : ''}`}
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  {/* phase accent halo for not-yet-complete weeks */}
                  {!done && (
                    <circle
                      cx={x}
                      cy={y}
                      r={21}
                      fill="none"
                      stroke={`color-mix(in srgb, ${phase.hex} 32%, transparent)`}
                      strokeWidth={2}
                    />
                  )}
                  <circle className="pr-node-ring" cx={x} cy={y} r={17} />
                  <text className="pr-node-num" x={x} y={y + 1}>
                    {week}
                  </text>
                  <text className="pr-node-wk" x={x} y={y + 34}>
                    W{week}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Finish marker — single highlighted convergence point */}
          <g aria-hidden="true">
            <circle className="pr-finish-glow" cx={finishX} cy={finishY} r={40} />
            <circle className="pr-finish-core" cx={finishX} cy={finishY} r={24} />
            <path
              className="pr-finish-star"
              transform={`translate(${finishX} ${finishY}) scale(0.95)`}
              d="M0,-13 L3.8,-4.2 L13,-4 L5.7,2 L8.1,11 L0,5.6 L-8.1,11 L-5.7,2 L-13,-4 L-3.8,-4.2 Z"
              fill={`url(#finishGrad-${uid})`}
            />
            <text className="pr-finish-sub" x={finishX} y={finishY + 56}>
              CERTIFIED
            </text>
            <text className="pr-finish-label" x={finishX} y={finishY + 76}>
              Anthropic AI Systems
            </text>
            <text className="pr-finish-label" x={finishX} y={finishY + 94}>
              Architect
            </text>
          </g>
        </svg>
      </div>

      {/* Legend (hidden on the narrow vertical fallback) */}
      <div className="pr-legend">
        <span className="pr-legend-item">
          <span className="pr-swatch" style={{ background: 'var(--pr-leaf)' }} />
          Week complete
        </span>
        <span className="pr-legend-item">
          <span className="pr-swatch" style={{ background: 'var(--surface-card,#fff)', border: '2px solid var(--pr-neutral)' }} />
          Upcoming week
        </span>
        <span className="pr-legend-item" style={{ color: 'var(--pr-cherry)' }}>
          <span className="pr-swatch pr-swatch-dot pr-dotted" />
          <span style={{ color: 'var(--text-muted,#6B6B6B)' }}>Project lane</span>
        </span>
        <span className="pr-legend-item" style={{ color: 'var(--pr-amber)' }}>
          <span className="pr-swatch pr-swatch-dot pr-dotted" />
          <span style={{ color: 'var(--text-muted,#6B6B6B)' }}>CCA-F certification lane</span>
        </span>
      </div>

      {/* Mobile vertical timeline fallback (≤540px) */}
      <div className="pr-vertical" aria-hidden="true">
        {Array.from({ length: TOTAL_WEEKS }, (_, i) => {
          const week = i + 1;
          const done = week <= WEEKS_COMPLETE;
          const phase = phaseForWeek(week);
          const isPhaseStart = week === phase.from;
          return (
            <div className="pr-vrow" key={week}>
              <span className={`pr-vdot${done ? ' done' : ''}`}>{week}</span>
              <div className="pr-vbody">
                {isPhaseStart && (
                  <span
                    className="pr-vphase"
                    style={{
                      background: `color-mix(in srgb, ${phase.hex} 14%, white)`,
                      color: `color-mix(in srgb, ${phase.hex} 78%, black)`,
                    }}
                  >
                    {phase.label}
                  </span>
                )}
                <div className="pr-vweek">
                  Week {week}
                  {done ? ' · complete' : ''}
                </div>
              </div>
            </div>
          );
        })}
        <div className="pr-vfinish">
          Certified Anthropic AI Systems Architect
          <small>PROJECT BUILD + CCA-F CERTIFICATION</small>
        </div>
      </div>

      {/* Off-screen linear timeline for assistive tech */}
      <ol className="pr-sr">
        {PHASES.map((phase) => (
          <li key={phase.key}>
            Phase {phase.label} groups weeks {phase.from} to {phase.to}.
          </li>
        ))}
        {Array.from({ length: TOTAL_WEEKS }, (_, i) => {
          const week = i + 1;
          const done = week <= WEEKS_COMPLETE;
          return (
            <li key={week}>
              Week {week}: {done ? 'complete' : 'upcoming'} (phase {phaseForWeek(week).label}).
            </li>
          );
        })}
        <li>
          A project build lane and a CCA-F certification lane converge at the finish: Certified
          Anthropic AI Systems Architect.
        </li>
      </ol>
    </div>
  );
};

export default ProgramRoadmap;
