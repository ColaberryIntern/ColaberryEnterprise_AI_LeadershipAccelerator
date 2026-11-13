import React, { useEffect, useState } from 'react';
import { saveBlob, type ArtifactFile, type ArtifactFileKind, type ArtifactSource } from '../../services/artifactViewerTypes';

/**
 * Viewers for an uploaded file, picked by file kind (Ali, 10 Nov 2026: "I also need to have a pdf
 * viewer in the platform same way I'm viewing the .md file ... I should be able to have a csv viewer
 * where I can view in excel ... some type of distinction on what the artifact type is").
 *
 *   pdf                       the browser's own PDF viewer, in the page
 *   csv                       a spreadsheet-style table, plus "Open in Excel" (.xlsx) and the raw CSV
 *   word / slides             rendered server-side to HTML, in a script-less sandbox, plus the download
 *   spreadsheet / image / other   download to open in its app
 *   text (incl. Markdown)     the text
 *
 * Shared by the admin viewer and the learner's own work page (C128). `source` says where the bytes come
 * from (each side has its own authenticated API); `audience` only changes the wording for text files,
 * where the admin view flags the wrong format and the learner view just shows the notes.
 */

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

export type ViewerAudience = 'admin' | 'learner';

export function KindBadge({ kind, audience = 'admin' }: { kind: ArtifactFileKind; audience?: ViewerAudience }): React.ReactElement {
  const s = KIND_STYLE[kind];
  const label = kind === 'text' && audience === 'learner' ? 'Notes (text)' : s.label;
  return (
    <span className="badge rounded-1 text-uppercase" style={{ background: s.color, letterSpacing: 0.5 }}>
      <i className={`ri-${s.icon} me-1`} aria-hidden="true" />{label}
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

interface ViewerProps { id: string; file: ArtifactFile; source: ArtifactSource }

function PdfViewer({ id, file, source }: ViewerProps): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    source.file(id, 'application/pdf')
      .then((b) => { made = URL.createObjectURL(b); if (live) setUrl(made); })
      .catch(() => { if (live) setError('Could not load this PDF.'); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [id, source]);
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

function CsvViewer({ id, file, source }: ViewerProps): React.ReactElement {
  const [error, run, busy] = useAction();
  const rows = file.table ?? [];
  const [head, ...body] = rows;
  const width = Math.max(0, ...rows.map((r) => r.length));
  return (
    <>
      <div className="d-flex gap-2 mb-2 align-items-center flex-wrap">
        <button type="button" className="btn btn-success btn-sm" disabled={busy}
          onClick={() => run(async () => saveBlob(await source.xlsx(id), file.name.replace(/\.[^.]+$/, '') + '.xlsx'))}>
          <i className="ri-file-excel-2-line me-1" aria-hidden="true" />Open in Excel
        </button>
        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy}
          onClick={() => run(async () => saveBlob(await source.file(id), file.name))}>Download CSV</button>
        <span className="small text-muted">{body.length} rows, {width} columns</span>
        {error && <span className="small text-danger" role="alert">{error}</span>}
      </div>
      {head ? (
        <div className="border rounded" style={{ maxHeight: '75vh', overflow: 'auto' }}>
          <table className="table table-sm table-striped table-hover mb-0 small" style={{ minWidth: width * 160 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th scope="col" className="text-end" style={{ background: '#2d3748', color: '#fff', width: 40 }}>#</th>
                {Array.from({ length: width }, (_, i) => (
                  <th key={i} scope="col" style={{ background: '#2d3748', color: '#fff', whiteSpace: 'nowrap' }}>{head[i] ?? ''}</th>
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

/**
 * Word and PowerPoint, rendered in the page (Ali, 10 Nov 2026: "We also need a MS word viewer").
 * The HTML is built server-side from the document (officeToHtml.ts, every value escaped) and shown
 * in an iframe with an EMPTY sandbox: no scripts, no same-origin, no forms, no popups.
 */
function OfficeViewer({ id, file, source }: ViewerProps): React.ReactElement {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    source.preview(id)
      .then((h) => { if (live) setHtml(h); })
      .catch((e: { response?: { data?: { error?: string } } }) => { if (live) setError(e?.response?.data?.error ?? 'Could not preview this document.'); });
    return () => { live = false; };
  }, [id, source]);
  return (
    <>
      <div className="mb-2"><DownloadViewer id={id} file={file} source={source} /></div>
      {error && <div className="alert alert-warning py-2 small" role="alert">{error} Use the download button to open it in {OPENS_IN[file.kind]}.</div>}
      {!error && !html && <div className="text-muted" aria-busy="true">Rendering document...</div>}
      {html && (
        <iframe title={file.name} srcDoc={html} sandbox=""
          style={{ width: '100%', height: '85vh', border: '1px solid var(--bs-border-color)', borderRadius: 6, background: '#f1f5f9' }} />
      )}
    </>
  );
}

function DownloadViewer({ id, file, source }: ViewerProps): React.ReactElement {
  const [error, run, busy] = useAction();
  return (
    <div className="d-flex gap-2 align-items-center flex-wrap">
      <button type="button" className="btn btn-primary btn-sm" disabled={busy}
        onClick={() => run(async () => saveBlob(await source.file(id), file.name))}>
        Download to open in {OPENS_IN[file.kind] ?? 'its app'}
      </button>
      <span className="small text-muted">{file.name}</span>
      {error && <span className="small text-danger" role="alert">{error}</span>}
    </div>
  );
}

export function ArtifactFileViewer({ id, file, source, audience = 'admin' }: ViewerProps & { audience?: ViewerAudience }): React.ReactElement {
  let body: React.ReactElement;
  if (!file.available && file.kind !== 'text' && file.kind !== 'csv') body = <span className="text-muted">{file.note ?? 'File is no longer on the server.'}</span>;
  else if (file.kind === 'pdf') body = <PdfViewer id={id} file={file} source={source} />;
  else if (file.kind === 'csv') body = <CsvViewer id={id} file={file} source={source} />;
  else if (file.kind === 'word' || file.kind === 'slides') body = <OfficeViewer id={id} file={file} source={source} />;
  else if (file.kind === 'text') {
    body = (
      <>
        {audience === 'admin' && (
          <div className="alert alert-warning py-1 px-2 small mb-2">Wrong format for an artifact: this is Markdown/text. Artifacts should be visual PDFs built from HTML (status colors, charts, icons). The Internship Report asks the intern to convert it.</div>
        )}
        {file.text !== null ? <pre className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{file.text}</pre> : <span className="text-muted">{file.note}</span>}
      </>
    );
  } else body = <DownloadViewer id={id} file={file} source={source} />;
  return (
    <div className="card mb-3">
      <div className="card-header small fw-semibold d-flex align-items-center gap-2"><KindBadge kind={file.kind} audience={audience} />{file.name}</div>
      <div className="card-body">{body}</div>
    </div>
  );
}
