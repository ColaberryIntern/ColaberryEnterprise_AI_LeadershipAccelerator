import React from 'react';
import { CertDomain, CertReadiness } from '../../../services/certPrepApi';

/**
 * CertDomainMap — the five blueprint domains, what the student scores in each,
 * and how much of each is backed by verified build evidence.
 *
 * TWO PRESENTATION RULES THAT ARE REALLY HONESTY RULES:
 *
 *   1. A domain with no answered questions shows "Not attempted", never 0%. Zero
 *      means "got them all wrong"; not-attempted means "we do not know". Merging
 *      them would tell a student they are bad at something they never tried.
 *   2. The weight is shown with its source. An unverified weight is labelled as
 *      such rather than presented with the same authority as Anthropic's own
 *      published figure.
 *
 * Domains render in the blueprint's own `display_order`, NOT sorted by weight or
 * by score — the official order is part of how the exam is documented, and
 * re-sorting it makes a student's mental model disagree with Anthropic's guide.
 */

interface Props {
  domains: CertDomain[];
  readiness: CertReadiness | null;
  /** Overview shows a condensed row; the Domain Map tab shows objectives too. */
  compact?: boolean;
  onDrill: (domainId: string) => void;
}

function bandFor(pct: number | null): 'none' | 'low' | 'mid' | 'good' {
  if (pct === null) return 'none';
  if (pct >= 0.8) return 'good';
  if (pct >= 0.6) return 'mid';
  return 'low';
}

const CertDomainMap: React.FC<Props> = ({ domains, readiness, compact, onDrill }) => {
  if (domains.length === 0) {
    return (
      <section className="cp-empty">
        <p>No certification domains are configured yet.</p>
      </section>
    );
  }

  const stateFor = (domainId: string) =>
    readiness?.domain_breakdown.find((d) => d.domain_id === domainId) ?? null;

  return (
    <section className="cp-domains" aria-label="Blueprint domains">
      {domains.map((domain) => {
        const state = stateFor(domain.domain_id);
        const pct = state?.knowledge_pct ?? null;
        const band = bandFor(pct);
        const answered = state?.answered ?? 0;
        const evidenced = state?.objectives_evidenced ?? 0;
        const objectivesTotal = state?.objectives_total ?? domain.objectives.length;

        return (
          <article className="cp-domain" key={domain.domain_id}>
            <div className="cp-domain-id" aria-hidden="true">{domain.domain_id}</div>

            <div className="cp-domain-main">
              <div className="cp-domain-head">
                <h3>{domain.label}</h3>
                <span className="cp-weight">
                  {domain.weight_pct === null ? (
                    <em>weight not set</em>
                  ) : (
                    <>
                      {Number(domain.weight_pct)}% of the exam
                      {domain.weight_source !== 'official' && (
                        <em className="cp-unverified"> · unverified</em>
                      )}
                    </>
                  )}
                </span>
              </div>

              <div className={`cp-bar cp-bar--${band}`}>
                <span style={{ width: pct === null ? '0%' : `${(pct * 100).toFixed(0)}%` }} />
              </div>

              <div className="cp-domain-meta">
                {pct === null ? (
                  <span className="cp-not-attempted">Not attempted</span>
                ) : (
                  <span>
                    <b>{Math.round(pct * 100)}%</b> across {answered} question{answered === 1 ? '' : 's'}
                  </span>
                )}
                <span className="cp-dot" aria-hidden="true">·</span>
                <span>
                  {evidenced} of {objectivesTotal} objective{objectivesTotal === 1 ? '' : 's'} evidenced
                </span>
              </div>

              {!compact && domain.objectives.length > 0 && (
                <ul className="cp-objectives">
                  {domain.objectives.map((objective) => (
                    <li key={objective.objective_id}>
                      <span className="cp-obj-id">{objective.objective_id}</span>
                      {objective.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              className="cp-btn cp-btn--ghost cp-domain-cta"
              onClick={() => onDrill(domain.domain_id)}
            >
              {pct === null ? 'Start' : 'Drill'}
              <span className="cp-sr-only"> {domain.label}</span>
            </button>
          </article>
        );
      })}
    </section>
  );
};

export default CertDomainMap;
