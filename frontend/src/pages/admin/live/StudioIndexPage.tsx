import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listStudioSessions, type StudioSessionRow } from '../../../services/studioSetupApi';
import { getPlanSetup, planFailure, type PlanSetup } from '../../../services/weeklyLivePlanApi';
import './studioSetup.css';
import './plan/plan.css';
import PlanTab from './plan/PlanTab';
import { CurriculumTab, RubricTab } from './plan/PlanParts';
import { centralToday, nextMonday } from './plan/planModel';
import StudioRail from './StudioRail';
import StudioTour from './StudioTour';
import StudioRecapPanel from './StudioRecapPanel';
import { indexTourSteps } from './studioTourSteps';

/**
 * The Studio setup index (D4, P4-01) — pick the class to configure.
 *
 * ## Why this page exists at all
 *
 * An admin nav entry is a fixed string. It cannot carry a session id. So "reach Studio setup from
 * the admin menu" needs somewhere to land that is not already about one class, and this is it.
 * The plan audit caught that: without this page the first success criterion was unwitnessable,
 * because there was no route the menu could point at.
 *
 * Like the detail screen, this renders OUTSIDE AdminLayout and opens in its own browser tab, so
 * it holds no in-app state and reads everything it shows from the server.
 *
 * ## The tabs (WL3.5)
 *
 * Planning is for full administrators. The tabs appear only once the server has answered the plan
 * lookup with something other than a refusal, so any other staff member sees the class list alone.
 */
const TABS = [['classes', 'Classes'], ['plan', 'Plan next Weekly Live'], ['map', 'Curriculum map'], ['rubric', 'Scoring rubric']] as const;
type Tab = (typeof TABS)[number][0];

/** How far each class has come, in words. Only what this list really knows. */
function Pipeline({ row }: { row: StudioSessionRow }): React.ReactElement {
  const aired = Boolean(row.session_date && row.session_date < centralToday());
  return (
    <span className="clp-pipe" data-testid={`pipe-${row.id}`}>
      <span className="clp-chip">Session made</span>
      <span className="clp-chip">{row.editorial_state ? 'Broadcast set up' : 'Broadcast not set up'}</span>
      {aired && <span className="clp-chip">Aired</span>}
    </span>
  );
}

/** A class with no broadcast is the common case here, and it reads as a plain dash, not a gap. */
function BroadcastState({ row }: { row: StudioSessionRow }): React.ReactElement {
  if (!row.editorial_state) {
    return <span className="cls-row-when">Not set up</span>;
  }
  return (
    <span className="cls-row-when">
      {row.editorial_state}
      {row.access_mode ? ` · ${row.access_mode}` : ''}
    </span>
  );
}

export default function StudioIndexPage(): React.ReactElement {
  const [rows, setRows] = useState<StudioSessionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [recapFor, setRecapFor] = useState<string | null>(null);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('classes');
  const [airDate, setAirDate] = useState(() => nextMonday());
  const [setup, setSetup] = useState<PlanSetup | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [mayPlan, setMayPlan] = useState(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    setSetup(null); setSetupError(null);
    (async () => {
      try {
        const s = await getPlanSetup(airDate);
        if (!cancelled) { setSetup(s); setMayPlan(true); }
      } catch (e) {
        if (cancelled) return;
        const f = planFailure(e);
        if (f.status === 401 || f.status === 403) { setMayPlan(false); setTab('classes'); return; }
        setMayPlan(true); setSetupError('The planner could not be loaded. Reload the page to try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [airDate]);

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex(([k]) => k === tab);
    const to = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : -1;
    if (to < 0) return;
    e.preventDefault(); setTab(TABS[to][0]); tabRefs.current[TABS[to][0]]?.focus();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listStudioSessions();
        if (!cancelled) setRows(list);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="cls-root">
      <StudioRail onTour={() => { setTab('classes'); setTourOpen(true); }} />
      <StudioTour
        open={tourOpen}
        steps={indexTourSteps(() => (rows && rows.length ? `/admin/live/studio/${rows[0].id}` : null))}
        onClose={() => setTourOpen(false)}
        onNavigate={(p) => navigate(p)}
      />
      <div className="cls-shell">
        <header className="cls-head">
          <h1 className="cls-title">Studio setup</h1>
          <p className="cls-sub">
            {mayPlan ? 'Every Weekly Live starts here. Plan the next topic, or pick a class to set up. ' : 'Pick the class to set up. '}
            The class list covers the last month and the next four months.
          </p>
        </header>

        {mayPlan && (
          <div className="clp-tabs" role="tablist" aria-label="Studio setup" onKeyDown={onTabKey} data-testid="studio-tabs">
            {TABS.map(([k, label]) => (
              <button key={k} type="button" role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`} tabIndex={tab === k ? 0 : -1} className="clp-tab"
                ref={(el) => { tabRefs.current[k] = el; }} onClick={() => setTab(k)} data-testid={`tab-${k}`}>{label}</button>
            ))}
          </div>
        )}
        {/* Every tab stays mounted, so inputs and a running plan survive switching. */}
        {mayPlan && (
          <>
            <div role="tabpanel" id="panel-plan" aria-labelledby="tab-plan" hidden={tab !== 'plan'}>
              <PlanTab airDate={airDate} onAirDate={setAirDate} setup={setup} setupError={setupError} onSetup={setSetup} />
            </div>
            <div role="tabpanel" id="panel-map" aria-labelledby="tab-map" hidden={tab !== 'map'}>
              {setup ? <CurriculumTab weeks={setup.map.weeks} /> : <p className="cls-empty">{setupError || 'Loading the curriculum map.'}</p>}
            </div>
            <div role="tabpanel" id="panel-rubric" aria-labelledby="tab-rubric" hidden={tab !== 'rubric'}><RubricTab /></div>
          </>
        )}

        <div {...(mayPlan ? { role: 'tabpanel', id: 'panel-classes', 'aria-labelledby': 'tab-classes' } : {})} hidden={tab !== 'classes'} data-testid="classes-panel">
        <section className="cls-card" data-tour="class-list">
          {failed && (
            <p className="cls-note cls-note-error" role="alert">
              The class list could not be loaded. Reload the page to try again.
            </p>
          )}

          {!failed && rows === null && <p className="cls-empty">Loading classes.</p>}

          {!failed && rows !== null && rows.length === 0 && (
            <p className="cls-empty">
              There are no classes scheduled in this window. Create a session first, then come
              back to set up its broadcast.
            </p>
          )}

          {rows?.map((row) => (
            <div className="cls-row" key={row.id}>
              <div className="cls-row-main">
                <strong>{row.title}</strong>
                <span className="cls-row-when">
                  {row.session_date ?? 'No date'}
                  {row.start_time ? ` at ${row.start_time}` : ''}
                  {row.cohort_name ? ` · ${row.cohort_name}` : ''}
                </span>
              </div>
              {mayPlan ? <Pipeline row={row} /> : <BroadcastState row={row} />}
              <button type="button" className="cls-btn cls-btn-ghost" onClick={() => setRecapFor(row.id)} data-testid={`recap-open-${row.id}`}>
                Recap
              </button>
              <Link className="cls-btn cls-btn-ghost" to={`/admin/live/studio/${row.id}`}>
                Set up
              </Link>
            </div>
          ))}
        </section>
        </div>
      </div>
      {recapFor && <StudioRecapPanel sessionId={recapFor} onClose={() => setRecapFor(null)} />}
    </div>
  );
}
