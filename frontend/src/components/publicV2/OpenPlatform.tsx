import React from 'react';
import { Link } from 'react-router-dom';
import { Claim } from './Claim';

/**
 * Section 9 — the closing CTA.
 *
 * The prototype's argument is the right one and survives verification: the
 * cheapest way to evaluate a capability system is to stand inside it. Kept.
 *
 * Two changes from the prototype:
 *  - Its buttons were dead hrefs. These route to the real /start and /services.
 *  - It said "Start with sample data." That is true of what a new workspace
 *    seeds, but this page has spent nine sections arguing that sample data is
 *    the thing to be suspicious of, so the copy says which parts are furnished
 *    and which start empty rather than leaving the reader to find out.
 */

const STEPS = [
  { k: 'Look', d: 'Both experiences, the management view and the one your team works in, on a furnished workspace.' },
  { k: 'Bring one', d: 'A real cost you live with every week. Watch it become requirements, stories and acceptance criteria.' },
  { k: 'Invite', d: 'Add your team when the thing has earned it, not before.' },
];

export default function OpenPlatform(): React.ReactElement {
  return (
    <section className="cbv2-rv cbv2-section cbv2-section--inverse cbv2-cta9" aria-labelledby="cbv2-cta9-title">
      <div className="cbv2-wrap cbv2-cta9__in">
        <p className="cbv2-eyebrow">See it yourself</p>
        <h2 id="cbv2-cta9-title">Don&rsquo;t take our word for it. Open the platform.</h2>
        <p className="cbv2-lede">
          Every claim on this page was written to be checked, which only means anything if checking is
          easy. So the workspace is free, and it opens without a procurement conversation.
        </p>

        <ol className="cbv2-cta9__steps">
          {STEPS.map((s, i) => (
            <li key={s.k}>
              <span className="cbv2-cta9__n" aria-hidden="true">{i + 1}</span>
              <b>{s.k}</b>
              <span>{s.d}</span>
            </li>
          ))}
        </ol>

        <div className="cbv2-cta9__btns">
          <Link className="cbv2-btn cbv2-btn--primary" to="/start">Open my free company workspace</Link>
          <Link className="cbv2-btn cbv2-btn--ghost" to="/services">Have an architect walk me through it</Link>
        </div>

        {/* The registry-gated statement about the free workspace, kept from the
            section this replaced. If its verification lapses it stops rendering,
            which is the entire point of routing it through the registry. */}
        <p className="cbv2-cta9__fine">
          <Claim claimKey="surface.free.workspace" route="/platform" />
        </p>

        <p className="cbv2-cta9__fine">
          The demo project is furnished so there is something to look at on day one. Your people, your
          repositories, your readiness number and every competency score start empty and stay that way
          until real work is verified against them.
        </p>
      </div>
    </section>
  );
}
