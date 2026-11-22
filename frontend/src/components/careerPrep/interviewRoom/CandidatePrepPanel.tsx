import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPlacementInterviewsApi } from '../interviewsApi';
import { fetchPrepDashboard } from '../careerPrepApi';

/**
 * CP9.1 (kit F5, "the candidate's side panel, only the candidate sees it"): the student's prep at a glance for THIS
 * interview: readiness now and the ready-at target, the questions to expect (from the job description, when there
 * are some) and the two skills to lean on least. It can be hidden. Every number comes from the server (the prep row
 * the booking linked, then the dashboard anchored on it); a missing value is not rendered, a failed load is an
 * alert, and the room works either way. Live delivery (pace, fillers during the call) needs an embedded meeting
 * (execution contract E1) and is not here.
 */
export interface PrepGlance { prepId: string | null; readiness?: number; target?: number; questions: string[]; focus: string[] }

export async function loadPrepGlance(interviewId: string): Promise<PrepGlance> {
  const list = await fetchPlacementInterviewsApi();
  const prepId = list.interviews.find((i) => i.id === interviewId)?.prepId ?? null;
  if (!prepId) return { prepId: null, questions: [], focus: [] };
  const d = await fetchPrepDashboard(prepId);
  const iv = d.interviews.find((i) => i.id === prepId);
  const focus = d.skills.filter((s) => typeof s.score === 'number').sort((a, b) => (a.score as number) - (b.score as number)).slice(0, 2).map((s) => s.label);
  return { prepId, readiness: d.readiness?.value, target: d.readiness?.target ?? iv?.target, questions: (iv?.questions ?? []).slice(0, 3), focus };
}

function Glance({ g }: { g: PrepGlance }): React.ReactElement {
  if (!g.prepId) return <p className="cp-muted" data-testid="cp-iroom-prep-none">No prep on file for this interview yet.</p>;
  return (
    <>
      {(g.readiness !== undefined || g.target !== undefined) && (
        <dl className="cp-iroom-stops">
          {g.readiness !== undefined && <div><dt>Readiness</dt><dd data-testid="cp-iroom-readiness">{g.readiness}</dd></div>}
          {g.target !== undefined && <div><dt>Ready at</dt><dd>{g.target}</dd></div>}
        </dl>
      )}
      {g.questions.length > 0 && (<><h4>Questions to expect</h4><ol className="cp-iroom-list">{g.questions.map((q) => <li key={q}>{q}</li>)}</ol></>)}
      {g.focus.length > 0 && <p><b>Lean on:</b> {g.focus.join(', ')}. Your lowest skills right now.</p>}
      <Link className="cp-ghost" to={`/portal/career/room?anchor=${encodeURIComponent(g.prepId)}`}>Open my prep</Link>
    </>
  );
}

export function CandidatePrepPanel({ interviewId }: { interviewId: string }): React.ReactElement {
  const [shown, setShown] = useState(true);
  const [g, setG] = useState<PrepGlance | null | 'failed'>(null);
  useEffect(() => {
    let live = true;
    loadPrepGlance(interviewId).then((v) => { if (live) setG(v); }, () => { if (live) setG('failed'); });
    return () => { live = false; };
  }, [interviewId]);
  return (
    <aside className="cp-iroom-side" aria-label="Your prep" data-testid="cp-iroom-prep">
      <div className="cp-iroom-side-head">
        <small className="cp-iroom-kicker">Only you see this</small>
        <button type="button" className="cp-linkbtn" aria-expanded={shown} onClick={() => setShown((v) => !v)} data-testid="cp-iroom-prep-toggle">{shown ? 'Hide my prep' : 'Show my prep'}</button>
      </div>
      {shown && (
        <div data-testid="cp-iroom-prep-body">
          <h3>Your prep, at a glance</h3>
          {g === null && <p className="cp-muted" aria-live="polite">Loading your prep...</p>}
          {g === 'failed' && <p role="alert" className="cp-iroom-alert">Your prep could not load. The room still works.</p>}
          {g && g !== 'failed' && <Glance g={g} />}
        </div>
      )}
    </aside>
  );
}
