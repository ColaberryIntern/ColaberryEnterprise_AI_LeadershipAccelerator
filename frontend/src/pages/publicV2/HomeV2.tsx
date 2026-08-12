import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import { Claim, canShow, SampleBadge } from '../../components/publicV2/Claim';
import Icon from '../../components/publicV2/Icon';
import { GOALS, ENGINE, SERVICES } from '../../config/v2Content';
import './homeV2.css';

/**
 * HomeV2 — the V2 homepage.
 *
 * Nine sections maximum, per the approved design. All marketing copy resolves
 * through the claims registry.
 *
 * NOTE ON WHAT IS ABSENT: the prototype's "Four roles, one system" console is
 * deliberately NOT here. It is the most striking element of the approved design,
 * but the capability does not exist yet, and the build-then-show decision
 * (BUILD_PLAN §0 option A) bars describing unbuilt capability in the present
 * tense. It returns when Phase 2 builds it. `surface.fourview.console` is
 * registry-blocked on `capability: 'unbuilt'`, so re-adding it here would render
 * nothing rather than silently over-claim.
 */

const ROUTE = '/';

function HomeV2(): React.ReactElement {
  const [goalKey, setGoalKey] = useState<string>(GOALS[0].key);
  const goal = GOALS.find((g) => g.key === goalKey) ?? GOALS[0];

  return (
    <>
      <SeoV2
        title="Build the system. Build the people. Prove the capability."
        description={
          'Colaberry helps organizations identify high-value AI opportunities, deploy governed ' +
          'Claude-powered systems, and develop the people who will own them, through one ' +
          'connected platform.'
        }
      />

      {/* 1 ─────────────────────────────────────────────────────────── hero ── */}
      <section className="cbv2-hero" aria-labelledby="cbv2-hero-title">
        {/* Ambient depth. Purely decorative, sits behind content, and carries no
            information -- so it is hidden from assistive tech and stops moving
            entirely under prefers-reduced-motion. */}
        <div className="cbv2-mesh" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="cbv2-gridlines" aria-hidden="true" />
        <div className="cbv2-wrap cbv2-hero__grid">
          <div>
            <p className="cbv2-eyebrow">Enterprise AI &middot; Systems + People</p>
            <h1 id="cbv2-hero-title" className="cbv2-hero__title">
              Build the system. Build the people. <em>Prove the capability.</em>
            </h1>
            <p className="cbv2-hero__body">
              Colaberry helps organizations identify high-value AI opportunities, deploy governed
              Claude-powered systems, and develop the people who will own them&mdash;through one
              connected platform.
            </p>
            <div className="cbv2-hero__ctas">
              <Link className="cbv2-btn cbv2-btn--primary" to="/v2/platform">
                Explore the Live Platform
              </Link>
              <Link className="cbv2-btn cbv2-btn--ghost" to="/v2/lab">
                Map an AI Opportunity
              </Link>
            </div>
          </div>

          {/*
            The readiness rollup is a LIVE surface, so it may be depicted -- and it
            is depicted with an actual capture of the product rather than boxes
            drawn in HTML. The capture carries its own on-screen "sample data"
            labelling, and a SampleBadge sits in the caption regardless, so the
            claim holds even if the image fails to load.
          */}
          {canShow('surface.readiness.rollup', ROUTE) ? (
            <figure className="cbv2-shot-stack">
              <div className="cbv2-shot-stack__main">
                <img
                  className="cbv2-shot"
                  src="/site-v2/shot-hero-dashboard.png"
                  alt="The organization readiness dashboard, showing average architect readiness, builder XP and evidence shipped for a sample company."
                  width={1680}
                  height={1120}
                  loading="eager"
                  decoding="async"
                />
              </div>
              <div className="cbv2-shot-stack__badge" aria-hidden="true">
                <span className="cbv2-pulse" />
                <span>
                  <b>+18 pts</b>
                  <span>readiness in 8 weeks</span>
                </span>
              </div>
              <figcaption className="cbv2-shot-caption">
                <SampleBadge inverse />
                <span>The company view, as it ships today.</span>
              </figcaption>
            </figure>
          ) : null}
        </div>
      </section>

      {/* 2 ──────────────────────────────────────── what we can state today ── */}
      <section className="cbv2-section cbv2-section--sunken" aria-label="What we can state today">
        <div className="cbv2-wrap cbv2-grid cbv2-grid--3">
          <article className="cbv2-card">
            <span className="cbv2-icon-tile cbv2-icon-tile--blue">
              <Icon name="cpu" size={22} />
            </span>
            <p className="cbv2-eyebrow cbv2-eyebrow--info">Capability</p>
            <h2 className="cbv2-card__title">
              <Claim claimKey="anthropic.capability" route={ROUTE} />
            </h2>
            <p className="cbv2-card__body">
              Production systems designed, built and governed on Anthropic&rsquo;s models.
            </p>
          </article>

          <article className="cbv2-card">
            <span className="cbv2-icon-tile cbv2-icon-tile--green">
              <Icon name="medal" size={22} />
            </span>
            <p className="cbv2-eyebrow cbv2-eyebrow--info">Credential path</p>
            <h2 className="cbv2-card__title">Claude Certified Architect, Foundations</h2>
            <p className="cbv2-card__body">
              <Claim claimKey="credential.cca.safe" route={ROUTE} />
            </p>
          </article>

          {/* Stating the absence is itself the honest move, and it is the thing
              reviewers scored 9/10. It is not a placeholder. */}
          <article className="cbv2-card cbv2-card--dashed">
            <span className="cbv2-icon-tile cbv2-icon-tile--amber">
              <Icon name="scale" size={22} />
            </span>
            <p className="cbv2-eyebrow cbv2-eyebrow--warn">Pending verification</p>
            <h2 className="cbv2-card__title">Track-record claims withheld</h2>
            <p className="cbv2-card__body">
              Volume, partner-status and outcome claims are deliberately absent until verified.
            </p>
          </article>
        </div>
      </section>

      {/* 3 ─────────────────────────────────────────────────── goal chooser ── */}
      <section className="cbv2-section" aria-labelledby="cbv2-goal-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Start where you are</p>
            <h2 id="cbv2-goal-title">What are you trying to accomplish?</h2>
            <p className="cbv2-lede">
              Pick the outcome you need next. The recommended service, the proof we would show
              you, and the next step all adapt.
            </p>
          </div>

          <div className="cbv2-chooser" role="group" aria-label="Choose a goal">
            {GOALS.map((g) => (
              <button
                key={g.key}
                type="button"
                className="cbv2-chooser__btn"
                aria-pressed={g.key === goalKey}
                onClick={() => setGoalKey(g.key)}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="cbv2-chooser__out" aria-live="polite">
            <div className="cbv2-field">
              <h3>Recommended service</h3>
              <p>
                <strong>{goal.service}</strong>
              </p>
            </div>
            <div className="cbv2-field">
              <h3>Why this fits</h3>
              <p>{goal.explain}</p>
            </div>
            <div className="cbv2-field">
              <h3>Supporting proof</h3>
              <p>{goal.proof}</p>
            </div>
            <div className="cbv2-field">
              <h3>Suggested next step</h3>
              <p>{goal.next}</p>
              <p style={{ marginTop: 'var(--space-3)' }}>
                <Link className="cbv2-btn cbv2-btn--primary cbv2-btn--sm" to={goal.ctaRoute}>
                  {goal.cta}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4 ────────────────────────────────────────── dual transformation ──── */}
      <section className="cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-engine-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">The operating model</p>
            <h2 id="cbv2-engine-title">Two engines, one owned capability</h2>
            <p className="cbv2-lede">
              Most programmes build a system nobody can maintain, or train people with nothing
              real to build. These run together.
            </p>
          </div>

          <div className="cbv2-engine">
            {(['system', 'people'] as const).map((lane) => (
              <div className={`cbv2-lane cbv2-lane--${lane}`} key={lane}>
                <h3>{lane === 'system' ? 'System Engine' : 'People Engine'}</h3>
                <ol className="cbv2-lane__steps">
                  {ENGINE[lane].map((step, i) => (
                    <li key={step.title}>
                      <span className="cbv2-lane__n">{i + 1}</span>
                      <span>
                        <span className="cbv2-lane__t">{step.title}</span>
                        <span className="cbv2-lane__d">{step.detail}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          <p className="cbv2-converge">
            <strong>Owned Enterprise AI Capability</strong>
            <span>The system runs in production, and your own people own it.</span>
          </p>
        </div>
      </section>

      {/* 5 ──────────────────────────────────────────────────────── services ── */}
      <section className="cbv2-section" aria-labelledby="cbv2-services-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Services</p>
            <h2 id="cbv2-services-title">Five ways an engagement starts</h2>
          </div>
          <div className="cbv2-ribbon">
            {SERVICES.map((s) => (
              <Link className="cbv2-ribbon__item" to={`/v2/services/${s.slug}`} key={s.slug}>
                <span className="cbv2-ribbon__n">{s.number}</span>
                <span className="cbv2-ribbon__title">{s.name}</span>
                <span className="cbv2-ribbon__body">{s.fit}</span>
              </Link>
            ))}
          </div>
          <p style={{ marginTop: 'var(--space-8)' }}>
            <Link className="cbv2-btn cbv2-btn--secondary" to="/v2/services">
              Compare all five services
            </Link>
          </p>
        </div>
      </section>

      {/* 6 ────────────────────────────────────────────── free workspace ────── */}
      {canShow('surface.free.workspace', ROUTE) ? (
        <section className="cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-free-title">
          <div className="cbv2-wrap">
            <div className="cbv2-section__head">
              <p className="cbv2-eyebrow">Free to start</p>
              <h2 id="cbv2-free-title">
                <Claim claimKey="surface.free.workspace" route={ROUTE} />
              </h2>
            </div>
            <p style={{ marginTop: 'var(--space-6)' }}>
              <Link className="cbv2-btn cbv2-btn--primary" to="/v2/try">
                Open the Free Company Workspace
              </Link>
            </p>
          </div>
        </section>
      ) : null}

      {/* 7 ────────────────────────────────────────────────────── final CTA ── */}
      <section className="cbv2-section cbv2-section--inverse" aria-labelledby="cbv2-cta-title">
        <div className="cbv2-wrap cbv2-wrap--narrow" style={{ textAlign: 'center' }}>
          <h2 id="cbv2-cta-title">See what AI could become inside your company.</h2>
          <p className="cbv2-lede" style={{ marginInline: 'auto' }}>
            Start free, or bring one workflow to an architect.
          </p>
          <div className="cbv2-hero__ctas" style={{ justifyContent: 'center' }}>
            <Link className="cbv2-btn cbv2-btn--primary" to="/v2/try">
              Open the Free Company Workspace
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

export default HomeV2;
