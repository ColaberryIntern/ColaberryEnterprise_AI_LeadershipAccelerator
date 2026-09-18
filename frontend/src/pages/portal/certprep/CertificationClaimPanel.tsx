import React, { useCallback, useEffect, useState } from 'react';
import {
  CertificationClaim, listMyCertifications, submitCertification, fetchMyCertificationFileUrl, TRACK_LABELS,
} from '../../../services/certificationApi';

/**
 * CertificationClaimPanel — "Your certificate": where a student uploads the
 * certification they passed, and sees what staff decided.
 *
 * Decision D4 (docs/POINTS_LADDER_DECISIONS.md): the upload lives in the Cert
 * section; approval happens in admin; only an approved claim counts toward AI
 * Architect. This panel therefore never says "you are an AI Architect" — it
 * says what was submitted and what staff said about it.
 *
 * Rendered in every state of the Cert Prep page, including the pre-Week-7
 * lock and the feature-off error: a certificate already earned must be
 * uploadable regardless of where practice stands.
 */

const STATUS_COPY: Record<CertificationClaim['status'], { label: string; tone: 'good' | 'warn' | 'low' }> = {
  pending: { label: 'Waiting for review', tone: 'warn' },
  approved: { label: 'Approved', tone: 'good' },
  rejected: { label: 'Not accepted', tone: 'low' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const ClaimRow: React.FC<{ claim: CertificationClaim }> = ({ claim }) => {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const status = STATUS_COPY[claim.status];

  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);

  const open = async () => {
    setOpening(true);
    try {
      const url = fileUrl ?? await fetchMyCertificationFileUrl(claim.id);
      setFileUrl(url);
      window.open(url, '_blank', 'noopener');
    } catch {
      /* the button simply stays; the file is still on record */
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className={`cp-claim cp-claim--${status.tone}`}>
      <div className="cp-claim-head">
        <span className="cp-claim-status">{status.label}</span>
        <span className="cp-claim-meta">Submitted {fmtDate(claim.submitted_at)}</span>
      </div>
      <div className="cp-claim-body">
        <b>{TRACK_LABELS[claim.track] ?? claim.track}</b>
        {claim.credential_id && <span> · Credential {claim.credential_id}</span>}
        {claim.passed_on && <span> · Passed {fmtDate(claim.passed_on)}</span>}
      </div>
      {claim.status === 'approved' && claim.reviewed_by && (
        <p className="cp-claim-note">Verified by {claim.reviewed_by}{claim.reviewed_at ? ` on ${fmtDate(claim.reviewed_at)}` : ''}. This counts toward AI Architect.</p>
      )}
      {claim.status === 'rejected' && (
        <p className="cp-claim-note">{claim.review_note ? `Staff note: ${claim.review_note}` : 'Staff could not accept this upload.'} You can submit a new one below.</p>
      )}
      {claim.status === 'pending' && (
        <p className="cp-claim-note">Staff review certificates by hand. You will see the decision here.</p>
      )}
      <button type="button" className="cp-btn cp-btn--ghost cp-claim-open" onClick={open} disabled={opening}>
        {opening ? 'Opening…' : `Open ${claim.original_name ?? 'file'}`}
      </button>
    </div>
  );
};

const CertificationClaimPanel: React.FC = () => {
  const [claims, setClaims] = useState<CertificationClaim[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [credentialId, setCredentialId] = useState('');
  const [passedOn, setPassedOn] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setClaims(await listMyCertifications());
      setLoadError(null);
    } catch {
      setClaims([]);
      setLoadError('Your certificates could not be loaded right now.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const open = (claims ?? []).find((c) => c.status === 'pending' || c.status === 'approved') ?? null;
  const canSubmit = !open;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setSubmitError('Attach your certificate as a PDF or an image.'); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitCertification({ file, credentialId: credentialId.trim() || undefined, passedOn: passedOn || undefined, note: note.trim() || undefined });
      setFile(null); setCredentialId(''); setPassedOn(''); setNote('');
      await load();
    } catch (err: any) {
      setSubmitError(err?.response?.data?.message ?? 'The upload did not go through. Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="cp-claims" aria-labelledby="cp-claims-h">
      <h3 id="cp-claims-h" className="cp-claims-h">Your certificate</h3>
      <p className="cp-note">
        Passed the exam? Upload the certificate here. A staff member checks it and approves it;
        an approved certification is what moves a Program Graduate to <b>AI Architect</b>.
      </p>

      {loadError && <p className="cp-claim-error" role="alert">{loadError}</p>}
      {claims === null && !loadError && <p className="cp-note">Loading…</p>}
      {(claims ?? []).map((c) => <ClaimRow key={c.id} claim={c} />)}

      {canSubmit && claims !== null && (
        <form className="cp-claim-form" onSubmit={onSubmit}>
          <label className="cp-field">
            <span>Certificate file <small>PDF, PNG, JPG or WEBP · up to 15MB</small></span>
            <input
              id="cert-claim-file"
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <div className="cp-field-row">
            <label className="cp-field">
              <span>Credential ID <small>optional</small></span>
              <input id="cert-claim-credential" type="text" maxLength={120} value={credentialId} onChange={(e) => setCredentialId(e.target.value)} placeholder="As printed on the certificate" />
            </label>
            <label className="cp-field">
              <span>Date passed <small>optional</small></span>
              <input id="cert-claim-passed-on" type="date" value={passedOn} onChange={(e) => setPassedOn(e.target.value)} />
            </label>
          </div>
          <label className="cp-field">
            <span>Note for the reviewer <small>optional</small></span>
            <textarea id="cert-claim-note" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {submitError && <p className="cp-claim-error" role="alert">{submitError}</p>}
          <button type="submit" className="cp-btn cp-btn--primary" disabled={submitting}>
            {submitting ? 'Uploading…' : 'Submit for review'}
          </button>
        </form>
      )}
    </section>
  );
};

export default CertificationClaimPanel;
