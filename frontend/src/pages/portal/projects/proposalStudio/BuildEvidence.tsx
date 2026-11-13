import React, { useCallback, useEffect, useState } from 'react';
import type { StudentGovProjectView, GovBuildArtifactView, GovReviewApi, GovStudioApi } from '../../../../services/govProjectPortalApi';
import { Bar } from './studioHelpers';

/** A captured screenshot thumbnail — fetched as an object URL. The reviewer (admin) uses the review API; an intern
 *  (no reviewApi) uses the member-level studio image route; a hatched placeholder otherwise or while loading. */
function Thumb({ projectId, artifactId, reviewApi, studioApi, miss }: { projectId: string; artifactId: string; reviewApi?: GovReviewApi; studioApi?: GovStudioApi; miss: boolean }): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  const fetchImage = reviewApi?.fetchArtifactImage ?? studioApi?.fetchArtifactImage;
  useEffect(() => {
    if (miss || !fetchImage) return;
    let live = true; let made: string | null = null;
    fetchImage(projectId, artifactId).then((u) => { if (live) { made = u; setUrl(u); } }).catch(() => undefined);
    return () => { live = false; if (made) { try { URL.revokeObjectURL(made); } catch { /* noop */ } } };
  }, [projectId, artifactId, fetchImage, miss]);
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
  { view, projectId, reviewApi, studioApi, onReload, onToast, readOnly = false }:
  { view: StudentGovProjectView; projectId: string; reviewApi?: GovReviewApi; studioApi?: GovStudioApi; onReload: () => void; onToast?: (m: string) => void; readOnly?: boolean },
): React.ReactElement {
  const artifacts: GovBuildArtifactView[] = view.buildArtifacts ?? [];
  const rollup = view.buildSummary?.rollup;
  const pct = rollup ? rollup.pct : 0;
  const usedCount = artifacts.filter((a) => a.caption && /figure|§/i.test(a.caption)).length;

  const insertTargets = (view.proposalDocuments ?? []).filter((d) => d.key !== 'pricing' && !d.superseded && (d.docType === 'build' || d.docType === 'derived' || d.docType === 'generated'));

  // The build artifacts REPOSITORY the proposal writer can draw from: what the intern has actually built and submitted
  // from their repo (each story's evidence — an artifactRef link and/or a matched commit), the deliverables behind the
  // verified stories. Demo videos join here as interns record their demos; until then this is the repo + commit work.
  const builtArtifacts = (view.build?.stories ?? [])
    .flatMap((s) => (s.evidence ?? []).map((e) => ({ story: s, e })))
    .filter((x) => x.e.artifactRef || x.e.commitSha || x.e.description);
  const isHttp = (u: string | null | undefined): boolean => !!u && /^https?:\/\//i.test(u);
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
      <div className="gps-vh"><div><h2>Build evidence <button type="button" data-testid="help" className="gps-help" title="About this view" onClick={() => onToast?.('Build evidence: screenshots captured from your verified build stories, inserted into documents as numbered figures.')}>i</button></h2><p>When a story is verified from its commit, the system opens the demo URL in a headless browser, captures the screen that proves it, and files the capture against that story's requirements. The agent puts these into documents as numbered figures with traceable captions.</p></div>
        <div className="gps-act"><button className="gps-btn" onClick={recapture}>Re-capture all</button></div></div>
      <div className="gps-grid3">
        <div className="gps-panel"><div className="gps-eyebrow">Build completion</div><div className="gps-big gps-num">{rollup ? `${rollup.verified} / ${rollup.total}` : '—'}</div><div className="gps-small gps-muted">stories verified from commits</div><Bar v={pct} /></div>
        <div className="gps-panel"><div className="gps-eyebrow">{readOnly ? 'Connected repo' : 'Demo URL'}</div>
          {readOnly ? (
            view.connectedRepo ? (
              <div style={{ marginTop: 6 }}>
                <a className="gps-mono" data-testid="ev-connected-repo" href={view.connectedRepo.url || undefined} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{view.connectedRepo.owner}/{view.connectedRepo.name}</a>
                <div className="gps-small gps-muted" style={{ marginTop: 4 }}>Synced from the build repo.</div>
              </div>
            ) : <div className="gps-small gps-muted" data-testid="ev-no-repo" style={{ marginTop: 6 }}>No repo connected yet.</div>
          ) : reviewApi?.setDemoUrl ? (
            <div style={{ marginTop: 6 }}>
              <div className="gps-inline-field"><input className="gps-input gps-mono" data-testid="ev-demo-url" placeholder="https://…-demo.colaberry.dev" value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} /><button className="gps-btn sm primary" disabled={savingUrl} onClick={saveDemoUrl}>Save</button></div>
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
            <div className="gps-shot" key={a.id} data-testid="ev-capture" data-story={a.storyId} data-verified={!miss}>
              <Thumb projectId={projectId} artifactId={a.id} reviewApi={reviewApi} studioApi={studioApi} miss={miss} />
              <div className="gps-cap">
                <div className="gps-row"><span className="gps-mono" style={{ color: 'var(--gps-accent)' }}>{a.storyId}</span>{miss ? <span className="gps-tag warn">Story open</span> : <span className="gps-tag ok">Verified</span>}</div>
                {a.caption && <b>{a.caption}</b>}
                {a.requirementIds.length > 0 && <span className="gps-small gps-muted">Proves {a.requirementIds.join(', ')}</span>}
                <div className="gps-foot"><span className="gps-small gps-muted">{a.commitSha ? a.commitSha.slice(0, 7) : '—'}</span>
                  {miss ? (
                    <button className="gps-btn sm" data-testid="ev-decide" onClick={() => onToast?.('Decide: open the matching decision in Needs you — finish the build, or describe it without a screenshot.')}>Decide</button>
                  ) : (
                    <select className="gps-input" data-testid="ev-insert" style={{ padding: '3px 8px', fontSize: 12 }} aria-label="Insert into document" defaultValue="" onChange={(e) => { if (e.target.value) { insert(a, e.target.value); e.currentTarget.value = ''; } }}>
                      <option value="" disabled>Insert into…</option>
                      {insertTargets.map((d) => <option key={d.key} value={d.key}>{d.title}</option>)}
                    </select>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Build artifacts REPOSITORY — what the intern has built + submitted from their repo, for the proposal writer. */}
      <div className="gps-vh" style={{ marginTop: 24 }}><div><h3>Build artifacts</h3><p>What the intern has built and submitted from their repo &mdash; the deliverables behind the verified stories, for the proposal to draw from. Demo videos join here as interns record their demos.</p></div></div>
      {/* The connected repo's deliverable files, pulled from the synced tree (read-only) — so the panel reflects the
          real product and confirms sync, instead of waiting for a manual submission. */}
      {view.connectedRepo && view.connectedRepo.files.length > 0 && (
        <div className="gps-panel" data-testid="ev-repo-files" style={{ marginBottom: 12 }}>
          <div className="gps-row" style={{ marginBottom: 6 }}>
            <b>Files in the connected repo</b>
            <span className="gps-small gps-muted">{view.connectedRepo.fileCount} file{view.connectedRepo.fileCount === 1 ? '' : 's'}{view.connectedRepo.syncedAt ? ` · synced ${new Date(view.connectedRepo.syncedAt).toLocaleDateString()}` : ''}</span>
          </div>
          <ul className="gps-small gps-mono" style={{ margin: 0, paddingLeft: 18, maxHeight: 280, overflowY: 'auto' }}>
            {view.connectedRepo.files.map((f) => <li key={f} data-testid="ev-repo-file">{f}</li>)}
          </ul>
          {view.connectedRepo.fileCount > view.connectedRepo.files.length && (
            <div className="gps-small gps-muted" style={{ marginTop: 4 }}>+{view.connectedRepo.fileCount - view.connectedRepo.files.length} more</div>
          )}
        </div>
      )}
      {builtArtifacts.length === 0 ? (
        <div className="gps-panel gps-muted" data-testid="ev-artifacts-empty">No build artifacts submitted yet. They appear here as the intern pushes work and submits it from their repo &mdash; and their demo videos once recorded.</div>
      ) : (
        <div className="gps-gallery">
          {builtArtifacts.map(({ story, e }, i) => (
            <div className="gps-panel" key={e.id || `${story.id}-${i}`} data-testid="ev-artifact" data-source={e.source ?? 'student'}>
              <div className="gps-row"><b>{story.title}</b>{e.status === 'verified' ? <span className="gps-tag ok">Verified</span> : e.status === 'rejected' ? <span className="gps-tag warn">Rejected</span> : <span className="gps-tag">Submitted</span>}</div>
              {e.description && <div className="gps-small gps-muted" style={{ marginBottom: 6 }}>{e.description}</div>}
              <div className="gps-foot">
                {e.artifactRef && (isHttp(e.artifactRef)
                  ? <a className="gps-small" data-testid="ev-artifact-link" href={e.artifactRef} target="_blank" rel="noreferrer">Open artifact</a>
                  : <span className="gps-small gps-mono">{e.artifactRef}</span>)}
                <span className="gps-small gps-muted">{e.source === 'github_push' ? 'from commit' : 'submitted'}{e.commitSha ? ` · ${e.commitSha.slice(0, 7)}` : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
