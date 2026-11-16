import React from 'react';
import { Link } from 'react-router-dom';

/**
 * The Platform hero: headline, deck, three status chips, body, two buttons.
 *
 * NO DIAGRAM. Until 2026-11-16 this drew a wired node-and-person diagram that
 * is in neither design file Ali supplied. The home-hero rebuild (#4097)
 * deleted the CSS that drew it, so production showed it as solid black boxes
 * and dots. Removed rather than restyled; the full rebuild to the v5 model
 * (dark hero, product screenshot) is its own page in the delta review.
 *
 * The text parts are styled by the `.cbv2-h8--svc` block in heroV8.css.
 */

export default function HeroPlatformV8(): React.ReactElement {
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
              <span className="cbv2-h8__word cbv2-h8__word--sys">See your company move to AI,</span>
              <span className="cbv2-h8__rail" aria-hidden="true" />
            </span>
            {' '}
            <span className="cbv2-h8__line">
              <span className="cbv2-h8__word cbv2-h8__word--ppl">department by department.</span>
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
            <Link className="cbv2-h8__btn cbv2-h8__btn--ghost" to="/demo-pilot">
              Book a demo pilot
            </Link>
          </div>

          <div className="cbv2-h8__proof">
            <span>Built on Claude &amp; Claude Code</span>
            <span>Certification path included</span>
            <span>Free company workspace</span>
          </div>
        </div>

      </div>
    </section>
  );
}
