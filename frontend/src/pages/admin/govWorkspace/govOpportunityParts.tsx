import React, { useEffect, useState } from 'react';
import { matchServicesToOpportunity, type BoardStage, type GovOpportunity, type ServiceMatch } from '../../../services/factoryApi';
import { band, subtle, fmtValue, daysLeft, closeLabel } from '../govOppFormat';

/** The row-level pieces of the Gov Opportunities board, split out of AdminGovOpportunitiesPage to keep it under the size ceiling. */

const STAGE_BADGES: Record<Exclude<BoardStage, 'flagged' | 'below_bar'>, { label: string; cls: string; title: string }> = {
  vetted: { label: '\u2B50 AI vetted', cls: 'bg-success text-white', title: 'The AI read the ZIP and recommends pursuing. Read it, then build and assign.' },
  needs_read: { label: 'Needs your read', cls: 'bg-warning-subtle text-warning-emphasis', title: 'The AI could not call it, or a person has already started this one.' },
  approved: { label: 'Approved', cls: 'bg-success-subtle text-success-emphasis', title: 'A second admin approved it. Build the project and assign an intern.' },
  analyzing: { label: 'AI analyzing', cls: 'bg-info-subtle text-info-emphasis', title: 'The ZIP is in. The AI checks run on their own and finish by the next morning.' },
  needs_zip: { label: 'Awaiting ZIP', cls: 'bg-secondary-subtle text-secondary-emphasis', title: 'Passed the first check. Download the ZIP from Bonfire and upload it.' },
};

/** Where a row sits in the daily process. The same stages the morning email groups by. */
export function BoardStageBadge({ stage }: { stage: BoardStage }): React.ReactElement | null {
  if (stage === 'flagged' || stage === 'below_bar') return null;
  const b = STAGE_BADGES[stage];
  return <span className={`badge ${b.cls}`} title={b.title}>{b.label}</span>;
}

/** The main button's words for a stage. */
export function stageActionLabel(stage: BoardStage | undefined): string {
  if (stage === 'needs_zip') return 'Upload ZIP';
  if (stage === 'vetted' || stage === 'needs_read') return 'Read';
  if (stage === 'approved') return 'Build & assign';
  if (stage === 'analyzing') return 'Open';
  return 'Qualify';
}

/** The vetting-ladder ("approval level") badge for a row. Null for a not-yet-qualified row, so the caller falls
 *  back to the existing Unassessed / Approval-pending badges. Tones go through the shared `subtle()` token helper. */
export function VettingBadge({ v }: { v?: { stage: string } | null }): React.ReactElement | null {
  if (!v || v.stage === 'not_vetted') return null;
  const map: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'secondary' }> = {
    vetted: { label: 'Approved', tone: 'success' },
    rfi: { label: 'RFI response', tone: 'secondary' },
    awaiting_approval: { label: 'Awaiting approval', tone: 'secondary' },
    needs_requirements: { label: 'Needs requirements', tone: 'warning' },
    in_review: { label: 'In review', tone: 'secondary' },
    no_bid: { label: 'No-bid', tone: 'danger' },
  };
  const m = map[v.stage];
  if (!m) return null;
  return <span className={`badge ${subtle(m.tone)}`} title={`Qualification stage: ${v.stage}`}>{m.label}</span>;
}

/** The segmented High/Med/Low distribution bar + legend text. */
export function MixBar({ label, items }: { label: string; items: Array<number | null | undefined> }): React.ReactElement {
  const high = items.filter((s) => typeof s === 'number' && s >= 75).length;
  const med = items.filter((s) => typeof s === 'number' && s >= 60 && s < 75).length;
  const low = items.filter((s) => typeof s === 'number' && s < 60).length;
  const total = Math.max(high + med + low, 1);
  const seg = (n: number, tone: string) => n > 0 && <div className={`bg-${tone}`} style={{ width: `${(n / total) * 100}%` }} aria-hidden="true" />;
  return (
    <div className="d-flex align-items-center gap-3 flex-wrap">
      <span className="small fw-semibold" style={{ minWidth: 72 }}>{label}</span>
      <div className="d-flex rounded overflow-hidden flex-grow-1" style={{ height: 8, minWidth: 160, background: 'var(--surface-sunken)' }}>
        {seg(high, 'success')}{seg(med, 'warning')}{seg(low, 'danger')}
      </div>
      <span className="small text-secondary">{high} high · {med} med · {low} low</span>
    </div>
  );
}

/** A score chip: number + band label + a thin colored meter. */
export function ScoreChip({ score }: { score: number | null | undefined }): React.ReactElement {
  const b = band(score);
  const pct = Math.max(0, Math.min(100, typeof score === 'number' ? score : 0));
  return (
    <div style={{ minWidth: 92 }}>
      <div className="d-flex align-items-center gap-2 mb-1">
        <span className={`badge ${subtle(b.tone)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{typeof score === 'number' ? score : '—'}</span>
        <span className="small text-secondary">{b.label}</span>
      </div>
      <div className="progress" style={{ height: 4 }} role="presentation">
        <div className={`progress-bar bg-${b.tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * The per-row Details popup: why it surfaced (advisory scores + category + any OP verdict) and OP's PRELIMINARY,
 * UNVERIFIED overview. The overview is clearly labeled and can never become a confirmed requirement — qualification
 * (requirements, coverage, approval) happens in the separate workspace reached via Qualify.
 */
export function DetailsModal({ opp, onClose, onQualify, onDismiss, dismissing }: {
  opp: GovOpportunity; onClose: () => void; onQualify: () => void; onDismiss: () => void; dismissing: boolean;
}): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Advisory service suggestions (deterministic matcher, server-side). Best-effort: a failure shows the empty state.
  const [matches, setMatches] = useState<ServiceMatch[] | null>(null);
  const [matchLoading, setMatchLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setMatchLoading(true);
    matchServicesToOpportunity({ category: opp.category, title: opp.title, summary: opp.preliminarySummary })
      .then((r) => { if (active) setMatches(r.matches); })
      .catch(() => { if (active) setMatches([]); })
      .finally(() => { if (active) setMatchLoading(false); });
    return () => { active = false; };
  }, [opp.category, opp.title, opp.preliminarySummary]);

  const v = opp.vetVerdict;
  const dl = daysLeft(opp.closeDate);
  return (
    <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Opportunity details"
      style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable" role="document" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <div>
              <h5 className="modal-title">{opp.title}</h5>
              <div className="small text-secondary d-flex flex-wrap align-items-center gap-2 mt-1">
                <span>{opp.agency}</span>
                {opp.category && <span className="badge bg-secondary-subtle text-secondary-emphasis">{opp.category}</span>}
              </div>
            </div>
            <button type="button" className="btn-close" aria-label="Close" autoFocus onClick={onClose} />
          </div>
          <div className="modal-body">
            {/* Why it surfaced */}
            <div className="mb-3">
              <div className="text-uppercase small fw-semibold text-secondary mb-2" style={{ letterSpacing: '.05em' }}>Why it surfaced</div>
              <div className="d-flex flex-wrap gap-4">
                <div><div className="small text-secondary">Priority (legacy)</div><ScoreChip score={opp.priorityScore} /></div>
                <div><div className="small text-secondary">Fit (legacy)</div><ScoreChip score={opp.fitScore} /></div>
                <div>
                  <div className="small text-secondary">Est. value</div>
                  <div className="fw-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtValue(opp.estimatedValue)}</div>
                  <div className="small text-secondary">unverified</div>
                </div>
                <div>
                  <div className="small text-secondary">Closes</div>
                  <div>{closeLabel(opp.closeDate)}{dl !== null ? ` · ${dl} days` : ''} <i className="ri-error-warning-line text-warning" aria-hidden="true" title="Verify on the portal — timezone unverified." /></div>
                </div>
              </div>
              <div className="small text-secondary mt-2">
                {v
                  ? <><i className="ri-alert-line me-1" aria-hidden="true" />Source note: {(v.label ?? v.status ?? 'flagged').replace(/_/g, ' ')}{v.reason ? ` — ${v.reason}` : ''}<span className="text-secondary"> · method: {v.method ?? 'unknown'}{v.method === 'title_regex' || v.evidence == null ? ' (legacy, unevidenced — weak)' : ''}</span></>
                  : <>No source verdict — <strong>unassessed</strong>. Legacy discovery scores are advisory, not a verified company fit.</>}
              </div>
            </div>

            {/* Preliminary overview — labeled, unverified, never a requirement */}
            <div>
              <div className="text-uppercase small fw-semibold text-secondary mb-2" style={{ letterSpacing: '.05em' }}>Project overview</div>
              <div className="alert alert-warning py-2 px-3 small mb-2" role="note">
                <i className="ri-draft-line me-1" aria-hidden="true" />Preliminary, unverified — not confirmed requirements. Download and qualify the solicitation before relying on anything here.
              </div>
              {opp.preliminarySummary
                ? <p className="mb-0" style={{ whiteSpace: 'pre-line' }}>{opp.preliminarySummary}</p>
                : <p className="text-secondary mb-0">No preliminary summary available yet — open the source posting or qualify to learn more.</p>}
            </div>

            {/* Services we could offer — advisory, deterministic match against Our Services; a suggestion to confirm */}
            <div className="mt-3">
              <div className="text-uppercase small fw-semibold text-secondary mb-2" style={{ letterSpacing: '.05em' }}>
                Services we could offer <span className="badge bg-info-subtle text-info-emphasis ms-1">suggested — confirm</span>
              </div>
              {matchLoading ? (
                <p className="text-secondary small mb-0">Matching against Our Services…</p>
              ) : matches && matches.length > 0 ? (
                <ul className="list-unstyled mb-0">
                  {matches.map((m) => (
                    <li key={m.id} className="py-1 border-bottom">
                      <div className="d-flex align-items-center gap-2">
                        <span className="fw-semibold">{m.name}</span>
                        {m.category && <span className="badge bg-secondary-subtle text-secondary-emphasis">{m.category}</span>}
                        <span className={`badge ${m.strength === 'strong' ? 'bg-success-subtle text-success-emphasis' : m.strength === 'moderate' ? 'bg-warning-subtle text-warning-emphasis' : 'bg-secondary-subtle text-secondary-emphasis'}`}>{m.strength}</span>
                      </div>
                      <div className="small text-secondary">{m.reason}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-secondary small mb-0">No suggested services — add or refine keywords in <strong>Our Services</strong>.</p>
              )}
            </div>
          </div>
          <div className="modal-footer justify-content-between">
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={onDismiss} disabled={dismissing}>
              <i className="ri-eye-off-line me-1" aria-hidden="true" />{dismissing ? 'Dismissing…' : 'Dismiss'}
            </button>
            <div className="d-flex gap-2">
              {opp.sourceUrl && (
                <a className="btn btn-outline-secondary btn-sm" href={opp.sourceUrl} target="_blank" rel="noopener noreferrer">
                  <i className="ri-external-link-line me-1" aria-hidden="true" />Source
                </a>
              )}
              <button type="button" className="btn btn-danger btn-sm" onClick={onQualify}>Qualify <i className="ri-arrow-right-line" aria-hidden="true" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
