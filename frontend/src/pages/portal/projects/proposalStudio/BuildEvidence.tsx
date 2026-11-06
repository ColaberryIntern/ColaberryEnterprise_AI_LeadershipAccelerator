import React, { useCallback, useEffect, useState } from 'react';
import type { StudentGovProjectView, GovBuildArtifactView, GovReviewApi } from '../../../../services/govProjectPortalApi';
import { Bar } from './studioHelpers';

/** A captured screenshot thumbnail — fetched as an object URL via the review API (admin); a hatched placeholder
 *  otherwise or while loading. */
function Thumb({ projectId, artifactId, reviewApi, miss }: { projectId: string; artifactId: string; reviewApi?: GovReviewApi; miss: boolean }): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (miss || !reviewApi) return;
    let live = true; let made: string | null = null;
    reviewApi.fetchArtifactImage(projectId, artifactId).then((u) => { if (live) { made = u; setUrl(u); } }).catch(() => undefined);
    return () => { live = false; if (made) { try { URL.revokeObjectURL(made); } catch { /* noop */ } } };
  }, [projectId, artifactId, reviewApi, miss]);
  if (miss) return <div className="gps-img miss">Not verified yet. No capture.</div>;
  if (url) return <img className="gps-img" src={url} alt="" loading="lazy" />;
  return <div className="gps-img" aria-hidden="true" />;
}

/**
 * BuildEvidence — the screenshots the system captured from verified build stories, filed against the requirements
 * they prove, and insertable into documents as figures. Build-completion + artifact-count tiles and a gallery. The
 * thumbnail, Insert (admin) and Decide (an unverified story) actions use the review API when present. Ported from the
 * approved design.
 */
export default function BuildEvidence(
  { view, projectId, reviewApi, onReload, onToast }:
  { view: StudentGovProjectView; projectId: string; reviewApi?: GovReviewApi; onReload: () => void; onToast?: (m: string) => void },
): React.ReactElement {
  const artifacts: GovBuildArtifactView[] = view.buildArtifacts ?? [];
  const rollup = view.buildSummary?.rollup;
  const pct = rollup ? rollup.pct : 0;
  const usedCount = artifacts.filter((a) => a.caption && /figure|§/i.test(a.caption)).length;

  const insertTargets = (view.proposalDocuments ?? []).filter((d) => d.key !== 'pricing' && !d.superseded && (d.docType === 'build' || d.docType === 'derived' || d.docType === 'generated'));
  const [target, setTarget] = useState<string>(() => insertTargets.find((d) => d.docType === 'build')?.key ?? insertTargets[0]?.key ?? 'technical');
  const [demoUrl, setDemoUrl] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);

  const saveDemoUrl = useCallback(async () => {
    if (!reviewApi?.setDemoUrl) { onToast?.('The demo URL is set from the admin studio.'); return; }
    const u = demoUrl.trim();
    if (!u) { onToast?.('Enter the demo URL.'); return; }
    setSavingUrl(true);
    try { await reviewApi.setDemoUrl(projectId, u); onToast?.('Demo URL saved. Re-capture to refresh the screens.'); onReload(); }
    catch { onToast?.('Could not save the demo URL.'); } finally { setSavingUrl(false); }
  }, [reviewApi, projectId, demoUrl, onReload, onToast]);

  const recapture = () => {
    if (!reviewApi) { onToast?.('Re-capture runs from the admin studio.'); return; }
    // The review API recaptures per story; a bulk "recapture all" re-fires each verified story's capture.
    Promise.all(artifacts.filter((a) => a.storyId).map((a) => reviewApi.recapture(projectId, a.storyId).catch(() => undefined)))
      .then(() => { onToast?.('Re-capturing screens from the demo URL.'); onReload(); });
  };
  const insert = (a: GovBuildArtifactView, docKey: string) => {
    if (!reviewApi) { onToast?.('Inserting figures runs from the admin studio.'); return; }
    reviewApi.insertFigure(projectId, docKey, a.id).then(() => { onToast?.('Inserted as a figure. It is saved with the next version.'); onReload(); }).catch(() => onToast?.('Could not insert the figure.'));
  };

  return (
    <div className="gps-view">
      <div className="gps-vh"><div><h2>Build evidence</h2><p>When a story is verified from its commit, the system opens the demo URL in a headless browser, captures the screen that proves it, and files the capture against that story's requirements. The agent puts these into documents as numbered figures with traceable captions.</p></div>
        <div className="gps-act">
          {reviewApi && insertTargets.length > 0 && (
            <label className="gps-small gps-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Insert into
              <select className="gps-input" style={{ padding: '4px 8px' }} value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Insert target document">
                {insertTargets.map((d) => <option key={d.key} value={d.key}>{d.title}</option>)}
              </select>
            </label>
          )}
          <button className="gps-btn" onClick={recapture}>Re-capture all</button>
        </div></div>
      <div className="gps-grid3">
        <div className="gps-panel"><div className="gps-eyebrow">Build completion</div><div className="gps-big gps-num">{rollup ? `${rollup.verified} / ${rollup.total}` : '—'}</div><div className="gps-small gps-muted">stories verified from commits</div><Bar v={pct} /></div>
        <div className="gps-panel"><div className="gps-eyebrow">Demo URL</div>
          {reviewApi?.setDemoUrl ? (
            <div style={{ marginTop: 6 }}>
              <div className="gps-inline-field"><input className="gps-input gps-mono" placeholder="https://…-demo.colaberry.dev" value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} /><button className="gps-btn sm primary" disabled={savingUrl} onClick={saveDemoUrl}>Save</button></div>
              <div className="gps-small gps-muted" style={{ marginTop: 4 }}>Seeded with sample data, no real PII.</div>
            </div>
          ) : <div className="gps-small gps-muted" style={{ marginTop: 6 }}>Set in the build workspace; seeded with sample data, no real PII.</div>}
        </div>
        <div className="gps-panel"><div className="gps-eyebrow">Artifacts in documents</div><div className="gps-big gps-num">{usedCount} of {artifacts.length}</div><div className="gps-small gps-muted">captures used as figures</div></div>
      </div>
      {artifacts.length === 0 && <div className="gps-panel gps-muted">No captures yet. They appear here when a build story is verified from its commit and the demo URL is set.</div>}
      <div className="gps-gallery">
        {artifacts.map((a) => {
          const miss = a.status !== 'captured' && a.status !== 'verified';
          return (
            <div className="gps-shot" key={a.id}>
              <Thumb projectId={projectId} artifactId={a.id} reviewApi={reviewApi} miss={miss} />
              <div className="gps-cap">
                <div className="gps-row"><span className="gps-mono" style={{ color: 'var(--gps-accent)' }}>{a.storyId}</span>{miss ? <span className="gps-tag warn">Story open</span> : <span className="gps-tag ok">Verified</span>}</div>
                {a.caption && <b>{a.caption}</b>}
                {a.requirementIds.length > 0 && <span className="gps-small gps-muted">Proves {a.requirementIds.join(', ')}</span>}
                <div className="gps-foot"><span className="gps-small gps-muted">{a.commitSha ? a.commitSha.slice(0, 7) : '—'}</span>{miss ? <button className="gps-btn sm" onClick={() => onToast?.('Add a question to the agent panel: finish the build, or describe it without a screenshot.')}>Decide</button> : <button className="gps-btn sm" onClick={() => insert(a, target)}>Insert</button>}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
