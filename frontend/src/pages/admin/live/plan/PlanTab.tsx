import React, { useCallback, useEffect, useRef, useState } from 'react';
import { chooseTopic, getPlan, getPlanSetup, planFailure, regeneratePlan, startPlan, type PlanInputs, type PlanSetup, type PlanView } from '../../../../services/weeklyLivePlanApi';
import { DemandBars, SignalList } from './PlanParts';
import { centralToday, STAGE_LABEL, STAGE_ORDER } from './planModel';
import TopicCard from './TopicCard';

/**
 * Plan next Weekly Live (WL3.5). A run takes a few minutes on the server, so the page polls it and can be
 * closed meanwhile: opening the same air date again shows the same plan.
 */
export const POLL_MS = 5000;
const TEXTS: readonly [keyof PlanInputs, string, string][] = [
  ['proof', "Proof you'll build this week", 'The biggest single factor. Leaving it blank caps the Teach score at 91.'],
  ['forceNews', 'News, trend or event to work in', ''], ['audience', 'Audience', ''], ['avoid', 'Avoid', ''], ['notes', 'Notes', ''],
];

interface Props { airDate: string; onAirDate: (d: string) => void; setup: PlanSetup | null; setupError: string | null; onSetup: (s: PlanSetup) => void }

export default function PlanTab({ airDate, onAirDate, setup, setupError, onSetup }: Props): React.ReactElement {
  const [inputs, setInputs] = useState<PlanInputs>({ week: 'auto' });
  const [view, setView] = useState<PlanView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; text: string } | null>(null);
  const current = useRef<string | null>(null);
  const shownDate = useRef(airDate);
  shownDate.current = airDate;
  const planId = view?.plan.id ?? setup?.latestPlanId ?? null;

  const load = useCallback(async (id: string) => {
    try {
      const v = await getPlan(id);
      if (current.current !== id) return; // the date changed while this was loading
      setView(v); setOffline(false);
    } catch (e) {
      if (current.current !== id) return;
      setOffline(true);
    }
  }, []);

  // A new air date (or a first load) shows the plan that date already has.
  const latest = setup?.latestPlanId ?? null;
  useEffect(() => {
    current.current = latest; setView(null); setConfirm(null); setError(null); setOffline(false);
    if (latest) load(latest);
    return () => { current.current = null; };
  }, [latest, load]);

  const running = view?.plan.status === 'researching';
  useEffect(() => {
    if (!running || !planId) return undefined;
    const t = setInterval(() => { load(planId); }, POLL_MS);
    return () => clearInterval(t);
  }, [running, planId, load]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    const on = shownDate.current;
    try { await fn(); } catch (e) { if (shownDate.current === on) setError(planFailure(e).message); } finally { setBusy(false); }
  };
  const start = () => act(async () => {
    const clean = Object.fromEntries(Object.entries(inputs).filter(([, v]) => v !== '' && v !== undefined)) as unknown as PlanInputs;
    const r = await startPlan(airDate, clean);
    if (shownDate.current !== airDate) return; // the date changed: this run belongs to the other date, where it will be found
    current.current = r.planId;
    await load(r.planId);
    const fresh = await getPlanSetup(airDate);
    if (shownDate.current === airDate) onSetup(fresh);
  });
  const again = () => act(async () => { if (planId) { await regeneratePlan(planId); if (current.current === planId) await load(planId); } });
  const choose = (topicId: string, override: boolean) => act(async () => {
    if (!planId) return;
    try { await chooseTopic(planId, topicId, override); setConfirm(null); await load(planId); } catch (e) {
      const f = planFailure(e);
      if (current.current !== planId) return;
      if (f.code === 'needs_override') setConfirm({ id: topicId, text: f.message }); else throw e;
    }
  });

  const batch = setup?.batch;
  const weeks = setup?.map.weeks ?? [];
  const stageAt = view ? STAGE_ORDER.indexOf(view.plan.stage) : -1;
  const canRegenerate = Boolean(view) && !running && view?.plan.status !== 'chosen';
  return (
    <div data-testid="plan-tab">
      <div className="clp-two">
        <section className="cls-card" data-testid="plan-inputs">
          <h2 className="cls-card-title">Your inputs</h2>
          <div className="cls-field">
            <label className="cls-label" htmlFor="plan-date">Air date</label>
            <input id="plan-date" className="cls-input" type="date" min={centralToday()} value={airDate} onChange={(e) => { if (e.target.value) onAirDate(e.target.value); }} data-testid="input-airDate" />
            <p className="cls-hint" data-testid="plan-batch">{setupError ? setupError : !batch ? 'Looking up the batch.' : batch.ok ? `Goes into ${batch.cohortName}` : batch.error}</p>
          </div>
          <div className="cls-field">
            <label className="cls-label" htmlFor="plan-week">Curriculum week</label>
            <select id="plan-week" className="cls-select" value={String(inputs.week)} onChange={(e) => setInputs({ ...inputs, week: e.target.value === 'auto' ? 'auto' : Number(e.target.value) })} data-testid="input-week">
              <option value="auto">Auto, the score picks</option>
              {weeks.map((w) => <option key={w.week} value={w.week}>{w.week}. {w.theme}{w.coveredInLast4 ? ' (covered)' : ''}</option>)}
            </select>
          </div>
          {TEXTS.map(([k, label, hint]) => (
            <div className="cls-field" key={k}>
              <label className="cls-label" htmlFor={`plan-${k}`}>{label}</label>
              <textarea id={`plan-${k}`} className="cls-input" rows={k === 'proof' || k === 'notes' ? 3 : 1} maxLength={k === 'audience' ? 200 : k === 'proof' || k === 'notes' ? 1000 : 500}
                value={String(inputs[k] ?? '')} onChange={(e) => setInputs({ ...inputs, [k]: e.target.value })} data-testid={`input-${k}`} aria-describedby={hint ? `plan-${k}-hint` : undefined} />
              {hint && <p className="cls-hint" id={`plan-${k}-hint`}>{hint}</p>}
            </div>
          ))}
          <button type="button" className="cls-btn cls-btn-primary" disabled={busy || running || !batch?.ok} onClick={start} data-testid="find-topics">
            {running ? 'Working on it' : 'Find 5 topics'}
          </button>
          {error && <p className="cls-note cls-note-error" role="alert" data-testid="plan-error">{error}</p>}
        </section>
        <DemandBars demand={view?.demand ?? setup?.demand ?? []} weeks={weeks} />
      </div>

      {offline && <p className="cls-note cls-note-warn" role="alert" data-testid="plan-offline">The plan could not be loaded.{running ? ' Trying again every few seconds.' : ' Reload the page to try again.'}</p>}
      {running && view && (
        <section className="cls-card" role="status" aria-live="polite" data-testid="plan-progress">
          <h2 className="cls-card-title">{STAGE_LABEL[view.plan.stage]}</h2>
          <ol className="clp-stages">
            {STAGE_ORDER.map((s, i) => <li key={s} className={i < stageAt ? 'is-done' : i === stageAt ? 'is-now' : ''}>{STAGE_LABEL[s]}{i < stageAt ? ' (done)' : i === stageAt ? ' (now)' : ''}</li>)}
          </ol>
          <p className="cls-hint">This takes several minutes. You can close this page and come back.</p>
        </section>
      )}
      {view?.plan.status === 'failed' && <p className="cls-note cls-note-error" role="alert" data-testid="plan-failed">{view.plan.error || 'The run stopped before it finished. Run it again.'}</p>}
      {view?.plan.note && <p className="cls-note cls-note-warn" data-testid="plan-note">{view.plan.note}</p>}

      {view && <SignalList signals={view.signals} />}

      {view && view.topics.length > 0 && (
        <section aria-label="Topics" data-testid="topics">
          <div className="clp-topics-head">
            <h2 className="clp-h2">Five topics, best first</h2>
            <button type="button" className="cls-btn cls-btn-ghost" disabled={busy || !canRegenerate} onClick={again} data-testid="regenerate">Find different topics</button>
          </div>
          {view.plan.status === 'chosen' && <p className="cls-note" data-testid="plan-chosen">A topic is chosen. Building the session from it comes in the next release; until then, schedule the class in the Accelerator.</p>}
          {view.topics.map((t) => (
            <TopicCard key={t.id} topic={t} signals={view.signals} chosen={view.plan.chosen_topic_id === t.id} canChoose={!running} busy={busy}
              confirming={confirm?.id === t.id ? confirm.text : null} onChoose={(o) => choose(t.id, o)} onCancel={() => setConfirm(null)} />
          ))}
        </section>
      )}
      {view && view.topics.length === 0 && view.plan.status === 'failed' && (
        <button type="button" className="cls-btn cls-btn-ghost" disabled={busy} onClick={again} data-testid="regenerate">Run it again</button>
      )}
    </div>
  );
}
