import React from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import Icon from '../../components/publicV2/Icon';
import { EvidenceBadge, CapabilityNotice, Metric } from '../../components/publicV2/Claim';
import { blockedClaims } from '../../config/claimsRegistry';
import { EVIDENCE_CLASSES, WITHDRAWN, GATES, PLANNED_PROOF_ROOM } from '../../config/v2Proof';
import './proofV2.css';

/**
 * ProofV2 — the Proof Room.
 *
 * The per-record proof surface is unbuilt, so this page publishes the STANDARD
 * rather than depicting the product. Everything on it is enforced in code today:
 * the evidence classes are rendered with the same `EvidenceBadge` the rest of the
 * site uses, and the two counts below are computed from the registry at render
 * time rather than typed in, so they cannot drift from the mechanism they claim
 * to describe.
 */

const ROUTE = '/proof';

/**
 * Split by REASON, because a single "blocked" total would conflate the two gates
 * this page exists to distinguish. A claim can fail on truth, on existence, or
 * on both — the buckets below are counted independently and may overlap.
 */
function withheldCounts(): { forTruth: number; forCapability: number } {
  const blocked = blockedClaims();
  return {
    forTruth: blocked.filter(
      (c) => c.verification !== 'VERIFIED' && c.verification !== 'ILLUSTRATIVE',
    ).length,
    forCapability: blocked.filter((c) => c.capability === 'unbuilt').length,
  };
}

function ProofV2(): React.ReactElement {
  const { forTruth, forCapability } = withheldCounts();

  return (
    <>
      <SeoV2
        title="The proof standard"
        description={
          'What we count as evidence, the two gates every claim passes before it is ' +
          'published, and the claims we withdrew from this site rather than qualify.'
        }
      />

      <section className="cbv2-pagehero" aria-labelledby="cbv2-proof-title">
        <div className="cbv2-wrap cbv2-pagehero__split">
          <div>
            <p className="cbv2-eyebrow cbv2-eyebrow--onDark">Proof</p>
            <h1 id="cbv2-proof-title">Every number here can be opened</h1>
            <p className="cbv2-pagehero__lede">
              Buying AI capability means buying claims about people. This page sets out what we
              count as evidence, and what we removed from this site when it did not meet that
              standard.
            </p>
          </div>
          {/*
            The metric tiles from the real product. Shown here because this page
            is about figures carrying their provenance, and these are the figures
            in question -- not a stock image of a dashboard.
          */}
          <figure className="cbv2-shot-frame">
            <img
              className="cbv2-shot"
              src="/site-v2/shot-metrics.png"
              alt="Metric tiles from the product: average architect readiness, builder XP per week, evidence shipped this week, projects and artifacts shipped, and live-session attendance."
              width={1340}
              height={420}
              loading="lazy"
              decoding="async"
            />
          </figure>
        </div>
      </section>

      <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-classes-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">The standard</p>
            <h2 id="cbv2-classes-title">Four evidence classes, declared on every figure</h2>
            <p className="cbv2-lede">
              No figure ships without one. These are the labels used throughout this site, not a
              policy written for this page.
            </p>
          </div>
          <div className="cbv2-grid cbv2-grid--2">
            {EVIDENCE_CLASSES.map((c) => (
              <article className="cbv2-card cbv2-evcard" key={c.key}>
                <span className="cbv2-icon-tile cbv2-icon-tile--blue">
                  <Icon name={c.icon} size={22} />
                </span>
                <EvidenceBadge evidence={c.key} />
                <p className="cbv2-evcard__meaning">{c.meaning}</p>
                <p className="cbv2-evcard__rule">{c.rule}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cbv2-rv cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-gates-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">How a claim reaches this site</p>
            <h2 id="cbv2-gates-title">Two gates, deliberately independent</h2>
          </div>
          <div className="cbv2-grid cbv2-grid--2">
            {GATES.map((g) => (
              <article className="cbv2-card" key={g.title}>
                <span className="cbv2-icon-tile cbv2-icon-tile--green">
                  <Icon name={g.icon} size={22} />
                </span>
                <h3 className="cbv2-card__title">{g.title}</h3>
                <p className="cbv2-card__body">{g.detail}</p>
              </article>
            ))}
          </div>

          {/* Counted from the registry at render time, not typed in. */}
          <div className="cbv2-grid cbv2-grid--2 cbv2-proof-counts">
            <Metric
              value={String(forTruth)}
              label="claims withheld because the evidence was not there"
              evidence="verified"
            />
            <Metric
              value={String(forCapability)}
              label="surfaces not shown because they are not built yet"
              evidence="verified"
            />
          </div>
          <p className="cbv2-note">
            Both figures are counted from the claims registry when this page renders, so they
            stay accurate without anyone maintaining them.
          </p>
        </div>
      </section>

      <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-withdrawn-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">What we took down</p>
            <h2 id="cbv2-withdrawn-title">Claims withdrawn during this rebuild</h2>
            <p className="cbv2-lede">
              Described by category and reason. Restating each claim in order to disown it would
              put it back in front of you, which is the opposite of withdrawing it.
            </p>
          </div>
          <ol className="cbv2-withdrawn">
            {WITHDRAWN.map((w) => (
              <li className="cbv2-withdrawn__item" key={w.category}>
                <h3 className="cbv2-withdrawn__cat">{w.category}</h3>
                <p className="cbv2-withdrawn__why">{w.reason}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="cbv2-rv cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-planned-title">
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <p className="cbv2-eyebrow">Next</p>
          <h2 id="cbv2-planned-title">Per-record proof</h2>
          <p className="cbv2-lede" style={{ margin: 'var(--space-3) 0 var(--space-5)' }}>
            {PLANNED_PROOF_ROOM}
          </p>
          <CapabilityNotice claimKey="surface.proof.room" />
        </div>
      </section>

      <section className="cbv2-rv cbv2-section cbv2-section--inverse" aria-labelledby="cbv2-proof-cta">
        <div className="cbv2-wrap cbv2-wrap--narrow" style={{ textAlign: 'center' }}>
          <h2 id="cbv2-proof-cta">Hold us to it.</h2>
          <p className="cbv2-lede" style={{ marginInline: 'auto' }}>
            If a figure on this site cannot be traced to its source, that is a defect worth
            reporting.
          </p>
          <div className="cbv2-hero__ctas" style={{ justifyContent: 'center' }}>
            <Link className="cbv2-btn cbv2-btn--primary" to="/v2/platform">
              See the platform
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

export default ProofV2;
