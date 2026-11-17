import React from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';

/**
 * The Pricing hero, in the model's light page-hero shape (`.prhero`): breadcrumb,
 * label, headline, lede, then this page's own body, buttons, status chips and
 * proof row.
 *
 * LAYOUT ONLY (2026-11-16, page group 3). Ali's pricing decision (W4) is open,
 * so every word here is the page's existing copy: headline, deck, body, both
 * buttons, the three chips and the proof row. What changed is the shape: the dark
 * v8 hero became the model's light hero, with the model's breadcrumb and
 * "Pricing" label in place of the "Build · Guide · Train" eyebrow. The one edit to
 * a sentence is punctuation: the body's em dash is a comma (house style).
 *
 * Styled by `.cbv2-prhero5` and `.cbv2-prc5` in fidelityV5.css. No diagram, as
 * before: it is in neither design file.
 */

export default function HeroPricingV8(): React.ReactElement {
  return (
    <section className="cbv2-prhero5 cbv2-prc5" aria-labelledby="cbv2-pricing-title">
      <div className="cbv2-wrap">
        <p className="cbv2-crumb5">
          <Link to="/">Home</Link> / Pricing
        </p>
        <p className="cbv2-k5">Pricing</p>

        <h1 id="cbv2-pricing-title">
          Three services. <span className="cbv2-it">Simple terms for each.</span>
        </h1>

        <p className="cbv2-lede cbv2-prc5__deck">
          One commercial shape per service. <b>Agreed in writing before work starts.</b>
        </p>

        <p className="cbv2-prc5__body">
          No license fees disguised as transformation. Every engagement starts the same way,
          with a <b>demo pilot on one of your own processes</b>, so the decision comes after
          you have seen AI run on your real work, not before.
        </p>

        <div className="cbv2-btns5 cbv2-prc5__btns">
          <Link className="cbv2-btn cbv2-btn--primary" to="/contact">
            Book a demo pilot
            <Icon name="arrowRight" size={16} />
          </Link>
          <Link className="cbv2-btn cbv2-btn--line" to="/try">
            Create a free account
          </Link>
        </div>

        <ul className="cbv2-prc5__status">
          <li className="cbv2-prc5__chip"><i /> Processes mapped</li>
          <li className="cbv2-prc5__chip"><i /> Demo pilot running</li>
          <li className="cbv2-prc5__chip"><i /> Return proven</li>
        </ul>

        <p className="cbv2-prc5__proof">
          <span>Built on Claude &amp; Claude Code</span>
          <span>Certification path included</span>
          <span>Three services, one shape each</span>
        </p>
      </div>
    </section>
  );
}
