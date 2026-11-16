import React from 'react';
import type { GapAnalysis, GapCandidate, ProposedServiceDraft } from '../../../../services/serviceGapApi';
import { ExpansionView, NaicsView, ProposedServiceView } from './GapDraftViews';
import { DECISION_META, SCORE_HELP, type ServiceCurrent } from './serviceGapModel';

/**
 * GapRecommendationPanel - the "AI service recommendation" block on an Intake card, above the keyword suggestions.
 *
 * Decision first (badge + one-sentence verdict), then the numbers that justify it, kept apart on purpose: EXISTING
 * FIT says how well a current service covers this; the NEW-SERVICE signals (novelty, readiness, duplicate risk) say
 * whether a new one is warranted. A 62% existing fit is never shown as "62% chance a new service is needed".
 * Evidence, missing information and the alternatives the model rejected sit behind a disclosure.
 *
 * Nothing here writes on its own. Every action is a click: Use existing (ticks the service; Link confirms), Apply
 * change (second confirm, also adds missing NAICS), Add NAICS to the matched service (second confirm), Review proposed service (pre-fills the existing form), Not a new service (dismiss),
 * Reanalyze. Every state is explicit: not analyzed, failed, dismissed, accepted, stale.
 */
export interface GapPanelProps {
  analysis: GapAnalysis | undefined;
  /** False when the recommendations feed could not be read: show "unavailable", never a guess. */
  available: boolean;
  busy: boolean;
  serviceCurrent: (serviceId: string) => ServiceCurrent | null;
  onAnalyze: (force: boolean) => void;
  onAdoptExisting: () => void;
  onReviewProposal: (draft: ProposedServiceDraft) => void;
  onApplyExpansion: (current: ServiceCurrent) => void;
  /** Adds the missing work-performed NAICS codes to the matched service (second confirm in the view). */
  onAddNaics: (current: ServiceCurrent) => void;
  onDismiss: (note: string) => void;
}

const fit = (c: GapCandidate): number => Math.round(0.5 * c.capabilityOverlap + 0.3 * c.buyerProblemOverlap + 0.2 * c.deliverableOverlap);
const Shell = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <section className="border rounded-3 p-2 mb-3 bg-body-tertiary" aria-label="AI service recommendation" data-testid="gap-panel">
    <div className="small fw-bold text-secondary mb-1"><i className="ri-sparkling-2-line me-1" aria-hidden="true" />AI service recommendation</div>
    {children}
  </section>
);
const Metric = ({ label, value, help }: { label: string; value: number | null; help: string }): React.ReactElement => (
  <span className="small me-3 text-nowrap" title={help}>
    <span className="text-secondary">{label}</span> <b>{value == null ? 'n/a' : value}</b><span className="visually-hidden"> ({help})</span>
  </span>
);

export default function GapRecommendationPanel(p: GapPanelProps): React.ReactElement {
  const a = p.analysis;
  if (!p.available) return <Shell><div className="small text-secondary">Unavailable right now. Manual linking below still works.</div></Shell>;
  if (!a) {
    return (
      <Shell>
        <div className="small text-secondary d-flex align-items-center gap-2 flex-wrap">Not analyzed yet.
          <button type="button" className="btn btn-outline-secondary btn-sm py-0" disabled={p.busy} onClick={() => p.onAnalyze(false)} data-testid="gap-analyze">{p.busy ? 'Analyzing…' : 'Analyze'}</button>
        </div>
      </Shell>
    );
  }
  if (a.status === 'failed') {
    return (
      <Shell>
        <div className="small text-danger-emphasis d-flex align-items-center gap-2 flex-wrap" role="status">
          <i className="ri-error-warning-line" aria-hidden="true" />{a.error ?? 'The analysis failed.'}
          <button type="button" className="btn btn-outline-secondary btn-sm py-0" disabled={p.busy} onClick={() => p.onAnalyze(true)}>{p.busy ? 'Analyzing…' : 'Try again'}</button>
        </div>
      </Shell>
    );
  }
  const rec = a.recommendation!;
  const meta = DECISION_META[rec.decision];
  if (a.reviewState !== 'open') {
    return (
      <Shell>
        <div className="small text-secondary d-flex align-items-center gap-2 flex-wrap">
          {a.reviewState === 'dismissed' ? 'Recommendation dismissed' : 'Recommendation accepted'}{a.reviewedBy ? ` by ${a.reviewedBy}` : ''}{a.reviewNote ? `: ${a.reviewNote}` : '.'}
          <button type="button" className="btn btn-link btn-sm p-0" disabled={p.busy} onClick={() => p.onAnalyze(true)}>Reanalyze</button>
        </div>
      </Shell>
    );
  }
  const isNew = rec.decision === 'PROPOSE_NEW';
  const canAdopt = (rec.decision === 'MATCH_EXISTING' || rec.decision === 'LINK_GROWTH') && rec.target;
  return (
    <Shell>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
        <span className={`badge rounded-pill ${meta.badge}`} data-testid="gap-decision"><i className={`${meta.icon} me-1`} aria-hidden="true" />{meta.label}</span>
        <span className="badge rounded-pill bg-body text-secondary border" title="Qualitative, not a probability">Confidence: {rec.confidence}</span>
        {a.stale && <span className="badge rounded-pill bg-warning-subtle text-warning-emphasis" title="The case study or the catalog changed since this was analyzed">Stale</span>}
      </div>
      <div className="fw-semibold small mb-2" data-testid="gap-verdict">{rec.verdict}</div>
      <div className="mb-2">
        <Metric label="Existing fit" value={rec.scores.existingFitScore} help={SCORE_HELP.existingFit} />
        {isNew && <>
          <Metric label="Novelty" value={rec.scores.noveltyScore} help={SCORE_HELP.novelty} />
          <Metric label="Readiness" value={rec.scores.evidenceReadinessScore} help={SCORE_HELP.readiness} />
          <Metric label="Duplicate risk" value={rec.scores.duplicateRiskScore} help={SCORE_HELP.duplicateRisk} />
        </>}
      </div>
      {rec.candidates.length > 0 && (
        <ul className="list-unstyled small mb-2" aria-label="Closest services">
          {rec.candidates.map((c) => (
            <li key={c.serviceId} className="d-flex gap-2 align-items-baseline">
              <b className="text-nowrap">{fit(c)}</b><span>{c.serviceName}{c.status === 'growth' && <span className="badge rounded-pill bg-info-subtle text-info-emphasis ms-1">Growth</span>}
                {c.missingCapabilities.length > 0 && <span className="text-secondary"> · missing: {c.missingCapabilities.join(', ')}</span>}</span>
            </li>
          ))}
        </ul>
      )}
      <NaicsView naics={rec.naics ?? []} warnings={rec.naicsWarnings ?? []} targetName={rec.target?.serviceName ?? null}
        current={rec.target ? p.serviceCurrent(rec.target.serviceId) : null} busy={p.busy}
        onAdd={canAdopt ? p.onAddNaics : null} />
      {isNew && rec.proposedService && <ProposedServiceView draft={rec.proposedService} rec={rec} />}
      {rec.decision === 'EXPAND_EXISTING' && rec.expansion && (
        <ExpansionView ex={rec.expansion} current={p.serviceCurrent(rec.expansion.serviceId)} busy={p.busy} onApply={p.onApplyExpansion} />
      )}
      {rec.decision === 'INSUFFICIENT_EVIDENCE' && rec.missingInformation.length > 0 && (
        <ul className="small mb-2 ps-3">{rec.missingInformation.map((m) => <li key={m}>{m}</li>)}</ul>
      )}
      <details className="small mt-2">
        <summary className="text-secondary">Evidence and reasoning</summary>
        <ul className="list-unstyled mt-1 mb-1">
          {rec.evidence.map((e) => (
            <li key={e.text}><span className={`badge fw-normal me-1 ${e.kind === 'document_claim' ? 'bg-secondary-subtle text-secondary-emphasis' : 'bg-body text-secondary border'}`}>{e.kind === 'document_claim' ? 'Document claim' : 'AI inference'}</span>{e.text}</li>
          ))}
          {rec.alternativesConsidered.map((x) => <li key={x.decision + x.whyNot} className="text-secondary">Not {DECISION_META[x.decision].label.toLowerCase()}: {x.whyNot}</li>)}
          {rec.decision !== 'INSUFFICIENT_EVIDENCE' && rec.missingInformation.map((m) => <li key={m} className="text-secondary">Missing: {m}</li>)}
        </ul>
        <div className="text-secondary" style={{ fontSize: '.72rem' }}>Analyzed {new Date(a.analyzedAt).toLocaleString()} · {a.modelVersion} · {a.promptVersion}</div>
      </details>
      <div className="d-flex flex-wrap gap-2 mt-2">
        {canAdopt && <button type="button" className="btn btn-outline-success btn-sm" disabled={p.busy} onClick={p.onAdoptExisting} data-testid="gap-use-existing">Use existing: {rec.target!.serviceName}</button>}
        {isNew && rec.proposedService && <button type="button" className="btn btn-outline-danger btn-sm" disabled={p.busy} onClick={() => p.onReviewProposal(rec.proposedService!)} data-testid="gap-review-proposal">Review proposed service</button>}
        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={p.busy} onClick={() => p.onDismiss(isNew ? 'Not a new service' : 'Recommendation not used')} data-testid="gap-dismiss">{isNew ? 'Not a new service' : 'Dismiss'}</button>
        <button type="button" className="btn btn-link btn-sm" disabled={p.busy} onClick={() => p.onAnalyze(true)}>{p.busy ? 'Working…' : 'Reanalyze'}</button>
      </div>
    </Shell>
  );
}
