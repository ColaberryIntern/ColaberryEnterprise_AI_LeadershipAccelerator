import React from 'react';
import { SampleBadge } from './Claim';

/**
 * Section 5 — the AI Architect experience.
 *
 * THE PROTOTYPE'S RADAR INVENTED ITS OWN CATEGORIES: LLM Core, RAG, Vectors,
 * Eval & Guardrails, Agents & MCP. None of those are tracked competencies, and
 * six that ARE tracked (testing, debugging, github, documentation, security,
 * communication) were missing from it entirely.
 *
 * A "Sample data" pill covers sample VALUES on real categories. It does not
 * cover invented CATEGORIES -- that tells a buyer the platform measures
 * something it does not, which is precisely the failure mode this page claims
 * immunity from. Ali's call (2026-08-20), option 1: use the real ones.
 *
 * The eleven below are `COMPETENCY_SEEDS` in services/progression/seeders.ts,
 * verbatim and in seed order.
 *
 * The polygon is COMPUTED from the same array that prints the numbers, rather
 * than hand-authored path data as the prototype had it. That is not tidiness --
 * the section's own claim is that the shape and the number cannot disagree, and
 * hand-drawn points would make that claim false on the page asserting it.
 */

interface Comp { name: string; score: number }

// Sample values on the real eleven. Order matches the seeder.
const COMPS: Comp[] = [
  { name: 'Prompt Eng.', score: 92 },
  { name: 'Context Eng.', score: 81 },
  { name: 'Architecture', score: 86 },
  { name: 'Testing', score: 74 },
  { name: 'Debugging', score: 77 },
  { name: 'Deployment', score: 69 },
  { name: 'GitHub', score: 88 },
  { name: 'Communication', score: 79 },
  { name: 'Leadership', score: 62 },
  { name: 'Security', score: 58 },
  { name: 'Documentation', score: 71 },
];

const CX = 232;
const CY = 196;
const R = 116;
const N = COMPS.length;

const angle = (i: number): number => (-Math.PI / 2) + ((i * 2 * Math.PI) / N);
const at = (i: number, radius: number): [number, number] => {
  const a = angle(i);
  return [CX + Math.cos(a) * radius, CY + Math.sin(a) * radius];
};
const ring = (frac: number): string => COMPS
  .map((_, i) => at(i, R * frac).map((n) => n.toFixed(1)).join(','))
  .join(' ');

const poly = COMPS
  .map((c, i) => at(i, R * (c.score / 100)).map((n) => n.toFixed(1)).join(','))
  .join(' ');

// Printed in the ring AND driving the polygon, from one source.
const overall = Math.round(COMPS.reduce((s, c) => s + c.score, 0) / N);

const thinnest = [...COMPS].sort((a, b) => a.score - b.score).slice(0, 2).map((c) => c.name);

export default function ArchitectExperience(): React.ReactElement {
  return (
    <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-ax-title">
      <div className="cbv2-wrap">
        <div className="cbv2-section__head">
          <p className="cbv2-eyebrow">The AI Architect experience</p>
          <h2 id="cbv2-ax-title">A personalized path for every person</h2>
          <p className="cbv2-lede">
            Eleven architecture competencies, one radar, and a next action that changes as the
            evidence changes. Nobody is handed the same week as the person next to them, because
            nobody arrives with the same shape.
          </p>
        </div>

        <div className="cbv2-ax">
          <div className="cbv2-ax__card">
            <div className="cbv2-ax__hd">
              <h3>AI architecture skills</h3>
              <span className="cbv2-ax__pct">{overall}% overall</span>
            </div>
            <p className="cbv2-ax__who">
              Marcus Bell &middot; Operations <SampleBadge />
            </p>

            <svg
              className="cbv2-ax__radar"
              viewBox="0 0 464 400"
              role="img"
              aria-label={`Radar of eleven AI architecture competencies: ${COMPS.map((c) => `${c.name} ${c.score}`).join(', ')}`}
            >
              <g fill="none" stroke="currentColor" strokeWidth="1" opacity="0.28">
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <polygon key={f} points={ring(f)} strokeDasharray={f === 1 ? undefined : '2 3'} />
                ))}
                {COMPS.map((c, i) => {
                  const [x, y] = at(i, R);
                  return <line key={c.name} x1={CX} y1={CY} x2={x.toFixed(1)} y2={y.toFixed(1)} />;
                })}
              </g>

              <polygon
                className="cbv2-ax__poly"
                points={poly}
                fill="rgba(251,40,50,0.14)"
                stroke="#fb2832"
                strokeWidth="2"
                strokeLinejoin="round"
              />

              {COMPS.map((c, i) => {
                const [px, py] = at(i, R * (c.score / 100));
                const [lx, ly] = at(i, R * 1.3);
                const cos = Math.cos(angle(i));
                const anchor = cos > 0.25 ? 'start' : (cos < -0.25 ? 'end' : 'middle');
                return (
                  <g key={c.name}>
                    <circle cx={px.toFixed(1)} cy={py.toFixed(1)} r="3.4" fill="#fb2832" />
                    <text className="cbv2-ax__lbl" x={lx.toFixed(1)} y={ly.toFixed(1)} textAnchor={anchor}>
                      {c.name}
                    </text>
                    <text className="cbv2-ax__val" x={lx.toFixed(1)} y={(ly + 13).toFixed(1)} textAnchor={anchor}>
                      {c.score}
                    </text>
                  </g>
                );
              })}
            </svg>

            <p className="cbv2-ax__legend">
              <i aria-hidden="true" /> Proficiency per competency, from the evidence ledger
            </p>
          </div>

          <div className="cbv2-ax__outs">
            <div className="cbv2-ax__out">
              <span className="cbv2-ax__v">{overall}%</span>
              <span>
                <b>Earned, not self-reported</b>
                Overall proficiency across the eleven competencies, from evidence bands rather than
                from what someone ticked off.
              </span>
            </div>
            <div className="cbv2-ax__out">
              <span className="cbv2-ax__v">Next</span>
              <span>
                <b>One clear action, every morning</b>
                STORY-014 &middot; route low-confidence tickets to a human queue. It moves{' '}
                {thinnest[0]} and {thinnest[1]} &mdash; the two bands this story touches where he is
                thinnest.
              </span>
            </div>
            <div className="cbv2-ax__out">
              <span className="cbv2-ax__v">11</span>
              <span>
                <b>Competencies, and they are the unglamorous ones</b>
                Prompt engineering and architecture, yes &mdash; and testing, debugging, deployment,
                GitHub, security, documentation, communication, leadership. The list an engineering
                manager would recognise, not the one a conference would.
              </span>
            </div>
            <div className="cbv2-ax__out">
              <span className="cbv2-ax__v">9</span>
              <span>
                <b>Ranks between Builder and Architect</b>
                Each one carries its own evidence minimums, and from Engineer upward an approval step
                beyond the totals. Nobody skips.
              </span>
            </div>
            <div className="cbv2-ax__out">
              <span className="cbv2-ax__v">1</span>
              <span>
                <b>Timeline, not five tools</b>
                Path, classroom, projects, community and review arrive filtered into one place, so the
                next action is a decision the system already made.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
