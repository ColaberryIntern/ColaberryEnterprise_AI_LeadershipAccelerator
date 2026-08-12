import React from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
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
      <SeoV2
        title="Start free"
        description={
          'One free account gives a manager both the learner experience and the ' +
          'organization view. No credit card.'
        }
      />

      <section className="cbv2-pagehero" aria-labelledby="cbv2-try-title">
        <div className="cbv2-wrap cbv2-pagehero__split">
          <div>
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
          {/* The workspace navigation, so the reader recognises where they land. */}
          <figure className="cbv2-shot-frame">
            <img
              className="cbv2-shot"
              src="/site-v2/shot-nav.png"
              alt="The workspace side navigation: Your company, Today, Path, Schedule, Projects, Classroom, Cert Prep and Community."
              width={620}
              height={900}
              loading="lazy"
              decoding="async"
            />
          </figure>
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
          {/*
            The actual banner the workspace shows on arrival. Included because
            this page's claim is "it opens on sample data and says so on screen"
            -- showing the thing is stronger evidence than asserting it, and it
            means the reader recognises the screen when they get there.
          */}
          <figure className="cbv2-shot-frame cbv2-try__proof">
            <img
              className="cbv2-shot"
              src="/site-v2/shot-sample-banner.png"
              alt={
                'The banner shown at the top of the free workspace, reading: Free preview with ' +
                'sample data, shaped to the real metrics we capture. Your free account gives you ' +
                'both the learner experience and this management dashboard, no credit card.'
              }
              width={1340}
              height={200}
              loading="lazy"
              decoding="async"
            />
          </figure>
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
