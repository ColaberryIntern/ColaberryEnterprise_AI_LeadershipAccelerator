import React, { useEffect, useState } from 'react';
import { importOutsideFiles, importOutsideFromDrive, type OutsideImportResponse, type OutsideImportResult } from '../../../services/ourServicesApi';

/**
 * OutsideCaseStudyImportModal - "Add outside case study". Two tabs: upload files (PDF, DOCX or PPTX, at most 4),
 * or a Google Drive file or folder id (manual import; there is no scheduled sync). The server answers per file,
 * even when some fail, and this modal shows each result. Closing after an import hands focus to Intake, where the
 * new drafts wait to be linked. Re-importing the same document is safe: it reports "already imported".
 */
interface Props { onClose: (imported: boolean) => void }

type Tab = 'upload' | 'drive';
const MAX_FILES = 4;
const ACCEPT = '.pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation';

const STATUS: Record<OutsideImportResult['status'], { label: string; className: string }> = {
  created: { label: 'Created', className: 'bg-success-subtle text-success-emphasis' },
  already_imported: { label: 'Already imported', className: 'bg-secondary-subtle text-secondary-emphasis' },
  failed: { label: 'Failed', className: 'bg-danger-subtle text-danger-emphasis' },
};

export default function OutsideCaseStudyImportModal({ onClose }: Props): React.ReactElement {
  const [tab, setTab] = useState<Tab>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [driveKind, setDriveKind] = useState<'file' | 'folder'>('file');
  const [driveId, setDriveId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OutsideImportResponse | null>(null);
  const imported = !!result && result.summary.created + result.summary.alreadyImported > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !busy) onClose(imported); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, imported, onClose]);

  const submit = async (): Promise<void> => {
    setBusy(true); setError(null); setResult(null);
    try {
      const r = tab === 'upload'
        ? await importOutsideFiles(files)
        : await importOutsideFromDrive(driveKind === 'file' ? { driveFileId: driveId.trim() } : { driveFolderId: driveId.trim() });
      setResult(r);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string } } };
      setError(err.response?.data?.error ?? (err.response?.status === 413 ? 'A file is too large for the upload limit.' : 'The import could not be completed.'));
    } finally { setBusy(false); }
  };

  const canSubmit = !busy && (tab === 'upload' ? files.length > 0 && files.length <= MAX_FILES : driveId.trim().length > 0);

  return (
    <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="import-title" style={{ background: 'rgba(0,0,0,.5)' }} onClick={() => !busy && onClose(imported)}>
      <div className="modal-dialog modal-dialog-centered modal-lg" role="document" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h2 className="modal-title h5" id="import-title"><span aria-hidden="true">📥 </span>Add outside case study</h2>
            <button type="button" className="btn-close" aria-label="Close" onClick={() => onClose(imported)} disabled={busy} />
          </div>
          <div className="modal-body">
            <p className="small text-secondary">The AI reads each document and drafts a private case study, then suggests services. Outside case studies stay internal: they are evidence for proposals, never published on the website.</p>
            <ul className="nav nav-tabs mb-3" role="tablist">
              {(['upload', 'drive'] as Tab[]).map((t) => (
                <li key={t} className="nav-item" role="presentation">
                  <button type="button" role="tab" aria-selected={tab === t} className={`nav-link ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)} disabled={busy}>
                    {t === 'upload' ? 'Upload file' : 'Google Drive file or folder ID'}
                  </button>
                </li>
              ))}
            </ul>
            {tab === 'upload' ? (
              <div>
                <label htmlFor="outside-files" className="form-label small fw-medium">PDF, DOCX or PPTX, up to {MAX_FILES} files</label>
                <input id="outside-files" type="file" className="form-control form-control-sm" accept={ACCEPT} multiple disabled={busy}
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
                {files.length > MAX_FILES && <div className="form-text text-danger-emphasis">Pick at most {MAX_FILES} files per import.</div>}
              </div>
            ) : (
              <div>
                <fieldset className="mb-2">
                  <legend className="form-label small fw-medium">What is the ID for?</legend>
                  {(['file', 'folder'] as const).map((k) => (
                    <div key={k} className="form-check form-check-inline">
                      <input className="form-check-input" type="radio" name="drive-kind" id={`drive-${k}`} checked={driveKind === k} onChange={() => setDriveKind(k)} disabled={busy} />
                      <label className="form-check-label small" htmlFor={`drive-${k}`}>{k === 'file' ? 'One file' : 'A folder (every supported file in it)'}</label>
                    </div>
                  ))}
                </fieldset>
                <label htmlFor="drive-id" className="form-label small fw-medium">Drive {driveKind} ID</label>
                <input id="drive-id" className="form-control form-control-sm" value={driveId} onChange={(e) => setDriveId(e.target.value)} disabled={busy} placeholder="The ID from the Drive link" />
                <div className="form-text">The file or folder must be shared with the platform's Drive service account.</div>
              </div>
            )}
            {error && <div className="alert alert-danger py-2 small mt-3 mb-0" role="alert">{error}</div>}
            {result && (
              <div className="mt-3" role="status">
                <div className="small fw-semibold mb-2">
                  {result.summary.created} created · {result.summary.alreadyImported} already imported · {result.summary.failed} failed
                  {result.summary.needsManualDetails > 0 && ` · ${result.summary.needsManualDetails} need manual details`}
                </div>
                {result.note && <div className="small text-secondary mb-2">{result.note}</div>}
                <ul className="list-group list-group-flush small">
                  {result.results.map((r, i) => (
                    <li key={`${r.fileName}-${i}`} className="list-group-item px-0 d-flex gap-2 align-items-start">
                      <span className={`badge rounded-pill ${STATUS[r.status].className}`}>{STATUS[r.status].label}</span>
                      <span>
                        <span className="fw-semibold">{r.title ?? r.fileName}</span>
                        {r.error && <span className="d-block text-danger-emphasis">{r.error}</span>}
                        {r.analysisError && <span className="d-block text-warning-emphasis">Needs manual details: the AI could not read it.</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => onClose(imported)} disabled={busy}>{result ? 'Done: go to Intake' : 'Cancel'}</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void submit()} disabled={!canSubmit}>{busy ? 'Importing…' : 'Import'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
