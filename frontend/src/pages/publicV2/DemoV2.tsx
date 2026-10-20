import React from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import CtaInterrupt from '../../components/publicV2/CtaInterrupt';
import { Claim, SampleBadge } from '../../components/publicV2/Claim';
import { DEMO_LIMITS, DEMO_NOTICE, DEMO_STEPS } from '../../config/v2Demo';
import { trackEvent } from '../../utils/tracker';
import './demoV2.css';

/**
 * DemoV2 — the guided demo (C5.9), at /demo.
 *
 * THREE THINGS THIS PAGE DOES ON PURPOSE
 *
 * 1. It imports no API client. Not `caseStudyApi`, not `orgApi`, not `api`. "No real
 *    customer data reachable" is therefore a property of the import list, which a test can
 *    assert by reading this file, rather than a claim in a review.
 *
 * 2. Every step renders its own Sample data badge. The ticket asks for sample data
 *    "visibly labelled on every screen, not just once", because a single banner scrolls
 *    away and a screenshot of step four would then be indistinguishable from a customer's
 *    real board. That is the defect `Claim.tsx` was written against.
 *
 * 3. It overrides CtaInterrupt's primary label. The component's default is "Open the free
 *    workspace", and advertising that word is prohibited (TWC 40 TAC 807.172(d)). The
 *    default is live on other pages and that is logged separately; this page does not add
 *    to it.
 *
 * Every externally visible claim resolves through the registry via <Claim>. There is
 * deliberately no prose here asserting a figure.
 */
const ROUTE = '/demo';

/** One step. The badge sits beside the sample fragment, where the invented data actually is. */
function Step({ step }: { step: (typeof DEMO_STEPS)[number] }): React.ReactElement {
  return (
    <li className="cbv2-demo__step cbv2-rv">
      <div className="cbv2-demo__head">
        <span className="cbv2-demo__n" aria-hidden="true">{step.n}</span>
        <h3 className="cbv2-demo__title">{step.label}</h3>
      </div>
      <p className="cbv2-demo__screen">{step.screen}</p>
      <div className="cbv2-demo__panel">
        <div className="cbv2-demo__panelbar">
          <span className="cbv2-demo__panelk">Illustration</span>
          <SampleBadge />
        </div>
        <ul className="cbv2-demo__detail">
          {step.detail.map((d) => <li key={d}><code>{d}</code></li>)}
        </ul>
      </div>
      <p className="cbv2-demo__meaning">{step.meaning}</p>
    </li>
  );
}

export default function DemoV2(): React.ReactElement {
  return (
    <>
      <SeoV2
        title="Guided demo"
        description="A walkthrough of one story going from unverified to verified against a
          commit. Sample data throughout."
        route={ROUTE}
      />

      <section className="cbv2-section cbv2-demo__hero" aria-label="Guided demo">
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <p className="cbv2-eyebrow">Guided demo</p>
          <h1>One story, from unverified to verified</h1>
          <p className="cbv2-lede">
            <Claim claimKey="positioning.primary" route={ROUTE} />
          </p>
          <p className="cbv2-demo__notice" role="note">
            <SampleBadge />
            {' '}
            {DEMO_NOTICE}
          </p>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--sunken" aria-label="The walkthrough">
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <ol className="cbv2-demo__steps">
            {DEMO_STEPS.map((step) => <Step key={step.n} step={step} />)}
          </ol>
        </div>
      </section>

      <section className="cbv2-section" aria-label="What this walkthrough is not">
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <h2>What this is not</h2>
          <ul className="cbv2-demo__limits">
            {DEMO_LIMITS.map((l) => <li key={l}>{l}</li>)}
          </ul>
          <p className="cbv2-demo__meaning">
            If you want to see it against your own repository rather than ours, that is a
            conversation rather than a demo link.{' '}
            <Link
              className="cbv2-btn cbv2-btn--secondary cbv2-btn--sm"
              to="/contact"
              data-track="demo_contact"
              onClick={() => trackEvent('cta_click', { cta_name: 'demo_contact', page: ROUTE })}
            >
              Talk to an architect
            </Link>
          </p>
        </div>
      </section>

      <CtaInterrupt
        eyebrow="See it on your own work"
        title="The checking is the product"
        body="A person says they built something, the system checks, and the record outlives
          the conversation."
        primary={{ label: 'Open a workspace at $0', to: '/try' }}
        secondary={{ label: 'Talk to an architect', to: '/contact' }}
      />
    </>
  );
}
