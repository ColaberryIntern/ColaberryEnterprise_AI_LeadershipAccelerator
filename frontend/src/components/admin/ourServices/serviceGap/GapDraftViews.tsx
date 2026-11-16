import React, { useState } from 'react';
import type { ExpansionDraft, GapRecommendation, NaicsSuggestion, ProposedServiceDraft } from '../../../../services/serviceGapApi';
import { MATURITY_LABEL, mergeExpansion, mergeNaics, type ServiceCurrent } from './serviceGapModel';

/**
 * GapDraftViews - the two "what exactly would change" views of an AI service recommendation:
 *   ProposedServiceView  a full Growth service draft (never created from here; "Review proposed service" pre-fills
 *                        the existing propose form, which the person still submits);
 *   ExpansionView        the exact diff to an existing service; "Apply change" needs a second, explicit confirm;
 *   NaicsView            work-performed NAICS for the case study (closed list on the server), marked on / not on the
 *                        matched service; adding the missing ones also needs a second confirm.
 */
const Row = ({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement => (
  <div className="d-flex gap-2 small"><span className="text-secondary flex-shrink-0" style={{ width: 110 }}>{label}</span><span>{children}</span></div>
);
const chips = (xs: string[], cls = 'bg-body-tertiary text-body-secondary border'): React.ReactNode =>
  xs.length ? <span className="d-inline-flex flex-wrap gap-1">{xs.map((x) => <span key={x} className={`badge fw-normal ${cls}`}>{x}</span>)}</span> : <span className="text-secondary">None</span>;

export function ProposedServiceView({ draft, rec }: { draft: ProposedServiceDraft; rec: GapRecommendation }): React.ReactElement {
  return (
    <div className="border rounded-3 p-2 bg-body" data-testid="gap-proposed-service">
      <div className="fw-bold small mb-1"><i className="ri-seedling-line me-1" aria-hidden="true" />{draft.name}
        <span className="badge rounded-pill bg-info-subtle text-info-emphasis ms-2">Enters as Growth</span></div>
      <div className="d-grid gap-1">
        <Row label="Buyer value">{draft.buyerValue ?? <span className="text-secondary">Not stated</span>}</Row>
        <Row label="Category">{draft.category ?? <span className="text-secondary">Not stated</span>}</Row>
        <Row label="Target buyer">{draft.targetBuyer ?? <span className="text-secondary">Not stated</span>}</Row>
        <Row label="Scope">{draft.scope ?? <span className="text-secondary">Not stated</span>}</Row>
        <Row label="Deliverables">{chips(draft.deliverables)}</Row>
        <Row label="Differentiators">{chips(draft.differentiators)}</Row>
        <Row label="Keywords">{chips(draft.keywords.map((k) => `#${k}`))}</Row>
        <Row label="NAICS / PSC">
          {chips([...draft.naicsSuggestionsUnverified, ...draft.pscSuggestionsUnverified], 'bg-warning-subtle text-warning-emphasis')}
          <span className="d-block text-warning-emphasis" style={{ fontSize: '.75rem' }}><i className="ri-alert-line me-1" aria-hidden="true" />Unverified suggestions. Check official NAICS/PSC definitions before any procurement claim. These NAICS go into the new service when you create it.</span>
        </Row>
        <Row label="Readiness">{MATURITY_LABEL[rec.maturity]}</Row>
      </div>
      {rec.duplicateWarnings.length > 0 && (
        <ul className="small text-danger-emphasis mb-0 mt-1 ps-3" data-testid="gap-duplicate-warnings">
          {rec.duplicateWarnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
    </div>
  );
}

export function ExpansionView({ ex, current, busy, onApply }: {
  ex: ExpansionDraft; current: ServiceCurrent | null; busy: boolean;
  onApply: (current: ServiceCurrent) => void;
}): React.ReactElement {
  const [confirming, setConfirming] = useState(false);
  const cur = current ?? { description: null, keywords: [], naicsCodes: [] };
  const next = mergeExpansion(cur, ex);
  const newKeywords = next.keywords.slice(cur.keywords.length);
  return (
    <div className="border rounded-3 p-2 bg-body" data-testid="gap-expansion">
      <div className="fw-bold small mb-1"><i className="ri-edit-2-line me-1" aria-hidden="true" />Proposed change to {ex.serviceName}</div>
      {cur.description && <div className="small text-secondary mb-1">Now: {cur.description}</div>}
      {[ex.descriptionAddition, ex.scopeChange].filter(Boolean).map((t) => (
        <div key={t as string} className="small text-success-emphasis"><span aria-hidden="true">+ </span><span className="visually-hidden">Adds: </span>{t}</div>
      ))}
      {newKeywords.length > 0 && <div className="small mt-1">Adds keywords: {chips(newKeywords.map((k) => `#${k}`), 'bg-success-subtle text-success-emphasis')}</div>}
      {next.naicsAdded.length > 0 && <div className="small mt-1" data-testid="gap-expansion-naics">Adds NAICS: {chips(next.naicsAdded, 'bg-success-subtle text-success-emphasis')}</div>}
      {!current && <div className="small text-warning-emphasis mt-1">The current service details could not be read, so the change cannot be applied here. Edit the service instead.</div>}
      <div className="mt-2 d-flex gap-2 flex-wrap">
        {!confirming ? (
          <button type="button" className="btn btn-outline-warning btn-sm" disabled={busy || !current || !next.changed} onClick={() => setConfirming(true)}>
            {next.changed ? 'Apply change…' : 'Already applied'}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-warning btn-sm" disabled={busy} onClick={() => current && onApply(current)} data-testid="gap-apply-expansion">
              {busy ? 'Saving…' : `Confirm: update ${ex.serviceName}`}
            </button>
            <button type="button" className="btn btn-link btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}

export function NaicsView({ naics, warnings, targetName, current, busy, onAdd }: {
  naics: NaicsSuggestion[]; warnings: string[]; targetName: string | null; current: ServiceCurrent | null; busy: boolean;
  onAdd: ((current: ServiceCurrent) => void) | null;
}): React.ReactElement | null {
  const [confirming, setConfirming] = useState(false);
  if (!naics.length && !warnings.length) return null;
  // Marked against what the service carries NOW (it may have changed since the analysis ran).
  const live = current ? new Set(current.naicsCodes) : null;
  const isOn = (n: NaicsSuggestion): boolean => (live ? live.has(n.code) : n.onTarget);
  const missing = current ? mergeNaics(current.naicsCodes, naics.map((n) => n.code)).added : [];
  return (
    <div className="mb-2" data-testid="gap-naics">
      <div className="small fw-bold text-secondary mb-1"><i className="ri-government-line me-1" aria-hidden="true" />NAICS for this work</div>
      <ul className="list-unstyled small mb-1">
        {naics.map((n) => (
          <li key={n.code} className="d-flex gap-2 align-items-baseline">
            <b className="text-nowrap">{n.code}</b><span className="me-auto">{n.title}</span>
            {targetName && (isOn(n)
              ? <span className="badge rounded-pill bg-success-subtle text-success-emphasis text-nowrap"><i className="ri-check-line me-1" aria-hidden="true" />On service</span>
              : <span className="badge rounded-pill bg-warning-subtle text-warning-emphasis text-nowrap">Not on service</span>)}
          </li>
        ))}
      </ul>
      <div className="text-secondary" style={{ fontSize: '.72rem' }}>Work-performed codes from a fixed list, suggested by AI. Check the official definition before a bid relies on one.</div>
      {warnings.map((w) => <div key={w} className="small text-danger-emphasis mt-1"><i className="ri-alert-line me-1" aria-hidden="true" />{w}</div>)}
      {onAdd && targetName && current && missing.length > 0 && (
        <div className="mt-1 d-flex gap-2 flex-wrap">
          {!confirming ? (
            <button type="button" className="btn btn-outline-secondary btn-sm py-0" disabled={busy} onClick={() => setConfirming(true)}>
              Add {missing.length} NAICS to {targetName}…
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary btn-sm py-0" disabled={busy} onClick={() => onAdd(current)} data-testid="gap-add-naics">
                {busy ? 'Saving…' : `Confirm: add ${missing.join(', ')}`}
              </button>
              <button type="button" className="btn btn-link btn-sm py-0" onClick={() => setConfirming(false)}>Cancel</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
