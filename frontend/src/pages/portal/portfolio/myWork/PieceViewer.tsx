import React from 'react';
import { Link } from 'react-router-dom';
import { ArtifactFileViewer } from '../../../../components/artifactViewer/ArtifactFileViewers';
import { DataBlock } from '../../../../components/artifactViewer/DataBlock';
import type { ArtifactSource } from '../../../../services/artifactViewerTypes';
import type { MyWorkPiece } from '../../../../services/myWorkApi';
import { skillLabel } from './myWorkModel';
import WrittenWorkReader from './WrittenWorkReader';

/**
 * The center of a work page: one piece, in the viewer its kind needs (C128). Shared by the learner's own work page and, since C130,
 * the public read-only work page for a featured piece, so a stranger sees a piece exactly as its owner does.
 *
 *   written    the in-app reader (WrittenWorkReader)
 *   guide      the learner's HTML in a sandboxed frame WITHOUT allow-same-origin (it cannot read this page)
 *   link       a link card plus the reflection: claude.ai pages cannot be embedded
 *   recording  what it was; the owner gets the way to Projects where it plays (audience "learner" only)
 *   files      the shared viewers: PDF, Word / PowerPoint, CSV with Open in Excel, downloads, fetched from `source`
 *
 * `audience` "public" words the page about the owner ("What they said about it") and never links into the portal.
 */
export type PieceView = Pick<MyWorkPiece, 'id' | 'title' | 'written' | 'html' | 'link' | 'recording' | 'file'> & { data?: Record<string, unknown> };

const mins = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export default function PieceViewer({ piece, source, audience = 'learner' }: { piece: PieceView; source: ArtifactSource; audience?: 'learner' | 'public' }): React.ReactElement {
  const own = audience === 'learner';
  const parts: React.ReactElement[] = [];
  if (piece.written) parts.push(<WrittenWorkReader key="w" title={piece.title} body={piece.written} />);
  if (piece.html) parts.push(<iframe key="h" title={piece.title} srcDoc={piece.html} sandbox="allow-scripts allow-popups" className="mw-frame" />);
  if (piece.link) {
    parts.push(
      <div key="l" className="cp-card mw-linkcard">
        <h2>Built in Claude Studio</h2>
        <p className="cp-muted">claude.ai pages cannot be shown inside this page, so this opens it in a new tab.</p>
        {piece.link.url && (
          <p><a className="cp-btn cp-btn-primary" href={piece.link.url} target="_blank" rel="noopener noreferrer">Open on claude.ai ↗</a></p>
        )}
        {piece.link.reflection && (<><h3 className="cp-sub-h">{own ? 'What you said about it' : 'What they said about it'}</h3><p className="mw-quote">{piece.link.reflection}</p></>)}
        {piece.link.stages.length > 0 && (
          <><h3 className="cp-sub-h">Stages completed</h3><p className="mw-tags">{piece.link.stages.map((s) => <span key={s} className="mw-tag">{skillLabel(s)}</span>)}</p></>
        )}
        {piece.link.aiDisclosure && (<><h3 className="cp-sub-h">How AI was used</h3><p>{piece.link.aiDisclosure}</p></>)}
        {piece.link.projectProofUrl && (
          <p><a className="cp-link" href={piece.link.projectProofUrl} target="_blank" rel="noopener noreferrer">Project proof ↗</a></p>
        )}
      </div>,
    );
  }
  if (piece.recording) {
    const r = piece.recording;
    parts.push(
      <div key="r" className="cp-card">
        <h2>{r.mode === 'practice_solo' ? 'Practice recording' : 'Recording'}{r.durationSeconds ? `, ${mins(r.durationSeconds)}` : ''}</h2>
        {r.projectName && <p className="cp-muted">{r.projectName}</p>}
        {own && (<><p className="cp-empty">Recordings play back on your Projects page, where you recorded them.</p>
          <p><Link className="cp-btn cp-btn-primary" to="/portal/projects">Open Projects</Link></p></>)}
      </div>,
    );
  }
  if (piece.file) parts.push(<ArtifactFileViewer key="f" id={piece.id} file={piece.file} source={source} audience="learner" />);
  if (own && piece.data && Object.keys(piece.data).length > 0) {
    parts.push(<div key="d" className="cp-card"><h3 className="cp-sub-h">Details</h3><DataBlock value={piece.data} /></div>);
  }
  if (!parts.length) parts.push(<div key="e" className="cp-card"><p className="cp-empty">This piece has no content to show yet.</p></div>);
  return <>{parts}</>;
}
