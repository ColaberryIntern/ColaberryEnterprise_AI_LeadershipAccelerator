import React from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import { Claim } from '../../components/publicV2/Claim';
import { JOURNEY } from '../../config/v2Journey';
import { trackEvent } from '../../utils/tracker';
import './journeyV2.css';

/**
 * HowItWorksV2 - the five-stage model, at /how-it-works.
 *
 * C5.1 put this band on the homepage as five words and gave the mechanism its own page,
 * for "a reader who believes the promise and wants the mechanism". Segment-neutral on
 * purpose: the same five stages serve all five audiences, which is the argument for having
 * one of these rather than five.
 *
 * THE DELIVERY LABEL IS THE HONEST PART. The C2.2 capability audit found two of these
 * stages have no platform capability behind them, both at day 80 to 90. Each stage says
 * which it is. Both tickets in this group say "never describe roadmap as live", and the
 * cheapest way to comply is to stop treating the distinction as something to hide: a stage
 * a person delivers is not a lesser stage, and saying so is more credible than implying
 * software does everything.
 */

const ROUTE = '/how-it-works';

export default function HowItWorksV2(): React.ReactElement {
  const onEnquire = () => {
    trackEvent('cta_click', { cta_name: 'how_it_works_enquiry', page: ROUTE });
  };

  return (
    <>
      <SeoV2
        title="How it works: learn, build, prove, deploy, manage"
        description={
          'Five stages from a business problem to working software, with proof of what each '
          + 'person built that anyone can check without an account.'
        }
        route={ROUTE}
      />

      <section className="cbv2-section" aria-labelledby="cbv2-how-title">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow">How it works</p>
          <h1 id="cbv2-how-title" className="cbv2-jy__lede">
            Five stages, from a problem you name to software your people built.
          </h1>
          <p className="cbv2-jy__claim"><Claim claimKey="positioning.primary" route={ROUTE} /></p>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--sunken" aria-label="The five stages">
        <div className="cbv2-wrap">
          <ol className="cbv2-jy__stages">
            {JOURNEY.map((s, i) => (
              <li className="cbv2-jy__stage" key={s.key}>
                <span className="cbv2-jy__n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <div className="cbv2-jy__body">
                  <h2>
                    {s.name}
                    <span
                      className={`cbv2-jy__by cbv2-jy__by--${s.delivery}`}
                      /* Text, never colour alone: the label has to survive greyscale. */
                    >
                      {s.delivery === 'platform' ? 'the platform does this' : 'our team does this'}
                    </span>
                  </h2>
                  <p>{s.summary}</p>
                  <p className="cbv2-jy__out"><strong>You get:</strong> {s.output}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="cbv2-jy__note">
            Two of the five are delivered by people rather than by software, and they say so.
            We would rather tell you that now than have you find it in week ten.
          </p>
        </div>
      </section>

      <section className="cbv2-section" aria-label="See the evidence">
        <div className="cbv2-wrap">
          <h2>The third stage is the one worth checking</h2>
          <p className="cbv2-jy__proof">
            Proof is the stage everything else rests on, and it is the one you can test
            before you buy anything. Open a published record and follow it to the commit.
          </p>
          <p>
            <Link to="/proof" className="cbv2-jy__link">See the published records</Link>
          </p>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--inverse" aria-label="Talk to us">
        <div className="cbv2-wrap cbv2-jy__cta">
          <Link
            to="/contact?source=how-it-works"
            onClick={onEnquire}
            className="cbv2-jy__btn"
            data-track="how_it_works_enquiry"
          >
            Talk to us about your problems
          </Link>
        </div>
      </section>
    </>
  );
}
