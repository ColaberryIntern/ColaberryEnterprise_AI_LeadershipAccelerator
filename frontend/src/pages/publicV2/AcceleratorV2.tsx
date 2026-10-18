import React from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import { Claim } from '../../components/publicV2/Claim';
import { OFFER, OFFER_NEEDS, JOURNEY } from '../../config/v2Journey';
import { trackEvent } from '../../utils/tracker';
import './journeyV2.css';

/**
 * AcceleratorV2 - the flagship offer, at /accelerator.
 *
 * NO DURATION IS WRITTEN IN THIS FILE, and that is deliberate rather than an omission. The
 * ticket is called "90-Day Accelerator" and the C2.2 blueprint is a ninety-day one, but the
 * only verified duration in the C0.6 registry is `program.duration`, whose public wording
 * is "12 weeks". CLM-029 says a figure without a source row does not go out, so the page
 * renders the registry's claim and nothing else. A test asserts "90 day" never appears.
 *
 * NO PRICE EITHER, following ServicesV2 and the same reasoning as the higher-education
 * page: C2.3's numbers are approved but have no registry row, and the registry is the gate
 * for anything externally visible.
 *
 * WHAT IS NOT ON THIS PAGE. Demo Day. The C2.2 audit says it "has schema but has never been
 * run end to end" and instructs plainly: "Do not describe it to a customer as proven." Its
 * task set stands at zero of forty-six. A flagship-offer page is exactly where that would
 * have slipped in, so a test looks for it.
 */

const ROUTE = '/accelerator';

export default function AcceleratorV2(): React.ReactElement {
  const onEnquire = () => {
    trackEvent('cta_click', { cta_name: 'accelerator_enquiry', page: ROUTE });
  };

  return (
    <>
      <SeoV2
        title="The AI Systems Architect Accelerator"
        description={
          'Your people build working AI systems against your own business problems, and you '
          + 'get proof of what each person built, verified against the code they wrote.'
        }
        route={ROUTE}
      />

      <section className="cbv2-section" aria-labelledby="cbv2-acc-title">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow">
            The accelerator &middot; <Claim claimKey="program.duration" route={ROUTE} />
          </p>
          <h1 id="cbv2-acc-title" className="cbv2-jy__lede">
            Your people learn to build with AI, and you get proof of what each one built.
          </h1>
          <p className="cbv2-jy__claim"><Claim claimKey="positioning.primary" route={ROUTE} /></p>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--sunken" aria-label="What you get">
        <div className="cbv2-wrap">
          <div className="cbv2-jy__grid">
            {OFFER.map((o) => (
              <article className="cbv2-jy__card" key={o.h}>
                <h2>{o.h}</h2>
                <p>{o.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cbv2-section" aria-label="The five stages">
        <div className="cbv2-wrap">
          <h2>What the engagement actually runs</h2>
          <ol className="cbv2-jy__inline">
            {JOURNEY.map((s) => <li key={s.key}>{s.name}</li>)}
          </ol>
          <p>
            <Link to="/how-it-works" className="cbv2-jy__link">
              How each stage works, including the two our team delivers rather than the
              platform
            </Link>
          </p>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--sunken" aria-label="What we need from you">
        <div className="cbv2-wrap">
          <h2>What we need from you</h2>
          <p className="cbv2-jy__proof">
            Pilots fail on missing inputs far more often than on delivery, so these are
            agreed before the clock starts rather than chased during week one.
          </p>
          <ul className="cbv2-jy__needs">
            {OFFER_NEEDS.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--inverse" aria-label="Talk to us">
        <div className="cbv2-wrap cbv2-jy__cta">
          <Link
            to="/contact?source=accelerator"
            onClick={onEnquire}
            className="cbv2-jy__btn"
            data-track="accelerator_enquiry"
          >
            Talk to us about a cohort
          </Link>
        </div>
      </section>
    </>
  );
}
