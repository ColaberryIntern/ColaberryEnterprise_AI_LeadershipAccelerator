import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KIND_STYLE } from '../artifactViewer/ArtifactFileViewers';
import { saveBlob } from '../../services/artifactViewerTypes';

/**
 * FileCards — a reusable grid of typed document cards, each opening a per-type viewer, reusing the
 * portfolio's KIND_STYLE colour/icon language and saveBlob. Content is fetched LIVE through the injected
 * `fetchFile(id,{download})`, so the host decides the route (gov repo, admin project documents, ...) and
 * nothing is stored here. pdf/image/video render inline; csv as a table; Word/PowerPoint/Excel/RTF/other
 * download. The same treatment as the gov Build Evidence cards, as a shared component.
 */

export type FileCardKind = 'pdf' | 'csv' | 'word' | 'slides' | 'spreadsheet' | 'image' | 'video' | 'other';

export interface FileCardItem {
  /** Opaque id passed back to fetchFile (a repo path, a portfolio piece id, ...). */
  id: string;
  /** The file's basename, for the download name and as a fallback title. */
  name: string;
  /** Clean display title; falls back to name. */
  title?: string;
  /** Optional provenance line (lesson, source). */
  from?: string;
  kind: FileCardKind;
}

const LABEL: Record<FileCardKind, string> = {
  pdf: 'PDF', csv: 'CSV', spreadsheet: 'Excel', word: 'Word', slides: 'PowerPoint', image: 'Image', video: 'Video', other: 'File',
};

function badgeFor(kind: FileCardKind): { label: string; color: string; icon: string } {
  if (kind === 'video') return { label: 'Video', color: '#7c3aed', icon: 'film-line' };
  const s = KIND_STYLE[kind];
  return { label: LABEL[kind] ?? s.label, color: s.color, icon: s.icon };
}

export function FileBadge({ kind }: { kind: FileCardKind }): React.ReactElement {
  const b = badgeFor(kind);
  return (
    <span className="badge rounded-1 text-uppercase" style={{ background: b.color, letterSpacing: 0.5, color: '#fff' }}>
      <i className={`ri-${b.icon} me-1`} aria-hidden="true" />{b.label}
    </span>
  );
}

export function FileCards(
  { items, onOpen }: { items: FileCardItem[]; onOpen: (f: FileCardItem) => void },
): React.ReactElement {
  return (
    <div data-testid="doc-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
      {items.map((f) => (
        <button
          key={f.id}
          type="button"
          data-testid="doc-card"
          data-kind={f.kind}
          className="border rounded p-2 bg-white"
          onClick={() => onOpen(f)}
          style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <FileBadge kind={f.kind} />
          <b style={{ wordBreak: 'break-word' }}>{f.title || f.name}</b>
          {f.from && <span className="small text-muted" style={{ wordBreak: 'break-word' }}>{f.from}</span>}
        </button>
      ))}
    </div>
  );
}

/** Minimal CSV parse (quoted fields, commas, CR/LF), capped — a table without a dependency. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.slice(0, 2000);
}

const DOWNLOAD_LABEL: Record<string, string> = { word: 'Word', slides: 'PowerPoint', spreadsheet: 'Excel', other: 'its app' };

/**
 * FileViewer — a modal that fetches ONE file live and renders it by kind: pdf/image/video inline,
 * csv as a table, and Word/PowerPoint/Excel/RTF/other as a download. `fetchFile(id,{download})` is the
 * host's blob fetcher.
 */
export function FileViewer(
  { item, fetchFile, onClose }:
  { item: FileCardItem; fetchFile: (id: string, opts?: { download?: boolean }) => Promise<Blob>; onClose: () => void },
): React.ReactElement {
  const kind = item.kind;
  const blobUrlKind = kind === 'pdf' || kind === 'image' || kind === 'video';
  const inlineKind = blobUrlKind || kind === 'csv';
  const [objUrl, setObjUrl] = useState<string | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!inlineKind) return;
    let live = true; let made: string | null = null;
    setError(null); setObjUrl(null); setTextBody(null);
    fetchFile(item.id)
      .then(async (blob) => {
        if (!live) return;
        if (blobUrlKind) { made = URL.createObjectURL(blob); setObjUrl(made); }
        else { setTextBody(await blob.text()); }
      })
      .catch(() => { if (live) setError('Could not load this file.'); });
    return () => { live = false; if (made) { try { URL.revokeObjectURL(made); } catch { /* noop */ } } };
  }, [item.id, kind, inlineKind, blobUrlKind, fetchFile]);

  const download = useCallback(() => {
    setDownloading(true);
    fetchFile(item.id, { download: true })
      .then((blob) => saveBlob(blob, item.name))
      .catch(() => setError('Could not download this file.'))
      .finally(() => setDownloading(false));
  }, [item.id, item.name, fetchFile]);

  const table = useMemo(() => (kind === 'csv' && textBody !== null ? parseCsv(textBody) : null), [kind, textBody]);

  let body: React.ReactElement;
  if (error) body = <div className="border rounded p-3 text-muted" role="alert">{error}</div>;
  else if (kind === 'pdf') body = objUrl ? <iframe title={item.name} src={objUrl} style={{ width: '100%', height: '78vh', border: '1px solid #e2e8f2', borderRadius: 6 }} /> : <div className="text-muted" aria-busy="true">Loading PDF…</div>;
  else if (kind === 'image') body = objUrl ? <img src={objUrl} alt={item.name} style={{ maxWidth: '100%', borderRadius: 6 }} /> : <div className="text-muted" aria-busy="true">Loading image…</div>;
  else if (kind === 'video') body = objUrl ? <video controls src={objUrl} style={{ width: '100%', maxHeight: '78vh', borderRadius: 6, background: '#000' }}>Your browser cannot play this video. Download it to watch.</video> : <div className="text-muted" aria-busy="true">Loading video…</div>;
  else if (kind === 'csv') body = table ? (
    <div style={{ maxHeight: '72vh', overflow: 'auto', border: '1px solid #e2e8f2', borderRadius: 6 }}>
      <table className="small" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {table.map((r, ri) => (
            <tr key={ri} style={ri === 0 ? { position: 'sticky', top: 0 } : undefined}>
              {r.map((cell, ci) => ri === 0
                ? <th key={ci} style={{ background: '#2d3748', color: '#fff', padding: '4px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>{cell}</th>
                : <td key={ci} style={{ padding: '4px 8px', borderBottom: '1px solid #e2e8f2', verticalAlign: 'top', whiteSpace: 'pre-wrap', maxWidth: 420 }}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : <div className="text-muted" aria-busy="true">Loading…</div>;
  else body = (
    <div className="border rounded p-3 text-center">
      <FileBadge kind={kind} />
      <p className="small text-muted" style={{ margin: '10px 0' }}>Download to open in {DOWNLOAD_LABEL[kind] ?? 'its app'}.</p>
      <button type="button" className="btn btn-primary btn-sm" data-testid="doc-download" disabled={downloading} onClick={download}>Download {item.name}</button>
    </div>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={item.name} data-testid="doc-viewer"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,31,61,.55)', zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="bg-white rounded p-3" onClick={(e) => e.stopPropagation()} style={{ width: 'min(960px, 96vw)', maxHeight: '92vh', overflow: 'auto' }}>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="d-flex align-items-center gap-2"><FileBadge kind={kind} /><b style={{ wordBreak: 'break-word' }}>{item.title || item.name}</b></div>
          <div className="d-flex align-items-center gap-2">
            {inlineKind && <button type="button" className="btn btn-outline-secondary btn-sm" data-testid="doc-download" disabled={downloading} onClick={download}>Download</button>}
            <button type="button" className="btn btn-outline-secondary btn-sm" data-testid="doc-close" onClick={onClose}>Close</button>
          </div>
        </div>
        {body}
      </div>
    </div>
  );
}
