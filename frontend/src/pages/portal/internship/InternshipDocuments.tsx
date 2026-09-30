import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DocumentsView,
  downloadInternshipDocument,
  fetchInternshipDocuments,
  uploadSignedInternshipDocument,
} from '../../../services/internshipApi';

/**
 * Download, sign by hand, upload back.
 *
 * ── WHY THERE IS NO "SIGN HERE" BUTTON ─────────────────────────────────────
 *
 * This version deliberately builds no electronic signature flow. The contract says
 * so, and the copy below says so to the student — because a page that shows a
 * document and a submit button teaches people to expect a click-to-sign, and then
 * they look for it instead of printing.
 *
 * So the instruction is explicit and sequenced: download, print, sign by hand,
 * upload the signed copy. A photo of a signed page is accepted, because requiring
 * a scanner would block anyone without one.
 *
 * ── WHAT A CORRECTION REQUEST LOOKS LIKE ───────────────────────────────────
 *
 * When a reviewer asks for a correction, the reason is shown against that document
 * and the upload control reopens for it. The previous upload is NOT deleted — the
 * server allocates the next revision — so "re-upload" never means "lose what you
 * sent".
 */

const FILE_HINT = 'PDF, or a clear photo or scan (PNG, JPG, WEBP, HEIC). Up to 25MB.';

const InternshipDocuments: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const [view, setView] = useState<DocumentsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyType, setBusyType] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    try {
      setView(await fetchInternshipDocuments());
      setError(null);
    } catch {
      setError('We could not load your documents. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const download = useCallback(async (docId: string, title: string) => {
    setBusyType(docId);
    setNote(null);
    try {
      const safe = title.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
      await downloadInternshipDocument(docId, `${safe}.pdf`);
    } catch {
      setError('We could not open that document. Please try again, or tell us if it keeps failing.');
    } finally {
      setBusyType(null);
    }
  }, []);

  const upload = useCallback(async (documentType: string, file: File) => {
    setBusyType(documentType);
    setError(null);
    setNote(null);
    try {
      await uploadSignedInternshipDocument(documentType, file);
      setNote('Uploaded. We will check it and let you know.');
      await load();
      onChanged?.();
    } catch (err: any) {
      // The server's own message is the useful one here — it says exactly which
      // formats are accepted, which a generic failure line would hide.
      setError(err?.response?.data?.error ?? 'We could not accept that file. Please try again.');
    } finally {
      setBusyType(null);
    }
  }, [load, onChanged]);

  if (loading) return <p className="ip-muted">Loading your documents…</p>;
  if (!view) return <p className="ip-muted">{error ?? 'Documents unavailable.'}</p>;

  const byType = new Map(view.documents.map((d) => [d.document_type, d]));

  return (
    <section className="ip-card" aria-labelledby="ip-docs">
      <h2 id="ip-docs">Your offer letter</h2>
      <p className="ip-muted ip-sub">
        Congratulations — you have a place. There are a few documents to sign before you start.
      </p>

      {error && <div className="ip-alert" role="alert">{error}</div>}
      {note && <p className="ip-muted ip-note" role="status">{note}</p>}

      <ol className="ip-steps">
        <li><strong>Download</strong> each document below.</li>
        <li><strong>Print it and sign it by hand.</strong> There is no click-to-sign — we need a real signature.</li>
        <li><strong>Upload</strong> the signed copy back here. A clear photo is fine.</li>
      </ol>

      {view.all_verified && (
        <div className="ip-confirm" role="status">
          <p><strong>All your documents are verified.</strong> Nothing more to do here — we are setting up your place.</p>
        </div>
      )}

      {view.requirements.map((req) => {
        const doc = byType.get(req.document_type);
        const busy = busyType === req.document_type || busyType === doc?.id;
        const needsUpload = req.requires_signature && (!req.latest_upload_revision || req.correction_requested);

        return (
          <div
            key={req.document_type}
            className={`ip-doc${req.correction_requested ? ' is-correction' : ''}${req.verified ? ' is-verified' : ''}`}
          >
            <div className="ip-doc__head">
              <div>
                <p className="ip-doc__title">{req.title}</p>
                {doc?.why && <p className="ip-muted ip-doc__why">{doc.why}</p>}
                {doc?.document_public_id && (
                  <p className="ip-muted ip-doc__id">Document ID {doc.document_public_id}</p>
                )}
              </div>
              <div className="ip-doc__status">
                {req.verified && <span className="ip-tag">Verified</span>}
                {!req.verified && req.correction_requested && (
                  <span className="ip-tag ip-tag--warn">Needs correcting</span>
                )}
                {!req.verified && !req.correction_requested && req.latest_upload_revision && (
                  <span className="ip-tag">Uploaded — with us</span>
                )}
                {!req.requires_signature && <span className="ip-tag">No signature needed</span>}
              </div>
            </div>

            {req.correction_requested && req.rejection_reason && (
              <div className="ip-alert ip-alert--soft" role="alert">
                <strong>What needs fixing:</strong> {req.rejection_reason}
              </div>
            )}

            <div className="ip-doc__actions">
              {doc && (
                <button
                  type="button"
                  className="te-btn ghost sm"
                  onClick={() => download(doc.id, req.title)}
                  disabled={busy}
                >
                  {busy ? 'Opening…' : 'Download'}
                </button>
              )}

              {needsUpload && (
                <>
                  <input
                    ref={(el) => { inputs.current[req.document_type] = el; }}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,application/pdf,image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(req.document_type, file);
                      // Cleared so choosing the SAME file again still fires onChange,
                      // which is the obvious thing to do after a failed upload.
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className="te-btn berry sm"
                    onClick={() => inputs.current[req.document_type]?.click()}
                    disabled={busy}
                  >
                    {busy ? 'Uploading…' : req.latest_upload_revision ? 'Upload a corrected copy' : 'Upload signed copy'}
                  </button>
                  <span className="ip-muted ip-doc__hint">{FILE_HINT}</span>
                </>
              )}

              {req.latest_upload_revision && !req.correction_requested && !req.verified && (
                <span className="ip-muted">
                  Sent {req.latest_upload_revision > 1 ? `(revision ${req.latest_upload_revision})` : ''}
                </span>
              )}
            </div>
          </div>
        );
      })}

      <p className="ip-warn ip-warn--sm">
        <strong>Never send us a password or an API key.</strong> These documents ask for a signature and
        nothing else. If anything claiming to be Colaberry asks you for a credential, it is not us.
      </p>
    </section>
  );
};

export default InternshipDocuments;
