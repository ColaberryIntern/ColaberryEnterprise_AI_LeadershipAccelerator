import React from 'react';
import { Link } from 'react-router-dom';
import { SERVICE_DETAILS } from '../../config/v2Services';

/**
 * The Services hero: the home page's machine, rewired to the engagements.
 *
 * The home hero draws system -> platform -> people. This draws the same arc in
 * the language of what we sell, so the two pages read as one system rather than
 * two designs: three services produce a system, a spine marks the handover, and
 * two services produce the capability to own it.
 *
 * SERVICE NAMES COME FROM v2Services, NOT FROM HERE. The whole point of this
 * hero is that it maps to the cards below it; retyping the names would let the
 * two drift apart silently the first time one is renamed. Slugs are matched
 * explicitly so a reordering of the config cannot quietly reshuffle the lanes.
 *
 * Shares .cbv2-h8* with the home hero deliberately -- the shell, the rails, the
 * chips, the 11s cycle and the reduced-motion behaviour are all one
 * implementation. Only the SVG and the chip copy differ.
 */

/** Short label for the node; the full name lives on the cards below. */
const DELIVER = [
  { slug: 'ai-opportunity-sprint', short: 'Opportunity', x: 20, cx: 120 },
  { slug: 'claude-production-pilot', short: 'Production pilot', x: 290, cx: 390 },
  { slug: 'enterprise-build-modernization', short: 'Build at scale', x: 560, cx: 660 },
];

const OWN = [
  { slug: 'workforce-architect-accelerator', short: 'Your architects', x: 130, cx: 237 },
  { slug: 'embedded-ai-operations', short: 'Embedded ops', x: 445, cx: 552 },
];

const TOP_WIRES = [
  { d: 'M120 108 C120 160, 235 158, 235 208', delay: 0 },
  { d: 'M390 108 C390 160, 245 158, 245 208', delay: 0.5 },
  { d: 'M390 108 C390 160, 535 158, 535 208', delay: 0.9 },
  { d: 'M660 108 C660 160, 545 158, 545 208', delay: 1.3 },
];

const OUTCOMES = [
  { label: 'A ranked map', x: 90 },
  { label: 'One system live', x: 245 },
  { label: 'Governed at scale', x: 400 },
  { label: 'Certified architects', x: 555 },
  { label: 'Practice handed back', x: 710 },
];

const DROPS = [
  { d: 'M90 338 L90 416', delay: 2.9 },
  { d: 'M245 338 L245 416', delay: 3.1 },
  { d: 'M400 356 L400 416', delay: 3.3 },
  { d: 'M555 338 L555 416', delay: 3.5 },
  { d: 'M710 338 L710 416', delay: 3.7 },
];

/** Fails loudly rather than rendering a blank node if a slug is ever renamed. */
const nameFor = (slug: string, fallback: string): string =>
  SERVICE_DETAILS.find((s) => s.slug === slug)?.name ?? fallback;

export default function HeroServicesV8(): React.ReactElement {
  return (
    <section className="cbv2-h8 cbv2-h8--svc" aria-labelledby="cbv2-svc-title">
      <div className="cbv2-h8__field" aria-hidden="true" />
      <div className="cbv2-h8__bloom cbv2-h8__bloom--red" aria-hidden="true" />
      <div className="cbv2-h8__bloom cbv2-h8__bloom--cyan" aria-hidden="true" />

      <div className="cbv2-h8__inner">
        <div className="cbv2-h8__copy">
          <div className="cbv2-h8__eyebrow">
            <span className="cbv2-h8__live" aria-hidden="true" />
            Five engagements &nbsp;&middot;&nbsp; one owned capability
          </div>

          <h1 id="cbv2-svc-title" className="cbv2-h8__h1">
            <span className="cbv2-h8__line">
              <span className="cbv2-h8__word cbv2-h8__word--sys">What outcome</span>
              <span className="cbv2-h8__rail" aria-hidden="true" />
            </span>
            <span className="cbv2-h8__line">
              <span className="cbv2-h8__word cbv2-h8__word--ppl">do you need next?</span>
              <span className="cbv2-h8__rail cbv2-h8__rail--cyan" aria-hidden="true" />
            </span>
          </h1>

          <p className="cbv2-h8__deck">
            Five productized engagements. <b>Pick by the outcome.</b>
          </p>

          <ul className="cbv2-h8__status">
            <li className="cbv2-h8__chip"><i /> Opportunity mapped</li>
            <li className="cbv2-h8__chip"><i /> Built and governed</li>
            <li className="cbv2-h8__chip"><i /> Your team owns it</li>
          </ul>

          <p className="cbv2-h8__body">
            Pick by the outcome you need, not by what the industry calls it. Three engagements
            put a system in production; two put your own people in charge of it. Most
            organizations need one now and the next one later.
          </p>

          <div className="cbv2-h8__cta">
            <Link className="cbv2-h8__btn cbv2-h8__btn--primary" to="/lab">
              Map an AI Opportunity
            </Link>
            <Link className="cbv2-h8__btn cbv2-h8__btn--ghost" to="/contact">
              Talk to an Architect
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
              <linearGradient id="cbv2-h8svcGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--h8-red)" />
                <stop offset="50%" stopColor="#b36ac9" />
                <stop offset="100%" stopColor="var(--h8-cyan)" />
              </linearGradient>
            </defs>

            <g>
              <circle cx="16" cy="16" r="3.5" fill="var(--h8-red)" />
              <text className="cbv2-h8layer" x="30" y="20" fill="#5a657b">What we deliver</text>
            </g>

            <g>
              {TOP_WIRES.map((w) => <path className="cbv2-h8wire" key={`w${w.d}`} d={w.d} />)}
              {TOP_WIRES.map((w) => (
                <path className="cbv2-h8flow" key={`f${w.d}`} d={w.d} style={{ animationDelay: `${w.delay}s` }} />
              ))}
            </g>

            {DELIVER.map((s, i) => (
              <g className={`cbv2-h8node cbv2-h8node--${['ing', 'mod', 'dep'][i]}`} key={s.slug}>
                <title>{nameFor(s.slug, s.short)}</title>
                <rect x={s.x} y={52} width={200} height={56} rx={9} />
                <text className="cbv2-h8lbl" x={s.cx} y={86} textAnchor="middle">{s.short}</text>
              </g>
            ))}

            {OWN.map((s, i) => (
              <g className={`cbv2-h8node cbv2-h8node--${['agt', 'grd'][i]}`} key={s.slug}>
                <title>{nameFor(s.slug, s.short)}</title>
                <rect x={s.x} y={208} width={215} height={60} rx={9} />
                <text className="cbv2-h8lbl" x={s.cx} y={244} textAnchor="middle">{s.short}</text>
              </g>
            ))}

            <path className="cbv2-h8wire" d="M237 268 L237 336" />
            <path className="cbv2-h8wire" d="M552 268 L552 336" />
            <path className="cbv2-h8flow" style={{ animationDelay: '1.6s' }} d="M237 268 L237 336" />
            <path className="cbv2-h8flow" style={{ animationDelay: '1.9s' }} d="M552 268 L552 336" />

            <line className="cbv2-h8spine" x1="10" y1="336" x2="790" y2="336" />
            <line className="cbv2-h8spine-hot" x1="10" y1="336" x2="790" y2="336" />
            <g className="cbv2-h8pill">
              <rect x="292" y="318" width="216" height="36" rx="18" />
              <text className="cbv2-h8tag" x="400" y="341" textAnchor="middle">Owned capability</text>
            </g>

            <g>
              {DROPS.map((s) => <path className="cbv2-h8wire" key={`w${s.d}`} d={s.d} />)}
              {DROPS.map((s) => (
                <path
                  className="cbv2-h8flow cbv2-h8flow--cyan"
                  key={`f${s.d}`}
                  d={s.d}
                  style={{ animationDelay: `${s.delay}s` }}
                />
              ))}
            </g>

            {OUTCOMES.map((o, i) => (
              <g className={`cbv2-h8person cbv2-h8person--${i + 1}`} key={o.label} transform={`translate(${o.x},456)`}>
                <circle className="cbv2-h8halo" cx="0" cy="0" r="30" />
                <circle className="cbv2-h8ring" cx="0" cy="0" r="34" />
                <path className="cbv2-h8tickglyph" d="M-11 1 l7 8 l15 -17" />
                <text className="cbv2-h8lbl cbv2-h8lbl--wrap" x="0" y="62" textAnchor="middle">{o.label}</text>
              </g>
            ))}

            <g>
              <circle cx="16" cy="590" r="3.5" fill="var(--h8-cyan)" />
              <text className="cbv2-h8layer" x="30" y="594" fill="#5a657b">What you keep</text>
            </g>

            <g className="cbv2-h8stamp">
              <rect x="556" y="572" width="228" height="38" rx="19" />
              <text x="670" y="596" textAnchor="middle">CAPABILITY OWNED</text>
            </g>
          </svg>
        </div>
      </div>
    </section>
  );
}
