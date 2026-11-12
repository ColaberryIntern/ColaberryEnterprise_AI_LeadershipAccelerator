import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SectionCard } from '../../../components/admin/shell';
import {
  listProposalSources, uploadProposalSource, approveProposalSource, deleteProposalSource,
  errorMessage, type ProposalSourceDoc,
} from '../../../services/adminGovContractsApi';

/**
 * GovProposalSourcesPanel (P-SRC, P3 UI) — the admin panel to put a REFERENCE document (a stakeholder briefing, a past
 * proposal, a capability statement) into a gov project's proposal source library, so the proposal agent can retrieve
 * its relevant parts per draft. Upload → it is chunked + embedded server-side → it grounds NOTHING until approved here.
 *
 * Self-contained: loads its own list, and refetches after every write. Bootstrap 5 + admin-shell, matching the page.
 * The upload is validated at the backend boundary (one file, 20MB, .docx/.pdf/.txt/.md); this surface mirrors that.
 */

const ACCEPT = '.docx,.pdf,.txt,.md';

function StatusBadge({ status }: { status: string }): React.ReactElement {
  if (status === 'ready') return <span className="badge bg-success-subtle text-success-emphasis">ready</span>;
  if (status === 'embedding_pending') return <span className="badge bg-warning-subtle text-warning-emphasis" title="Stored, but the embedding service was unavailable; it will not be retrieved until re-embedded.">embedding pending</span>;
  return <span className="badge bg-danger-subtle text-danger-emphasis">{status}</span>;
}

export default function GovProposalSourcesPanel({ projectId }: { projectId: string }): React.ReactElement {
  const [docs, setDocs] = useState<ProposalSourceDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setDocs((await listProposalSources(projectId)).documents); }
    catch (e) { setNotice({ kind: 'err', text: errorMessage(e, 'Could not load the source documents.') }); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const onUpload = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setNotice({ kind: 'err', text: 'Choose a file first.' }); return; }
    setUploading(true); setNotice(null);
    try {
      const r = await uploadProposalSource(projectId, file);
      setNotice({ kind: 'ok', text: `Uploaded "${file.name}": ${r.chunkCount} chunk(s), ${r.embeddedCount} embedded. Approve it below to let the proposal agent use it.` });
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (e) { setNotice({ kind: 'err', text: errorMessage(e, 'Upload failed.') }); }
    finally { setUploading(false); }
  }, [projectId, load]);

  const onApprove = useCallback(async (d: ProposalSourceDoc) => {
    setBusyId(d.id); setNotice(null);
    try { await approveProposalSource(projectId, d.id, !d.approved); await load(); }
    catch (e) { setNotice({ kind: 'err', text: errorMessage(e, 'Could not change approval.') }); }
    finally { setBusyId(null); }
  }, [projectId, load]);

  const onDelete = useCallback(async (d: ProposalSourceDoc) => {
    setBusyId(d.id); setNotice(null);
    try { await deleteProposalSource(projectId, d.id); await load(); }
    catch (e) { setNotice({ kind: 'err', text: errorMessage(e, 'Could not delete.') }); }
    finally { setBusyId(null); }
  }, [projectId, load]);

  return (
    <SectionCard
      title="Proposal source documents"
      icon="file-text-line"
      subtitle="Upload reference documents for this pursuit. Each is chunked and embedded; once approved, the proposal agent retrieves the relevant parts when it drafts. Nothing grounds a proposal until you approve it."
    >
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2" data-testid="gps-source-upload">
        <input ref={fileRef} type="file" accept={ACCEPT} className="form-control form-control-sm" style={{ maxWidth: 360 }} aria-label="Source document" />
        <button type="button" className="btn btn-sm btn-primary" disabled={uploading} onClick={onUpload}>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <span className="small text-secondary">.docx, .pdf, .txt, .md · up to 20MB</span>
      </div>

      {notice && (
        <div className={`alert ${notice.kind === 'ok' ? 'alert-success' : 'alert-danger'} py-2 px-3 small mb-2`} role="status">{notice.text}</div>
      )}

      {loading && docs.length === 0 ? (
        <div className="small text-secondary"><i className="ri-loader-4-line me-1" aria-hidden="true" />Loading…</div>
      ) : docs.length === 0 ? (
        <div className="small text-secondary">No source documents yet. Upload one above.</div>
      ) : (
        <ul className="list-unstyled mb-0" data-testid="gps-source-list">
          {docs.map((d) => (
            <li key={d.id} className="py-2 border-top d-flex flex-wrap align-items-center gap-2" data-testid="gps-source-row">
              <span className="fw-semibold">{d.name}</span>
              <StatusBadge status={d.status} />
              {d.approved
                ? <span className="badge bg-success">Approved</span>
                : <span className="badge bg-secondary-subtle text-secondary-emphasis">Not grounding</span>}
              <span className="small text-secondary">{d.embeddedCount}/{d.chunkCount} embedded{d.truncated ? ' · truncated' : ''}</span>
              <div className="ms-auto d-flex gap-2">
                <button type="button" className={`btn btn-sm ${d.approved ? 'btn-outline-secondary' : 'btn-outline-success'}`} disabled={busyId === d.id} onClick={() => onApprove(d)}>
                  {d.approved ? 'Unapprove' : 'Approve'}
                </button>
                <button type="button" className="btn btn-sm btn-outline-danger" disabled={busyId === d.id} onClick={() => onDelete(d)} aria-label={`Delete ${d.name}`}>
                  <i className="ri-delete-bin-line" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
