import React, { useCallback, useEffect, useState } from 'react';
import type { GovStudioApi, GovOpenQuestion, GovActivityEvent } from '../../../../services/govProjectPortalApi';

export type AgentState = 'Idle' | 'Running' | 'Reading ZIP';

const shortTime = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const evClass = (k: GovActivityEvent['kind']): string => (k === 'library_answer' ? 'ok' : k === 'gate' || k === 'blueprint' ? 'h' : '');

/**
 * AgentPanel — the persistent right column. The agent's state, a derived activity log (newest first), and the
 * "Needs your answer" list: each open question with a why line and an inline control (text + Save, or option
 * buttons). Answering saves it to the library and re-scores the affected documents, then the project reloads.
 * Ported from the approved design. Drives either the admin or the portal routes via the injected studioApi.
 */
export default function AgentPanel(
  { projectId, studioApi, onReload, state = 'Idle', onToast }:
  { projectId: string; studioApi: GovStudioApi; onReload: () => void; state?: AgentState; onToast?: (m: string) => void },
): React.ReactElement {
  const [questions, setQuestions] = useState<GovOpenQuestion[]>([]);
  const [activity, setActivity] = useState<GovActivityEvent[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    studioApi.listQuestions(projectId).then(setQuestions).catch(() => setQuestions([]));
    studioApi.listActivity(projectId, 50).then(setActivity).catch(() => setActivity([]));
  }, [projectId, studioApi]);

  useEffect(() => { load(); }, [load]);

  const answer = useCallback(async (q: GovOpenQuestion, value: string) => {
    const v = value.trim();
    if (!v) { onToast?.('Type an answer first.'); return; }
    setBusy(q.key);
    try {
      const { resolved } = await studioApi.answerQuestion(projectId, q.key, v);
      onToast?.(resolved > 0 ? 'Saved. The agent will use it in the next revision.' : 'Saved to the company library.');
      setQuestions((qs) => qs.filter((x) => x.key !== q.key));
      load();
      onReload();
    } catch {
      onToast?.('Could not save the answer.');
    } finally {
      setBusy(null);
    }
  }, [projectId, studioApi, onReload, onToast, load]);

  return (
    <aside className="gps-agent">
      <div className="gps-ag">
        <header>
          <div className="gps-av" aria-hidden="true">AI</div>
          <div><h2>Proposal agent</h2><p>Drafts, checks and revises. You approve.</p></div>
          <span className="gps-state gps-tag agent">{state}</span>
        </header>
        <div className="gps-ag-log" aria-live="polite">
          {activity.length === 0 && <div className="gps-ev"><div><div className="gps-t">&nbsp;</div><span className="gps-muted">No activity yet. It fills as the agent drafts, checks and you answer questions.</span></div></div>}
          {activity.map((e, i) => (
            <div className={`gps-ev ${evClass(e.kind)}`} key={i}><div><div className="gps-t">{shortTime(e.at)}</div>{e.summary}</div></div>
          ))}
        </div>
        <div className="gps-ask">
          <h3><span>Needs your answer</span><span className="gps-num">{questions.length}</span></h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {questions.length === 0 && <div className="gps-muted gps-small">Nothing to answer right now.</div>}
            {questions.map((q) => (
              <div className="gps-q" key={q.key}>
                <b>{q.question}</b>
                {q.why && <span className="gps-why">{q.why}</span>}
                {q.suggestions.length > 0 ? (
                  <div className="gps-opts">
                    {q.suggestions.map((o) => (
                      <button key={o} className="gps-btn sm" disabled={busy === q.key} onClick={() => answer(q, o)}>{o}</button>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input aria-label="Answer" value={drafts[q.key] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [q.key]: e.target.value }))} />
                    <button className="gps-btn sm primary" disabled={busy === q.key} onClick={() => answer(q, drafts[q.key] ?? '')}>Save</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
