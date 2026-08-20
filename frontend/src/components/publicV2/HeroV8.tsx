import React from 'react';
import { Link } from 'react-router-dom';

/**
 * The hero: the headline is physically wired into the system diagram.
 *
 * Ali's v2 design. "system." feeds the machine layer, "people." feeds the human
 * layer, and one handover pulse runs the whole cycle -- the page's argument
 * drawn rather than asserted.
 *
 * FOUR DELIBERATE DEPARTURES FROM THE SUPPLIED FILE, all recorded because each
 * would otherwise look like a mistake:
 *
 * 1. NAMESPACED cbv2-h8*, not cbv2-hero*. `.cbv2-hero` and `.cbv2-eyebrow` are
 *    still owned by other sections of this page, and generic names like
 *    `.cbv2-node`, `.cbv2-flow` and `.cbv2-person` are exactly the kind that
 *    collide. `.cbv2-goal`, defined twice in two files, already broke an
 *    unrelated section once in this workstream.
 *
 * 2. NO GOOGLE FONTS. The file links Hanken Grotesk and JetBrains Mono. This
 *    page already has display and mono faces as design tokens, and a duplicate
 *    icon font was removed from it earlier this week precisely to stop a second
 *    render-blocking font request. It uses --font-display and --font-mono.
 *
 * 3. THE BODY SENTENCE IS THE APPROVED ONE. The file rewrote it to "same
 *    platform, same timeline"; the wording kept here -- "in one platform, at the
 *    same time" -- is what the claims work settled on and what the suite
 *    asserts. Same meaning, vetted phrasing.
 *
 * 4. CTA LABELS STAY TITLE CASE, matching every other call to action on the
 *    site and the existing link-integrity expectations.
 *
 * The diagram is aria-hidden: every label in it restates a word already in the
 * headline, deck or status list beside it.
 */

/** Top row of the machine. x is the box left edge; the label centres on it. */
const STAGES = [
  { key: 'ing', label: 'Ingest', x: 20, cx: 120 },
  { key: 'mod', label: 'Model', x: 290, cx: 390 },
  { key: 'dep', label: 'Deploy', x: 560, cx: 660 },
];

const CONTROLS = [
  { key: 'agt', label: 'Agents', x: 130, cx: 237 },
  { key: 'grd', label: 'Guardrails', x: 445, cx: 552 },
];

/** Wires from the top row down into the control row, and the pulse on each. */
const TOP_WIRES = [
  { d: 'M120 108 C120 160, 235 158, 235 208', delay: 0 },
  { d: 'M390 108 C390 160, 245 158, 245 208', delay: 0.5 },
  { d: 'M390 108 C390 160, 535 158, 535 208', delay: 0.9 },
  { d: 'M660 108 C660 160, 545 158, 545 208', delay: 1.3 },
];

const PEOPLE = [
  { label: 'Data eng', x: 90 },
  { label: 'Architect', x: 245 },
  { label: 'Ops lead', x: 400 },
  { label: 'Analyst', x: 555 },
  { label: 'Exec', x: 710 },
];

/** Spine down to each person. The middle one starts below the pill. */
const SPINE_DROPS = [
  { d: 'M90 338 L90 416', delay: 2.9 },
  { d: 'M245 338 L245 416', delay: 3.1 },
  { d: 'M400 356 L400 416', delay: 3.3 },
  { d: 'M555 338 L555 416', delay: 3.5 },
  { d: 'M710 338 L710 416', delay: 3.7 },
];

function Person({ label, x, i }: { label: string; x: number; i: number }): React.ReactElement {
  return (
    <g className={`cbv2-h8person cbv2-h8person--${i + 1}`} transform={`translate(${x},456)`}>
      <circle className="cbv2-h8halo" cx="0" cy="0" r="30" />
      <circle className="cbv2-h8ring" cx="0" cy="0" r="34" />
      <g className="cbv2-h8glyph">
        <circle cx="0" cy="-8" r="8" />
        <path d="M-14 14 a14 14 0 0 1 28 0 z" />
      </g>
      <text className="cbv2-h8lbl" x="0" y="62" textAnchor="middle">{label}</text>
    </g>
  );
}

export default function HeroV8(): React.ReactElement {
  return (
    <section className="cbv2-h8" aria-labelledby="cbv2-hero-title">
      <div className="cbv2-h8__field" aria-hidden="true" />
      <div className="cbv2-h8__bloom cbv2-h8__bloom--red" aria-hidden="true" />
      <div className="cbv2-h8__bloom cbv2-h8__bloom--cyan" aria-hidden="true" />

      <div className="cbv2-h8__inner">
        <div className="cbv2-h8__copy">
          <div className="cbv2-h8__eyebrow">
            <span className="cbv2-h8__live" aria-hidden="true" />
            Systems <b>+</b> People &nbsp;&middot;&nbsp; One platform
          </div>

          <h1 id="cbv2-hero-title" className="cbv2-h8__h1">
            <span className="cbv2-h8__line">
              <span className="cbv2-h8__word cbv2-h8__word--sys">Build the system.</span>
              <span className="cbv2-h8__rail" aria-hidden="true" />
            </span>
            {/* A real space between the lines: they are separate spans, so the
                accessible name concatenated to "systemBuild" without it. The
                lines are block-level, so this changes nothing visually. */}
            {' '}
            <span className="cbv2-h8__line">
              <span className="cbv2-h8__word cbv2-h8__word--ppl">Build the people.</span>
              <span className="cbv2-h8__rail cbv2-h8__rail--cyan" aria-hidden="true" />
            </span>
          </h1>

          <p className="cbv2-h8__deck">
            One platform. <b>Your team owns it.</b>
          </p>

          <ul className="cbv2-h8__status">
            <li className="cbv2-h8__chip"><i /> System in production</li>
            <li className="cbv2-h8__chip"><i /> People own the system</li>
            <li className="cbv2-h8__chip"><i /> Handover complete</li>
          </ul>

          <p className="cbv2-h8__body">
            Most AI work leaves you with a system nobody inside your company can run. We build
            the system and certify the people who will own it, <b>in one platform, at the same
            time</b> &mdash; so the capability is still yours after we go.
          </p>

          <div className="cbv2-h8__cta">
            <Link className="cbv2-h8__btn cbv2-h8__btn--primary" to="/platform">
              Explore the Live Platform
            </Link>
            <Link className="cbv2-h8__btn cbv2-h8__btn--ghost" to="/lab">
              Map an AI Opportunity
            </Link>
          </div>

          <div className="cbv2-h8__proof">
            <span>Built on Claude &amp; Claude Code</span>
            <span>Certification path included</span>
            <span>Free company workspace</span>
          </div>
        </div>

        <div className="cbv2-h8__viz" aria-hidden="true">
          <svg viewBox="0 0 800 660" xmlns="http://www.w3.org/2000/svg" focusable="false">
            <defs>
              <linearGradient id="cbv2-h8spineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--h8-red)" />
                <stop offset="50%" stopColor="#b36ac9" />
                <stop offset="100%" stopColor="var(--h8-cyan)" />
              </linearGradient>
            </defs>

            <g>
              <circle cx="16" cy="16" r="3.5" fill="var(--h8-red)" />
              <text className="cbv2-h8layer" x="30" y="20" fill="#5a657b">System</text>
            </g>

            <g>
              {TOP_WIRES.map((w) => <path className="cbv2-h8wire" key={`w${w.d}`} d={w.d} />)}
              {TOP_WIRES.map((w) => (
                <path
                  className="cbv2-h8flow"
                  key={`f${w.d}`}
                  d={w.d}
                  style={{ animationDelay: `${w.delay}s` }}
                />
              ))}
            </g>

            {STAGES.map((s) => (
              <g className={`cbv2-h8node cbv2-h8node--${s.key}`} key={s.key}>
                <rect x={s.x} y={52} width={200} height={56} rx={9} />
                <text className="cbv2-h8lbl" x={s.cx} y={86} textAnchor="middle">{s.label}</text>
              </g>
            ))}

            {CONTROLS.map((c) => (
              <g className={`cbv2-h8node cbv2-h8node--${c.key}`} key={c.key}>
                <rect x={c.x} y={208} width={215} height={60} rx={9} />
                <text className="cbv2-h8lbl" x={c.cx} y={244} textAnchor="middle">{c.label}</text>
              </g>
            ))}

            <path className="cbv2-h8wire" d="M237 268 L237 336" />
            <path className="cbv2-h8wire" d="M552 268 L552 336" />
            <path className="cbv2-h8flow" style={{ animationDelay: '1.6s' }} d="M237 268 L237 336" />
            <path className="cbv2-h8flow" style={{ animationDelay: '1.9s' }} d="M552 268 L552 336" />

            <line className="cbv2-h8spine" x1="10" y1="336" x2="790" y2="336" />
            <line className="cbv2-h8spine-hot" x1="10" y1="336" x2="790" y2="336" />
            <g className="cbv2-h8pill">
              <rect x="315" y="318" width="170" height="36" rx="18" />
              <text className="cbv2-h8tag" x="400" y="341" textAnchor="middle">One platform</text>
            </g>

            <g>
              {SPINE_DROPS.map((s) => <path className="cbv2-h8wire" key={`w${s.d}`} d={s.d} />)}
              {SPINE_DROPS.map((s) => (
                <path
                  className="cbv2-h8flow cbv2-h8flow--cyan"
                  key={`f${s.d}`}
                  d={s.d}
                  style={{ animationDelay: `${s.delay}s` }}
                />
              ))}
            </g>

            {PEOPLE.map((p, i) => <Person key={p.label} label={p.label} x={p.x} i={i} />)}

            <g>
              <circle cx="16" cy="590" r="3.5" fill="var(--h8-cyan)" />
              <text className="cbv2-h8layer" x="30" y="594" fill="#5a657b">People</text>
            </g>

            <g className="cbv2-h8stamp">
              <rect x="556" y="572" width="228" height="38" rx="19" />
              <text x="670" y="596" textAnchor="middle">HANDOVER COMPLETE</text>
            </g>
          </svg>
        </div>
      </div>
    </section>
  );
}
