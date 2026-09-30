import React, { useEffect, useState } from 'react';
import { SampleBadge } from './Claim';

/**
 * Section 1 — the capability OS diagram.
 *
 * In the prototype this lived inside the hero. The hero here is HeroPlatformV8,
 * which Ali approved as the template across Services / Platform / Pricing, so
 * the diagram becomes its own section directly under the thesis instead.
 *
 * VERIFIED BEFORE WRITING:
 *  - "9 ranks" is real. services/progression/seeders.ts seeds exactly nine,
 *    rank 0..8: Builder, Junior Builder, Practitioner, Developer, Senior
 *    Developer, Engineer, Senior Engineer, Architect Candidate, Architect.
 *  - "11 competencies" is real, from the same seeder. The prototype said ten.
 *
 * The row VALUES (63%, the drill-down, the weekly cadence) are illustrative and
 * carry the sample badge. The row CATEGORIES are the real surfaces.
 */

const MGMT = [
  { l: 'Architect readiness', v: '63%' },
  { l: 'Team capability', v: '9 ranks' },
  { l: 'Individual progress', v: 'drill-down' },
  { l: 'Evidence & velocity', v: 'weekly' },
];

const TEAM = [
  { l: 'Today’s work', v: 'next action' },
  { l: 'AI architecture skills', v: '11' },
  { l: 'Projects & stories', v: 'STORY-014' },
  { l: 'Claude Code', v: 'their own repo' },
];

const FLOW = ['Build', 'Commit', 'Verify', 'Evidence', 'Skill ↑', 'Readiness'];

export default function CapabilityOS(): React.ReactElement {
  const [k, setK] = useState(-1);

  useEffect(() => {
    const reduced = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return undefined;
    const id = window.setInterval(() => { setK((n) => n + 1); }, 1400);
    return () => window.clearInterval(id);
  }, []);

  const step = k < 0 ? -1 : k % FLOW.length;

  return (
    <section className="cbv2-rv cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-os-title">
      <div className="cbv2-wrap">
        <div className="cbv2-section__head">
          <p className="cbv2-eyebrow">The AI capability operating system</p>
          <h2 id="cbv2-os-title">One login. Two views of the same evidence.</h2>
          <p className="cbv2-lede">
            Leadership and the people doing the work are not looking at two different products with a
            reporting bridge between them. They are looking at one ledger from two ends &mdash; which
            is why the number on the executive dashboard and the work in someone&rsquo;s Tuesday
            cannot drift apart.
          </p>
        </div>

        <div className="cbv2-os">
          <div className="cbv2-os__cap">
            <span>Colaberry AI Capability OS</span>
            <span className="cbv2-os__live"><i aria-hidden="true" />one login</span>
          </div>

          <div className="cbv2-os__core">
            <b>One evidence ledger</b>
            <i>every number traces back to a commit</i>
          </div>

          <div className="cbv2-os__cols">
            <div className="cbv2-os__col">
              <h3>Management</h3>
              {MGMT.map((r, i) => (
                <p className={`cbv2-os__row${step >= 3 && i === step - 3 ? ' is-hot' : ''}`} key={r.l}>
                  {r.l}<i>{r.v}</i>
                </p>
              ))}
            </div>
            <div className="cbv2-os__col">
              <h3>Your team</h3>
              {TEAM.map((r, i) => (
                <p className={`cbv2-os__row${step >= 0 && step < 3 && i === step ? ' is-hot' : ''}`} key={r.l}>
                  {r.l}<i>{r.v}</i>
                </p>
              ))}
            </div>
          </div>

          <div className="cbv2-os__spine">
            <p className="cbv2-os__spinelbl">what moves between them</p>
            <div className="cbv2-os__flow">
              {FLOW.map((s, i) => (
                <React.Fragment key={s}>
                  <span className={`cbv2-os__step${i === step ? ' is-hot' : ''}`}>{s}</span>
                  {i < FLOW.length - 1 ? <b className="cbv2-os__arrow" aria-hidden="true">&rsaquo;</b> : null}
                </React.Fragment>
              ))}
            </div>
            <p className="cbv2-os__out">Real AI systems running on your workflows</p>
          </div>

          <p className="cbv2-os__foot">
            <SampleBadge />
            <span>
              The rows are the real surfaces and the nine ranks and eleven competencies are the real
              counts. The percentages are illustrative &mdash; your numbers start empty.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
