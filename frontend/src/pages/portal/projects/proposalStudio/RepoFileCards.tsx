import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KIND_STYLE } from '../../../../components/artifactViewer/ArtifactFileViewers';
import { saveBlob } from '../../../../services/artifactViewerTypes';
import type { GovRepoDeliverable } from '../../../../services/govProjectPortalApi';

/**
 * RepoFileCards — the connected repo's deliverable DOCUMENTS as portfolio-style typed cards, each opening a
 * per-type viewer, reusing the portfolio's KIND_STYLE colour/icon language (the same badges the Showcase uses)
 * and its saveBlob helper. Content is fetched LIVE from the repo through the injected `fetchFile` (the portal or
 * admin route), so nothing is stored. Office/Excel degrade to a download in v1 (as the portfolio's own viewer
 * offers); pdf previews inline, csv/html/text render in-app.
 */

type RepoKind = GovRepoDeliverable['kind'];

/** Badge styling for a deliverable kind: reuse the portfolio colour+icon, with deliverable-appropriate labels
 *  (text is a real deliverable here, not the Showcase's "wrong format"), plus html which the portfolio lacks. */
function badgeFor(kind: RepoKind): { label: string; color: string; icon: string } {
  if (kind === 'html') return { label: 'HTML', color: '#0e7490', icon: 'file-code-line' };
  const s = KIND_STYLE[kind];
  const LABEL: Record<string, string> = { pdf: 'PDF', csv: 'CSV', spreadsheet: 'Excel', word: 'Word', slides: 'PowerPoint', image: 'Image', text: 'Text', other: 'File' };
  return { label: LABEL[kind] ?? s.label, color: s.color, icon: s.icon };
}

export function RepoFileBadge({ kind }: { kind: RepoKind }): React.ReactElement {
  const b = badgeFor(kind);
  return (
    <span className="badge rounded-1 text-uppercase" style={{ background: b.color, letterSpacing: 0.5, color: '#fff' }}>
      <i className={`ri-${b.icon} me-1`} aria-hidden="true" />{b.label}
    </span>
  );
}

export function RepoFileCards(
  { deliverables, onOpen }: { deliverables: GovRepoDeliverable[]; onOpen: (d: GovRepoDeliverable) => void },
): React.ReactElement {
  return (
    <div className="gps-cards" data-testid="ev-repo-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
      {deliverables.map((d) => (
        <button
          key={d.path}
          type="button"
          data-testid="ev-repo-card"
          data-kind={d.kind}
          className="gps-panel"
          onClick={() => onOpen(d)}
          style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--gps-line, #e2e8f2)', display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <RepoFileBadge kind={d.kind} />
          <b style={{ wordBreak: 'break-word' }}>{d.name}</b>
          <span className="gps-small gps-muted gps-mono" style={{ wordBreak: 'break-all' }}>{d.path}</span>
        </button>
      ))}
    </div>
  );
}

/** Minimal CSV parse (quoted fields, commas, CR/LF), capped — enough to show a table without a dependency. */
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

const DOWNLOAD_LABEL: Record<string, string> = { word: 'Word', slides: 'PowerPoint', spreadsheet: 'Excel', image: 'your image viewer', other: 'its app' };

/**
 * RepoFileViewer — a modal that fetches ONE deliverable live and renders it by kind: pdf inline, image inline,
 * html in a script-less sandboxed iframe, csv as a table, text/markdown as a <pre>, and Word/PowerPoint/Excel/
 * other as a download. `fetchFile(path, {download})` is the per-surface blob fetcher.
 */
export function RepoFileViewer(
  { deliverable, fetchFile, onClose }:
  { deliverable: GovRepoDeliverable; fetchFile: (path: string, opts?: { download?: boolean }) => Promise<Blob>; onClose: () => void },
): React.ReactElement {
  const kind = deliverable.kind;
  const inlineKind = kind === 'pdf' || kind === 'image' || kind === 'html' || kind === 'csv' || kind === 'text';
  const [objUrl, setObjUrl] = useState<string | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!inlineKind) return;
    let live = true; let made: string | null = null;
    setError(null); setObjUrl(null); setTextBody(null);
    fetchFile(deliverable.path)
      .then(async (blob) => {
        if (!live) return;
        if (kind === 'pdf' || kind === 'image') { made = URL.createObjectURL(blob); setObjUrl(made); }
        else { setTextBody(await blob.text()); }
      })
      .catch(() => { if (live) setError('Could not load this file from the repo.'); });
    return () => { live = false; if (made) { try { URL.revokeObjectURL(made); } catch { /* noop */ } } };
  }, [deliverable.path, kind, inlineKind, fetchFile]);

  const download = useCallback(() => {
    setDownloading(true);
    fetchFile(deliverable.path, { download: true })
      .then((blob) => saveBlob(blob, deliverable.name))
      .catch(() => setError('Could not download this file.'))
      .finally(() => setDownloading(false));
  }, [deliverable.path, deliverable.name, fetchFile]);

  const table = useMemo(() => (kind === 'csv' && textBody !== null ? parseCsv(textBody) : null), [kind, textBody]);

  let body: React.ReactElement;
  if (error) body = <div className="gps-panel gps-muted" role="alert">{error}</div>;
  else if (kind === 'pdf') body = objUrl ? <iframe title={deliverable.name} src={objUrl} style={{ width: '100%', height: '78vh', border: '1px solid var(--gps-line,#e2e8f2)', borderRadius: 6 }} /> : <div className="gps-muted" aria-busy="true">Loading PDF…</div>;
  else if (kind === 'image') body = objUrl ? <img src={objUrl} alt={deliverable.name} style={{ maxWidth: '100%', borderRadius: 6 }} /> : <div className="gps-muted" aria-busy="true">Loading image…</div>;
  else if (kind === 'html') body = textBody !== null ? <iframe title={deliverable.name} srcDoc={textBody} sandbox="" style={{ width: '100%', height: '78vh', border: '1px solid var(--gps-line,#e2e8f2)', borderRadius: 6, background: '#fff' }} /> : <div className="gps-muted" aria-busy="true">Loading…</div>;
  else if (kind === 'csv') body = table ? (
    <div style={{ maxHeight: '72vh', overflow: 'auto', border: '1px solid var(--gps-line,#e2e8f2)', borderRadius: 6 }}>
      <table className="gps-small" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {table.map((r, ri) => (
            <tr key={ri} style={ri === 0 ? { position: 'sticky', top: 0 } : undefined}>
              {r.map((cell, ci) => ri === 0
                ? <th key={ci} style={{ background: '#2d3748', color: '#fff', padding: '4px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>{cell}</th>
                : <td key={ci} style={{ padding: '4px 8px', borderBottom: '1px solid var(--gps-line,#e2e8f2)', verticalAlign: 'top', whiteSpace: 'pre-wrap', maxWidth: 420 }}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : <div className="gps-muted" aria-busy="true">Loading…</div>;
  else if (kind === 'text') body = textBody !== null ? <pre className="gps-small" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{textBody}</pre> : <div className="gps-muted" aria-busy="true">Loading…</div>;
  else body = (
    <div className="gps-panel" style={{ textAlign: 'center' }}>
      <RepoFileBadge kind={kind} />
      <p className="gps-small gps-muted" style={{ margin: '10px 0' }}>Download to open in {DOWNLOAD_LABEL[kind] ?? 'its app'}.</p>
      <button type="button" className="gps-btn primary" data-testid="ev-repo-download" disabled={downloading} onClick={download}>Download {deliverable.name}</button>
    </div>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={deliverable.name} data-testid="ev-repo-viewer"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,31,61,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="gps-panel" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--gps-card,#fff)', width: 'min(960px, 96vw)', maxHeight: '92vh', overflow: 'auto' }}>
        <div className="gps-row" style={{ marginBottom: 10 }}>
          <div className="gps-row" style={{ gap: 8 }}><RepoFileBadge kind={kind} /><b style={{ wordBreak: 'break-word' }}>{deliverable.name}</b></div>
          <div className="gps-row" style={{ gap: 8 }}>
            {inlineKind && <button type="button" className="gps-btn sm" data-testid="ev-repo-download" disabled={downloading} onClick={download}>Download</button>}
            <button type="button" className="gps-btn sm" data-testid="ev-repo-close" onClick={onClose}>Close</button>
          </div>
        </div>
        {body}
      </div>
    </div>
  );
}
