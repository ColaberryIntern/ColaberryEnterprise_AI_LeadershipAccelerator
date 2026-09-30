import React, { useCallback, useEffect, useState } from 'react';
import { SectionCard } from '../../../components/admin/shell';
import { fetchPendingEvidence, setEvidenceState, EvidenceMapping } from '../../../services/certPrepAdminApi';

/**
 * CertEvidenceReviewPanel — auto-matching proposes, a human disposes.
 *
 * Every evidence candidate the matcher produces lands as `pending` and counts
 * for nothing. Readiness only ever counts VERIFIED rows, because a credential a
 * student can award themselves is worth nothing. This panel is where that
 * verification happens, and the queue is scoped to the cohort selected on the
 * page rather than fetched globally: an instructor reviews the students in front
 * of them.
 *
 * A REJECTION REQUIRES A REASON, which the API does not enforce and this UI
 * does. The rejections are the entries somebody comes back to read six weeks
 * later — "why didn't my build count?" — and a rejection with no reason cannot
 * answer that. Verification needs no reason: the artifact speaks for itself.
 *
 * The matcher's own rationale is shown on every row, because the reviewer is
 * being asked to agree or disagree with a specific claim, not to guess why a
 * row appeared.
 */

export function EvidenceRow({ m, onDecided }: { m: EvidenceMapping; onDecided: (id: string) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'verified' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (state: 'verified' | 'rejected') => {
    if (state === 'rejected' && reason.trim().length === 0) {
      setError('A rejection needs a reason — the student will ask.');
      return;
    }
    setBusy(state);
    setError(null);
    try {
      await setEvidenceState(m.id, state, state === 'rejected' ? reason.trim() : undefined);
      onDecided(m.id);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not record the decision.');
      setBusy(null);
    }
  };

  return (
    <div className="border rounded p-3 mb-3">
      <div className="small text-muted mb-1">
        <code>{m.domain_id}</code>
        {m.objective_id && <> · <code>{m.objective_id}</code></>}
        {' · '}{m.source_type}
        {' · '}{m.auto_matched ? 'auto-matched' : 'manual'}
      </div>
      <div className="mb-2">
        <span className="text-muted small">Enrollment</span> <code>{m.enrollment_id}</code>
        {' '}<span className="text-muted small">Source</span> <code>{m.source_id}</code>
      </div>
      {m.mapping_rationale && (
        <p className="small mb-2"><strong>Why it was proposed:</strong> {m.mapping_rationale}</p>
      )}

      <div className="row g-2 align-items-start">
        <div className="col-12 col-md-7">
          <label className="visually-hidden" htmlFor={`reason-${m.id}`}>Reason for rejecting this evidence</label>
          <input
            id={`reason-${m.id}`}
            className="form-control form-control-sm"
            placeholder="Reason (required to reject)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </div>
        <div className="col-12 col-md-5 d-flex gap-2">
          <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => decide('verified')}>
            {busy === 'verified' ? 'Verifying…' : 'Verify'}
          </button>
          <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy !== null} onClick={() => decide('rejected')}>
            {busy === 'rejected' ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger py-2 small mt-2 mb-0">{error}</div>}
    </div>
  );
}

export default function CertEvidenceReviewPanel({ enrollmentIds }: { enrollmentIds: string[] }) {
  const [rows, setRows] = useState<EvidenceMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The id list is carried as a joined string so the effect depends on a stable
   * primitive: a new array identity on every parent render would otherwise
   * refetch the queue continuously. The ids are split back out inside, which
   * keeps the dependency honest rather than silenced.
   */
  const key = enrollmentIds.join(',');

  const load = useCallback(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) { setRows([]); return Promise.resolve(); }
    setLoading(true);
    setError(null);
    return fetchPendingEvidence(ids)
      .then(setRows)
      .catch(() => setError('Could not load pending evidence.'))
      .finally(() => setLoading(false));
  }, [key]);

  useEffect(() => { load(); }, [load]);

  return (
    <SectionCard
      title="Evidence awaiting a decision"
      subtitle="Auto-matching proposes; readiness counts only what a named human verified."
      icon="file-check-line"
    >
      {enrollmentIds.length === 0 && (
        <p className="text-muted mb-0">Select a cohort on the Cohort tab first — the queue is scoped to its students.</p>
      )}
      {error && <div className="alert alert-danger">{error}</div>}
      {loading && <p className="text-muted mb-0">Loading…</p>}
      {!loading && enrollmentIds.length > 0 && rows.length === 0 && (
        <p className="text-muted mb-0">Nothing pending for this cohort.</p>
      )}
      {!loading && rows.map((m) => (
        <EvidenceRow key={m.id} m={m} onDecided={(id) => setRows((prev) => prev.filter((r) => r.id !== id))} />
      ))}
    </SectionCard>
  );
}
