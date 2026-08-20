import React from 'react';

/**
 * "Capability grows because work ships" + the AI Aware → AI Organization ladder.
 *
 * Sections 6 and 8 of Ali's platform redesign. Both are built first because
 * neither is blocked on unverified product behaviour -- see
 * docs/PLATFORM_REDESIGN_BUILD_SPEC.md for what the others are waiting on.
 *
 * THE FORMULA IS VERIFIED, NOT DECORATIVE. capeSeeders.ts seeds
 * claim 0.2 / knowledge 0.25 / application 0.35 / judgment 0.2, so "application
 * carries the heaviest weight" is a fact about the system rather than a
 * flattering way to describe it. It is written as the DEFAULT model because
 * capeEvidenceBandWeightsService can patch the weights with versioning --
 * publishing them as immutable constants would be the wrong claim.
 *
 * THE COMPETENCY NAMES ARE THE REAL ONES, read from
 * services/progression/seeders.ts -- the eleven promotion competencies:
 * prompt_engineering, context_engineering, architecture, testing, debugging,
 * deployment, github, communication, leadership, security, documentation.
 *
 * The prototype's radar invented categories -- RAG, Vectors, LLM Core -- that
 * the platform does not track, while omitting several it does. A "sample data"
 * badge covers made-up VALUES on real categories; it does not cover made-up
 * categories, which tell a reader the product measures something it doesn't.
 *
 * CORRECTED AFTER FIRST SHIP: the initial list ended with "Claude Code", which
 * came from a different source in the search and is NOT a promotion competency.
 * The eleventh is DEBUGGING. Shipping a competency list on the page that argues
 * every number traces to evidence, and getting the list wrong, is the same
 * failure as the invented radar -- just quieter.
 */

/** The four evidence bands, with the seeded default weights. */
const BANDS = [
  {
    key: 'claim',
    weight: '0.20',
    title: 'Claim',
    detail: 'What someone says they can do. The weakest signal, weighted accordingly.',
  },
  {
    key: 'knowledge',
    weight: '0.25',
    title: 'Knowledge',
    detail: 'Assessed understanding from evaluations, measured against the entry check — not video completion.',
  },
  {
    key: 'application',
    weight: '0.35',
    title: 'Application',
    detail: 'Working systems shipped and confirmed against a repository. The heaviest band.',
    lead: true,
  },
  {
    key: 'judgment',
    weight: '0.20',
    title: 'Judgment',
    detail: 'Design calls under review — including when not to hand a decision to an agent.',
  },
];

/** Real competency slugs, read from the platform rather than invented. */
const COMPETENCIES = [
  'Architecture', 'Prompt engineering', 'Context engineering', 'Testing',
  'Debugging', 'Deployment', 'GitHub', 'Security',
  'Documentation', 'Communication', 'Leadership',
];

const RUNGS = [
  { n: '01', t: 'AI Aware', d: 'People understand what AI can and cannot do.', m: 'Baseline literacy across every department', c: '#cfe0e9' },
  { n: '02', t: 'AI Enabled', d: 'People use AI in their daily work.', m: 'Adoption by team, not seats purchased', c: '#6f9db6' },
  { n: '03', t: 'AI Builders', d: 'People build working AI solutions.', m: 'Automations shipped and verified', c: '#367895' },
  { n: '04', t: 'AI Architects', d: 'People design enterprise AI systems.', m: 'Systems designed, governed and deployed', c: '#fd5760' },
  { n: '05', t: 'AI Organization', d: 'AI is part of every business process.', m: 'AI-touched processes and governance org-wide', c: '#fb2832' },
];

export default function CapabilityEarned(): React.ReactElement {
  return (
    <>
      <section className="cbv2-rv cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-cap-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">How capability is earned</p>
            <h2 id="cbv2-cap-title">Capability grows because work ships</h2>
            <p className="cbv2-lede">
              A learning management system measures attendance. This measures whether something
              now exists that did not exist last week.
            </p>
          </div>

          <div className="cbv2-vs">
            <div className="cbv2-vs__c cbv2-vs__c--bad">
              <p className="cbv2-vs__l">What an LMS measures</p>
              <p className="cbv2-vs__s">Watch video &rarr; complete quiz &rarr; 100%</p>
              <p className="cbv2-vs__n">Certificate issued. Nothing shipped.</p>
            </div>
            <div className="cbv2-vs__c cbv2-vs__c--good">
              <p className="cbv2-vs__l">What this measures</p>
              <p className="cbv2-vs__s">Learn &rarr; apply &rarr; build &rarr; ship &rarr; verify &rarr; review</p>
              <p className="cbv2-vs__n">Capability moves only at the end of that chain.</p>
            </div>
          </div>

          <h3 className="cbv2-cap__sub">What feeds a competency score</h3>
          <p className="cbv2-cap__subp">
            Four weighted bands. Course completion is not one of them.
          </p>

          <div className="cbv2-bands">
            {BANDS.map((b) => (
              <article className={`cbv2-band${b.lead ? ' is-lead' : ''}`} key={b.key}>
                <p className="cbv2-band__w">{b.weight}</p>
                <h4>{b.title}</h4>
                <p>{b.detail}</p>
              </article>
            ))}
          </div>

          <div className="cbv2-formula">
            <p className="cbv2-formula__l">Per-competency proficiency, by default</p>
            <p className="cbv2-formula__f">
              <b>0.20</b> &times; claim &nbsp;+&nbsp; <b>0.25</b> &times; knowledge &nbsp;+&nbsp;{' '}
              <b className="is-lead">0.35</b> &times; application &nbsp;+&nbsp; <b>0.20</b> &times; judgment
            </p>
            <p className="cbv2-formula__n">
              Application carries the heaviest weight because a system that runs is the only
              evidence that survives contact with your business. The weights are the platform
              default and are versioned, so an organization can change what it counts.
            </p>
          </div>

          <div className="cbv2-comps">
            <p className="cbv2-comps__l">
              The competencies these bands are scored against
            </p>
            <ul>
              {COMPETENCIES.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-rungs-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">What the organization becomes</p>
            <h2 id="cbv2-rungs-title">From AI Aware to AI Organization</h2>
            <p className="cbv2-lede">
              Five levels your people climb. The platform measures every one of them, so you can
              say which rung your company is standing on today rather than which one you hope
              it reaches.
            </p>
          </div>

          <div className="cbv2-rungs">
            {RUNGS.map((r) => (
              <article className="cbv2-rung" key={r.n} style={{ ['--rung' as string]: r.c }}>
                <p className="cbv2-rung__n">{r.n}</p>
                <h3>{r.t}</h3>
                <p className="cbv2-rung__d">{r.d}</p>
                <p className="cbv2-rung__m">{r.m}</p>
              </article>
            ))}
          </div>

          <div className="cbv2-split">
            <div className="cbv2-split__c">
              <p className="cbv2-split__l">The Platform</p>
              <h3>Measures the journey</h3>
              <p>
                The evidence ledger, the readiness roll-up, the build pipeline and the governance
                around it. This is the machine, and it runs whether or not anyone is teaching.
              </p>
            </div>
            <div className="cbv2-split__c">
              <p className="cbv2-split__l">The Program</p>
              <h3>Helps your people make it</h3>
              <p>
                The cohort path, the live sessions, the certification track and the humans who
                review the work &mdash; the structured climb from AI Aware to AI Architect.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
