import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import Icon from '../../components/publicV2/Icon';
import { Claim } from '../../components/publicV2/Claim';
import { SERVICE_SHAPES, COMPARE_ROWS } from '../../config/v2Pricing';
import { SERVICE_PAGES, getServicePage, LEGACY_SERVICE_REDIRECTS } from '../../config/v2ServicePages';
import './servicesV2.css';
/*
   The offer-shape cards and the comparison table are shared with /pricing rather
   than reimplemented here. Importing that page's stylesheet is deliberate: the
   two pages describe the same three services, and giving each its own copy of
   `.cbv2-shape*` is how they drift into two different offers. /pricing itself is
   untouched by this change -- the import adds a stylesheet, it does not alter one.
*/
import './pricingV2.css';
import '../../components/publicV2/heroV8.css';

/**
 * ServicesV2 / ServiceDetailV2 — three services: Build, Guide, Train.
 *
 * WHAT CHANGED, AND WHY. This page used to list five productized engagements,
 * opening on the outcome question "What outcome do you need next?". The outcome
 * framing was right and is kept; the five names were not. A buyer experiences
 * three choices -- have it built, be guided while your team builds, or be
 * trained -- and five offer names made the chooser do the work the sales call
 * should do. The v5 site model (docs/enterprise-site-v5/) collapses them, and
 * this is that collapse.
 *
 * The five old slugs are NOT deleted. `/services/:slug` redirects each of them
 * to the service that absorbed it (LEGACY_SERVICE_REDIRECTS), so inbound links,
 * bookmarks and search results keep working.
 *
 * NO PRICES ANYWHERE, unchanged from before. Services pricing is "scoped on a
 * call" per the 2026-08-07 decision, and a test asserts no currency figure
 * renders on this page or any detail page. That is also why Train's terms read
 * "a free account" here rather than the model's "$0 to get started": same
 * meaning, and it matches what COMPARE_ROWS already says on /pricing.
 */

const ROUTE = '/services';

/**
 * The chooser's three questions, from the v5 model.
 *
 * Each one is about choosing BETWEEN the services, which is why they live here
 * and not on a service page: "can we combine them", "is Build off the shelf",
 * "does Guide add a tool". None of them states a figure, a duration or a term,
 * so none needs a registry claim.
 */
const CHOOSER_FAQS: readonly { q: string; a: string }[] = [
  {
    q: 'Can we combine services?',
    a:
      'Yes. For example, Build for a custom application while your people go through Train ' +
      'or Guide to automate the workflows around it.',
  },
  {
    q: 'Is Build an off-the-shelf product?',
    a:
      'No. It is custom made and custom designed with your business experts, around how ' +
      'your company and your industry actually work.',
  },
  {
    q: 'Will Guide add another tool to our stack?',
    a:
      'No. Your team builds workflows that run locally in your own environment and work ' +
      'with the systems you already have: your ERP, CRM, email, drives and chat.',
  },
];


export function ServicesV2(): React.ReactElement {
  return (
    <>
      <SeoV2
        title="Build. Guide. Train."
        description={
          'Three ways to move your company to AI with Claude Code: we build you a custom ' +
          'application, we guide your team to automate your workflows, or we train your ' +
          'people into Forward Deployed Engineers.'
        }
      />

      <section className="cbv2-pagehero" aria-labelledby="cbv2-svc-title">
        <div className="cbv2-wrap">
          <p className="cbv2-breadcrumb">
            <Link to="/">Home</Link> / Services
          </p>
          <p className="cbv2-eyebrow cbv2-eyebrow--onDark">Services</p>
          <h1 id="cbv2-svc-title">Build. Guide. Train.</h1>
          <p className="cbv2-pagehero__lede">
            Three ways to move your company to AI with Claude Code. We build you a custom
            application, we guide your team to automate your workflows, or we train your
            people, department by department, or company-wide.
          </p>
          <p style={{ marginTop: 'var(--space-6)' }}>
            <Link className="cbv2-btn cbv2-btn--primary" to="/demo-pilot">
              Book a demo pilot
            </Link>
          </p>
        </div>
      </section>

      {/*
          THE DEMO-PILOT BAND CAME OFF THIS PAGE.

          It sat above the three cards so a visitor who did not yet know which
          service they wanted still had a correct first step. The model has no
          equivalent band on the chooser, and the fact it carried has not left
          the page: "Starts with: Demo pilot / Demo pilot / A free account" is a
          row in the comparison table below, and the closing band the model does
          have offers the pilot directly.
      */}
      <section className="cbv2-section" aria-labelledby="cbv2-three-h">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow">Choose by what you need</p>
          <h2 id="cbv2-three-h">Three services. One question each.</h2>

          <div className="cbv2-shapes">
            {SERVICE_SHAPES.map((s, i) => (
              <article
                className={`cbv2-shape${s.featured ? ' cbv2-shape--featured' : ''}`}
                key={s.key}
              >
                <div className="cbv2-shape__head">
                  <span className="cbv2-shape__badge">
                    {String(i + 1).padStart(2, '0')} &middot; {s.badge}
                  </span>
                  <h3 className="cbv2-shape__verb">
                    <Link to={`/services/${s.key}`}>{s.verb}.</Link>
                  </h3>
                </div>
                <p className="cbv2-shape__promise">{s.promise}</p>
                <p className="cbv2-shape__blurb">{s.blurb}</p>
                <div className="cbv2-shape__terms">
                  <p className="cbv2-shape__terms-label">{s.termsLabel}</p>
                  <p className="cbv2-shape__terms-value">{s.terms}</p>
                </div>
                <ul className="cbv2-shape__list">
                  {s.includes.map((inc) => (
                    <li key={inc}>
                      <span aria-hidden="true">&#10003;</span>
                      {inc}
                    </li>
                  ))}
                </ul>
                <p className="cbv2-shape__cta">
                  <Link
                    className="cbv2-btn cbv2-btn--primary cbv2-btn--sm"
                    to={`/services/${s.key}`}
                  >
                    See {s.verb}
                  </Link>
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-cmp-h">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow">Side by side</p>
          <h2 id="cbv2-cmp-h">Which one fits?</h2>
          <div className="cbv2-compare__scroll">
            <table className="cbv2-compare">
              <caption className="cbv2-sr-only">
                The three services compared across {COMPARE_ROWS.length} dimensions.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Compare</th>
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
                    <td>{r.build}</td>
                    <td>{r.guide}</td>
                    <td>{r.train}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="cbv2-note">
            Engagement pricing is <Claim claimKey="pricing.services" route={ROUTE} />, so the
            scope is agreed with a person who can qualify the work, rather than anchored on a
            number before anyone has seen your systems.
          </p>
        </div>
      </section>

      {/*
          THE CHOOSER'S OWN FAQ, which the model has and this page did not.

          It is not a duplicate of the three service pages' "Before you ask."
          Those answer questions about one service; these three are the
          questions a visitor has while still deciding BETWEEN them, which is
          the only thing this page is for.
      */}
      <section className="cbv2-section" aria-labelledby="cbv2-svc-faq">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow">Questions</p>
          <h2 id="cbv2-svc-faq">Common questions.</h2>
          <dl className="cbv2-faq">
            {CHOOSER_FAQS.map((f) => (
              <div className="cbv2-faq__item" key={f.q}>
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/*
          THE CLOSING BAND. Every page in the model ends on this one, and the
          chooser was the page that ended on a pricing footnote instead. It
          links /demo-pilot directly rather than /contact, which only resolves
          because a redirect route catches it.
      */}
      <section
        className="cbv2-rv cbv2-section cbv2-section--inverse"
        aria-labelledby="cbv2-svc-cta"
      >
        <div className="cbv2-wrap cbv2-wrap--narrow" style={{ textAlign: 'center' }}>
          <h2 id="cbv2-svc-cta">
            See AI run on one of your processes, before you commit to anything.
          </h2>
          <p className="cbv2-lede" style={{ marginInline: 'auto' }}>
            Bring one process and two numbers: what it costs you today, and what you need it
            to return. We will show you the demo pilot that proves it.
          </p>
          <div className="cbv2-hero__ctas" style={{ justifyContent: 'center' }}>
            <Link className="cbv2-btn cbv2-btn--primary" to="/demo-pilot">
              Book a demo pilot
            </Link>
            {/*
              The model labels this one "Start training free". That word is
              barred on this site by 40 TAC 807.172(d) and the copy ratchet
              caught it on the way in, which is what the ratchet is for. The
              destination is the company workspace, so the button says so.
            */}
            <Link className="cbv2-btn cbv2-btn--ghost" to="/try">
              Open a company workspace
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export function ServiceDetailV2(): React.ReactElement {
  const { slug } = useParams<{ slug: string }>();

  /*
      A retired slug resolves before anything renders. `replace` keeps the dead
      URL out of the visitor's back button, so pressing back from Build does not
      bounce them through /services/claude-production-pilot again.
  */
  const redirectTo = slug ? LEGACY_SERVICE_REDIRECTS[slug] : undefined;
  if (redirectTo) {
    return <Navigate to={`/services/${redirectTo}`} replace />;
  }

  const page = slug ? getServicePage(slug) : undefined;
  const shape = page ? SERVICE_SHAPES.find((s) => s.key === page.slug) : undefined;

  if (!page || !shape) {
    return (
      <section className="cbv2-section">
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <h1>Service not found</h1>
          <p className="cbv2-lede" style={{ marginTop: 'var(--space-4)' }}>
            That service does not exist. See all three services instead.
          </p>
          <p style={{ marginTop: 'var(--space-6)' }}>
            <Link className="cbv2-btn cbv2-btn--primary" to="/services">
              All services
            </Link>
          </p>
        </div>
      </section>
    );
  }

  const others = SERVICE_PAGES.filter((s) => s.slug !== page.slug);

  return (
    <>
      <SeoV2 title={`${page.verb}. ${page.promise}`} description={page.lede} />

      <section className="cbv2-pagehero" aria-labelledby="cbv2-svcd-title">
        <div className="cbv2-wrap cbv2-pagehero__split">
          <div>
            <p className="cbv2-breadcrumb">
              <Link to="/services">Services</Link> / {page.verb}
            </p>
            <p className="cbv2-eyebrow cbv2-eyebrow--onDark">{shape.badge}</p>
            <h1 id="cbv2-svcd-title">{page.verb}.</h1>
            <p className="cbv2-pagehero__lede">{page.promise}</p>
            <p style={{ marginTop: 'var(--space-5)' }}>
              <Link className="cbv2-btn cbv2-btn--primary" to={page.ctaRoute}>
                {page.ctaLabel}
              </Link>
            </p>
          </div>
          <figure className="cbv2-svcd__photo">
            <img
              src={page.photo.src}
              alt={page.photo.alt}
              width={1280}
              height={960}
              loading="eager"
              decoding="async"
            />
          </figure>
        </div>
      </section>

      {/* The commercial shape, read from SERVICE_SHAPES so it cannot disagree
          with /pricing. Terms only -- never a figure. */}
      <section className="cbv2-section" aria-labelledby="cbv2-svcd-what">
        <div className="cbv2-wrap">
          <div className="cbv2-shape cbv2-shape--wide">
            <div className="cbv2-shape__terms">
              <p className="cbv2-shape__terms-label">{shape.termsLabel}</p>
              <p className="cbv2-shape__terms-value">{shape.terms}</p>
            </div>
            <ul className="cbv2-shape__list">
              {shape.includes.map((inc) => (
                <li key={inc}>
                  <span aria-hidden="true">&#10003;</span>
                  {inc}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ marginTop: 'var(--space-8)' }}>
            <p className="cbv2-eyebrow">What it is</p>
            <h2 id="cbv2-svcd-what">{page.promise}</h2>
            <p className="cbv2-lede">{page.lede}</p>
          </div>

          <div className="cbv2-field" style={{ marginTop: 'var(--space-6)' }}>
            <h3>Choose {page.verb} when</h3>
            <p>{page.chooseWhen}</p>
          </div>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-svcd-inc">
        <div className="cbv2-wrap">
          <h2 id="cbv2-svcd-inc">What is included</h2>
          <ul className="cbv2-inclusions">
            {page.includes.map((inc) => (
              <li className="cbv2-inclusion" key={inc.title}>
                <span className="cbv2-icon-tile cbv2-icon-tile--blue">
                  <Icon name={page.icon} size={20} />
                </span>
                <h3>{inc.title}</h3>
                <p>{inc.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="cbv2-section" aria-labelledby="cbv2-svcd-steps">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow">{page.stepsEyebrow}</p>
          <h2 id="cbv2-svcd-steps">{page.stepsHeading}</h2>
          <ol className="cbv2-pilot">
            {page.steps.map((st) => (
              <li className="cbv2-pilot__step" key={st.n + st.title}>
                <span className="cbv2-pilot__n" aria-hidden="true">
                  {st.n}
                </span>
                <div>
                  <h3 className="cbv2-pilot__title">{st.title}</h3>
                  <p className="cbv2-pilot__body">{st.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-svcd-isnot">
        <div className="cbv2-wrap cbv2-grid cbv2-grid--2">
          <div className="cbv2-field">
            <h3 id="cbv2-svcd-isnot">{page.isNotHeading}</h3>
            <ul className="cbv2-svc__dlv cbv2-svc__dlv--neg">
              {page.isNot.map((n) => (
                <li key={n}>
                  <span aria-hidden="true">&times;</span>
                  {n}
                </li>
              ))}
            </ul>
          </div>
          <div className="cbv2-field">
            <h3>{page.isHeading}</h3>
            <ul className="cbv2-svc__dlv">
              {page.isIt.map((n) => (
                <li key={n}>
                  <span aria-hidden="true">&#10003;</span>
                  {n}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="cbv2-section" aria-labelledby="cbv2-svcd-faq">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow">Questions</p>
          <h2 id="cbv2-svcd-faq">Before you ask.</h2>
          <dl className="cbv2-faq">
            {page.faqs.map((f) => (
              <div className="cbv2-faq__item" key={f.q}>
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </dl>

          <div style={{ marginTop: 'var(--space-8)' }}>
            <h3>The other two services</h3>
            <ul className="cbv2-otherservices">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link to={`/services/${o.slug}`}>
                    <strong>{o.verb}.</strong> {o.promise}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/services">Compare all three side by side</Link>
              </li>
            </ul>
          </div>

          <p className="cbv2-note">
            Pricing for this service is <Claim claimKey="pricing.services" route={ROUTE} />.
          </p>
        </div>
      </section>
    </>
  );
}

export default ServicesV2;
