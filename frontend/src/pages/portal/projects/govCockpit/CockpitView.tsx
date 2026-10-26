import React, { useMemo, useState } from 'react';
import type { StudentGovProjectView } from '../../../../services/govProjectPortalApi';
import { parseDeadline, countdownTo, formatCountdown, dossierDeadlineIso } from '../../../admin/govDeadline';
import { buildTasks, summarize, type CockpitTask } from './cockpitModel';
import TaskBoard, { type BoardFilter } from './TaskBoard';
import CommitFeed from './CommitFeed';
import HowItWorks from './HowItWorks';
import CopilotRail from './CopilotRail';
import TaskDrawer from './TaskDrawer';
import './govCockpit.css';

/**
 * CockpitView — the Build Cockpit shell: a project bar (agency + close countdown), the progress/stat summary, the
 * three tabs (task board / commit sync / how it works) and the copilot rail, with a task drawer over the top. All
 * data comes from the one student-safe projection; this component only arranges it and owns the view-local UI state
 * (tab, filter, which task is open). Every write goes through the drawer and calls onReload to refresh the view.
 */
type Tab = 'board' | 'commits' | 'how';

export default function CockpitView(
  { view, projectId, onReload }: { view: StudentGovProjectView; projectId: string; onReload: () => void },
): React.ReactElement {
  const [tab, setTab] = useState<Tab>('board');
  const [filter, setFilter] = useState<BoardFilter>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const tasks = useMemo(() => buildTasks(view), [view]);
  const summary = useMemo(() => summarize(tasks), [tasks]);
  const feed = view.commitFeed ?? [];
  const open: CockpitTask | null = openKey ? tasks.find((t) => t.track + ':' + t.key === openKey) ?? null : null;

  // Close countdown — reuse the admin Qualify workspace's govDeadline helpers over the detected key dates (public).
  const closeIso = dossierDeadlineIso(view.keyDates ?? []);
  const parsed = parseDeadline(closeIso);
  const countdown = parsed ? formatCountdown(countdownTo(parsed.ms, Date.now()), parsed.hasTime) : null;

  const greeting = summary.reviewCount > 0
    ? `${summary.reviewCount} commit${summary.reviewCount === 1 ? '' : 's'} matched ${summary.reviewCount === 1 ? 'a task' : 'tasks'} and ${summary.reviewCount === 1 ? 'is' : 'are'} waiting for your review. Ask me what to do next, or open any task.`
    : 'Ask me what to do next, review the matched commits, or open any task.';

  const seg: Array<[keyof typeof summary.counts, string]> = [['done', 'ok'], ['matched', 'warn'], ['build', 'ai'], ['todo', 'line']];

  return (
    <div className="gck">
      <header className="gck-bar">
        <div>
          <span className="gck-eyebrow">Gov project &middot; Solution build + proposal</span>
          <h1>{view.name}</h1>
        </div>
        <div className="gck-meta">
          {view.agency && <span className="gck-chip">Agency <b>{view.agency}</b></span>}
          {closeIso && <span className="gck-chip">Closes <b className="gck-num">{closeIso}</b>{countdown ? <> &middot; <b className="gck-num">{countdown}</b></> : null}</span>}
          <span className="gck-chip"><span className="gck-dot" aria-hidden="true" />GitHub sync <b>live</b></span>
        </div>
      </header>

      <section className="gck-summary" aria-label="Progress summary">
        <div className="gck-panel">
          <div className="gck-prog-label"><span className="gck-eyebrow">Requirements verified</span><span className="gck-big gck-num">{summary.pct}%</span></div>
          <div className="gck-track">
            {seg.map(([k, c]) => summary.counts[k] > 0 && (
              <span key={k} style={{ width: `${(summary.counts[k] / summary.total) * 100}%`, background: `var(--${c})` }} title={`${summary.counts[k]}`} />
            ))}
          </div>
          <div className="gck-legend">
            <span><i style={{ background: 'var(--ok)' }} />Verified</span>
            <span><i style={{ background: 'var(--warn)' }} />Commit matched</span>
            <span><i style={{ background: 'var(--ai)' }} />In build</span>
            <span><i style={{ background: 'var(--line)' }} />Not started</span>
          </div>
        </div>
        <div className="gck-panel gck-stat"><div className="k">AI build tasks</div><div className="v gck-num">{summary.aiCount}</div><div className="s">close from commits in the build repo</div></div>
        <div className="gck-panel gck-stat"><div className="k">Your tasks</div><div className="v gck-num">{summary.humanCount}</div><div className="s">reviews, proposal, demo</div></div>
        <div className="gck-panel gck-stat"><div className="k">Waiting on you</div><div className="v gck-num" style={{ color: summary.reviewCount ? 'var(--warn)' : undefined }}>{summary.reviewCount}</div><div className="s">commit matches to review</div></div>
      </section>

      <nav className="gck-tabs" role="tablist">
        <button className="gck-tab" role="tab" aria-selected={tab === 'board'} onClick={() => setTab('board')}>Task board</button>
        <button className="gck-tab" role="tab" aria-selected={tab === 'commits'} onClick={() => setTab('commits')}>Commit sync<span className="n">{feed.length}</span></button>
        <button className="gck-tab" role="tab" aria-selected={tab === 'how'} onClick={() => setTab('how')}>How it works</button>
      </nav>

      <div className="gck-main">
        <div style={{ minWidth: 0 }}>
          {tab === 'board' && (tasks.length === 0
            ? <p className="gck-empty">No requirement-cited tasks yet. Build work is tracked here once requirements are established and assigned.</p>
            : <TaskBoard tasks={tasks} filter={filter} onFilter={setFilter} onOpen={(t) => setOpenKey(t.track + ':' + t.key)} />)}
          {tab === 'commits' && <CommitFeed feed={feed} />}
          {tab === 'how' && <HowItWorks />}
        </div>
        <CopilotRail projectId={projectId} greeting={greeting} />
      </div>

      {open && <TaskDrawer task={open} view={view} projectId={projectId} onReload={onReload} onClose={() => setOpenKey(null)} />}
    </div>
  );
}
