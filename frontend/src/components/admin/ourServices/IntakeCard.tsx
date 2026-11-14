import React, { useState } from 'react';
import type { IntakeSummaryItem } from '../../../services/ourServicesApi';
import { CaseStudyTitleLink, SourcePill } from './CaseStudyCard';
import { PRECHECK_AT, confidenceTone, industryIcon, suggestionConfidence } from './ourServicesModel';

/**
 * IntakeCard - one unlinked case study. Suggestions show a match confidence (derived from the suggestor's score,
 * see `suggestionConfidence`); those at 75 or more start checked. The gate stays locked until at least one service
 * is picked. "Link" confirms only the picked suggestions through the existing decide route and leaves the rest as
 * suggestions. "New service" proposes a Growth service from this case study. Nothing is confirmed without a click.
 */
interface Props {
  item: IntakeSummaryItem;
  growthServiceIds: Set<string>;
  onLink: (item: IntakeSummaryItem, linkIds: string[]) => Promise<void>;
  onPropose: (item: IntakeSummaryItem, name: string, category: string) => Promise<void>;
}

const BAR = { success: 'var(--status-success)', warning: 'var(--status-warning)', muted: 'var(--border-strong)' } as const;
const PCT = { success: 'text-success-emphasis', warning: 'text-warning-emphasis', muted: 'text-secondary' } as const;

export default function IntakeCard({ item, growthServiceIds, onLink, onPropose }: Props): React.ReactElement {
  const ranked = item.suggestions.map((s) => ({ ...s, pct: suggestionConfidence(s.matchScore) }));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(ranked.filter((s) => s.pct >= PRECHECK_AT).map((s) => s.linkId)));
  const [proposing, setProposing] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = picked.size > 0;
  const outside = item.sourceKind === 'outside';

  const toggle = (id: string): void => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'That did not save. Try again.');
    } finally { setBusy(false); }
  };

  return (
    <article className={`border rounded-3 bg-body overflow-hidden h-100 d-flex flex-column ${ready ? '' : 'border-danger-subtle'}`} aria-label={`Intake: ${item.title}`} data-testid={`intake-${item.id}`}>
      <header className="d-flex gap-3 p-3 border-bottom">
        <div className={`rounded-3 d-flex align-items-center justify-content-center flex-shrink-0 fs-3 ${outside ? 'bg-secondary-subtle' : 'bg-info-subtle'}`} style={{ width: 48, height: 48 }} aria-hidden="true"><i className={`${industryIcon(item.industry)} text-body-secondary`} /></div>
        <div className="flex-grow-1">
          <div className="fw-bold"><CaseStudyTitleLink id={item.id} title={item.title} /></div>
          <div className="small mt-1">
            <SourcePill kind={item.sourceKind} className="me-2" label={outside ? 'Outside · Google Drive' : 'Inside · Project Factory'} />
            <span className="text-secondary">{item.industry ?? 'Industry not set'} · {item.status}</span>
          </div>
          {item.analysisError && <div className="small text-warning-emphasis mt-1"><i className="ri-error-warning-line me-1" aria-hidden="true" />Needs manual details: the AI could not read this document.</div>}
          {item.keywords.length > 0 && (
            <div className="d-flex flex-wrap gap-1 mt-2">{item.keywords.slice(0, 10).map((k) => <span key={k} className="badge bg-body-tertiary text-body-secondary fw-normal border">#{k}</span>)}</div>
          )}
        </div>
      </header>
      <div className="p-3 flex-grow-1">
        <div className="small fw-bold text-secondary mb-1"><i className="ri-robot-2-line me-1" aria-hidden="true" />Suggested services</div>
        {ranked.length === 0 ? (
          <p className="small text-secondary mb-0">No suggestions yet. Propose a new service, or link it from a service's Evidence panel.</p>
        ) : (
          <fieldset>
            <legend className="visually-hidden">Services to link {item.title} to</legend>
            {ranked.map((s) => {
              const tone = confidenceTone(s.pct);
              const id = `pick-${item.id}-${s.linkId}`;
              return (
                <div key={s.linkId} className="d-grid align-items-center gap-2 py-1 border-bottom" style={{ gridTemplateColumns: '20px 1fr 110px 44px', borderBottomStyle: 'dashed' }}>
                  <input id={id} type="checkbox" className="form-check-input m-0" checked={picked.has(s.linkId)} onChange={() => toggle(s.linkId)} disabled={busy} />
                  <label htmlFor={id} className="small mb-0" title={s.rationale ?? undefined}>
                    {s.serviceName} {growthServiceIds.has(s.serviceId) && <span className="badge rounded-pill bg-info-subtle text-info-emphasis"><i className="ri-seedling-line me-1" aria-hidden="true" />Growth</span>}
                  </label>
                  <div className="progress" style={{ height: 7 }} role="progressbar" aria-label={`Match confidence for ${s.serviceName}`} aria-valuenow={s.pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="progress-bar" style={{ width: `${s.pct}%`, background: BAR[tone] }} />
                  </div>
                  <span className={`small fw-bold text-end ${PCT[tone]}`}>{s.pct}%</span>
                </div>
              );
            })}
          </fieldset>
        )}
        {error && <div className="alert alert-danger py-1 px-2 small mt-2 mb-0" role="alert">{error}</div>}
      </div>
      {proposing && (
        <form className="p-3 border-top bg-warning-subtle" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) void run(() => onPropose(item, name.trim(), category.trim())); }}>
          <div className="fw-bold small"><i className="ri-seedling-line me-1" aria-hidden="true" />Propose a new service</div>
          <div className="small text-secondary mb-2">It enters the catalog as Growth with this case study as its first proof.</div>
          <label htmlFor={`ns-name-${item.id}`} className="form-label small mb-1">Service name</label>
          <input id={`ns-name-${item.id}`} className="form-control form-control-sm mb-2" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required minLength={2} />
          <label htmlFor={`ns-cat-${item.id}`} className="form-label small mb-1">Category <span className="text-secondary">(optional)</span></label>
          <input id={`ns-cat-${item.id}`} className="form-control form-control-sm mb-2" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={120} />
          <button type="submit" className="btn btn-success btn-sm" disabled={busy || name.trim().length < 2}>Create service & link</button>
        </form>
      )}
      <footer className="d-flex flex-wrap gap-2 align-items-center p-3 border-top bg-body-tertiary">
        <span className={`small fw-bold me-auto ${ready ? 'text-success-emphasis' : 'text-danger-emphasis'}`} role="status" data-testid="intake-gate">
          <i className={`${ready ? 'ri-lock-unlock-line' : 'ri-lock-line'} me-1`} aria-hidden="true" />
          {ready ? `Ready: ${picked.size} service${picked.size === 1 ? '' : 's'} selected` : 'Pick at least one service'}
        </span>
        <button type="button" className="btn btn-outline-danger btn-sm" aria-expanded={proposing} onClick={() => setProposing((v) => !v)} disabled={busy}><i className="ri-seedling-line me-1" aria-hidden="true" />New service</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!ready || busy} onClick={() => void run(() => onLink(item, [...picked]))}
          title={outside
            ? 'Outside case studies are internal evidence only; linking does not make them public.'
            : 'Confirms the picked links, which clears the must-link publish blocker. Publishing itself still runs through Case Studies and its other checks.'}>
          {busy ? 'Saving…' : outside ? 'Link (internal only)' : 'Link & publish'}
        </button>
      </footer>
    </article>
  );
}
