import React, { useId } from 'react';
import { MATURITY_LEVELS } from '../../data/capabilityModel';

/**
 * MaturityJourney — animated 5-stage "Aware -> AI Organization" progression.
 *
 * An ascending SVG ladder whose spine self-draws left->right, whose stage nodes
 * pop in staggered, and whose "energy" pulse climbs the ladder on a loop to show
 * people advancing. A responsive grid of stage cards under it carries the detail
 * (what employees do at each level + what the platform measures). Modeled on the
 * ProgramRoadmap animation idiom; all motion is gated behind prefers-reduced-motion.
 */
export default function MaturityJourney() {
  const uid = useId().replace(/:/g, '');
  const VB_W = 1000;
  const VB_H = 300;
  const N = MATURITY_LEVELS.length;
  const x = (i: number) => 80 + (i * (VB_W - 160)) / (N - 1);
  const y = (i: number) => 240 - (i * 170) / (N - 1); // ascending
  const spine = MATURITY_LEVELS.map((_, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(0)} ${y(i).toFixed(0)}`).join(' ');

  return (
    <div className="mj-root">
      <style>{`
        .mj-root {
          background: var(--surface-card);
          border: var(--border-1) solid var(--border-subtle);
          border-radius: var(--radius-2xl);
          box-shadow: var(--shadow-lg);
          padding: var(--space-8);
          font-family: var(--font-body);
        }
        .mj-scroll { width: 100%; overflow-x: auto; overflow-y: hidden; }
        .mj-svg { display: block; width: 100%; min-width: 720px; height: auto; }
        .mj-spine-track { fill: none; stroke: var(--surface-sunken); stroke-width: 10; stroke-linecap: round; }
        .mj-spine-draw { fill: none; stroke: url(#mjgrad-${uid}); stroke-width: 10; stroke-linecap: round; }
        .mj-node-num { font-family: var(--font-display); font-weight: 900; font-size: 18px; fill: #fff; text-anchor: middle; dominant-baseline: central; }
        .mj-node-name { font-family: var(--font-display); font-weight: 700; font-size: 14px; fill: var(--text-strong); text-anchor: middle; }
        .mj-cards {
          display: grid; gap: var(--space-4); margin-top: var(--space-8);
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        }
        .mj-card {
          background: var(--surface-page); border: var(--border-1) solid var(--border-subtle);
          border-top-width: 4px; border-radius: var(--radius-lg); padding: var(--space-5);
        }
        .mj-chip {
          display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px;
          border-radius: var(--radius-pill); color: #fff; font-family: var(--font-mono); font-weight: 700;
          font-size: var(--fs-body-sm); margin-bottom: var(--space-3);
        }
        .mj-card h4 { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-h5); color: var(--text-strong); margin: 0 0 var(--space-1); }
        .mj-card .mj-do { font-size: var(--fs-body-sm); color: var(--text-body); margin: 0 0 var(--space-2); line-height: var(--lh-normal); }
        .mj-card .mj-measures { font-size: var(--fs-caption); color: var(--text-muted); margin: 0; }
        .mj-card .mj-measures b { color: var(--brand-tertiary); font-weight: 700; }
        .mj-sr { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }

        @media (prefers-reduced-motion: no-preference) {
          .mj-spine-draw { stroke-dasharray: var(--mj-len); stroke-dashoffset: var(--mj-len); animation: mjDraw 1200ms var(--ease-emphasized, cubic-bezier(0.16,1,0.3,1)) forwards; }
          .mj-node { opacity: 0; animation: mjPop 460ms var(--ease-spring, cubic-bezier(0.34,1.56,0.64,1)) both; }
          .mj-pulse { animation: mjPulse 2200ms ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        }
        @keyframes mjDraw { to { stroke-dashoffset: 0; } }
        @keyframes mjPop { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes mjPulse { 0%,100% { opacity: 0; transform: scale(1); } 45% { opacity: .5; } 60% { opacity: 0; transform: scale(1.7); } }
      `}</style>

      <div className="mj-scroll">
        <svg className="mj-svg" viewBox={`0 0 ${VB_W} ${VB_H}`} role="img"
          aria-label="Five-stage AI maturity progression from AI Aware to AI Organization, each stage measured by the platform.">
          <defs>
            <linearGradient id={`mjgrad-${uid}`} x1="0" y1="1" x2="1" y2="0">
              {MATURITY_LEVELS.map((lvl, i) => (
                <stop key={lvl.level} offset={`${(i / (N - 1)) * 100}%`} stopColor={lvl.hex} />
              ))}
            </linearGradient>
          </defs>

          <path className="mj-spine-track" d={spine} />
          <path
            className="mj-spine-draw"
            d={spine}
            ref={(el) => {
              if (!el) return;
              const len = el.getTotalLength();
              el.style.setProperty('--mj-len', `${len}`);
            }}
          />

          {MATURITY_LEVELS.map((lvl, i) => (
            <g key={lvl.level} className="mj-node" style={{ animationDelay: `${300 + i * 160}ms` }}>
              <circle className="mj-pulse" cx={x(i)} cy={y(i)} r={22} fill="none" stroke={lvl.hex} strokeWidth={3}
                style={{ animationDelay: `${i * 380}ms` }} />
              <circle cx={x(i)} cy={y(i)} r={20} fill={lvl.hex} stroke="var(--surface-card)" strokeWidth={3} />
              <text className="mj-node-num" x={x(i)} y={y(i) + 1}>{lvl.level}</text>
              <text className="mj-node-name" x={x(i)} y={y(i) - 32}>{lvl.name}</text>
            </g>
          ))}
        </svg>
      </div>

      <div className="mj-cards">
        {MATURITY_LEVELS.map((lvl) => (
          <div key={lvl.level} className="mj-card" style={{ borderTopColor: lvl.hex }}>
            <span className="mj-chip" style={{ background: lvl.hex }}>{lvl.level}</span>
            <h4>{lvl.name}</h4>
            <p className="mj-do">{lvl.tagline}</p>
            <p className="mj-measures"><b>Platform measures:</b> {lvl.measures}</p>
          </div>
        ))}
      </div>

      <ol className="mj-sr">
        {MATURITY_LEVELS.map((lvl) => (
          <li key={lvl.level}>Level {lvl.level}, {lvl.name}: {lvl.tagline} The platform measures {lvl.measures}</li>
        ))}
      </ol>
    </div>
  );
}
