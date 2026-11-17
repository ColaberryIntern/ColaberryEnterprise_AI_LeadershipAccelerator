import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import Icon from '../../components/publicV2/Icon';
import ModelGlyph from '../../components/publicV2/ModelGlyph';
import ServiceCardsV5, { RingTick } from '../../components/publicV2/ServiceCardsV5';
import ClosingCtaV5 from '../../components/publicV2/ClosingCtaV5';
import { Claim } from '../../components/publicV2/Claim';
import { SERVICE_SHAPES, COMPARE_ROWS } from '../../config/v2Pricing';
import type { CompareRow } from '../../config/v2Pricing';
import {
  SERVICE_PAGES,
  getServicePage,
  LEGACY_SERVICE_REDIRECTS,
} from '../../config/v2ServicePages';
import type { ServiceContrastSide, ServicePage } from '../../config/v2ServicePages';
import ServiceVisualV5 from './ServiceVisualsV5';
import './servicesV2.css';

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
 * MODEL FIDELITY (2026-11-16). Both pages are now drawn as Ali's site model draws
 * them, measured part by part (the fidelity audit): the light chooser hero with the
 * giant "Build. Guide. Train." and the demo-pilot band inside it, the shared service
 * cards and closing band, the model's comparison table and FAQ cards; and on each
 * service page the dark hero with its terms card, "what it is / what is included",
 * the page's own sequence, the contrast pair and the other two services. Styles live
 * in fidelityV5.css (loaded on every public page), never in a page chunk.
 *
 * The five old slugs are NOT deleted. `/services/:slug` redirects each of them
 * to the service that absorbed it (LEGACY_SERVICE_REDIRECTS), so inbound links,
 * bookmarks and search results keep working.
 *
 * NO PRICES ANYWHERE, unchanged from before. Services pricing is "scoped on a
 * call" per the 2026-08-07 decision, and a test asserts no currency figure
 * renders on this page or any detail page. That is why Train's terms and its
 * comparison cell do not read the model's "$0 to get started".
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

/** The demo pilot's four moves, as the model's band inside the chooser hero lists them. */
const PILOT_MOVES: readonly { glyph: 'search' | 'bars' | 'terminal' | 'ringCheck'; t: string; s: string }[] = [
  { glyph: 'search', t: 'We map your processes', s: 'With the leader and the people who run the work.' },
  { glyph: 'bars', t: 'We rank them by ROI', s: 'What each would return if it were automated.' },
  { glyph: 'terminal', t: 'We build the best one', s: 'A working Claude Code demo on your real workflow.' },
  { glyph: 'ringCheck', t: 'You decide what is next', s: 'Scale it, take it to the next leader, or stop.' },
];

/** Cells the model marks with a ringed tick, by row label and column. */
const TICKED: Readonly<Record<string, readonly (keyof Omit<CompareRow, 'label'>)[]>> = {
  'Starts with': ['build', 'guide'],
  'Finding ROI in your processes': ['build', 'guide'],
  'Training in Claude Code': ['guide', 'train'],
};
const TERMS_ROW = 'Commercial terms';

function compareCell(row: CompareRow, col: keyof Omit<CompareRow, 'label'>): React.ReactNode {
  const text = row[col];
  if (row.label === TERMS_ROW) return <strong>{text}</strong>;
  if ((TICKED[row.label] || []).includes(col)) {
    return (
      <>
        <RingTick />
        {text}
      </>
    );
  }
  return text;
}

/** FAQ as the model draws it: two columns of cards that open in place. */
function FaqCards({ items }: { items: readonly { q: string; a: string }[] }): React.ReactElement {
  return (
    <div className="cbv2-faq5">
      {items.map((f) => (
        <details key={f.q}>
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
    </div>
  );
}

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

      {/*
          The chooser hero, light, with the demo-pilot band inside it. An earlier pass
          took the band off this page believing the model had none; the model carries it
          here, as the first thing under the title, because Build and Guide both begin
          with a pilot.
      */}
      <section className="cbv2-shero5" aria-labelledby="cbv2-svc-title">
        <div className="cbv2-wrap">
          <p className="cbv2-crumb5">
            <Link to="/">Home</Link> / Services
          </p>
          <p className="cbv2-k5">Services</p>
          <div className="cbv2-shero5__g">
            <h1 id="cbv2-svc-title">
              <span>
                Build<span className="cbv2-shero5__dot">.</span>
              </span>{' '}
              <span>
                Guide<span className="cbv2-shero5__dot">.</span>
              </span>{' '}
              <span>
                Train<span className="cbv2-shero5__dot">.</span>
              </span>
            </h1>
            <div>
              <p className="cbv2-shero5__p">
                Three ways to move your company to AI with Claude Code.{' '}
                <strong>
                  We build you a custom application, we guide your team to automate your
                  workflows, or we train your people
                </strong>
                , department by department, or company-wide.
              </p>
              <div className="cbv2-btns5" style={{ marginTop: 26 }}>
                <Link className="cbv2-btn cbv2-btn--primary" to="/demo-pilot">
                  Book a demo pilot
                  <Icon name="arrowRight" size={16} />
                </Link>
              </div>
            </div>
          </div>

          <div className="cbv2-start5">
            <div className="cbv2-start5__l">
              <p className="cbv2-k5">Where Build and Guide begin</p>
              <h2>The demo pilot.</h2>
              <p>
                Before you commit, you see AI running on one of your own processes, with the
                ROI case beside it.
              </p>
            </div>
            <div className="cbv2-start5__r">
              {PILOT_MOVES.map((m) => (
                <div key={m.t}>
                  <span className="cbv2-start5__ic">
                    <ModelGlyph name={m.glyph} size={18} />
                  </span>
                  <p>
                    <strong>{m.t}</strong>
                    <span>{m.s}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--tight-top5" aria-labelledby="cbv2-three-h">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Choose by what you need</p>
            <h2 id="cbv2-three-h">
              Three services. <span className="cbv2-it">One question each.</span>
            </h2>
          </div>
          <ServiceCardsV5 />
        </div>
      </section>

      <section className="cbv2-section cbv2-section--soft" aria-labelledby="cbv2-cmp-h">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Side by side</p>
            <h2 id="cbv2-cmp-h">Which one fits?</h2>
          </div>
          <div className="cbv2-ctable5">
            <table>
              <caption className="cbv2-sr-only">
                The three services compared across {COMPARE_ROWS.length} dimensions.
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
                    <td data-col="Build">{compareCell(r, 'build')}</td>
                    <td data-col="Guide">{compareCell(r, 'guide')}</td>
                    <td data-col="Train">{compareCell(r, 'train')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="cbv2-note5">
            Engagement pricing is <Claim claimKey="pricing.services" route={ROUTE} />, so the
            scope is agreed with a person who can qualify the work, rather than anchored on a
            number before anyone has seen your systems.
          </p>
        </div>
      </section>

      {/*
          THE CHOOSER'S OWN FAQ. Not a duplicate of the service pages' "Before you ask":
          those answer questions about one service; these are the questions a visitor has
          while still deciding BETWEEN them, which is the only thing this page is for.
      */}
      <section className="cbv2-section cbv2-section--soft" aria-labelledby="cbv2-svc-faq">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Questions</p>
            <h2 id="cbv2-svc-faq">Common questions.</h2>
          </div>
          <FaqCards items={CHOOSER_FAQS} />
        </div>
      </section>

      <ClosingCtaV5 />
    </>
  );
}

/** One side of the contrast pair: a list with marks, or a short note with an action. */
function ContrastSide({
  side,
  yes,
}: {
  side: ServiceContrastSide;
  yes: boolean;
}): React.ReactElement {
  return (
    <div className={yes ? 'cbv2-not5__yes' : 'cbv2-not5__no'}>
      <p className="cbv2-k5">{side.label}</p>
      <h3>{side.heading}</h3>
      {side.items ? (
        <ul>
          {side.items.map((n) => (
            <li key={n}>
              <ModelGlyph name={yes ? 'ringCheck' : 'ringMinus'} size={18} />
              {n}
            </li>
          ))}
        </ul>
      ) : null}
      {side.body ? <p className="cbv2-not5__p">{side.body}</p> : null}
      {side.action ? (
        <p className="cbv2-not5__act">
          {yes ? (
            <Link className="cbv2-btn cbv2-btn--primary cbv2-btn--sm" to={side.action.to}>
              {side.action.label}
              <Icon name="arrowRight" size={16} />
            </Link>
          ) : (
            <Link className="cbv2-lnk" to={side.action.to}>
              {side.action.label}
              <Icon name="arrowRight" size={15} />
            </Link>
          )}
        </p>
      ) : null}
    </div>
  );
}

function ContrastSection({ page }: { page: ServicePage }): React.ReactElement {
  const yes =
    page.slug === 'train'
      ? { ...page.contrastYes, action: { label: page.ctaLabel, to: page.ctaRoute } }
      : page.contrastYes;
  return (
    <section className="cbv2-section" aria-label={`What ${page.verb} is, and is not`}>
      <div className="cbv2-wrap">
        <div className="cbv2-not5">
          <ContrastSide side={page.contrastNo} yes={false} />
          <ContrastSide side={yes} yes />
        </div>
      </div>
    </section>
  );
}

/** The page's own sequence: Build's timeline, Guide's week, Train's twelve weeks. */
function StepsSection({ page }: { page: ServicePage }): React.ReactElement {
  const kind = page.slug === 'build' ? 'tl' : page.slug === 'guide' ? 'wk' : 'ph';
  /* the model highlights one step: Build's demo pilot, Guide's every-day answers, Train's week 12 */
  const hl = page.slug === 'build' ? 2 : page.slug === 'guide' ? 2 : page.steps.length - 1;
  return (
    <section className="cbv2-section cbv2-section--soft" aria-labelledby="cbv2-svcd-steps">
      <div className="cbv2-wrap">
        <div className="cbv2-section__head">
          <p className="cbv2-eyebrow">{page.stepsEyebrow}</p>
          <h2 id="cbv2-svcd-steps">
            {page.stepsHeading}
            {page.stepsAccent ? (
              <>
                {' '}
                <span className="cbv2-it">{page.stepsAccent}</span>
              </>
            ) : null}
          </h2>
          {page.stepsLede ? <p className="cbv2-lede">{page.stepsLede}</p> : null}
        </div>
        <ol className={`cbv2-steps5 cbv2-steps5--${kind}`}>
          {page.steps.map((st, i) => (
            <li className={`cbv2-step5${i === hl ? ' cbv2-step5--hl' : ''}`} key={st.n + st.title}>
              {kind === 'ph' ? <b>{st.n}</b> : <span className="cbv2-step5__k">{st.n}</span>}
              <h4>{st.title}</h4>
              <p>{st.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
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

      <section className="cbv2-svhero5" aria-labelledby="cbv2-svcd-title">
        <div className="cbv2-wrap">
          <p className="cbv2-crumb5 cbv2-crumb5--d">
            <Link to="/services">Services</Link> / {page.verb}
          </p>
          <div className="cbv2-svhero5__g">
            <div>
              <h1 id="cbv2-svcd-title">
                {page.verb}
                <span>.</span>
              </h1>
              <p className="cbv2-svhero5__tagline">{page.promise}</p>
              <p className="cbv2-svhero5__l">{page.heroLede}</p>
              <div className="cbv2-btns5">
                <Link className="cbv2-btn cbv2-btn--primary" to={page.ctaRoute}>
                  {page.ctaLabel}
                  <Icon name="arrowRight" size={16} />
                </Link>
                <Link className="cbv2-btn cbv2-btn--line cbv2-btn--onDark" to={page.secondaryRoute}>
                  {page.secondaryLabel}
                </Link>
              </div>
            </div>
            {/* The commercial shape, read from SERVICE_SHAPES so it cannot disagree with
                /pricing. Terms only, never a figure. */}
            <div className="cbv2-svhero5__terms">
              <p className="cbv2-k5">{shape.termsLabel}</p>
              <strong>{shape.terms}</strong>
              <p>{page.termsNote}</p>
              <ul>
                {page.heroList.map((n) => (
                  <li key={n}>
                    <ModelGlyph name="ringCheck" size={17} />
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--detail5" aria-labelledby="cbv2-svcd-what">
        <div className="cbv2-wrap">
          <article className="cbv2-detail5">
            <div>
              <p className="cbv2-k5">What it is</p>
              {/* a paragraph, as in the model: the page's one heading is the hero's h1 */}
              <p id="cbv2-svcd-what" className="cbv2-detail5__t">
                {page.promise}
              </p>
              <p className="cbv2-detail5__d">{page.lede}</p>
              <ServiceVisualV5 slug={page.slug} />
              {page.slug === 'train' ? null : (
                <div className="cbv2-when5">
                  <b>Choose {page.verb} when</b>
                  <p>{page.chooseWhen}</p>
                </div>
              )}
            </div>
            <div className="cbv2-inc5">
              <p className="cbv2-k5 cbv2-inc5__k">What is included</p>
              <ul>
                {page.includes.map((inc) => (
                  <li key={inc.title}>
                    <span className="cbv2-inc5__ic">
                      <ModelGlyph name={inc.glyph} size={19} />
                    </span>
                    <div>
                      <strong>{inc.title}</strong>
                      <span>{inc.body}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        </div>
      </section>

      {page.contrastFirst ? <ContrastSection page={page} /> : null}
      <StepsSection page={page} />
      {page.contrastFirst ? null : <ContrastSection page={page} />}

      {page.faqs.length ? (
        <section className="cbv2-section cbv2-section--soft" aria-labelledby="cbv2-svcd-faq">
          <div className="cbv2-wrap">
            <div className="cbv2-section__head">
              <p className="cbv2-eyebrow">Questions</p>
              <h2 id="cbv2-svcd-faq">Before you ask.</h2>
            </div>
            <FaqCards items={page.faqs} />
          </div>
        </section>
      ) : null}

      <section className="cbv2-section cbv2-section--others5" aria-labelledby="cbv2-svcd-others">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head cbv2-section__head--tight5">
            <p className="cbv2-eyebrow" id="cbv2-svcd-others">
              The other two services
            </p>
          </div>
          <div className="cbv2-othersvc5">
            {others.map((o) => (
              <Link key={o.slug} to={`/services/${o.slug}`}>
                <div>
                  <strong>{o.verb}.</strong>
                  <span>{o.short}</span>
                </div>
                <ModelGlyph name="arrow" size={22} />
              </Link>
            ))}
          </div>
          <p className="cbv2-othersvc5__all">
            <Link className="cbv2-lnk" to="/services">
              Compare all three side by side
              <Icon name="arrowRight" size={15} />
            </Link>
          </p>
        </div>
      </section>

      <ClosingCtaV5 />
    </>
  );
}

export default ServicesV2;
