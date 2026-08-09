import React from 'react';
import { Link, useParams } from 'react-router-dom';
import SEOHead from '../../components/SEOHead';
import { Claim } from '../../components/publicV2/Claim';
import { SERVICE_DETAILS, getServiceBySlug } from '../../config/v2Services';
import './servicesV2.css';

/**
 * ServicesV2 / ServiceDetailV2 — the five productized engagements.
 *
 * Decision-first: the page opens with the outcome question rather than a list of
 * offer names, because a buyer knows the outcome they need before they know what
 * the industry calls it.
 *
 * NO PRICES ANYWHERE. Services pricing is "scoped on a call" per the 2026-08-07
 * decision, and a test asserts no currency figure renders on either page. That
 * also matches what independent review scored well: a named tier with the price
 * behind a conversation beats a number that a prospect can anchor on.
 */

const ROUTE = '/services';

export function ServicesV2(): React.ReactElement {
  return (
    <>
      <SEOHead
        title="What outcome do you need next?"
        description={
          'Five productized engagements: opportunity and readiness, a Claude production ' +
          'pilot, enterprise build and modernization, the workforce architect accelerator, ' +
          'and embedded architecture and AI operations.'
        }
      />

      <section className="cbv2-pagehero" aria-labelledby="cbv2-svc-title">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow cbv2-eyebrow--onDark">Services</p>
          <h1 id="cbv2-svc-title">What outcome do you need next?</h1>
          <p className="cbv2-pagehero__lede">
            Five productized engagements. Pick by the outcome you need, not by what the
            industry calls it.
          </p>
        </div>
      </section>

      <section className="cbv2-section" aria-label="All services">
        <div className="cbv2-wrap cbv2-svc-list">
          {SERVICE_DETAILS.map((s, i) => (
            <article className={`cbv2-svc${i % 2 === 1 ? ' cbv2-svc--flip' : ''}`} key={s.slug}>
              <div className="cbv2-svc__copy">
                <p className="cbv2-eyebrow">Service {s.number}</p>
                <h2 className="cbv2-svc__name">
                  <Link to={`/v2/services/${s.slug}`}>{s.name}</Link>
                </h2>
                <p className="cbv2-lede">{s.happens}</p>
                <div className="cbv2-field" style={{ marginTop: 'var(--space-5)' }}>
                  <h3>Best fit</h3>
                  <p>{s.bestFit}</p>
                </div>
                <div className="cbv2-field" style={{ marginTop: 'var(--space-4)' }}>
                  <h3>Typical trigger</h3>
                  <p>{s.trigger}</p>
                </div>
                <p style={{ marginTop: 'var(--space-6)' }}>
                  <Link className="cbv2-btn cbv2-btn--primary cbv2-btn--sm" to={`/v2/services/${s.slug}`}>
                    See what this includes
                  </Link>
                </p>
              </div>

              <div className="cbv2-svc__panel">
                <div className="cbv2-card">
                  <h3 className="cbv2-svc__dlv-head">Deliverables</h3>
                  <ul className="cbv2-svc__dlv">
                    {s.deliverables.map((d) => (
                      <li key={d}>
                        <span aria-hidden="true">&#10003;</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                  <div className="cbv2-field" style={{ marginTop: 'var(--space-5)' }}>
                    <h3>Proof required</h3>
                    <p>{s.proof}</p>
                  </div>
                </div>
              </div>
            </article>
          ))}

          <p className="cbv2-note">
            Engagement pricing is <Claim claimKey="pricing.services" route={ROUTE} /> &mdash; so the
            scope is agreed with a person who can qualify the work, rather than anchored on a
            number before anyone has seen your systems.
          </p>
        </div>
      </section>
    </>
  );
}

export function ServiceDetailV2(): React.ReactElement {
  const { slug } = useParams<{ slug: string }>();
  const service = slug ? getServiceBySlug(slug) : undefined;

  if (!service) {
    return (
      <section className="cbv2-section">
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <h1>Service not found</h1>
          <p className="cbv2-lede" style={{ marginTop: 'var(--space-4)' }}>
            That engagement does not exist. See all five services instead.
          </p>
          <p style={{ marginTop: 'var(--space-6)' }}>
            <Link className="cbv2-btn cbv2-btn--primary" to="/v2/services">
              All services
            </Link>
          </p>
        </div>
      </section>
    );
  }

  return (
    <>
      <SEOHead title={service.name} description={service.happens} />

      <section className="cbv2-pagehero" aria-labelledby="cbv2-svcd-title">
        <div className="cbv2-wrap">
          <p className="cbv2-breadcrumb">
            <Link to="/v2/services">Services</Link> / {service.name}
          </p>
          <p className="cbv2-eyebrow cbv2-eyebrow--onDark">Service {service.number}</p>
          <h1 id="cbv2-svcd-title">{service.name}</h1>
          <p className="cbv2-pagehero__lede">{service.happens}</p>
        </div>
      </section>

      <section className="cbv2-section">
        <div className="cbv2-wrap cbv2-grid cbv2-grid--2">
          <div className="cbv2-field">
            <h3>Best fit</h3>
            <p>{service.bestFit}</p>
          </div>
          <div className="cbv2-field">
            <h3>Typical trigger</h3>
            <p>{service.trigger}</p>
          </div>
        </div>

        <div className="cbv2-wrap" style={{ marginTop: 'var(--space-8)' }}>
          <div className="cbv2-card">
            <h2 className="cbv2-svc__dlv-head">Deliverables</h2>
            <ul className="cbv2-svc__dlv cbv2-svc__dlv--wide">
              {service.deliverables.map((d) => (
                <li key={d}>
                  <span aria-hidden="true">&#10003;</span>
                  {d}
                </li>
              ))}
            </ul>
          </div>

          <div className="cbv2-grid cbv2-grid--2" style={{ marginTop: 'var(--space-6)' }}>
            <div className="cbv2-field">
              <h3>Proof required</h3>
              <p>{service.proof}</p>
            </div>
            <div className="cbv2-field">
              <h3>Next step</h3>
              <p>{service.nextStep}</p>
              <p style={{ marginTop: 'var(--space-3)' }}>
                <Link className="cbv2-btn cbv2-btn--primary cbv2-btn--sm" to={service.nextRoute}>
                  Take this step
                </Link>
              </p>
            </div>
          </div>

          <p className="cbv2-note">
            Pricing for this engagement is{' '}
            <Claim claimKey="pricing.services" route={ROUTE} />.
          </p>
        </div>
      </section>
    </>
  );
}

export default ServicesV2;
