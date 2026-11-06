import React, { useCallback, useState } from 'react';
import type { StudentGovProjectView, GovStudioApi } from '../../../../services/govProjectPortalApi';
import type { StudioView } from './StageRail';
import { docScore, colr, Bar } from './studioHelpers';
import { anyNotStarted, docStageLabel } from './buildHelpers';

/**
 * WhereWeAre — the Studio's overview (v3, T17). The pursuit stage strip, the proposal-readiness ring + a score bar
 * and stage pill per scored document, a data-driven "Next moves" list led by what needs you, and a "Build all
 * documents" primary action when any document is not started. Every number is the real projection's.
 */
export default function WhereWeAre(
  { view, onNavigate, studioApi, onReload, onToast }:
  { view: StudentGovProjectView; onNavigate: (v: StudioView) => void; studioApi: GovStudioApi; onReload: () => void; onToast: (m: string) => void },
): React.ReactElement {
  const readiness = view.proposalReadiness ?? { pct: 0, passing: 0, total: 0 };
  const docs = (view.proposalDocuments ?? []);
  const scored = docs.filter((d) => d.docType !== 'form' && !d.superseded);
  const r = 34, c = 2 * Math.PI * r;
  const p = readiness.pct;
  const needCount = view.needsCount ?? 0;
  const [building, setBuilding] = useState(false);

  const buildAll = useCallback(async () => {
    setBuilding(true);
    try { const res = await studioApi.buildAll(view.projectId); onToast(res.enqueued.length ? `Building ${res.enqueued.length} document${res.enqueued.length === 1 ? '' : 's'}…` : 'Nothing to build right now.'); onReload(); }
    catch { onToast('Could not start Build all. Please try again.'); } finally { setBuilding(false); }
  }, [studioApi, view.projectId, onReload, onToast]);

  const lowest = scored.filter((d) => docScore(d) < 95).sort((a, b) => docScore(a) - docScore(b))[0];
  const formsPending = docs.filter((d) => d.docType === 'form' && !(d.latest?.passes)).length;
  const canBuildAll = anyNotStarted(docs);

  type Move = { who: string; cls: string; text: string };
  const moves: Move[] = [];
  if (needCount > 0) moves.push({ who: 'You', cls: 'warn', text: `Answer ${needCount} need${needCount === 1 ? '' : 's'} in Needs you. Each one unblocks the documents that cite it.` });
  if (canBuildAll) moves.push({ who: 'Agent', cls: 'agent', text: 'Build all documents that have not been started — the agent drafts, checks and revises each one.' });
  else if (lowest) moves.push({ who: 'Agent', cls: 'agent', text: `Run a review cycle on ${lowest.title}. It scores ${docScore(lowest)}; the target is 95.` });
  if (formsPending > 0) moves.push({ who: 'Signer', cls: 'acc', text: `Record the signed copy for ${formsPending} required form${formsPending === 1 ? '' : 's'}.` });
  if (moves.length === 0) moves.push({ who: 'Agent', cls: 'ok', text: 'Every scored document is passing. Give the package a final Go at the Gold gate, then submit.' });

  return (
    <div className="gps-view">
      <div className="gps-vh"><div><h2>Where we are</h2><p>Planning and the pilot build are done. The work now is turning the solicitation, the build and the company record into a submittable proposal, with every document checked against the requirements until it scores 95 or better.</p></div></div>
      <div className="gps-pipe" aria-label="Pursuit stages">
        <div className="d"><b>Snapshot</b>advisory read</div>
        <div className="d"><b>Solicitation</b>{view.requirementCounts.total} requirements</div>
        <div className="d"><b>Fit</b>approved</div>
        <div className="d"><b>Decide</b>bid approved</div>
        <div className="d"><b>Build</b>{view.buildSummary ? `${view.buildSummary.rollup.verified} / ${view.buildSummary.rollup.total} verified` : 'in progress'}</div>
        <div className="h"><b>Proposal</b>you are here</div>
        <div><b>Submit</b>export + record</div>
        <div><b>Outcome</b>win / loss</div>
      </div>
      <div className="gps-grid2">
        <div className="gps-panel">
          <h3>Proposal readiness</h3>
          <div className="gps-ring">
            <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
              <circle cx="42" cy="42" r={r} fill="none" stroke="var(--gps-sunk)" strokeWidth="9" />
              <circle cx="42" cy="42" r={r} fill="none" stroke={colr(p)} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(c * p) / 100} ${c}`} transform="rotate(-90 42 42)" />
            </svg>
            <div><div className="gps-big gps-num">{p}%</div><div className="gps-muted gps-small">target 95% on every document &middot; {readiness.passing} of {readiness.total} documents pass</div></div>
          </div>
          <div className="gps-mini-docs" style={{ marginTop: 14 }}>
            {scored.map((d) => { const sc = docScore(d); return (<div className="gps-r" key={d.key}><span>{d.title} <span className="gps-tag gps-small" style={{ marginLeft: 4 }}>{docStageLabel(d)}</span></span><Bar v={sc} /><b className="gps-num" style={{ textAlign: 'right' }}>{sc}</b></div>); })}
          </div>
        </div>
        <div className="gps-panel">
          <h3>Next moves</h3>
          <ul className="gps-next">
            {moves.map((m, i) => (<li key={i}><span className={`gps-who gps-tag ${m.cls}`}>{m.who}</span><span>{m.text}</span></li>))}
          </ul>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {canBuildAll && <button className="gps-btn primary" disabled={building} onClick={buildAll}>Build all documents</button>}
            <button className="gps-btn agent" onClick={() => onNavigate('editor')}>Open Draft &amp; versions</button>
            <button className="gps-btn" onClick={() => onNavigate('openitems')}>Needs you{needCount ? ` (${needCount})` : ''}</button>
          </div>
        </div>
      </div>
      <div className="gps-panel">
        <h3>How a document gets to 95%</h3>
        <div className="gps-grid3 gps-small">
          <div><span className="gps-tag acc">1 &middot; Draft</span><p style={{ margin: '6px 0 0' }}>The agent drafts from the blueprint: requirements, evaluation weights, Section L format rules, build artifacts, and the company library. Missing facts become questions, not guesses.</p></div>
          <div><span className="gps-tag red">2 &middot; Check</span><p style={{ margin: '6px 0 0' }}>Six checks score every version: coverage, evaluator score, proof, fact integrity, format, and clarity. Each one maps to a Shipley color team.</p></div>
          <div><span className="gps-tag ok">3 &middot; Revise or approve</span><p style={{ margin: '6px 0 0' }}>Below 95, the agent writes a new version that fixes what failed. At 95 or above, a person approves the gate. Every version is kept with its scores and a diff.</p></div>
        </div>
      </div>
    </div>
  );
}
