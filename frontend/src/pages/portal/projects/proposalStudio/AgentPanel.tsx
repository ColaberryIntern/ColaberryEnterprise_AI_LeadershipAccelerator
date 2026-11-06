import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { GovStudioApi, GovActivityEvent, GovProjectNeed, GovProposalDocument, GovReviewRun } from '../../../../services/govProjectPortalApi';
import type { StudioView } from './StageRail';
import { agentHeaderState } from './agentState';
import { needControl, needKindLabel, submissionFor } from './needsHelpers';

const shortTime = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const evClass = (k: GovActivityEvent['kind']): string => (k === 'library_answer' ? 'ok' : k === 'gate' || k === 'blueprint' ? 'h' : '');

/**
 * AgentPanel — the persistent right column (v3, T16). A live header state (Building / Judging / Revising / Reading
 * ZIP / Waiting on you / Idle) derived from the active review run + open needs, a derived activity log, the top needs
 * (first 5, with "See all N" into the Needs-you inbox), and a restored Ask box. Drives either the admin or the portal
 * routes via the injected studioApi; Ask goes through the injected copilot.
 */
export default function AgentPanel(
  { projectId, studioApi, docs, onReload, onNavigate, onAsk, onToast }:
  { projectId: string; studioApi: GovStudioApi; docs: GovProposalDocument[]; onReload: () => void; onNavigate: (v: StudioView) => void; onAsk?: (q: string) => Promise<string>; onToast?: (m: string) => void },
): React.ReactElement {
  const [needs, setNeeds] = useState<GovProjectNeed[]>([]);
  const [activity, setActivity] = useState<GovActivityEvent[]>([]);
  const [run, setRun] = useState<GovReviewRun | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(() => {
    studioApi.listNeeds(projectId).then((g) => setNeeds(g.needs)).catch(() => setNeeds([]));
    studioApi.listActivity(projectId, 50).then(setActivity).catch(() => setActivity([]));
  }, [projectId, studioApi]);
  useEffect(() => { load(); }, [load]);

  // Poll the active review run (the first doc whose cycle is running) for its live phase message.
  const activeRunId = docs.find((d) => d.cycle?.status === 'running')?.cycle?.runId ?? null;
  useEffect(() => {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    if (!activeRunId) { setRun(null); return; }
    let cancelled = false;
    const tick = () => studioApi.getReviewRun(projectId, activeRunId).then((r) => { if (!cancelled) setRun(r); }).catch(() => undefined);
    tick();
    pollRef.current = window.setInterval(tick, 4000);
    return () => { cancelled = true; if (pollRef.current) window.clearInterval(pollRef.current); pollRef.current = null; };
  }, [activeRunId, projectId, studioApi]);

  const state = agentHeaderState({ runStatus: run?.status ?? (activeRunId ? 'running' : null), lastMessage: run?.lastMessage, needsCount: needs.length });

  const resolve = useCallback(async (need: GovProjectNeed, value: string) => {
    const v = value.trim();
    if (!v) { onToast?.('Type an answer first.'); return; }
    setBusy(need.key);
    try {
      const r = await studioApi.resolveNeed(projectId, need.key, submissionFor('text', v));
      onToast?.(r.unblocked.length ? `Answered — resuming ${r.unblocked.length} document${r.unblocked.length === 1 ? '' : 's'}.` : 'Answered.');
      setNeeds((ns) => ns.filter((x) => x.key !== need.key));
      load();
      onReload();
    } catch { onToast?.('Could not save the answer.'); } finally { setBusy(null); }
  }, [projectId, studioApi, onReload, onToast, load]);

  const submitAsk = useCallback(async () => {
    const q = ask.trim();
    if (!q || !onAsk) return;
    setAsking(true);
    try { setAnswer(await onAsk(q)); } catch { setAnswer('The agent could not answer that right now.'); } finally { setAsking(false); }
  }, [ask, onAsk]);

  const top = needs.slice(0, 5);

  return (
    <aside className="gps-agent" data-tour="agent" data-testid="agent-panel">
      <div className="gps-ag">
        <header>
          <div className="gps-av" aria-hidden="true">AI</div>
          <div><h2>Proposal agent</h2><p>Builds and judges. You supply what&rsquo;s missing.</p></div>
          <span className={`gps-state gps-tag ${state === 'Waiting on you' ? 'warn' : 'agent'}`} data-testid="agent-state" data-state={state}>{state}</span>
        </header>
        {run?.lastMessage && state !== 'Idle' && state !== 'Waiting on you' && <div className="gps-small gps-muted" style={{ padding: '0 2px 6px' }}>{run.lastMessage}</div>}

        <div className="gps-ag-log" aria-live="polite" data-testid="agent-log">
          {activity.length === 0 && <div className="gps-ev"><div><div className="gps-t">&nbsp;</div><span className="gps-muted">No activity yet. It fills as the agent drafts, checks and you answer needs.</span></div></div>}
          {activity.map((e, i) => (
            <div className={`gps-ev ${evClass(e.kind)}`} key={i}><div><div className="gps-t">{shortTime(e.at)}</div>{e.summary}</div></div>
          ))}
        </div>

        <div className="gps-ask" data-testid="agent-needs">
          <h3><span>Needs you</span><span className="gps-num">{needs.length}</span></h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {needs.length === 0 && <div className="gps-muted gps-small">Nothing needs you right now.</div>}
            {top.map((n) => {
              const control = needControl(n);
              const inline = control === 'text' || control === 'url';
              return (
                <div className="gps-q" key={n.key}>
                  <span className="gps-tag" style={{ alignSelf: 'flex-start' }}>{needKindLabel(n.kind)}</span>
                  <b>{n.ask}</b>
                  {n.why && <span className="gps-why">{n.why}</span>}
                  {inline ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className="gps-input" aria-label="Answer" value={drafts[n.key] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [n.key]: e.target.value }))} />
                      <button className="gps-btn sm primary" disabled={busy === n.key} onClick={() => resolve(n, drafts[n.key] ?? '')}>Save</button>
                    </div>
                  ) : (
                    <button className="gps-btn sm" onClick={() => onNavigate('openitems')}>Answer in Needs you</button>
                  )}
                </div>
              );
            })}
            {needs.length > 5 && <button className="gps-btn sm" onClick={() => onNavigate('openitems')}>See all {needs.length}</button>}
          </div>
        </div>

        {onAsk && (
          <div className="gps-ask" style={{ marginTop: 10 }}>
            <h3><span>Ask the agent</span></h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="gps-input" data-testid="agent-ask" aria-label="Ask the agent" placeholder="Ask about this proposal…" value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitAsk(); }} />
              <button className="gps-btn sm" disabled={asking || !ask.trim()} onClick={submitAsk}>Ask</button>
            </div>
            {answer && <div className="gps-small" style={{ marginTop: 6 }}>{answer}</div>}
          </div>
        )}
      </div>
    </aside>
  );
}
