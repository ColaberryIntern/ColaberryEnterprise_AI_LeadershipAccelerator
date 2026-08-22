import React from 'react';
import { Link } from 'react-router-dom';
import { SHOWROOM_SURFACES } from '../../config/v2Platform';

/**
 * The Platform hero: the same machine, wired to the six surfaces.
 *
 * Home draws system -> platform -> people. Services draws deliver -> capability
 * -> keep. This draws the split the product actually has: four surfaces
 * management watches, two the team works in, one login between them.
 *
 * SURFACE LABELS AND THE SPLIT COME FROM v2Platform, NOT FROM HERE. The
 * `audience` field already decides which lane a surface belongs to further down
 * the page; reading it here means the hero cannot disagree with the tabs below
 * it, and adding a seventh surface puts it in the right lane automatically.
 *
 * Shares .cbv2-h8* with the home and services heroes -- one shell, one cycle,
 * one reduced-motion behaviour.
 */

/** Where each lane's nodes sit. The geometry matches the other two heroes. */
const MGMT_POS = [
  { x: 20, cx: 120 },
  { x: 290, cx: 390 },
  { x: 560, cx: 660 },
];
const TEAM_POS = [
  { x: 130, cx: 237 },
  { x: 445, cx: 552 },
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

/** What a person actually gets out of the platform, under the spine. */
const GAINS = [
  { label: 'Who is ready', x: 90 },
  { label: 'Who is moving', x: 245 },
  { label: 'What shipped', x: 400 },
  { label: 'Evidence, dated', x: 555 },
  { label: 'One login', x: 710 },
];

/** Node labels are shortened for a 200px box; the tabs below carry the full ones. */
const SHORT: Record<string, string> = {
  readiness: 'Readiness',
  roster: 'Roster',
  individual: 'Individual',
  workspace: 'Workspace',
  today: 'Today',
  storybuild: 'Idea to shipped',
};

export default function HeroPlatformV8(): React.ReactElement {
  const mgmt = SHOWROOM_SURFACES.filter((s) => s.audience === 'management').slice(0, 3);
  const team = SHOWROOM_SURFACES.filter((s) => s.audience === 'team').slice(0, 2);

  return (
    <section className="cbv2-h8 cbv2-h8--svc" aria-labelledby="cbv2-plat-title">
      <div className="cbv2-h8__field" aria-hidden="true" />
      <div className="cbv2-h8__bloom cbv2-h8__bloom--red" aria-hidden="true" />
      <div className="cbv2-h8__bloom cbv2-h8__bloom--cyan" aria-hidden="true" />

      <div className="cbv2-h8__inner">
        <div className="cbv2-h8__copy">
          <div className="cbv2-h8__eyebrow">
            <span className="cbv2-h8__live" aria-hidden="true" />
            Management <b>+</b> team &nbsp;&middot;&nbsp; one login
          </div>

          <h1 id="cbv2-plat-title" className="cbv2-h8__h1">
            <span className="cbv2-h8__line">
              <span className="cbv2-h8__word cbv2-h8__word--sys">You watch it.</span>
              <span className="cbv2-h8__rail" aria-hidden="true" />
            </span>
            {' '}
            <span className="cbv2-h8__line">
              <span className="cbv2-h8__word cbv2-h8__word--ppl">They work in it.</span>
              <span className="cbv2-h8__rail cbv2-h8__rail--cyan" aria-hidden="true" />
            </span>
          </h1>

          <p className="cbv2-h8__deck">
            One platform. <b>Two jobs to do.</b>
          </p>

          <ul className="cbv2-h8__status">
            <li className="cbv2-h8__chip"><i /> Readiness, by department</li>
            <li className="cbv2-h8__chip"><i /> Work happening today</li>
            <li className="cbv2-h8__chip"><i /> Evidence, dated</li>
          </ul>

          <p className="cbv2-h8__body">
            Leadership gets readiness, the roster and the individual record. The team gets the
            day in front of them and the build they are shipping. <b>Same login, same data</b>
            {' '}&mdash; so the number a manager sees is the work a builder did, not a status
            report about it.
          </p>

          <div className="cbv2-h8__cta">
            <Link className="cbv2-h8__btn cbv2-h8__btn--primary" to="/try">
              Explore the Live Platform
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
              <text className="cbv2-h8layer" x="30" y="20" fill="#5a657b">Management sees</text>
            </g>

            <g>
              {TOP_WIRES.map((w) => <path className="cbv2-h8wire" key={`w${w.d}`} d={w.d} />)}
              {TOP_WIRES.map((w) => (
                <path className="cbv2-h8flow" key={`f${w.d}`} d={w.d} style={{ animationDelay: `${w.delay}s` }} />
              ))}
            </g>

            {mgmt.map((s, i) => (
              <g className={`cbv2-h8node cbv2-h8node--${['ing', 'mod', 'dep'][i]}`} key={s.key}>
                <title>{s.label}</title>
                <rect x={MGMT_POS[i].x} y={52} width={200} height={56} rx={9} />
                <text className="cbv2-h8lbl" x={MGMT_POS[i].cx} y={86} textAnchor="middle">
                  {SHORT[s.key] ?? s.label}
                </text>
              </g>
            ))}

            {team.map((s, i) => (
              <g className={`cbv2-h8node cbv2-h8node--${['agt', 'grd'][i]}`} key={s.key}>
                <title>{s.label}</title>
                <rect x={TEAM_POS[i].x} y={208} width={215} height={60} rx={9} />
                <text className="cbv2-h8lbl" x={TEAM_POS[i].cx} y={244} textAnchor="middle">
                  {SHORT[s.key] ?? s.label}
                </text>
              </g>
            ))}

            <path className="cbv2-h8wire" d="M237 268 L237 336" />
            <path className="cbv2-h8wire" d="M552 268 L552 336" />
            <path className="cbv2-h8flow" style={{ animationDelay: '1.6s' }} d="M237 268 L237 336" />
            <path className="cbv2-h8flow" style={{ animationDelay: '1.9s' }} d="M552 268 L552 336" />

            <line className="cbv2-h8spine" x1="10" y1="336" x2="790" y2="336" />
            <line className="cbv2-h8spine-hot" x1="10" y1="336" x2="790" y2="336" />
            <g className="cbv2-h8pill">
              <rect x="330" y="318" width="140" height="36" rx="18" />
              <text className="cbv2-h8tag" x="400" y="341" textAnchor="middle">One login</text>
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

            {GAINS.map((g, i) => (
              <g className={`cbv2-h8person cbv2-h8person--${i + 1}`} key={g.label} transform={`translate(${g.x},456)`}>
                <circle className="cbv2-h8halo" cx="0" cy="0" r="30" />
                <circle className="cbv2-h8ring" cx="0" cy="0" r="34" />
                <path className="cbv2-h8tickglyph" d="M-11 1 l7 8 l15 -17" />
                <text className="cbv2-h8lbl cbv2-h8lbl--wrap" x="0" y="62" textAnchor="middle">{g.label}</text>
              </g>
            ))}

            <g>
              <circle cx="16" cy="590" r="3.5" fill="var(--h8-cyan)" />
              <text className="cbv2-h8layer" x="30" y="594" fill="#5a657b">Everyone gets</text>
            </g>

            <g className="cbv2-h8stamp">
              <rect x="576" y="572" width="208" height="38" rx="19" />
              <text x="680" y="596" textAnchor="middle">ONE SOURCE OF TRUTH</text>
            </g>
          </svg>
        </div>
      </div>
    </section>
  );
}
