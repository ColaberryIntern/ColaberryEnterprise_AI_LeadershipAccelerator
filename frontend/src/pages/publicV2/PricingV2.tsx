import React from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import HeroPricingV8 from '../../components/publicV2/HeroPricingV8';
import Icon from '../../components/publicV2/Icon';
import FaqCardsV5 from '../../components/publicV2/FaqCardsV5';
import { RingTick } from '../../components/publicV2/ServiceCardsV5';
import { Claim, canShow } from '../../components/publicV2/Claim';
import {
  PRICING_TIERS,
  PRICING_FAQ,
  SERVICES_PRICING_NOTE,
  SERVICE_SHAPES,
  COMPARE_ROWS,
} from '../../config/v2Pricing';
import './pricingV2.css';

/**
 * PricingV2 -- the one surface where the full price ladder may render.
 *
 * LAYOUT ONLY, 2026-11-16 (page group 3). Ali's pricing decision (W4) is open,
 * so no price, term, plan name or offer wording changed here. The bands took the
 * model's shapes: light page hero, the services as the model's dark price cards,
 * the model's "bring two figures" ask, the shared table, FAQ cards and closing
 * band. Every service and tier keeps its own words and buttons.
 *
 * REBUILT AROUND BUILD / GUIDE / TRAIN, modeled on
 * `docs/enterprise-site-v4/index.html`. The page used to open on a license
 * ladder, which answered "what does a seat cost" before the reader knew what
 * they were buying. v4's order is the one a buyer actually walks: three named
 * services, then the side-by-side that tells them which one they are, then the
 * figures.
 *
 * THE LADDER STAYS, AND DELIBERATELY SO. Every figure still resolves through
 * the claims registry, and `pricing.team` / `pricing.department` are approved
 * for '/pricing' ONLY -- declaring that route here is what makes them
 * publishable. Dropping the ladder to match v4's figure-free layout would have
 * taken approved, governed prices off the site altogether, which is a
 * commercial decision and not one a layout change gets to make quietly. It now
 * sits underneath Train, where it belongs, rather than being the whole page.
 *
 * A tier whose price claim is blocked renders without a figure rather than with
 * a hardcoded fallback. That is deliberate: a page that silently substitutes a
 * number when the governed one is unavailable is worse than one that shows none.
 */

const ROUTE = '/pricing';

function PricingV2(): React.ReactElement {
  return (
    <>
      <SeoV2
        title="Build, Guide or Train: simple terms for each service"
        description={
          'Three ways to move your company to AI with Claude Code. We build you a custom '
          + 'application, we guide your team to automate your workflows, or we train your '
          + 'people. Each has one commercial shape, agreed before work starts.'
        }
      />

      <HeroPricingV8 />

      {/* ============ THE THREE SERVICES: the model's dark price band ============ */}
      <section className="cbv2-section cbv2-ink5" aria-labelledby="cbv2-services-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Three ways to work with us</p>
            <h2 id="cbv2-services-title">Build. Guide. Train.</h2>
            <p className="cbv2-lede">
              All three use Claude Code. Choose by what you need: a custom application built
              for you, workflows your team builds in the systems you already have, or people
              trained to do it themselves.
            </p>
          </div>

          <div className="cbv2-price5">
            {SERVICE_SHAPES.map((s, i) => (
              <article
                className={`cbv2-pr5${s.featured ? ' cbv2-pr5--hl' : ''}`}
                key={s.key}
              >
                <p className="cbv2-k5">
                  {String(i + 1).padStart(2, '0')} &middot; {s.verb}
                </p>
                <h3>{s.termsLabel}</h3>
                {/* The shape of the deal, never a figure. Figures live in the ladder below. */}
                <p className="cbv2-pr5__model">{s.terms}</p>
                <p className="cbv2-pr5__p">
                  <b>{s.promise}</b> {s.blurb}
                </p>
                <ul className="cbv2-pr5__list">
                  {s.includes.map((x) => (
                    <li key={x}>
                      <RingTick />
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
                <p className="cbv2-pr5__row">
                  <span>{s.badge}</span>
                </p>
                <Link
                  className={`cbv2-btn ${s.featured ? 'cbv2-btn--primary' : 'cbv2-btn--line cbv2-btn--onDark'} cbv2-pr5__btn`}
                  to={s.ctaRoute}
                >
                  {s.ctaLabel}
                </Link>
              </article>
            ))}
          </div>

          {/* The model's "ask": what to bring to the first call. It asks for the customer's
              two figures and states none of ours, so it does not touch the open W4 decision. */}
          <div className="cbv2-ask5">
            <div>
              <h3>Bring two figures to the first call.</h3>
              <p>
                What the process costs you today in your people&rsquo;s time, and what you need
                AI to return. That is how we pick the demo pilot, and how you will judge it.
              </p>
            </div>
            <Link className="cbv2-btn cbv2-ask5__btn" to="/demo-pilot">
              Book a demo pilot
              <Icon name="arrowRight" size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ======================== SIDE BY SIDE ======================== */}
      <section className="cbv2-section cbv2-section--soft" aria-labelledby="cbv2-compare-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Side by side</p>
            <h2 id="cbv2-compare-title">Which one fits?</h2>
          </div>

          <div className="cbv2-ctable5">
            <table>
              <caption className="cbv2-sr-only">
                Build, Guide and Train compared across {COMPARE_ROWS.length} dimensions
              </caption>
              <colgroup>
                <col className="cbv2-ctable5__c0" />
                {SERVICE_SHAPES.map((s) => (
                  <col key={s.key} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">
                    <span>Compare</span>
                  </th>
                  {SERVICE_SHAPES.map((s) => (
                    <th scope="col" key={s.key}>
                      {s.verb}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <td data-col="Build">{r.build}</td>
                    <td data-col="Guide">{r.guide}</td>
                    <td data-col="Train">{r.train}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ============ THE LADDER: FIGURES, GOVERNED BY THE REGISTRY ============ */}
      <section className="cbv2-section cbv2-tiers5" aria-labelledby="cbv2-tiers-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Inside Train</p>
            <h2 id="cbv2-tiers-title">Platform licenses, if your people are learning</h2>
            <p className="cbv2-lede">
              Train runs on the platform, so this is what a seat on it costs. Build and Guide
              are scoped engagements and are priced on the call, not here.
            </p>
          </div>

          <div className="cbv2-tiers">
            {PRICING_TIERS.map((t) => (
              <article
                className={`cbv2-tier cbv2-tier--${t.accent}${t.featured ? ' cbv2-tier--featured' : ''}`}
                key={t.key}
              >
                <div className="cbv2-tier__head">
                  <span className="cbv2-icon-tile cbv2-icon-tile--blue">
                    <Icon name={t.icon} size={20} />
                  </span>
                  <span className="cbv2-tier__badge">{t.badge}</span>
                </div>

                <h3 className="cbv2-tier__name">{t.name}</h3>

                {/* The figure comes from the registry or not at all. */}
                {canShow(t.priceClaim, ROUTE) ? (
                  <p className="cbv2-tier__price">
                    <Claim claimKey={t.priceClaim} route={ROUTE} />
                    {t.unit ? <span className="cbv2-tier__unit">{t.unit}</span> : null}
                  </p>
                ) : null}

                {t.secondaryClaim && canShow(t.secondaryClaim, ROUTE) ? (
                  <p className="cbv2-tier__alt">
                    <Claim claimKey={t.secondaryClaim} route={ROUTE} />
                  </p>
                ) : null}

                <p className="cbv2-tier__blurb">{t.blurb}</p>

                <ul className="cbv2-tier__list">
                  {t.includes.map((i) => (
                    <li key={i}>
                      <Icon name="check" size={16} />
                      <span>{i}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  className={`cbv2-btn ${t.featured ? 'cbv2-btn--primary' : 'cbv2-btn--line'} cbv2-tier__cta`}
                  to={t.ctaRoute}
                >
                  {t.ctaLabel}
                </Link>
              </article>
            ))}
          </div>

          {/* Build and Guide are delivered through the three services catalogued on
              /services. Naming that relationship here is deliberate: the two pages would
              otherwise appear to disagree about how many things we sell. */}
          <p className="cbv2-note5">
            Build and Guide are priced separately:{' '}
            <Claim claimKey="pricing.services" route={ROUTE} />. {SERVICES_PRICING_NOTE}{' '}
            <Link to="/services">See the three services they are delivered through</Link>.
          </p>
        </div>
      </section>

      {/* ============================ FAQ ============================ */}
      <section className="cbv2-section cbv2-section--soft" aria-labelledby="cbv2-faq-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Before you ask</p>
            <h2 id="cbv2-faq-title">The questions people actually have</h2>
          </div>
          <FaqCardsV5 items={PRICING_FAQ} />
        </div>
      </section>

      {/* ============================ CTA ============================
          The shared closing band's look (`.cbv2-cta5`), with this page's own words and
          buttons kept while W4 is open: its second button is the page's existing
          "Create a free account", not the shared band's "Start training". */}
      <section className="cbv2-cta5" aria-labelledby="cbv2-pricing-cta">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow cbv2-cta5__k">Start here</p>
          <h2 id="cbv2-pricing-cta" className="cbv2-cta5__h">
            See AI run on one of your processes,{' '}
            <span className="cbv2-it">before you commit to anything.</span>
          </h2>
          <p className="cbv2-cta5__p">
            Bring one process and two numbers: what it costs you today, and what you need it
            to return. That is how we pick the demo pilot, and how you will judge it.
          </p>
          <div className="cbv2-cta5__btns">
            <Link className="cbv2-btn cbv2-btn--primary" to="/contact">
              Book a demo pilot
              <Icon name="arrowRight" size={16} />
            </Link>
            <Link className="cbv2-btn cbv2-btn--line cbv2-btn--onDark" to="/try">
              Create a free account
            </Link>
          </div>
          <p className="cbv2-cta5__fine">Build &middot; Guide &middot; Train, with Claude Code</p>
        </div>
      </section>
    </>
  );
}

export default PricingV2;
