import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { saveBlob } from '../../../../services/artifactViewerTypes';
import type { GovSubmittedArtifact, GovBuildArtifactKind } from '../../../../services/govProjectPortalApi';

/**
 * BuildArtifactCards — the deliverables the intern SUBMITTED from their build repo (a project overview page,
 * architecture diagrams, test/security/cutover reports) as typed cards, each opening a per-type viewer that
 * fetches the file LIVE from the repo through the injected `fetchFile`. Unlike the connected-repo "Files"
 * block (structured documents only), these are a build's real deliverables, so the viewer also renders HTML
 * (in a script-less sandboxed iframe), images and Markdown inline. Nothing is stored here.
 */

const BADGE: Record<GovBuildArtifactKind, { label: string; color: string; icon: string }> = {
  html: { label: 'Web page', color: '#0ea5e9', icon: 'html5-line' },
  image: { label: 'Image', color: '#a21caf', icon: 'image-line' },
  markdown: { label: 'Doc', color: '#475569', icon: 'markdown-line' },
  pdf: { label: 'PDF', color: '#b91c1c', icon: 'file-pdf-2-line' },
  csv: { label: 'CSV', color: '#15803d', icon: 'file-excel-2-line' },
  word: { label: 'Word', color: '#1d4ed8', icon: 'file-word-2-line' },
  slides: { label: 'PowerPoint', color: '#c2410c', icon: 'file-ppt-2-line' },
  spreadsheet: { label: 'Excel', color: '#15803d', icon: 'file-excel-2-line' },
  video: { label: 'Video', color: '#7c3aed', icon: 'film-line' },
  other: { label: 'File', color: '#475569', icon: 'file-line' },
};

export function BuildArtifactBadge({ kind }: { kind: GovBuildArtifactKind }): React.ReactElement {
  const b = BADGE[kind] ?? BADGE.other;
  return (
    <span className="badge rounded-1 text-uppercase" style={{ background: b.color, letterSpacing: 0.5, color: '#fff' }}>
      <i className={`ri-${b.icon} me-1`} aria-hidden="true" />{b.label}
    </span>
  );
}

const PREVIEW_H = 132;
/** Kinds that render a live inline thumbnail in the card (the rest show a type tile). */
const PREVIEWABLE: Record<GovBuildArtifactKind, boolean> = {
  html: true, image: true, pdf: true, video: true, markdown: true, csv: true,
  word: false, slides: false, spreadsheet: false, other: false,
};

/**
 * ArtifactPreview — a small LIVE thumbnail of one submitted artifact, so the card reads like a viewer instead of a
 * bare file chip. It fetches the file once through the injected `fetchFile` and renders by kind: image inline, HTML
 * in a scaled SCRIPT-LESS sandboxed iframe (pointer-events off so the card stays the click target), PDF first page,
 * video first frame, and Markdown/CSV as a text snippet. Binary office kinds keep a type tile (no fetch). Best-effort:
 * a load failure falls back to the tile, never blocks the card.
 */
function ArtifactPreview(
  { artifact, fetchFile }: { artifact: GovSubmittedArtifact; fetchFile: (id: string, opts?: { download?: boolean }) => Promise<Blob> },
): React.ReactElement {
  const kind = artifact.kind;
  const blobUrlKind = kind === 'image' || kind === 'pdf' || kind === 'video';
  const textKind = kind === 'html' || kind === 'markdown' || kind === 'csv';
  const [objUrl, setObjUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!PREVIEWABLE[kind]) return;
    let live = true; let made: string | null = null;
    fetchFile(artifact.id)
      .then(async (blob) => {
        if (!live) return;
        if (blobUrlKind) { try { made = URL.createObjectURL(blob); setObjUrl(made); } catch { setFailed(true); } }
        else { setText((await blob.text()).slice(0, 2000)); }
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; if (made) { try { URL.revokeObjectURL(made); } catch { /* noop */ } } };
  }, [artifact.id, kind, blobUrlKind, fetchFile]);

  const frame = { position: 'relative' as const, height: PREVIEW_H, borderRadius: 6, overflow: 'hidden', background: '#f1f5f9', border: '1px solid var(--gps-line,#e2e8f2)' };
  const b = BADGE[kind] ?? BADGE.other;
  const tile = (
    <div style={{ ...frame, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
      <i className={`ri-${b.icon}`} style={{ fontSize: 34, color: b.color }} />
    </div>
  );
  if (!PREVIEWABLE[kind] || failed) return tile;

  if (kind === 'image') return objUrl
    ? <div style={frame}><img src={objUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
    : tile;
  if (kind === 'html') return text !== null
    ? <div style={frame}><iframe title="" srcDoc={text} sandbox="" tabIndex={-1} aria-hidden="true"
        style={{ width: 400, height: 520, border: 0, background: '#fff', transform: 'scale(.33)', transformOrigin: 'top left', pointerEvents: 'none' }} /></div>
    : tile;
  if (kind === 'pdf') return objUrl
    ? <div style={frame}><iframe title="" src={`${objUrl}#toolbar=0&view=FitH`} tabIndex={-1} aria-hidden="true"
        style={{ width: '100%', height: 320, border: 0, pointerEvents: 'none' }} /></div>
    : tile;
  if (kind === 'video') return objUrl
    ? <div style={frame}><video src={objUrl} muted preload="metadata" tabIndex={-1} aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} /></div>
    : tile;
  // markdown / csv — text snippet
  return text !== null
    ? <div style={{ ...frame, padding: '8px 10px' }}><pre className="gps-mono" style={{ margin: 0, fontSize: 9.5, lineHeight: 1.5, color: '#475569', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: PREVIEW_H - 16, overflow: 'hidden' }}>{text.slice(0, 500)}</pre></div>
    : tile;
}

export function BuildArtifactCards(
  { artifacts, onOpen, fetchFile }:
  { artifacts: GovSubmittedArtifact[]; onOpen: (a: GovSubmittedArtifact) => void; fetchFile?: (id: string, opts?: { download?: boolean }) => Promise<Blob> },
): React.ReactElement {
  return (
    <div className="gps-cards" data-testid="ev-build-artifact-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
      {artifacts.map((a) => (
        <div
          key={a.id}
          role="button"
          tabIndex={0}
          data-testid="ev-build-artifact-card"
          data-kind={a.kind}
          className="gps-panel"
          onClick={() => onOpen(a)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(a); } }}
          aria-label={`Open ${a.title}`}
          style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--gps-line, #e2e8f2)', display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          {fetchFile ? <ArtifactPreview artifact={a} fetchFile={fetchFile} /> : <BuildArtifactBadge kind={a.kind} />}
          <div className="gps-row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {fetchFile && <BuildArtifactBadge kind={a.kind} />}
            <b style={{ wordBreak: 'break-word' }}>{a.title}</b>
          </div>
          <span className="gps-small gps-muted gps-mono" style={{ wordBreak: 'break-all' }}>{a.repoPath}</span>
        </div>
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
 * BuildArtifactViewer — a modal that fetches ONE submitted artifact live and renders it by kind: html in a
 * script-less sandboxed iframe, image inline, markdown/text as text, pdf inline, csv as a table, video in a
 * player, and Word/PowerPoint/Excel/other as a download. `fetchFile(id,{download})` is the per-surface fetcher.
 */
export function BuildArtifactViewer(
  { artifact, fetchFile, onClose }:
  { artifact: GovSubmittedArtifact; fetchFile: (id: string, opts?: { download?: boolean }) => Promise<Blob>; onClose: () => void },
): React.ReactElement {
  const kind = artifact.kind;
  const blobUrlKind = kind === 'pdf' || kind === 'image' || kind === 'video';
  const textKind = kind === 'html' || kind === 'markdown' || kind === 'csv';
  const inlineKind = blobUrlKind || textKind;
  const [objUrl, setObjUrl] = useState<string | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!inlineKind) return;
    let live = true; let made: string | null = null;
    setError(null); setObjUrl(null); setTextBody(null);
    fetchFile(artifact.id)
      .then(async (blob) => {
        if (!live) return;
        if (blobUrlKind) { made = URL.createObjectURL(blob); setObjUrl(made); }
        else { setTextBody(await blob.text()); }
      })
      .catch(() => { if (live) setError('Could not load this artifact from the repo.'); });
    return () => { live = false; if (made) { try { URL.revokeObjectURL(made); } catch { /* noop */ } } };
  }, [artifact.id, kind, inlineKind, blobUrlKind, fetchFile]);

  const download = useCallback(() => {
    setDownloading(true);
    fetchFile(artifact.id, { download: true })
      .then((blob) => saveBlob(blob, artifact.name))
      .catch(() => setError('Could not download this file.'))
      .finally(() => setDownloading(false));
  }, [artifact.id, artifact.name, fetchFile]);

  const table = useMemo(() => (kind === 'csv' && textBody !== null ? parseCsv(textBody) : null), [kind, textBody]);

  let body: React.ReactElement;
  if (error) body = <div className="gps-panel gps-muted" role="alert">{error}</div>;
  else if (kind === 'html') body = textBody !== null
    ? <iframe title={artifact.name} srcDoc={textBody} sandbox="" data-testid="ev-build-artifact-frame"
        style={{ width: '100%', height: '78vh', border: '1px solid var(--gps-line,#e2e8f2)', borderRadius: 6, background: '#fff' }} />
    : <div className="gps-muted" aria-busy="true">Loading…</div>;
  else if (kind === 'image') body = objUrl ? <img src={objUrl} alt={artifact.name} style={{ maxWidth: '100%', borderRadius: 6 }} /> : <div className="gps-muted" aria-busy="true">Loading image…</div>;
  else if (kind === 'markdown') body = textBody !== null
    ? <pre data-testid="ev-build-artifact-text" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '78vh', overflow: 'auto', margin: 0 }}>{textBody}</pre>
    : <div className="gps-muted" aria-busy="true">Loading…</div>;
  else if (kind === 'pdf') body = objUrl ? <iframe title={artifact.name} src={objUrl} style={{ width: '100%', height: '78vh', border: '1px solid var(--gps-line,#e2e8f2)', borderRadius: 6 }} /> : <div className="gps-muted" aria-busy="true">Loading PDF…</div>;
  else if (kind === 'video') body = objUrl ? <video controls src={objUrl} style={{ width: '100%', maxHeight: '78vh', borderRadius: 6, background: '#000' }}>Your browser cannot play this video. Download it to watch.</video> : <div className="gps-muted" aria-busy="true">Loading video…</div>;
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
  else body = (
    <div className="gps-panel" style={{ textAlign: 'center' }}>
      <BuildArtifactBadge kind={kind} />
      <p className="gps-small gps-muted" style={{ margin: '10px 0' }}>Download to open in {DOWNLOAD_LABEL[kind] ?? 'its app'}.</p>
      <button type="button" className="gps-btn primary" data-testid="ev-build-artifact-download" disabled={downloading} onClick={download}>Download {artifact.name}</button>
    </div>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={artifact.name} data-testid="ev-build-artifact-viewer"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,31,61,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="gps-panel" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--gps-card,#fff)', width: 'min(960px, 96vw)', maxHeight: '92vh', overflow: 'auto' }}>
        <div className="gps-row" style={{ marginBottom: 10 }}>
          <div className="gps-row" style={{ gap: 8 }}><BuildArtifactBadge kind={kind} /><b style={{ wordBreak: 'break-word' }}>{artifact.title}</b></div>
          <div className="gps-row" style={{ gap: 8 }}>
            {inlineKind && <button type="button" className="gps-btn sm" data-testid="ev-build-artifact-download" disabled={downloading} onClick={download}>Download</button>}
            <button type="button" className="gps-btn sm" data-testid="ev-build-artifact-close" onClick={onClose}>Close</button>
          </div>
        </div>
        {body}
      </div>
    </div>
  );
}
