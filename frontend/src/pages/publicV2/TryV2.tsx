import React from 'react';
import { Link } from 'react-router-dom';
import SEOHead from '../../components/SEOHead';
import { Claim, canShow } from '../../components/publicV2/Claim';
import { FREE_INCLUDES, ARRIVAL_NOTE, PAID_BOUNDARIES } from '../../config/v2Try';
import './tryV2.css';

/**
 * TryV2 -- the front door to the free workspace.
 *
 * It does not reimplement the workspace. The live one at /try works and already
 * labels its own sample data; this page sets expectations before someone lands
 * there and states where free stops, which V2 said nowhere.
 *
 * Route is declared as '/try' so `pricing.free` resolves. The route scoping in
 * the registry means the individual subscription figure cannot render here.
 */

const ROUTE = '/try';

function TryV2(): React.ReactElement {
  return (
    <>
      <SEOHead
        title="Start free"
        description={
          'One free account gives a manager both the learner experience and the ' +
          'organization view. No credit card.'
        }
      />

      <section className="cbv2-pagehero" aria-labelledby="cbv2-try-title">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow cbv2-eyebrow--onDark">Start free</p>
          <h1 id="cbv2-try-title">See it with your own eyes first</h1>
          {canShow('surface.free.workspace', ROUTE) ? (
            <p className="cbv2-pagehero__lede">
              <Claim claimKey="surface.free.workspace" route={ROUTE} />
            </p>
          ) : null}
          <div className="cbv2-hero__ctas cbv2-try__cta">
            <Link className="cbv2-btn cbv2-btn--primary" to="/try">
              Open the free workspace
            </Link>
            {canShow('pricing.free', ROUTE) ? (
              <span className="cbv2-try__free">
                <Claim claimKey="pricing.free" route={ROUTE} />
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="cbv2-section" aria-labelledby="cbv2-try-includes">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">What you get</p>
            <h2 id="cbv2-try-includes">A working account, not a slide deck</h2>
          </div>
          <div className="cbv2-grid cbv2-grid--3">
            {FREE_INCLUDES.map((f) => (
              <article className="cbv2-card" key={f.title}>
                <h3 className="cbv2-card__title">{f.title}</h3>
                <p className="cbv2-card__body">{f.detail}</p>
              </article>
            ))}
          </div>
          <p className="cbv2-note">{ARRIVAL_NOTE}</p>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-try-paid">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Where free stops</p>
            <h2 id="cbv2-try-paid">The honest boundary</h2>
            <p className="cbv2-lede">
              Two things are paid. Everything above is not.
            </p>
          </div>
          <div className="cbv2-grid cbv2-grid--2">
            {PAID_BOUNDARIES.map((b) => (
              <article className="cbv2-card cbv2-boundary" key={b.title}>
                <h3 className="cbv2-card__title">{b.title}</h3>
                <p className="cbv2-card__body">{b.detail}</p>
                {/* Both are in-app SPA routes; `external` records only that the
                    destination leaves the V2 shell. */}
                <Link className="cbv2-boundary__link" to={b.href}>
                  {b.linkLabel}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--inverse" aria-labelledby="cbv2-try-cta">
        <div className="cbv2-wrap cbv2-wrap--narrow" style={{ textAlign: 'center' }}>
          <h2 id="cbv2-try-cta">Two minutes to see whether this is real.</h2>
          <div className="cbv2-hero__ctas" style={{ justifyContent: 'center' }}>
            <Link className="cbv2-btn cbv2-btn--primary" to="/try">
              Open the free workspace
            </Link>
            <Link className="cbv2-btn cbv2-btn--ghost" to="/v2/lab">
              Map an opportunity instead
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default TryV2;
