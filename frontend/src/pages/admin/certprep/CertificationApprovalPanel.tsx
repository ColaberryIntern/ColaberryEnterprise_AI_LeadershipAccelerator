import React, { useCallback, useEffect, useState } from 'react';
import { SectionCard } from '../../../components/admin/shell';
import {
  AdminCertificationClaim, CertificationStatus, fetchCertificationQueue, reviewCertification, fetchCertificationFileUrl, TRACK_LABELS,
} from '../../../services/certificationApi';

/**
 * CertificationApprovalPanel — the staff side of ladder decision D4: the queue
 * of certificates students uploaded, each approved or rejected by a named
 * admin. Approval latches the milestone and re-ranks the student on the spot;
 * the outcome line says what happened so the reviewer does not have to go
 * and look.
 *
 * "We are the approvers": nothing here reads Cert Prep readiness. The file is
 * opened as a blob so the admin session's auth travels with the request.
 */

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ClaimRow({ claim, onDecided }: { claim: AdminCertificationClaim; onDecided: (updated: AdminCertificationClaim, line: string) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approved' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);

  const openFile = async () => {
    try {
      const url = fileUrl ?? await fetchCertificationFileUrl(claim.id);
      setFileUrl(url);
      window.open(url, '_blank', 'noopener');
    } catch {
      setError('The file could not be opened.');
    }
  };

  const decide = async (decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && note.trim().length === 0) {
      setError('A rejection needs a note — the student will read it.');
      return;
    }
    setBusy(decision);
    setError(null);
    try {
      const out = await reviewCertification(claim.id, decision, note.trim() || undefined);
      const line = decision === 'approved'
        ? (out.promotion
          ? `Approved. ${out.promotion.promoted ? `Promoted to ${out.promotion.level.replace(/_/g, ' ')} (rank ${out.promotion.rank}).` : `Rank unchanged (${out.promotion.level.replace(/_/g, ' ')}) — needs Program Graduate first.`}`
          : 'Approved. Milestone recorded; rank will follow on the nightly sweep.')
        : 'Rejected. The student can upload again.';
      onDecided(out.certification, line);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.response?.data?.error ?? 'Could not record the decision.');
      setBusy(null);
    }
  };

  return (
    <div className="border rounded p-3 mb-3">
      <div className="d-flex justify-content-between flex-wrap gap-2 mb-1">
        <div>
          <strong>{TRACK_LABELS[claim.track] ?? claim.track}</strong>
          <span className="text-muted small"> · submitted {fmt(claim.submitted_at)}</span>
        </div>
        <span className={`badge ${claim.status === 'approved' ? 'bg-success' : claim.status === 'rejected' ? 'bg-danger' : 'bg-warning text-dark'}`}>{claim.status}</span>
      </div>
      <div className="small mb-2">
        <span className="text-muted">Enrollment</span> <code>{claim.enrollment_id}</code>
        {claim.credential_id && <> · <span className="text-muted">Credential</span> <code>{claim.credential_id}</code></>}
        {claim.passed_on && <> · <span className="text-muted">Passed</span> {claim.passed_on}</>}
        {claim.original_name && <> · <span className="text-muted">File</span> {claim.original_name}</>}
      </div>
      {claim.note && <p className="small mb-2"><strong>Student note:</strong> {claim.note}</p>}
      {claim.reviewed_by && (
        <p className="small text-muted mb-2">Reviewed by {claim.reviewed_by} on {fmt(claim.reviewed_at)}{claim.review_note ? ` — ${claim.review_note}` : ''}</p>
      )}
      <div className="d-flex flex-wrap gap-2 align-items-center">
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={openFile}>
          <i className="ri-file-text-line me-1" aria-hidden="true" />Open certificate
        </button>
        {claim.status === 'pending' && (
          <>
            <input
              id={`cert-review-note-${claim.id}`}
              className="form-control form-control-sm"
              style={{ maxWidth: 360 }}
              placeholder="Note (required to reject)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
            />
            <button type="button" className="btn btn-sm btn-success" disabled={busy !== null} onClick={() => decide('approved')}>
              {busy === 'approved' ? 'Approving…' : 'Approve'}
            </button>
            <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy !== null} onClick={() => decide('rejected')}>
              {busy === 'rejected' ? 'Rejecting…' : 'Reject'}
            </button>
          </>
        )}
      </div>
      {error && <p className="small text-danger mt-2 mb-0" role="alert">{error}</p>}
    </div>
  );
}

const CertificationApprovalPanel: React.FC = () => {
  const [status, setStatus] = useState<CertificationStatus | 'all'>('pending');
  const [claims, setClaims] = useState<AdminCertificationClaim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setClaims(await fetchCertificationQueue(status));
      setError(null);
    } catch (err: any) {
      setClaims([]);
      setError(err?.response?.data?.message ?? 'The queue could not be loaded.');
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const onDecided = (updated: AdminCertificationClaim, line: string) => {
    setOutcomes((o) => ({ ...o, [updated.id]: line }));
    setClaims((list) => (list ?? []).map((c) => (c.id === updated.id ? updated : c)));
  };

  return (
    <SectionCard
      title="Certificates to approve"
      subtitle="A student uploads the certificate they passed; a named admin approves it. An approved certificate is what moves a Program Graduate to AI Architect."
    >
      <div className="d-flex align-items-center gap-2 mb-3">
        <label htmlFor="cert-queue-status" className="small text-muted mb-0">Show</label>
        <select id="cert-queue-status" className="form-select form-select-sm" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value as CertificationStatus | 'all')}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void load()}>Refresh</button>
      </div>
      {error && <p className="text-danger small" role="alert">{error}</p>}
      {claims === null && !error && <p className="text-muted small">Loading…</p>}
      {claims !== null && claims.length === 0 && !error && <p className="text-muted small">Nothing {status === 'all' ? 'submitted yet' : status}.</p>}
      {(claims ?? []).map((c) => (
        <div key={c.id}>
          <ClaimRow claim={c} onDecided={onDecided} />
          {outcomes[c.id] && <p className="small text-success mt-n2 mb-3" role="status">{outcomes[c.id]}</p>}
        </div>
      ))}
    </SectionCard>
  );
};

export default CertificationApprovalPanel;
