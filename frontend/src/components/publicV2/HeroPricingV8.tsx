import React from 'react';
import { Link } from 'react-router-dom';

/**
 * The Pricing hero: the same machine, drawing the path to paying rather than
 * the price.
 *
 * NO NUMBERS IN THE DIAGRAM, DELIBERATELY. The tiers below carry the figures.
 * A price inside an animated graphic is the hardest thing on the site to keep
 * in step with the table beneath it, and the same rule already governs the
 * goal-chooser figures: a drawing may show the SHAPE of an offer and must not
 * assert a number it cannot be held to.
 *
 * The arc is the one a buyer actually walks: open a workspace, put your team in
 * it, watch sample data give way to their own work, and pay only when someone
 * is progressing rather than evaluating.
 *
 * Shares .cbv2-h8* with the other heroes -- one shell, one cycle, one
 * reduced-motion behaviour.
 */

const STEPS = [
  { key: 'ing', label: 'Open a workspace', x: 20, cx: 120 },
  { key: 'mod', label: 'Invite your team', x: 290, cx: 390 },
  { key: 'dep', label: 'Real work appears', x: 560, cx: 660 },
];

const GATES = [
  { key: 'agt', label: 'Still free', x: 130, cx: 237 },
  { key: 'grd', label: 'Nothing to cancel', x: 445, cx: 552 },
];

const TOP_WIRES = [
  { d: 'M120 108 C120 160, 235 158, 235 208', delay: 0 },
  { d: 'M390 108 C390 160, 245 158, 245 208', delay: 0.5 },
  { d: 'M390 108 C390 160, 535 158, 535 208', delay: 0.9 },
  { d: 'M660 108 C660 160, 545 158, 545 208', delay: 1.3 },
];

const DROPS = [
  { d: 'M90 338 L90 416', delay: 2.9 },
  { d: 'M245 338 L245 416', delay: 3.1 },
  { d: 'M400 356 L400 416', delay: 3.3 },
  { d: 'M555 338 L555 416', delay: 3.5 },
  { d: 'M710 338 L710 416', delay: 3.7 },
];

const INCLUDED = [
  { label: 'The whole platform', x: 90 },
  { label: 'Your own project', x: 245 },
  { label: 'Cert preparation', x: 400 },
  { label: 'Evidence you keep', x: 555 },
  { label: 'Your repo', x: 710 },
];

export default function HeroPricingV8(): React.ReactElement {
  return (
    <section className="cbv2-h8 cbv2-h8--svc" aria-labelledby="cbv2-pricing-title">
      <div className="cbv2-h8__field" aria-hidden="true" />
      <div className="cbv2-h8__bloom cbv2-h8__bloom--red" aria-hidden="true" />
      <div className="cbv2-h8__bloom cbv2-h8__bloom--cyan" aria-hidden="true" />

      <div className="cbv2-h8__inner">
        <div className="cbv2-h8__copy">
          <div className="cbv2-h8__eyebrow">
            <span className="cbv2-h8__live" aria-hidden="true" />
            Free to explore &nbsp;&middot;&nbsp; licensed when you are ready
          </div>

          <h1 id="cbv2-pricing-title" className="cbv2-h8__h1">
            <span className="cbv2-h8__line">
              <span className="cbv2-h8__word cbv2-h8__word--sys">Free to start.</span>
              <span className="cbv2-h8__rail" aria-hidden="true" />
            </span>
            {' '}
            <span className="cbv2-h8__line">
              <span className="cbv2-h8__word cbv2-h8__word--ppl">Paid when it pays.</span>
              <span className="cbv2-h8__rail cbv2-h8__rail--cyan" aria-hidden="true" />
            </span>
          </h1>

          <p className="cbv2-h8__deck">
            Licenses only when you are ready. <b>No contract to look.</b>
          </p>

          <ul className="cbv2-h8__status">
            <li className="cbv2-h8__chip"><i /> Workspace open</li>
            <li className="cbv2-h8__chip"><i /> Team invited</li>
            <li className="cbv2-h8__chip"><i /> Paying for progress</li>
          </ul>

          <p className="cbv2-h8__body">
            The whole platform is free to explore and free for your team to try. You pay when
            someone is ready to <b>progress rather than evaluate</b> &mdash; so the decision
            comes after you have seen your own people use it, not before.
          </p>

          <div className="cbv2-h8__cta">
            <Link className="cbv2-h8__btn cbv2-h8__btn--primary" to="/try">
              Open the Free Company Workspace
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
            <g>
              <circle cx="16" cy="16" r="3.5" fill="var(--h8-red)" />
              <text className="cbv2-h8layer" x="30" y="20" fill="#5a657b">Before you pay</text>
            </g>

            <g>
              {TOP_WIRES.map((w) => <path className="cbv2-h8wire" key={`w${w.d}`} d={w.d} />)}
              {TOP_WIRES.map((w) => (
                <path className="cbv2-h8flow" key={`f${w.d}`} d={w.d} style={{ animationDelay: `${w.delay}s` }} />
              ))}
            </g>

            {STEPS.map((s) => (
              <g className={`cbv2-h8node cbv2-h8node--${s.key}`} key={s.key}>
                <rect x={s.x} y={52} width={200} height={56} rx={9} />
                <text className="cbv2-h8lbl" x={s.cx} y={86} textAnchor="middle">{s.label}</text>
              </g>
            ))}

            {GATES.map((g) => (
              <g className={`cbv2-h8node cbv2-h8node--${g.key}`} key={g.key}>
                <rect x={g.x} y={208} width={215} height={60} rx={9} />
                <text className="cbv2-h8lbl" x={g.cx} y={244} textAnchor="middle">{g.label}</text>
              </g>
            ))}

            <path className="cbv2-h8wire" d="M237 268 L237 336" />
            <path className="cbv2-h8wire" d="M552 268 L552 336" />
            <path className="cbv2-h8flow" style={{ animationDelay: '1.6s' }} d="M237 268 L237 336" />
            <path className="cbv2-h8flow" style={{ animationDelay: '1.9s' }} d="M552 268 L552 336" />

            <line className="cbv2-h8spine" x1="10" y1="336" x2="790" y2="336" />
            <line className="cbv2-h8spine-hot" x1="10" y1="336" x2="790" y2="336" />
            <g className="cbv2-h8pill">
              <rect x="300" y="318" width="200" height="36" rx="18" />
              <text className="cbv2-h8tag" x="400" y="341" textAnchor="middle">Included either way</text>
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

            {INCLUDED.map((g, i) => (
              <g className={`cbv2-h8person cbv2-h8person--${i + 1}`} key={g.label} transform={`translate(${g.x},456)`}>
                <circle className="cbv2-h8halo" cx="0" cy="0" r="30" />
                <circle className="cbv2-h8ring" cx="0" cy="0" r="34" />
                <path className="cbv2-h8tickglyph" d="M-11 1 l7 8 l15 -17" />
                <text className="cbv2-h8lbl cbv2-h8lbl--wrap" x="0" y="62" textAnchor="middle">{g.label}</text>
              </g>
            ))}

            <g>
              <circle cx="16" cy="590" r="3.5" fill="var(--h8-cyan)" />
              <text className="cbv2-h8layer" x="30" y="594" fill="#5a657b">What you keep</text>
            </g>

            <g className="cbv2-h8stamp">
              <rect x="596" y="572" width="188" height="38" rx="19" />
              <text x="690" y="596" textAnchor="middle">NO CONTRACT TO LOOK</text>
            </g>
          </svg>
        </div>
      </div>
    </section>
  );
}
