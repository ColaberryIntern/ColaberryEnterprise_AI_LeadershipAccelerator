import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SectionCard, StatusBadge } from '../shell';
import {
  AdminDocumentsView,
  fetchInternshipDocumentsAdmin,
  internshipDocumentFileUrl,
  verifyInternshipDocument,
} from '../../../services/adminInternshipApi';

/**
 * Document verification for a reviewer.
 *
 * ── YOU CANNOT ACCEPT WHAT YOU HAVE NOT OPENED ─────────────────────────────
 *
 * "Admin verifies completeness and marks it accepted or requests correction." The
 * point of verification is that a human looked at the signature, so the Accept
 * control is disabled until the reviewer has opened the file. That is not
 * paternalism — a queue of Accept buttons beside unopened files is a rubber stamp,
 * and the whole reason this gate exists is that someone checks.
 *
 * ── AND A CORRECTION MUST SAY WHAT TO FIX ──────────────────────────────────
 *
 * Requesting a correction requires a reason, because the applicant is shown it
 * verbatim and "rejected" with no explanation just produces the same upload again.
 * The server enforces this too; the UI simply stops the reviewer wasting a click.
 */

const InternshipDocumentPanel: React.FC<{
  applicationId: string;
  onChanged?: () => void;
}> = ({ applicationId, onChanged }) => {
  const [view, setView] = useState<AdminDocumentsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setView(await fetchInternshipDocumentsAdmin(applicationId));
      setError(null);
    } catch {
      setView(null);
      setError('Could not load the documents. This is a request failure, not an empty pack.');
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => { void load(); }, [load]);

  const uploads = useMemo(
    () => (view?.documents ?? []).filter((d) => d.kind === 'signed_upload'),
    [view],
  );
  const generated = useMemo(
    () => (view?.documents ?? []).filter((d) => d.kind === 'generated'),
    [view],
  );

  const titleFor = useCallback((type: string) => (
    view?.requirements.find((r) => r.document_type === type)?.title ?? type
  ), [view]);

  const act = useCallback(async (documentId: string, accept: boolean) => {
    setBusy(documentId);
    setError(null);
    try {
      await verifyInternshipDocument(documentId, {
        accept,
        rejection_reason: accept ? null : (reasons[documentId] ?? '').trim() || null,
      });
      await load();
      onChanged?.();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not record that.');
    } finally {
      setBusy(null);
    }
  }, [reasons, load, onChanged]);

  const open = (documentId: string) => {
    setOpened((prev) => new Set(prev).add(documentId));
    window.open(internshipDocumentFileUrl(documentId), '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return <SectionCard title="Documents" icon="file-text-line"><p className="text-muted mb-0">Loading…</p></SectionCard>;
  }

  if (error && !view) {
    return (
      <SectionCard title="Documents" icon="file-text-line">
        <div className="alert alert-danger mb-0" role="alert">{error}</div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Documents"
      icon="file-text-line"
      subtitle={view?.all_verified
        ? 'Every required document is verified — activation is unblocked.'
        : 'Activation stays blocked until every document requiring a signature is verified.'}
    >
      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      {(view?.requirements.length ?? 0) === 0 && (
        <p className="text-muted mb-0">No offer-letter package has been generated yet.</p>
      )}

      {(view?.requirements.length ?? 0) > 0 && (
        <table className="table table-sm align-middle" style={{ fontSize: 13 }}>
          <thead>
            <tr><th>Document</th><th>Signature</th><th>Uploaded</th><th>Status</th></tr>
          </thead>
          <tbody>
            {view!.requirements.map((r) => (
              <tr key={r.document_type}>
                <td>{r.title}</td>
                <td>{r.requires_signature ? 'Required' : 'Not needed'}</td>
                <td>{r.latest_upload_revision ? `r${r.latest_upload_revision}` : <span className="text-muted">—</span>}</td>
                <td>
                  {r.verified ? <StatusBadge label="verified" />
                    : r.correction_requested ? <StatusBadge label="correction requested" tone="warning" />
                      : r.latest_upload_revision ? <StatusBadge label="awaiting review" tone="info" />
                        : <StatusBadge label="not uploaded" tone="neutral" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {generated.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13 }}>
            What we issued ({generated.length})
          </summary>
          <ul className="list-unstyled mt-2 mb-0" style={{ fontSize: 12.5 }}>
            {generated.map((d) => (
              <li key={d.id} style={{ marginBottom: 6 }}>
                {titleFor(d.document_type)} · ID {d.document_public_id ?? '—'}
                {' · '}<code>{d.checksum_short ?? 'no hash'}</code>
                {' · '}
                <button type="button" className="btn btn-link btn-sm p-0" onClick={() => open(d.id)}>
                  open
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {uploads.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Signed uploads</p>
          {uploads.map((d) => {
            const isOpen = opened.has(d.id);
            const reason = reasons[d.id] ?? '';
            return (
              <div key={d.id} style={{ border: '1px solid #e9ecef', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13 }}>
                    <strong>{titleFor(d.document_type)}</strong>
                    {' · '}revision {d.revision}
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      {d.original_filename ?? 'upload'}
                      {d.byte_size ? ` · ${Math.round(d.byte_size / 1024)} KB` : ''}
                      {' · '}<code>{d.checksum_short ?? 'no hash'}</code>
                      {' · '}{new Date(d.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <StatusBadge label={d.status.replace(/_/g, ' ')} />
                  </div>
                </div>

                {d.status === 'verified' && (
                  <p className="text-muted mb-0" style={{ fontSize: 12, marginTop: 8 }}>
                    Verified by {d.verified_by} on {d.verified_at ? new Date(d.verified_at).toLocaleString() : '—'}
                  </p>
                )}

                {d.status === 'correction_requested' && d.rejection_reason && (
                  <p className="mb-0" style={{ fontSize: 12, marginTop: 8 }}>
                    <strong>Correction asked for:</strong> {d.rejection_reason}
                  </p>
                )}

                {d.status === 'uploaded' && (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => open(d.id)}>
                        {isOpen ? 'Open again' : 'Open the file'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-success"
                        onClick={() => act(d.id, true)}
                        // Disabled until opened: a row of Accept buttons beside
                        // unopened files is a rubber stamp, not verification.
                        disabled={busy === d.id || !isOpen}
                        title={isOpen ? undefined : 'Open the file before accepting it'}
                      >
                        {busy === d.id ? 'Saving…' : 'Accept'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => act(d.id, false)}
                        disabled={busy === d.id || !reason.trim()}
                        title={reason.trim() ? undefined : 'Say what needs correcting first'}
                      >
                        Request a correction
                      </button>
                    </div>
                    {!isOpen && (
                      <p className="text-muted mb-0" style={{ fontSize: 12, marginTop: 6 }}>
                        Open the file before accepting it.
                      </p>
                    )}
                    <textarea
                      className="form-control form-control-sm"
                      rows={2}
                      maxLength={2000}
                      style={{ marginTop: 8 }}
                      placeholder="If something needs correcting, say what — the applicant is shown this exactly as written."
                      value={reason}
                      onChange={(e) => setReasons((prev) => ({ ...prev, [d.id]: e.target.value }))}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
};

export default InternshipDocumentPanel;
