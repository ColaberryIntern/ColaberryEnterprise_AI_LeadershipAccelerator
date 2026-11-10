import React, { useEffect, useState } from 'react';
import { fetchArtifactFile, fetchArtifactXlsx, saveBlob, type ArtifactFileKind, type InternArtifactView } from '../../../services/internArtifactApi';

/**
 * Viewers for an intern's uploaded artifact file, picked by file kind (Ali, 10 Nov 2026: "I also
 * need to have a pdf viewer in the platform same way I'm viewing the .md file ... I should be able
 * to have a csv viewer where I can view in excel ... some type of distinction on what the artifact
 * type is").
 *
 *   pdf                       the browser's own PDF viewer, in the page
 *   csv                       a spreadsheet-style table, plus "Open in Excel" (.xlsx) and the raw CSV
 *   word / slides / xlsx      download to open in Word / PowerPoint / Excel
 *   text (incl. Markdown)     the text, flagged as notes rather than an artifact
 */

type File = NonNullable<InternArtifactView['file']>;

/** Same colors as the Internship Report chips, so a type looks the same in the email and here. */
export const KIND_STYLE: Record<ArtifactFileKind, { label: string; color: string; icon: string }> = {
  pdf: { label: 'PDF', color: '#b91c1c', icon: 'file-pdf-2-line' },
  csv: { label: 'Spreadsheet (CSV)', color: '#15803d', icon: 'file-excel-2-line' },
  spreadsheet: { label: 'Spreadsheet', color: '#15803d', icon: 'file-excel-2-line' },
  word: { label: 'Word document', color: '#1d4ed8', icon: 'file-word-2-line' },
  slides: { label: 'Slides', color: '#c2410c', icon: 'file-ppt-2-line' },
  image: { label: 'Image', color: '#a21caf', icon: 'image-line' },
  text: { label: 'Markdown / text: wrong format', color: '#b45309', icon: 'error-warning-line' },
  other: { label: 'File', color: '#475569', icon: 'file-line' },
};

export function KindBadge({ kind }: { kind: ArtifactFileKind }): React.ReactElement {
  const s = KIND_STYLE[kind];
  return (
    <span className="badge rounded-1 text-uppercase" style={{ background: s.color, letterSpacing: 0.5 }}>
      <i className={`ri-${s.icon} me-1`} aria-hidden="true" />{s.label}
    </span>
  );
}

function useAction(): [string | null, (f: () => Promise<void>) => void, boolean] {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = (f: () => Promise<void>): void => {
    setBusy(true); setError(null);
    f().catch(() => setError('Could not download this file.')).finally(() => setBusy(false));
  };
  return [error, run, busy];
}

function PdfViewer({ id, file }: { id: string; file: File }): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    fetchArtifactFile(id, 'application/pdf')
      .then((b) => { made = URL.createObjectURL(b); if (live) setUrl(made); })
      .catch(() => { if (live) setError('Could not load this PDF.'); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [id]);
  if (error) return <div className="alert alert-warning" role="alert">{error}</div>;
  if (!url) return <div className="text-muted" aria-busy="true">Loading PDF...</div>;
  return (
    <>
      <div className="d-flex gap-2 mb-2">
        <a className="btn btn-outline-secondary btn-sm" href={url} target="_blank" rel="noopener noreferrer">Open in a new tab</a>
        <a className="btn btn-outline-secondary btn-sm" href={url} download={file.name}>Download PDF</a>
      </div>
      <iframe title={file.name} src={url} style={{ width: '100%', height: '85vh', border: '1px solid var(--bs-border-color)', borderRadius: 6 }} />
    </>
  );
}

function CsvViewer({ id, file }: { id: string; file: File }): React.ReactElement {
  const [error, run, busy] = useAction();
  const rows = file.table ?? [];
  const [head, ...body] = rows;
  const width = Math.max(0, ...rows.map((r) => r.length));
  return (
    <>
      <div className="d-flex gap-2 mb-2 align-items-center">
        <button type="button" className="btn btn-success btn-sm" disabled={busy}
          onClick={() => run(async () => saveBlob(await fetchArtifactXlsx(id), file.name.replace(/\.[^.]+$/, '') + '.xlsx'))}>
          <i className="ri-file-excel-2-line me-1" aria-hidden="true" />Open in Excel
        </button>
        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy}
          onClick={() => run(async () => saveBlob(await fetchArtifactFile(id), file.name))}>Download CSV</button>
        <span className="small text-muted">{body.length} rows, {width} columns</span>
        {error && <span className="small text-danger" role="alert">{error}</span>}
      </div>
      {head ? (
        <div className="border rounded" style={{ maxHeight: '75vh', overflow: 'auto' }}>
          <table className="table table-sm table-striped table-hover mb-0 small" style={{ minWidth: width * 160 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th scope="col" className="text-muted text-end" style={{ background: '#1a365d', color: '#fff', width: 40 }}>#</th>
                {Array.from({ length: width }, (_, i) => (
                  <th key={i} scope="col" style={{ background: '#1a365d', color: '#fff', whiteSpace: 'nowrap' }}>{head[i] ?? ''}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  <td className="text-muted text-end">{ri + 1}</td>
                  {Array.from({ length: width }, (_, ci) => (
                    <td key={ci} style={{ whiteSpace: 'pre-wrap', verticalAlign: 'top', maxWidth: 420 }}>{r[ci] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <pre className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{file.text ?? file.note ?? 'Empty file.'}</pre>
      )}
    </>
  );
}

const OPENS_IN: Partial<Record<ArtifactFileKind, string>> = { word: 'Word', slides: 'PowerPoint', spreadsheet: 'Excel', image: 'your image viewer', other: 'its app' };

function DownloadViewer({ id, file }: { id: string; file: File }): React.ReactElement {
  const [error, run, busy] = useAction();
  return (
    <div className="d-flex gap-2 align-items-center">
      <button type="button" className="btn btn-primary btn-sm" disabled={busy}
        onClick={() => run(async () => saveBlob(await fetchArtifactFile(id), file.name))}>
        Download to open in {OPENS_IN[file.kind] ?? 'its app'}
      </button>
      <span className="small text-muted">{file.name}</span>
      {error && <span className="small text-danger" role="alert">{error}</span>}
    </div>
  );
}

export function ArtifactFileViewer({ id, file }: { id: string; file: File }): React.ReactElement {
  let body: React.ReactElement;
  if (!file.available && file.kind !== 'text' && file.kind !== 'csv') body = <span className="text-muted">{file.note ?? 'File is no longer on the server.'}</span>;
  else if (file.kind === 'pdf') body = <PdfViewer id={id} file={file} />;
  else if (file.kind === 'csv') body = <CsvViewer id={id} file={file} />;
  else if (file.kind === 'text') {
    body = (
      <>
        <div className="alert alert-warning py-1 px-2 small mb-2">Wrong format for an artifact: this is Markdown/text. Artifacts should be visual PDFs built from HTML (status colors, charts, icons). The Internship Report asks the intern to convert it.</div>
        {file.text !== null ? <pre className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{file.text}</pre> : <span className="text-muted">{file.note}</span>}
      </>
    );
  } else body = <DownloadViewer id={id} file={file} />;
  return (
    <div className="card mb-3">
      <div className="card-header small fw-semibold d-flex align-items-center gap-2"><KindBadge kind={file.kind} />{file.name}</div>
      <div className="card-body">{body}</div>
    </div>
  );
}
