import React, { useCallback, useState } from 'react';
import {
  assessCapabilityFit, recordCapabilityDecisions, createServiceOffering,
  type CapabilityItem, type FitAssessment, type CapabilityDecision, type CapabilityDecisionsPayload,
} from '../../../services/factoryApi';
import type { GapsResult } from '../govGaps';

/**
 * FitCapabilitiesPanel (P3) — Step 3 "Fit". Runs the ADVISORY capability assessment (derive 5-8 capabilities the
 * scope needs, assess each against the ACTIVE service catalog as have / partial / new), lets the admin write a new
 * capability back to Our Services or add it as a growth capability (excluded from fit, kept in reporting), tick the
 * eligibility gates (deterministic, always shown), and SAVE the decisions onto the record. Self-contained: owns the
 * fetch, the write-backs and the persist; the page just renders it. Advisory only — sets no gate.
 */
const META: Record<FitAssessment, { label: string; badge: string; tile: string }> = {
  have: { label: 'We have it', badge: 'bg-success-subtle text-success-emphasis', tile: 'border-success' },
  partial: { label: 'Partly', badge: 'bg-warning-subtle text-warning-emphasis', tile: 'border-warning' },
  new: { label: 'New capability', badge: 'bg-primary-subtle text-primary-emphasis', tile: 'border-primary' },
};

export function FitCapabilitiesPanel({
  canonicalOpportunityId, needs, title, buyer, gaps, biddingEntity, version, canWrite, onSaved,
}: {
  canonicalOpportunityId: string;
  needs: { id: string; text: string }[];
  title: string | null;
  buyer: string | null;
  gaps: GapsResult;
  biddingEntity: string;
  version: number;
  canWrite: boolean;
  onSaved: () => void;
}): React.ReactElement {
  const [caps, setCaps] = useState<CapabilityItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [actions, setActions] = useState<Record<string, CapabilityDecision['action']>>({});
  const [eligChecked, setEligChecked] = useState<Record<string, boolean>>({});

  const assess = useCallback(async () => {
    if (needs.length === 0) { setError('Establish the cited requirements first; the assessment works from them.'); return; }
    setLoading(true); setError(null); setNote(null);
    try {
      const r = await assessCapabilityFit(canonicalOpportunityId, { requirements: needs.map((n) => ({ id: n.id, text: n.text })), title, buyer });
      if (r.error) { setError(r.error); setCaps(null); } else { setCaps(r.capabilities); }
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Could not assess capability fit.');
    } finally { setLoading(false); }
  }, [canonicalOpportunityId, needs, title, buyer]);

  // Write a new/partial capability back to Our Services (active) or as a growth capability (excluded from fit).
  const writeBack = useCallback(async (cap: CapabilityItem, as: 'active' | 'growth') => {
    setBusy(true); setNote(null); setError(null);
    try {
      await createServiceOffering({
        name: cap.name,
        description: cap.whatItIs || cap.rationale || undefined,
        category: as === 'growth' ? 'growth capability' : undefined,
        status: as,
      });
      setActions((p) => ({ ...p, [cap.id]: as === 'growth' ? 'added_growth' : 'updated_service' }));
      setNote(as === 'growth' ? `Added "${cap.name}" as a growth capability (excluded from fit).` : `Added "${cap.name}" to Our Services. Refine it on the Our Services page.`);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Could not save the service.');
    } finally { setBusy(false); }
  }, []);

  const markPartner = useCallback((cap: CapabilityItem) => {
    setActions((p) => ({ ...p, [cap.id]: 'find_partner' }));
    setNote(`Noted: find a teaming partner for "${cap.name}".`);
  }, []);

  const save = useCallback(async () => {
    setBusy(true); setError(null);
    const payload: CapabilityDecisionsPayload = {
      decisions: (caps ?? []).map((c): CapabilityDecision => ({ id: c.id, name: c.name, assessment: c.assessment, matchedServiceId: c.matchedServiceId, action: actions[c.id] ?? 'none' })),
      eligibilityResolved: Object.keys(eligChecked).filter((k) => eligChecked[k]),
      savedAt: new Date().toISOString(),
    };
    try {
      await recordCapabilityDecisions(canonicalOpportunityId, { biddingEntity, expectedVersion: version, capabilities: payload });
      setNote('Fit decisions saved.');
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Could not save the fit decisions.');
    } finally { setBusy(false); }
  }, [caps, actions, eligChecked, canonicalOpportunityId, biddingEntity, version, onSaved]);

  const counts = caps ? { have: 0, partial: 0, new: 0 } : null;
  if (caps && counts) for (const c of caps) counts[c.assessment] += 1;
  const hasSomethingToSave = !!caps || gaps.items.length > 0;

  return (
    <div className="card shadow-sm mb-3">
      <div className="card-body">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <h2 className="h6 fw-semibold mb-0"><i className="ri-scales-3-line me-1" aria-hidden="true" />Can we deliver it?</h2>
          <button type="button" className="btn btn-outline-primary btn-sm" disabled={loading || busy || needs.length === 0} onClick={() => void assess()}>
            <i className="ri-sparkling-2-line me-1" aria-hidden="true" />{loading ? 'Assessing…' : caps ? 'Re-assess' : 'Assess fit with AI'}
          </button>
        </div>
        <p className="small text-secondary mb-3">Advisory: the AI derives the capabilities this scope needs and checks each against Our Services (active catalog only). It sets no gate; confirm it with your judgment.</p>

        {error && <div className="alert alert-warning py-2 small" role="alert">{error}</div>}
        {note && <div className="alert alert-success py-2 small" role="status">{note}</div>}

        {!caps && !loading && needs.length === 0 && (
          <p className="small text-secondary">No requirements established yet — establish the cited requirements on the Solicitation step first, then assess fit.</p>
        )}

        {caps && counts && (
          <>
            <div className="row g-2 mb-3">
              {(['have', 'partial', 'new'] as FitAssessment[]).map((a) => (
                <div key={a} className="col-4">
                  <div className={`border rounded-3 p-2 text-center ${META[a].tile}`}>
                    <div className="h4 mb-0 fw-bold">{counts[a]}</div>
                    <div className="small text-secondary">{META[a].label}</div>
                  </div>
                </div>
              ))}
            </div>
            {caps.length === 0 ? (
              <p className="small text-secondary">No capabilities were derived. Re-assess, or establish more requirements.</p>
            ) : (
              <div className="d-flex flex-column gap-2 mb-3">
                {caps.map((c) => {
                  const m = META[c.assessment];
                  const act = actions[c.id];
                  return (
                    <div key={c.id} className="border rounded-3 p-2">
                      <div>
                        <span className="fw-semibold small me-2">{c.name}</span>
                        <span className={`badge ${m.badge}`}>{m.label}</span>
                        {act && act !== 'none' ? <span className="badge bg-info-subtle text-info-emphasis ms-1">{act.replace(/_/g, ' ')}</span> : null}
                      </div>
                      {c.why ? <div className="small text-secondary mt-1">{c.why}</div> : null}
                      {c.rationale ? <div className="small mt-1">{c.rationale}</div> : null}
                      {c.assessment !== 'have' && (
                        <div className="mt-2 small">
                          {c.whatItIs ? <div><strong>What it is:</strong> {c.whatItIs}</div> : null}
                          {c.whatThisBidGivesUs ? <div><strong>What this bid gives us:</strong> {c.whatThisBidGivesUs}</div> : null}
                          {c.toDeliver ? <div><strong>To deliver:</strong> {c.toDeliver}</div> : null}
                          {canWrite && (
                            <div className="d-flex flex-wrap gap-2 mt-2">
                              <button type="button" className="btn btn-outline-success btn-sm" disabled={busy} onClick={() => void writeBack(c, 'active')}>
                                <i className="ri-add-line me-1" aria-hidden="true" />We already do this — add to Our Services
                              </button>
                              <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy} onClick={() => void writeBack(c, 'growth')}>
                                <i className="ri-seedling-line me-1" aria-hidden="true" />Add as a growth capability
                              </button>
                              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => markPartner(c)}>
                                <i className="ri-team-line me-1" aria-hidden="true" />Find a teaming partner
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {gaps.items.length > 0 && (
          <div className="mb-3">
            <div className="small fw-semibold text-uppercase text-secondary mb-1">Eligibility checks</div>
            <p className="small text-secondary mb-2">Advisory eligibility gates that could disqualify a bid; tick each once verified or resolved.</p>
            {gaps.items.map((g) => (
              <div key={g.kind + g.id} className="form-check small">
                <input className="form-check-input" type="checkbox" id={`elig-${g.kind}-${g.id}`} checked={!!eligChecked[g.kind + g.id]}
                  onChange={(e) => setEligChecked((p) => ({ ...p, [g.kind + g.id]: e.target.checked }))} />
                <label className="form-check-label" htmlFor={`elig-${g.kind}-${g.id}`}>
                  <span className={`badge me-1 ${g.kind === 'blocking' ? 'bg-danger-subtle text-danger-emphasis' : 'bg-warning-subtle text-warning-emphasis'}`}>{g.kind === 'blocking' ? 'blocking' : 'verify'}</span>
                  {g.text}
                </label>
              </div>
            ))}
          </div>
        )}

        {hasSomethingToSave && (canWrite ? (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save()}>
            <i className="ri-save-line me-1" aria-hidden="true" />Save fit decisions
          </button>
        ) : (
          <div className="alert alert-info py-2 mb-0 small" role="status"><i className="ri-information-line me-1" aria-hidden="true" />Open the qualification on the <strong>Decide</strong> step to save these decisions.</div>
        ))}
      </div>
    </div>
  );
}
