import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listGovProposalShare, setGovProposalShare,
  type GovAssignableBuilder, type ProposalShareLevel, type ProposalShareGrant,
} from '../../../services/factoryApi';

/**
 * TeamAccessPanel (P5) — "who works this, and how much of the proposal can they see". For each assignable builder
 * it shows a share segmented control (Not shared / Can view / Can comment / Can edit, default when first shared is
 * Can comment). Sharing is a PER-MEMBER grant (a row, server-side) that never widens anyone else's access.
 *
 * The qualification, the decision and PRICING are NEVER shared, at any level — the server projects the proposal to
 * a safe shape (govProposalShare.toSharedProposalView, unit-tested). This panel's "What a shared intern sees" box is
 * the view-as: it states exactly what each level reveals and what stays admin-only.
 */
const LEVELS: { value: ProposalShareLevel; label: string; cls: string }[] = [
  { value: 'none', label: 'Not shared', cls: 'btn-outline-secondary' },
  { value: 'view', label: 'Can view', cls: 'btn-outline-info' },
  { value: 'comment', label: 'Can comment', cls: 'btn-outline-primary' },
  { value: 'edit', label: 'Can edit', cls: 'btn-outline-success' },
];

export function TeamAccessPanel({
  canonicalOpportunityId, builders, canShare, responseCount,
}: {
  canonicalOpportunityId: string;
  builders: GovAssignableBuilder[];
  canShare: boolean;
  responseCount: number;
}): React.ReactElement {
  const [levels, setLevels] = useState<Record<string, ProposalShareLevel>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProposalShareLevel>('comment');

  const load = useCallback(async () => {
    if (!canShare) return;
    try {
      const { grants } = await listGovProposalShare(canonicalOpportunityId);
      const next: Record<string, ProposalShareLevel> = {};
      (grants ?? []).forEach((g: ProposalShareGrant) => { next[g.memberIdentityId] = g.level; });
      setLevels(next);
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Could not load the share grants.'); }
  }, [canonicalOpportunityId, canShare]);
  useEffect(() => { void load(); }, [load]);

  const setLevel = useCallback(async (memberIdentityId: string, level: ProposalShareLevel) => {
    setBusy(true); setError(null);
    setLevels((p) => ({ ...p, [memberIdentityId]: level })); // optimistic
    try {
      await setGovProposalShare(canonicalOpportunityId, memberIdentityId, level);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Could not set the share level.');
      void load(); // reconcile on failure
    } finally { setBusy(false); }
  }, [canonicalOpportunityId, load]);

  const seesAtPreview = useMemo(() => {
    if (preview === 'none') return 'nothing — the proposal is not shared.';
    const base = `the ${responseCount} proposal response${responseCount === 1 ? '' : 's'}`;
    if (preview === 'view') return `${base}, read-only.`;
    if (preview === 'comment') return `${base}, plus the open gap questions, and can comment.`;
    return `${base}, plus the open gaps, and can edit the answers.`;
  }, [preview, responseCount]);

  return (
    <div className="card shadow-sm mb-3">
      <div className="card-body">
        <h2 className="h6 fw-semibold mb-2"><i className="ri-team-line me-1" aria-hidden="true" />Team &amp; access</h2>
        {!canShare ? (
          <div className="alert alert-info py-2 mb-0 small" role="status">
            <i className="ri-information-line me-1" aria-hidden="true" />Assign an intern (create the monitored project) first; then you can share the proposal with them here.
          </div>
        ) : (
          <>
            <p className="small text-secondary mb-2">Share the proposal with an assigned builder. The qualification, the decision and <strong>pricing</strong> are never shared, at any level.</p>
            {error && <div className="alert alert-warning py-2 small" role="alert">{error}</div>}

            {builders.length === 0 ? (
              <div className="small text-secondary">No assignable builders on this project yet.</div>
            ) : (
              <div className="d-flex flex-column gap-2 mb-3">
                {builders.map((b) => {
                  const lvl = levels[b.identityId] ?? 'none';
                  return (
                    <div key={b.identityId} className="d-flex flex-wrap align-items-center justify-content-between gap-2 border rounded p-2">
                      <span className="small"><i className="ri-user-line me-1" aria-hidden="true" />{b.email || b.identityId}</span>
                      <div className="btn-group btn-group-sm" role="group" aria-label={`Share level for ${b.email || b.identityId}`}>
                        {LEVELS.map((opt) => (
                          <button key={opt.value} type="button"
                            className={`btn ${lvl === opt.value ? opt.cls.replace('btn-outline-', 'btn-') : opt.cls}`}
                            disabled={busy} aria-pressed={lvl === opt.value}
                            onClick={() => void setLevel(b.identityId, opt.value)}>{opt.label}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="border rounded p-2 bg-body-secondary">
              <div className="small fw-semibold mb-1"><i className="ri-eye-line me-1" aria-hidden="true" />Preview what a shared intern sees</div>
              <div className="btn-group btn-group-sm mb-2" role="group" aria-label="Preview level">
                {LEVELS.map((opt) => (
                  <button key={opt.value} type="button" className={`btn ${preview === opt.value ? 'btn-secondary' : 'btn-outline-secondary'}`}
                    aria-pressed={preview === opt.value} onClick={() => setPreview(opt.value)}>{opt.label}</button>
                ))}
              </div>
              <div className="small">At <strong>{LEVELS.find((l) => l.value === preview)?.label}</strong>, the intern sees {seesAtPreview}</div>
              <div className="small text-secondary mt-1">Never shared, at any level: the qualification, the bid decision, and any pricing requirement or figure (server-enforced).</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
