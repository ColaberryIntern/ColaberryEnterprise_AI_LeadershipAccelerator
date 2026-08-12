import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import { Claim, canShow, Metric, SampleBadge, CapabilityNotice } from '../../components/publicV2/Claim';
import { SHOWROOM_SURFACES, STUDIO_DESCRIPTION, DATA_EARNED } from '../../config/v2Platform';
import './platformV2.css';

/**
 * PlatformV2 — the Platform Showroom.
 *
 * Shows ONLY surfaces that exist. Each panel is gated on its registry claim, so
 * a surface whose capability regresses to `unbuilt` disappears from the page
 * automatically rather than requiring someone to remember to remove it.
 *
 * The four-view Readiness console is absent. A CapabilityNotice states that it is
 * in development, which is a truthful thing to say about an unbuilt feature —
 * unlike depicting it, which is not.
 */

const ROUTE = '/platform';

function PlatformV2(): React.ReactElement {
  const visible = SHOWROOM_SURFACES.filter((s) => canShow(s.claimKey, ROUTE));
  const [activeKey, setActiveKey] = useState<string>(visible[0]?.key ?? '');
  const active = visible.find((s) => s.key === activeKey) ?? visible[0];

  return (
    <>
      <SeoV2
        title="The platform your team logs into"
        description={
          'Organization AI readiness, the team roster and ladder, and a free company ' +
          'workspace. Readiness is earned from evidence, evaluations and shipped work, not ' +
          'from course completion.'
        }
      />

      <section className="cbv2-pagehero" aria-labelledby="cbv2-plat-title">
        <div className="cbv2-wrap cbv2-pagehero__split">
          <div>
            <p className="cbv2-eyebrow cbv2-eyebrow--onDark">Platform</p>
            <h1 id="cbv2-plat-title">The platform your team logs into</h1>
            <p className="cbv2-pagehero__lede">
              Every figure below is sample data, shaped to the metrics the product actually
              captures. Nothing here is a customer&rsquo;s data.
            </p>
          </div>
          <figure className="cbv2-shot-frame">
            <img
              className="cbv2-shot"
              src="/site-v2/shot-hero-dashboard.png"
              alt="The company view a manager logs into: readiness, builder XP, evidence shipped and evaluations passed for a sample organization."
              loading="eager"
              decoding="async"
            />
          </figure>
        </div>
      </section>

      {active ? (
        <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-surfaces-title">
          <div className="cbv2-wrap">
            <div className="cbv2-section__head">
              <p className="cbv2-eyebrow">Explore the surfaces</p>
              <h2 id="cbv2-surfaces-title">What is live today</h2>
            </div>

            <div className="cbv2-tabs" role="tablist" aria-label="Platform surfaces">
              {visible.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  className="cbv2-tab"
                  aria-selected={s.key === active.key}
                  onClick={() => setActiveKey(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="cbv2-surface" role="tabpanel" aria-label={active.label}>
              <div className="cbv2-surface__bar">
                <strong>{active.label}</strong>
                <span className="cbv2-surface__where">{active.livesAt}</span>
                <SampleBadge />
              </div>
              <div className="cbv2-surface__body">
                <p className="cbv2-lede" style={{ marginBottom: 'var(--space-6)' }}>
                  {active.blurb}
                </p>

                {/*
                  The capture for THIS surface, when one exists. Driven from
                  config so a surface without a vetted capture simply shows its
                  figures rather than borrowing a picture of another screen.
                */}
                {active.shot ? (
                  <figure className="cbv2-shot-frame" style={{ marginBottom: 'var(--space-7)' }}>
                    <img
                      className="cbv2-shot"
                      src={active.shot.src}
                      alt={active.shot.alt}
                      loading="lazy"
                      decoding="async"
                    />
                  </figure>
                ) : null}

                <div className="cbv2-grid cbv2-grid--4">
                  {active.stats.map((s) => (
                    <Metric
                      key={s.label}
                      value={s.value}
                      label={s.label}
                      evidence="illustrative"
                      badgeHidden
                    />
                  ))}
                </div>

                <div className="cbv2-tracks" style={{ marginTop: 'var(--space-8)' }}>
                  {active.rows.map((r) => (
                    <div className="cbv2-track" key={r.label}>
                      <span>{r.label}</span>
                      <span className="cbv2-track__rail">
                        <i style={{ width: `${r.pct}%` }} />
                      </span>
                      <b>{r.pct}%</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* The console is unbuilt. Saying so is truthful; depicting it would not be. */}
      <section className="cbv2-rv cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-soon-title">
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <h2 id="cbv2-soon-title">Role-based views</h2>
          <p className="cbv2-lede" style={{ margin: 'var(--space-3) 0 var(--space-5)' }}>
            The same evidence, rendered for the executive, the builder, the architect and the
            auditor.
          </p>
          <CapabilityNotice claimKey="surface.fourview.console" />
        </div>
      </section>

      <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-earned-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">How the data is earned</p>
            <h2 id="cbv2-earned-title">Readiness comes from evidence, not course completion</h2>
            <p className="cbv2-lede">
              This is the difference between a training report and a capability measurement.
              Nothing on the executive dashboard is self-reported.
            </p>
          </div>
          {/*
            One person's record, which is where the argument above stops being
            an assertion: evidence records, GitHub commits, artifacts and
            evaluations passed are all countable, and none of them is a course
            marked complete. Carries an explicit sample badge because this crop,
            unlike the workspace banner, has no labelling of its own.
          */}
          <figure className="cbv2-shot-frame cbv2-earned__shot">
            <img
              className="cbv2-shot"
              src="/site-v2/shot-member.png"
              alt="One team member's record: knowledge growth from pre-check to evaluation, architect readiness at 92 percent with all promotion gates cleared, competency confidence across four domains, and counts of evidence records, GitHub commits, artifacts, evaluations passed and implementations."
              loading="lazy"
              decoding="async"
            />
            <figcaption className="cbv2-shot-caption">
              <SampleBadge />
              <span>A single person&rsquo;s evidence, as the manager view shows it.</span>
            </figcaption>
          </figure>

          <div className="cbv2-grid cbv2-grid--3">
            {DATA_EARNED.map((d) => (
              <article className="cbv2-card" key={d.title}>
                <h3 className="cbv2-card__title">{d.title}</h3>
                <p className="cbv2-card__body">{d.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cbv2-rv cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-studio-title">
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <p className="cbv2-eyebrow">Behind the curriculum</p>
          <h2 id="cbv2-studio-title">{STUDIO_DESCRIPTION.label}</h2>
          <p className="cbv2-lede" style={{ marginTop: 'var(--space-3)' }}>
            {STUDIO_DESCRIPTION.blurb}
          </p>
          <p className="cbv2-note">{STUDIO_DESCRIPTION.note}</p>
        </div>
      </section>

      <section className="cbv2-rv cbv2-section cbv2-section--inverse" aria-labelledby="cbv2-plat-cta">
        <div className="cbv2-wrap cbv2-wrap--narrow" style={{ textAlign: 'center' }}>
          <h2 id="cbv2-plat-cta">See where your team would start.</h2>
          <p className="cbv2-lede" style={{ marginInline: 'auto' }}>
            <Claim claimKey="surface.free.workspace" route={ROUTE} />
          </p>
          <div className="cbv2-hero__ctas" style={{ justifyContent: 'center' }}>
            <Link className="cbv2-btn cbv2-btn--primary" to="/v2/start">
              Open the free workspace
            </Link>
            <Link className="cbv2-btn cbv2-btn--ghost" to="/v2/services">
              Compare services
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default PlatformV2;
