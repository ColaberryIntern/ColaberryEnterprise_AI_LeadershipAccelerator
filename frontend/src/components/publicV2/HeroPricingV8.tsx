import React from 'react';
import { Link } from 'react-router-dom';

/**
 * The Pricing hero: headline, deck, three status chips, body, two buttons.
 *
 * NO DIAGRAM. Until 2026-11-16 this drew a wired node-and-person diagram that
 * is in neither design file Ali supplied. The home-hero rebuild (#4097)
 * deleted the CSS that drew it, so production showed it as solid black boxes
 * and dots. Removed rather than restyled. The rest of /pricing waits on Ali's
 * decision about prices (the v5 model shows none); this change touches only
 * the broken hero.
 *
 * The text parts are styled by the `.cbv2-h8--svc` block in heroV8.css.
 */

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
            Build &nbsp;&middot;&nbsp; Guide &nbsp;&middot;&nbsp; Train
          </div>

          <h1 id="cbv2-pricing-title" className="cbv2-h8__h1">
            <span className="cbv2-h8__line">
              <span className="cbv2-h8__word cbv2-h8__word--sys">Three services.</span>
              <span className="cbv2-h8__rail" aria-hidden="true" />
            </span>
            {' '}
            <span className="cbv2-h8__line">
              <span className="cbv2-h8__word cbv2-h8__word--ppl">Simple terms for each.</span>
              <span className="cbv2-h8__rail cbv2-h8__rail--cyan" aria-hidden="true" />
            </span>
          </h1>

          <p className="cbv2-h8__deck">
            One commercial shape per service. <b>Agreed in writing before work starts.</b>
          </p>

          <ul className="cbv2-h8__status">
            <li className="cbv2-h8__chip"><i /> Processes mapped</li>
            <li className="cbv2-h8__chip"><i /> Demo pilot running</li>
            <li className="cbv2-h8__chip"><i /> Return proven</li>
          </ul>

          <p className="cbv2-h8__body">
            No license fees disguised as transformation. Every engagement starts the same way,
            with a <b>demo pilot on one of your own processes</b> &mdash; so the decision comes
            after you have seen AI run on your real work, not before.
          </p>

          <div className="cbv2-h8__cta">
            <Link className="cbv2-h8__btn cbv2-h8__btn--primary" to="/contact">
              Book a demo pilot
            </Link>
            <Link className="cbv2-h8__btn cbv2-h8__btn--ghost" to="/try">
              Create a free account
            </Link>
          </div>

          <div className="cbv2-h8__proof">
            <span>Built on Claude &amp; Claude Code</span>
            <span>Certification path included</span>
            <span>Three services, one shape each</span>
          </div>
        </div>

      </div>
    </section>
  );
}
