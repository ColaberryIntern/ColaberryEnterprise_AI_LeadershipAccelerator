import React, { useCallback, useState } from 'react';
import {
  StudentProject, ProjectTask, ProjectActivity,
  projectProgress, reqVerified, nextTask, markTaskDone, skipTask, isTaskBlocked,
} from './projectsStore';
import NextSessionStrip from './NextSessionStrip';
import ProjectWorkspaceDrawer from './ProjectWorkspaceDrawer';
import { useIsExplorer } from '../useIsExplorer';
import { buildProjectTaskPrompt } from './projectWorkspacePrompt';
import { loadDeliveryMode } from '../../../services/deliveryModes';

// The portal-native project workspace, in the Today-page shape: a full-width
// build header, then a two-column grid — left is the FB timeline (hero "your
// next action" -> next session -> task feed); right is a clickable project
// OUTLINE (the releases/lists) that filters the middle timeline, plus a build
// dashboard. Click a task card to expand its story, prompt, acceptance, owner.

const DUE_LABEL: Record<string, string> = { overdue: 'Overdue', today: 'Due today', up: 'Upcoming', done: 'Completed' };
const CAL = <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;

function DueChip({ due }: { due: ProjectTask['due'] }) {
  return <span className={`pj-due ${due}`}>{CAL}{DUE_LABEL[due]}</span>;
}
function urgColor(t: ProjectTask): string {
  if (t.state === 'done') return '#8C8C8C';
  if (t.due === 'overdue') return '#C20E1E';
  if (t.due === 'today') return '#E8920C';
  return '#367895';
}

// Per-task context notes live under the same localStorage key the workspace drawer
// writes, so a Copy Prompt from a card/hero includes whatever the student typed in
// the drawer for that task. Kept in sync with ProjectWorkspaceDrawer's prefix.
const NOTES_KEY_PREFIX = 'te_task_notes_v1:';
function loadTaskNotes(projectId: string, taskId: string): string {
  try {
    return localStorage.getItem(`${NOTES_KEY_PREFIX}${projectId}:${taskId}`) || '';
  } catch {
    return '';
  }
}
function listNameFor(project: StudentProject, task: ProjectTask): string {
  for (const l of project.lists) {
    if (l.tasks.some((t) => t.id === task.id)) return l.name;
  }
  return 'This build';
}

// Small inline icons for the shared action buttons.
const IC_COPY = <svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
const IC_OPEN = <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
const IC_DONE = <svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>;
const IC_LOCK = <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;

// ── ONE reusable task-action button group — the SAME 4 buttons, order and colors,
// on the hero AND every task card. Copy Prompt · Open Workspace · Mark Done · Skip.
// Colors are defined once in projects.css (.pw-act.copy/.open/.done/.skip) and are
// never recolored per location.
const TaskActions: React.FC<{
  project: StudentProject;
  task: ProjectTask;
  onOpen: (taskId: string) => void;
}> = ({ project, task, onOpen }) => {
  const [copied, setCopied] = useState(false);
  const demo = useIsExplorer();   // Explorer = demo mode: doing actions are locked
  const copyPrompt = useCallback(() => {
    // Reuse the SAME prompt builder + persisted delivery mode the drawer uses.
    const modeId = loadDeliveryMode();
    const notes = loadTaskNotes(project.id, task.id);
    const prompt = buildProjectTaskPrompt(project, task, listNameFor(project, task), modeId, notes);
    if (navigator.clipboard) navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [project, task]);
  const lock = demo ? 'Demo — enroll to build for real' : undefined;

  return (
    <div className="pw-acts">
      <button type="button" className={`pw-act copy${copied ? ' ok' : ''}`} onClick={copyPrompt} disabled={demo} title={lock}>
        {IC_COPY} {copied ? 'Copied' : 'Copy Prompt'}
      </button>
      <button type="button" className="pw-act open" onClick={() => onOpen(task.id)}>
        {IC_OPEN} Open Workspace
      </button>
      <button type="button" className="pw-act done" onClick={() => markTaskDone(project.id, task.id)} disabled={demo} title={lock}>
        {IC_DONE} Mark Done
      </button>
      <button type="button" className="pw-act skip" onClick={() => skipTask(project.id, task.id)} disabled={demo} title={lock}>
        Skip
      </button>
    </div>
  );
};
// ── one task as an FB-style feed card ──
// A NON-blocked task: click to open the workspace drawer + the shared 4 actions.
// A BLOCKED task: rendered VISIBLE but LOCKED — a lock icon + "Blocked · waiting on
// STORY-XXX" note, not clickable (onOpen is a no-op), and it shows a single disabled
// "Locked" pill instead of the action buttons. The student can see it, not act on it.
const TaskCard: React.FC<{
  project: StudentProject; task: ProjectTask; listName: string; onOpen: (taskId: string) => void;
}> = ({ project, task, listName, onOpen }) => {
  const req = task.req ? project.reqs.find((r) => r.id === task.req) : null;
  const done = task.state === 'done';
  const { blocked, waitingOn } = isTaskBlocked(project, task);
  const color = blocked ? '#9A9A9A' : urgColor(task);
  const openIfAllowed = () => { if (!blocked) onOpen(task.id); }; // blocked → no-op

  return (
    <div className={`pjt-card${done ? ' done' : ''}${blocked ? ' blocked' : ''}`}>
      <div className="pjt-head" onClick={openIfAllowed}>
        <span className="pjt-ic" style={{ background: color }}>
          {blocked
            ? <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="#fff" strokeWidth="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
            : <svg viewBox="0 0 24 24" fill="none"><path d="M3 7l9-4 9 4-9 4-9-4z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /><path d="M3 12l9 4 9-4" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /></svg>}
        </span>
        <div className="pjt-main">
          <div className="pjt-src">
            <span className="chip" style={{ padding: '2px 9px', background: 'rgba(54,120,149,.12)', color: '#2E6A86' }}><span className="sw" style={{ background: '#367895' }} />{listName}</span>
            <DueChip due={task.due} />
            {task.owner && <span className="pjt-owner">{task.owner}</span>}
            {req && <span className={`pj-st ${req.state}`}>{task.req} · {req.state}</span>}
          </div>
          <div className="pjt-title">{task.title}</div>
          {task.what && <div className="pjt-sub">{task.what}</div>}
          {blocked && (
            <div style={{ marginTop: 8 }}>
              <span className="pjt-lock">{IC_LOCK} Blocked · waiting on {waitingOn.join(', ')}</span>
            </div>
          )}
        </div>
        {!blocked && <span className="pjt-chev"><svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>}
      </div>

      <div className="pjt-foot">
        {done ? (
          <span className="pjt-donetag"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg> Completed</span>
        ) : blocked ? (
          <span className="pjt-lockpill">{IC_LOCK} Locked</span>
        ) : (
          <TaskActions project={project} task={task} onOpen={onOpen} />
        )}
      </div>
    </div>
  );
};

const ACT_IC: Record<ProjectActivity['kind'], React.ReactNode> = {
  commit: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 4v4M12 16v4" stroke="#fff" strokeWidth="2" strokeLinecap="round" />,
  req: <path d="M5 12l4 4L19 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />,
  done: <path d="M5 12l4 4L19 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />,
  note: <path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />,
};
const ACT_COLOR: Record<ProjectActivity['kind'], string> = { commit: '#367895', req: '#5BA63C', done: '#5BA63C', note: '#E8920C' };

const ActivityCard: React.FC<{ a: ProjectActivity }> = ({ a }) => (
  <div className="pja-card">
    <div className="pja-head">
      <span className="pja-ic" style={{ background: ACT_COLOR[a.kind] }}><svg viewBox="0 0 24 24" fill="none">{ACT_IC[a.kind]}</svg></span>
      <div><div className="pja-title">{a.title}</div><div className="pja-when">{a.who} · {a.time}</div></div>
    </div>
    <div className="pja-body">{a.body}</div>
  </div>
);

const ProjectInterior: React.FC<{ project: StudentProject; onBack: () => void }> = ({ project, onBack }) => {
  const [sel, setSel] = useState<string>('all'); // 'all' or a list id (drives the outline filter)
  const [wsTaskId, setWsTaskId] = useState<string | null>(null); // task open in the workspace drawer
  const prog = projectProgress(project);
  const rv = reqVerified(project);
  const nx = nextTask(project);

  // Resolve the task currently open in the drawer (re-derived so it stays in
  // sync with the store after mark-done / skip mutations). Never resolve a BLOCKED
  // task — the workspace must not open for a locked dependency (guard, alongside
  // the drawer's own).
  const resolved = wsTaskId
    ? project.lists.flatMap((l) => l.tasks).find((t) => t.id === wsTaskId) || null
    : null;
  const wsTask = resolved && !isTaskBlocked(project, resolved).blocked ? resolved : null;

  // stat tiles (whole project, regardless of filter)
  let open = 0, today = 0, overdue = 0, done = 0;
  project.lists.forEach((l) => l.tasks.forEach((t) => {
    if (t.state === 'done') { done++; return; }
    if (t.state === 'skipped') return;
    open++; if (t.due === 'today') today++; if (t.due === 'overdue') overdue++;
  }));

  // the middle timeline, scoped to the selected outline section
  const scoped = sel === 'all' ? project.lists : project.lists.filter((l) => l.id === sel);
  const rank: Record<string, number> = { overdue: 0, today: 1, up: 2, done: 9 };
  const openTasks: { t: ProjectTask; list: string }[] = [];
  const doneTasks: { t: ProjectTask; list: string }[] = [];
  scoped.forEach((l) => l.tasks.forEach((t) => {
    if (t.state === 'done') doneTasks.push({ t, list: l.name });
    else if (t.state === 'todo') openTasks.push({ t, list: l.name });
  }));
  openTasks.sort((a, b) => rank[a.t.due] - rank[b.t.due]);
  const selName = sel === 'all' ? null : project.lists.find((l) => l.id === sel)?.name;

  return (
    <>
      <button className="pj-back" onClick={onBack}><svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> All builds</button>

      {/* full-width build header */}
      <div className="card pj-head">
        <div className="pj-cover" style={{ background: project.cover }}>
          {/* themed watermark — the project's own icon, big + low-opacity, behind
              the title. Auto-derived from `project.icon` (scissors for the salon). */}
          <span className="pj-wm" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><path d={project.icon} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>
          </span>
        </div>
        <div className="pj-hbody">
          <div className="pj-avwrap">
            <span className="pj-av" style={{ background: project.accent }}><svg viewBox="0 0 24 24" fill="none"><path d={project.icon} stroke="#fff" strokeWidth="2" strokeLinejoin="round" /></svg></span>
            <div style={{ minWidth: 0 }}>
              <div className="pj-name">{project.name}</div>
              <div className="pj-desc">{project.descriptor}</div>
            </div>
          </div>
          <div className="pj-metarow">
            <span className="pj-pill"><span className="chip" style={{ margin: 0, padding: '2px 10px', background: 'rgba(54,120,149,.12)', color: '#2E6A86' }}><span className="sw" style={{ background: '#367895' }} />{project.stage}</span></span>
            {project.sample && <span className="pj-pill" style={{ borderColor: '#E8920C', color: '#B5710A' }}>Training example · from Basecamp</span>}
            <span className="pj-pill prev"><svg viewBox="0 0 24 24" fill="none"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>{project.slug}.preview.colaberry.ai</span>
          </div>
          <div className="pj-prog"><div className="meter"><i style={{ width: `${prog.pct}%`, background: '#5BA63C' }} /></div><span className="pct">{prog.pct}%</span></div>
        </div>
      </div>

      {/* Today-shaped two-column body */}
      <div className="te-grid">
        <div>
          {/* hero: your next action */}
          {nx ? (
            <div className="te-hero">
              <div className="eyebrow"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" /></svg> Your next action on this build</div>
              <h2>{nx.task.title}</h2>
              <p>{nx.task.what || 'Pick this up next — it keeps the walking skeleton moving.'}</p>
              <div style={{ marginTop: 4 }}>
                <TaskActions project={project} task={nx.task} onOpen={setWsTaskId} />
              </div>
            </div>
          ) : (
            <div className="te-hero"><div className="eyebrow">This build</div><h2>Every open task is done</h2><p>Nice work — nothing else queued on this build right now.</p></div>
          )}

          <NextSessionStrip />

          {/* the FB timeline, filtered by the outline selection */}
          <div className="te-sec-title">{selName ? `${selName} · tasks` : 'This build · next task due first'}</div>
          {openTasks.map(({ t, list }) => <TaskCard key={t.id} project={project} task={t} listName={list} onOpen={setWsTaskId} />)}
          {sel === 'all' && project.activity.map((a) => <ActivityCard key={a.id} a={a} />)}
          {doneTasks.map(({ t, list }) => <TaskCard key={t.id} project={project} task={t} listName={list} onOpen={setWsTaskId} />)}
          {!openTasks.length && !doneTasks.length && <div className="fc-empty">No tasks in this section.</div>}
        </div>

        {/* right sidebar: clickable outline + build dashboard */}
        <aside className="te-side">
          <div className="te-card te-scard">
            <h3><svg viewBox="0 0 24 24" fill="none"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> Project outline</h3>
            <div className="pj-outline">
              <button className={`pj-olrow${sel === 'all' ? ' active' : ''}`} onClick={() => setSel('all')}>
                <span className="nm">All tasks</span><span className="ct">{open + done}</span>
              </button>
              {project.lists.map((l) => {
                const d = l.tasks.filter((t) => t.state === 'done').length;
                return (
                  <button key={l.id} className={`pj-olrow${sel === l.id ? ' active' : ''}`} onClick={() => setSel(l.id)}>
                    <span className="nm">{l.name}</span><span className="ct">{d}/{l.tasks.length}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="te-card te-scard">
            <h3><svg viewBox="0 0 24 24" fill="none"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> Build at a glance</h3>
            <div className="te-stat"><span className="lab">Tasks open</span><span className="num">{open}</span></div>
            <div className="te-stat"><span className="lab">Due today</span><span className="num" style={{ color: '#B5710A' }}>{today}</span></div>
            <div className="te-stat"><span className="lab">Overdue</span><span className="num" style={{ color: '#E5121D' }}>{overdue}</span></div>
            <div className="te-stat"><span className="lab">Done</span><span className="num" style={{ color: '#468A2E' }}>{done}</span></div>
            <div className="te-stat"><span className="lab">Requirements verified</span><span className="num">{rv.v}/{rv.total}</span></div>
            <div className="te-ribbon" style={{ marginTop: 6 }}><i style={{ width: `${prog.pct}%`, background: '#5BA63C' }} /></div>
          </div>
        </aside>
      </div>

      <ProjectWorkspaceDrawer
        project={project}
        task={wsTask}
        open={wsTask !== null}
        onClose={() => setWsTaskId(null)}
      />
    </>
  );
};

export default ProjectInterior;
