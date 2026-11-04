import React, { useState, useEffect, useCallback } from 'react';
import type { GovProposalDocument, GovBuildArtifactView, GovReviewApi } from '../../../../services/govProjectPortalApi';

/**
 * BuildEvidence — the cockpit's BUILD EVIDENCE tab (Proposal Studio P4). It shows the screenshots captured from the
 * verified build demo, each tagged with the requirements it proves, and lets a reviewer insert one into a proposal
 * document as a numbered figure. Our discriminator: the proof is a working software demo, not a stock image.
 * Images load through the authenticated artifact route as blobs (a bare <img src> can't carry the token).
 */
function ArtifactCard(
  { projectId, art, docs, reviewApi, onInserted }:
  { projectId: string; art: GovBuildArtifactView; docs: GovProposalDocument[]; reviewApi?: GovReviewApi; onInserted: () => void },
): React.ReactElement {
  const [img, setImg] = useState<string | null>(null);
  const [docKey, setDocKey] = useState<string>(docs[0]?.key ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    if (reviewApi && art.status === 'captured') {
      reviewApi.fetchArtifactImage(projectId, art.id).then((u) => { url = u; setImg(u); }).catch(() => setMsg('Image unavailable.'));
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [reviewApi, projectId, art.id, art.status]);

  const insert = async () => {
    if (!reviewApi || !docKey) return;
    setBusy(true); setMsg(null);
    try { await reviewApi.insertFigure(projectId, docKey, art.id); onInserted(); setMsg('Inserted.'); }
    catch (e: any) { setMsg(e?.response?.data?.error ?? 'Could not insert.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="gck-panel" style={{ marginBottom: 10 }}>
      {img ? <img src={img} alt={art.caption ?? 'Build screenshot'} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--line)' }} />
           : <div className="gck-empty" style={{ padding: 24 }}>{art.status === 'captured' ? 'Loading screenshot…' : `Capture ${art.status}`}</div>}
      <div className="gck-tags" style={{ marginTop: 8 }}>
        <span className="gck-tag">story {art.storyId}</span>
        {art.requirementIds.map((r) => <span key={r} className="gck-tag">{r}</span>)}
        {art.commitSha && <span className="gck-tag">commit {art.commitSha.slice(0, 7)}</span>}
      </div>
      <div className="gck-hint" style={{ marginTop: 4 }}>{art.caption}</div>
      {reviewApi && docs.length > 0 && art.status === 'captured' && (
        <div className="gck-tags" style={{ marginTop: 8, alignItems: 'center' }}>
          <select value={docKey} onChange={(e) => setDocKey(e.target.value)} className="gck-select">
            {docs.map((d) => <option key={d.key} value={d.key}>{d.title}</option>)}
          </select>
          <button type="button" className="gck-btn" disabled={busy} onClick={insert}>{busy ? 'Inserting…' : 'Insert as figure'}</button>
          {msg && <span className="gck-hint">{msg}</span>}
        </div>
      )}
    </div>
  );
}

export default function BuildEvidence(
  { projectId, artifacts, docs, reviewApi, onReload }:
  { projectId: string; artifacts: GovBuildArtifactView[]; docs: GovProposalDocument[]; reviewApi?: GovReviewApi; onReload: () => void },
): React.ReactElement {
  const [demoUrl, setDemoUrl] = useState('');
  const [savingDemo, setSavingDemo] = useState(false);
  const [demoMsg, setDemoMsg] = useState<string | null>(null);

  const saveDemo = useCallback(async () => {
    if (!reviewApi || !demoUrl.trim()) return;
    setSavingDemo(true); setDemoMsg(null);
    try { await reviewApi.setDemoUrl(projectId, demoUrl.trim()); setDemoMsg('Saved. New verified stories will be captured from this demo.'); }
    catch (e: any) { setDemoMsg(e?.response?.data?.error ?? 'Could not save the demo URL.'); }
    finally { setSavingDemo(false); }
  }, [reviewApi, demoUrl, projectId]);

  return (
    <div>
      {reviewApi && (
        <div className="gck-panel" style={{ marginBottom: 12 }}>
          <div className="gck-eyebrow" style={{ marginBottom: 6 }}>Demo URL</div>
          <p className="gck-hint" style={{ marginTop: 0 }}>Set the deployed demo (https, allowlisted host). When a build story is verified, a screenshot is captured from it as proposal evidence.</p>
          <div className="gck-tags" style={{ alignItems: 'center' }}>
            <input type="url" value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} placeholder="https://your-demo.colaberry.dev" className="gck-input" style={{ minWidth: 280 }} />
            <button type="button" className="gck-btn" disabled={savingDemo} onClick={saveDemo}>{savingDemo ? 'Saving…' : 'Save demo URL'}</button>
          </div>
          {demoMsg && <p className="gck-hint" style={{ marginTop: 6 }}>{demoMsg}</p>}
        </div>
      )}
      {artifacts.length === 0
        ? <div className="gck-empty" style={{ padding: 16 }}>No build evidence yet. Once a build story is verified and a demo URL is set, its screenshot appears here, ready to insert as a figure.</div>
        : artifacts.map((a) => <ArtifactCard key={a.id} projectId={projectId} art={a} docs={docs} reviewApi={reviewApi} onInserted={onReload} />)}
    </div>
  );
}
