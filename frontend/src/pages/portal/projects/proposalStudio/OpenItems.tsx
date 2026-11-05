import React, { useEffect, useState } from 'react';
import type { StudentGovProjectView, GovProposalDocument, GovStudioApi, GovOpenQuestion } from '../../../../services/govProjectPortalApi';
import type { StudioView } from './StageRail';

/**
 * OpenItems — the "For you" view: everything that needs a person before this proposal can ship, pulled live from the
 * project. Three columns — questions the agent needs answered, items that block export (fatal findings, documents
 * over their page limit, documents mapped to no requirement), and loose ends (documents no longer required, build
 * artifacts tied to nothing, documents not started). Each row links to where it gets resolved. When all three are
 * empty the view says so plainly. This replaces the design's static gap report with the project's real state.
 */
export default function OpenItems(
  { view, projectId, docs, studioApi, onNavigate, onOpenDoc }:
  { view: StudentGovProjectView; projectId: string; docs: GovProposalDocument[]; studioApi: GovStudioApi; onNavigate: (v: StudioView) => void; onOpenDoc: (d: GovProposalDocument) => void },
): React.ReactElement {
  const [questions, setQuestions] = useState<GovOpenQuestion[]>([]);
  useEffect(() => { studioApi.listQuestions(projectId).then(setQuestions).catch(() => setQuestions([])); }, [projectId, studioApi]);

  const live = docs.filter((d) => d.key !== 'pricing' && !d.superseded);
  const blocking: Array<{ d: GovProposalDocument; text: string }> = [];
  live.forEach((d) => {
    if ((d.fatalCount ?? 0) > 0) blocking.push({ d, text: `${d.title}: ${d.fatalCount} fatal finding${d.fatalCount === 1 ? '' : 's'} to resolve` });
    if (d.pageLimit != null && d.latest?.pageCount != null && d.latest.pageCount > d.pageLimit) blocking.push({ d, text: `${d.title}: ${d.latest.pageCount} pages over the ${d.pageLimit}-page limit` });
    if (d.requirementIds.length === 0) blocking.push({ d, text: `${d.title}: not mapped to any requirement` });
  });

  const loose: Array<{ d?: GovProposalDocument; text: string }> = [];
  docs.filter((d) => d.superseded).forEach((d) => loose.push({ d, text: `${d.title}: no longer required, still in the set` }));
  (view.buildArtifacts ?? []).filter((a) => a.requirementIds.length === 0).forEach((a) => loose.push({ text: `Build artifact ${a.storyId}: not linked to a requirement` }));
  live.filter((d) => d.status === 'not_started' && d.requirementIds.length > 0).forEach((d) => loose.push({ d, text: `${d.title}: not started` }));

  const total = questions.length + blocking.length + loose.length;

  return (
    <div className="gps-view">
      <div className="gps-vh"><div><h2>Open items</h2><p>Everything that needs a person before this proposal can ship: questions the agent is waiting on, items that would block export, and loose ends. Pulled live from the project.</p></div></div>
      {total === 0 ? (
        <div className="gps-panel"><p className="gps-muted" style={{ margin: 0 }}>Nothing open right now. The agent has what it needs — run a review cycle from Draft &amp; versions, or move to Review gates.</p></div>
      ) : (
        <div className="gps-gapcols">
          <div className="gps-panel"><h3><span className="gps-tag warn">Needs an answer</span></h3>
            <ul>
              {questions.length === 0 && <li className="gps-muted">No open questions.</li>}
              {questions.map((q) => (
                <li key={q.key}><b>{q.question}</b>{q.why ? <div className="gps-small gps-muted">{q.why}</div> : null}<div><button className="gps-btn sm" style={{ marginTop: 4 }} onClick={() => onNavigate('overview')}>Answer in the agent panel</button></div></li>
              ))}
            </ul>
          </div>
          <div className="gps-panel"><h3><span className="gps-tag bad">Blocking</span></h3>
            <ul>
              {blocking.length === 0 && <li className="gps-muted">Nothing blocking export.</li>}
              {blocking.map((b, i) => (
                <li key={i}><button className="gps-link" onClick={() => onOpenDoc(b.d)} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>{b.text}</button></li>
              ))}
            </ul>
          </div>
          <div className="gps-panel"><h3><span className="gps-tag">Loose ends</span></h3>
            <ul>
              {loose.length === 0 && <li className="gps-muted">None.</li>}
              {loose.map((l, i) => (
                <li key={i}>{l.d ? <button className="gps-link" onClick={() => onOpenDoc(l.d as GovProposalDocument)} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>{l.text}</button> : <span>{l.text}</span>}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
