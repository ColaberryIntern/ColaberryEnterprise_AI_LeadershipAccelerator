import React from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import Icon from '../../components/publicV2/Icon';
import { Claim, canShow } from '../../components/publicV2/Claim';
import { PRICING_TIERS, PRICING_FAQ, SERVICES_PRICING_NOTE } from '../../config/v2Pricing';
import './pricingV2.css';

/**
 * PricingV2 -- the one surface where the full price ladder may render.
 *
 * Every figure resolves through the claims registry. The monthly, team and
 * department figures are approved for '/pricing' ONLY, so declaring that route
 * here is what makes them publishable -- and what keeps them off the homepage.
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
        title="Free to start, licenses when you are ready"
        description={
          'Start free with the whole platform and invite your team free. Activate licenses ' +
          'only when someone is ready to progress rather than evaluate.'
        }
      />

      <section className="cbv2-pagehero" aria-labelledby="cbv2-pricing-title">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow cbv2-eyebrow--onDark">Pricing</p>
          <h1 id="cbv2-pricing-title">Free to start. Licenses only when you are ready.</h1>
          <p className="cbv2-pagehero__lede">
            The whole platform is free to explore, and free for your team to try. You pay when
            someone is ready to progress rather than evaluate.
          </p>
        </div>
      </section>

      <section className="cbv2-rv cbv2-section" aria-label="Pricing tiers">
        <div className="cbv2-wrap">
          <div className="cbv2-tiers">
            {PRICING_TIERS.map((t) => (
              <article
                className={`cbv2-tier${t.featured ? ' cbv2-tier--featured' : ''}`}
                key={t.key}
              >
                <div className="cbv2-tier__head">
                  <span className="cbv2-icon-tile cbv2-icon-tile--blue">
                    <Icon name={t.icon} size={20} />
                  </span>
                  <span className="cbv2-tier__badge">{t.badge}</span>
                </div>

                <h2 className="cbv2-tier__name">{t.name}</h2>

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

          <p className="cbv2-note">
            Engagements are priced separately:{' '}
            <Claim claimKey="pricing.services" route={ROUTE} />. {SERVICES_PRICING_NOTE}{' '}
            <Link to="/v2/services">Compare the five engagements</Link>.
          </p>
        </div>
      </section>

      <section className="cbv2-rv cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-faq-title">
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

      <section className="cbv2-rv cbv2-section cbv2-section--inverse" aria-labelledby="cbv2-pricing-cta">
        <div className="cbv2-wrap cbv2-wrap--narrow" style={{ textAlign: 'center' }}>
          <h2 id="cbv2-pricing-cta">Start on the free tier and decide later.</h2>
          <div className="cbv2-hero__ctas" style={{ justifyContent: 'center' }}>
            <Link className="cbv2-btn cbv2-btn--primary" to="/v2/start">
              Create a free account
            </Link>
            <Link className="cbv2-btn cbv2-btn--ghost" to="/contact">
              Talk to an Architect
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default PricingV2;
