import React from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import HeroPricingV8 from '../../components/publicV2/HeroPricingV8';
import Icon from '../../components/publicV2/Icon';
import { Claim, canShow } from '../../components/publicV2/Claim';
import {
  PRICING_TIERS,
  PRICING_FAQ,
  SERVICES_PRICING_NOTE,
  SERVICE_SHAPES,
  COMPARE_ROWS,
} from '../../config/v2Pricing';
import './pricingV2.css';
import '../../components/publicV2/heroV8.css';

/**
 * PricingV2 -- the one surface where the full price ladder may render.
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

      {/* ===================== THE THREE SERVICES ===================== */}
      <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-services-title">
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

          <div className="cbv2-shapes">
            {SERVICE_SHAPES.map((s) => (
              <article
                className={`cbv2-shape cbv2-shape--${s.accent}${s.featured ? ' cbv2-shape--featured' : ''}`}
                key={s.key}
              >
                <div className="cbv2-shape__head">
                  <span className="cbv2-icon-tile cbv2-icon-tile--blue">
                    <Icon name={s.icon} size={20} />
                  </span>
                  <span className="cbv2-shape__badge">{s.badge}</span>
                </div>

                <p className="cbv2-shape__verb">
                  {s.verb}
                  <span aria-hidden="true">.</span>
                </p>
                <h3 className="cbv2-shape__promise">{s.promise}</h3>
                <p className="cbv2-shape__blurb">{s.blurb}</p>

                {/* The shape of the deal, never a figure. Figures live in the ladder below. */}
                <div className="cbv2-shape__terms">
                  <p className="cbv2-shape__terms-label">{s.termsLabel}</p>
                  <p className="cbv2-shape__terms-value">{s.terms}</p>
                </div>

                <ul className="cbv2-shape__list">
                  {s.includes.map((i) => (
                    <li key={i}>
                      <Icon name="check" size={16} />
                      <span>{i}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  className={`cbv2-btn ${s.featured ? 'cbv2-btn--primary' : 'cbv2-btn--secondary'} cbv2-shape__cta`}
                  to={s.ctaRoute}
                >
                  {s.ctaLabel}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ======================== SIDE BY SIDE ======================== */}
      <section
        className="cbv2-rv cbv2-section cbv2-section--sunken"
        aria-labelledby="cbv2-compare-title"
      >
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Side by side</p>
            <h2 id="cbv2-compare-title">Which one fits?</h2>
          </div>

          {/* Scrolls inside its own box below ~720px rather than pushing the page sideways. */}
          <div className="cbv2-compare__scroll">
            <table className="cbv2-compare">
              <caption className="cbv2-sr-only">
                Build, Guide and Train compared across eight dimensions
              </caption>
              <thead>
                <tr>
                  <th scope="col">Compare</th>
                  {SERVICE_SHAPES.map((s) => (
                    <th
                      scope="col"
                      key={s.key}
                      className={s.featured ? 'cbv2-compare__hl' : undefined}
                    >
                      {s.verb}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <td>{r.build}</td>
                    <td className="cbv2-compare__hl">{r.guide}</td>
                    <td>{r.train}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ============ THE LADDER: FIGURES, GOVERNED BY THE REGISTRY ============ */}
      <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-tiers-title">
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
                  className={`cbv2-btn ${t.featured ? 'cbv2-btn--primary' : 'cbv2-btn--secondary'} cbv2-tier__cta`}
                  to={t.ctaRoute}
                >
                  {t.ctaLabel}
                </Link>
              </article>
            ))}
          </div>

          {/* Build and Guide are delivered through the five engagements catalogued on
              /services. Naming that relationship here is deliberate: the two pages would
              otherwise appear to disagree about how many things we sell. */}
          <p className="cbv2-note">
            Build and Guide are priced separately:{' '}
            <Claim claimKey="pricing.services" route={ROUTE} />. {SERVICES_PRICING_NOTE}{' '}
            <Link to="/services">See the five engagements they are delivered through</Link>.
          </p>
        </div>
      </section>

      {/* ============================ FAQ ============================ */}
      <section
        className="cbv2-rv cbv2-section cbv2-section--sunken"
        aria-labelledby="cbv2-faq-title"
      >
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Before you ask</p>
            <h2 id="cbv2-faq-title">The questions people actually have</h2>
          </div>
          <dl className="cbv2-faq">
            {PRICING_FAQ.map((f) => (
              <div className="cbv2-faq__item" key={f.q}>
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ============================ CTA ============================ */}
      <section
        className="cbv2-rv cbv2-section cbv2-section--inverse"
        aria-labelledby="cbv2-pricing-cta"
      >
        <div className="cbv2-wrap cbv2-wrap--narrow" style={{ textAlign: 'center' }}>
          <h2 id="cbv2-pricing-cta">
            See AI run on one of your processes, before you commit to anything.
          </h2>
          <p className="cbv2-lede" style={{ marginInline: 'auto' }}>
            Bring one process and two numbers: what it costs you today, and what you need it
            to return. That is how we pick the demo pilot, and how you will judge it.
          </p>
          <div className="cbv2-hero__ctas" style={{ justifyContent: 'center' }}>
            <Link className="cbv2-btn cbv2-btn--primary" to="/contact">
              Book a demo pilot
            </Link>
            <Link className="cbv2-btn cbv2-btn--ghost" to="/try">
              Create a free account
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default PricingV2;
