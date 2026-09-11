import React, { useState } from 'react';
import {
  StudentProject, ProjectTask, ProjectActivity,
  projectProgress, reqVerified, nextTask, skipTask, isTaskBlocked,
} from './projectsStore';
import NextSessionStrip from './NextSessionStrip';
import { CorySpark } from '../../../components/portal/CoryMark';
import { useIsExplorer } from '../useIsExplorer';
import ProjectsNextStepHero from './ProjectsNextStepHero';
import CaseStudyReadinessCard from './CaseStudyReadinessCard';
import TimelineCard, { type TimelineFeedCard } from '../../../components/timeline/TimelineCard';
import TimelineFeed from '../../../components/timeline/TimelineFeed';
// Every rule for the Classroom card is scoped `.tl-de …` in timeline.css, and
// /portal/projects is its own route chunk: import it here so a cold load of
// the Projects tab styles the cards (ProjectsNextStepHero does the same).
import '../../../components/timeline/timeline.css';

// The portal-native project workspace, in the Today-page shape: a full-width
// build header, then a two-column grid — left is the FB timeline (hero "your
// next action" -> next session -> task feed); right is a clickable project
// OUTLINE (the releases/lists) that filters the middle timeline, plus a build
// dashboard. Click a task card to open its workspace.

const DUE_LABEL: Record<string, string> = { overdue: 'Overdue', today: 'Due today', up: 'Upcoming', done: 'Completed' };

// ── one task as the SAME card the Classroom renders ──
// Ali, 2026-09-11: "Projects should look more like the Classroom section, and
// the projects should have points instead of the open button." So a story is
// rendered through TimelineCard — the one universal card — not a lookalike:
// the list-name chip, the "+N pts" badge, the Not started / Completed pip, the
// description, and a cherry "Build · +N pts" CTA that takes them to the
// workspace. The points are paid when the platform verifies the story from
// the repo, never by a click, and the button says exactly that on hover.
//
// A BLOCKED task (release gate) becomes a LOCKED card: visible, not clickable,
// with "Complete STORY-XXX to unlock" in the card's own lock note — the same
// treatment a week-gated curriculum card gets.
function taskToFeedCard(project: StudentProject, task: ProjectTask, listName: string): TimelineFeedCard {
  const done = task.state === 'done';
  const { blocked, waitingOn } = isTaskBlocked(project, task);
  return {
    id: task.id,
    type: 'project_task',
    student_label: listName,
    render_band: 'task',
    title: task.title,
    subtitle: task.release ?? null,
    description: task.what ?? null,
    week: null,
    bucket: 'build',
    order: 0,
    difficulty: '',
    estimated_time: null,
    // Builder points, the ledger the work lands in; the card shows the total.
    // Only a real, positive price becomes a badge — nothing here is invented.
    points: task.points && task.points > 0 ? { builder: task.points } : {},
    competencies: [],
    status: done ? 'completed' : blocked ? 'locked' : 'available',
    lock_reason: blocked ? waitingOn.join(', ') : null,
    quiz_score: null,
    completed_at: task.verifiedAt ?? null,
    // The due state, where a curriculum card shows its difficulty word.
    meta: done ? null : DUE_LABEL[task.due],
    project_id: project.id,
    project_task_id: task.id,
  };
}

// Skip stays, and stays ungated: skipping is an honest "not doing this now",
// and a skipped prerequisite still does not clear a downstream gate. It sits
// under the card rather than on it — the card's one action is the build.
const SkipRow: React.FC<{ project: StudentProject; task: ProjectTask }> = ({ project, task }) => {
  const demo = useIsExplorer();   // Explorer = demo mode: doing actions are locked
  return (
    <div className="pw-acts" style={{ margin: '-8px 0 16px', justifyContent: 'flex-end' }}>
      <button
        type="button"
        className="pw-act skip"
        onClick={() => skipTask(project.id, task.id)}
        disabled={demo}
        title={demo ? 'Demo — enroll to build for real' : 'Set this story aside for now'}
      >
        Skip for now
      </button>
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
      <div><div className="pja-title">{a.title}</div><div className="pja-when">{a.who === 'Cory' && <span style={{ display: 'inline-flex', verticalAlign: '-1px', marginRight: 4 }}><CorySpark size={11} /></span>}{a.who} · {a.time}</div></div>
    </div>
    <div className="pja-body">{a.body}</div>
  </div>
);

const ProjectInterior: React.FC<{
  project: StudentProject;
  onBack: () => void;
  /** True while the page header is showing the condensed next-step card. */
  condensed?: boolean;
  /**
   * Open a task. The page navigates to the project WORKSPACE — the full page
   * with the mentor on the right, the build-side twin of the classroom runtime.
   * This component used to own a slide-over drawer instead, which is not the
   * same thing and did not feel like the same product.
   */
  onOpenTask: (taskId: string) => void;
}> = ({ project, onBack, condensed, onOpenTask }) => {
  const demo = useIsExplorer();   // Explorer = demo mode
  const [sel, setSel] = useState<string>('all'); // 'all' or a list id (drives the outline filter)
  const prog = projectProgress(project);
  const rv = reqVerified(project);
  const nx = nextTask(project);

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
  // The card hands itself up; the page owns routing (TimelineCard is Router-free
  // by design). A locked card never calls this — the release gate holds there.
  const openCard = (card: TimelineFeedCard) => { if (card.project_task_id) onOpenTask(card.project_task_id); };

  return (
    <>
      <button className="pj-back" onClick={onBack}><svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> All builds</button>
      {demo && (
        <div style={{ border: '1px solid #F0D9AE', background: '#FBF1E1', color: '#7A5310', borderRadius: 10, padding: '11px 15px', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flex: 'none', color: '#C97C0A' }}><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" /></svg>
          <span style={{ fontSize: 13.5 }}><b>Demo build.</b> Look around freely — running prompts, marking tasks done, and skipping are locked until you enroll.</span>
        </div>
      )}

      {/* Your next action, ABOVE the build header. The first thing a student
          should see on a build is the thing to do next — the project's name and
          cover are context for it, not the headline. Wrapped in
          `te-condense-body` so it rides up into the page header on scroll, the
          same way the overview's hero does; without that the two screens
          scrolled differently for no reason a student could see. */}
      <div className={`te-condense-body${condensed ? ' is-condensed' : ''}`}>
        <ProjectsNextStepHero
          variant="full"
          primary={project}
          primaryNext={nx}
          demo={demo}
          onOpenBuild={() => nx && onOpenTask(nx.task.id)}
          onCopyPrompt={() => { if (navigator.clipboard && nx?.task.prompt) navigator.clipboard.writeText(nx.task.prompt); }}
          onStartBuild={onBack}
        />
      </div>

      {/* A build header of a few lines, not a page. The name, descriptor, stage
          and preview URL moved to the top of the Project outline card in the
          right column — that is where you look for "which build is this", and
          the full-bleed cover was pushing the actual work below the fold. */}
      <div className="pj-headbar">
        <span className="pj-av sm" style={{ background: project.accent }}>
          <svg viewBox="0 0 24 24" fill="none"><path d={project.icon} stroke="#fff" strokeWidth="2" strokeLinejoin="round" /></svg>
        </span>
        <div className="pj-hb-t">
          <div className="pj-hb-name">{project.name}</div>
          <div className="pj-hb-sub">{project.stage}{project.sample ? ' · training example' : ''}</div>
        </div>
        <div className="pj-hb-prog">
          <span className="meter"><i style={{ width: `${prog.pct}%`, background: '#5BA63C' }} /></span>
          <span className="pct">{prog.pct}%</span>
        </div>
      </div>

      {/* Today-shaped two-column body */}
      <div className="te-grid">
        <div>
          <NextSessionStrip />

          {/* the FB timeline, filtered by the outline selection — the Classroom's
              cards, wrapped in `.tl-de` because every rule for them is scoped
              under it (see ProjectsNextStepHero for the same reason). */}
          <div className="te-sec-title">{selName ? `${selName} · tasks` : 'This build · next task due first'}</div>
          <div className="tl-de">
            {openTasks.map(({ t, list }) => {
              const card = taskToFeedCard(project, t, list);
              return (
                <React.Fragment key={t.id}>
                  <TimelineCard card={card} onOpen={openCard} onWorkspace={openCard} />
                  {card.status === 'available' && <SkipRow project={project} task={t} />}
                </React.Fragment>
              );
            })}
            {sel === 'all' && project.activity.map((a) => <ActivityCard key={a.id} a={a} />)}
            {/* Finished stories stay in the feed, compact — the Classroom's own
                treatment of completed work — with their "Completed · +N pts". */}
            <TimelineFeed cards={doneTasks.map(({ t, list }) => taskToFeedCard(project, t, list))} compactCompleted onOpen={openCard} onWorkspace={openCard} />
            {!openTasks.length && !doneTasks.length && <div className="fc-empty">No tasks in this section.</div>}
          </div>
        </div>

        {/* right sidebar: clickable outline + build dashboard */}
        <aside className="te-side">
          <div className="te-card te-scard">
            <h3><svg viewBox="0 0 24 24" fill="none"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> Project outline</h3>

            {/* Who this build is — moved off the page header, where it was a
                full-bleed banner, to the top of the card you already look at to
                navigate the build. */}
            <div className="pj-ol-ident">
              <div className="nm">{project.name}</div>
              <div className="ds">{project.descriptor}</div>
              <div className="mt">
                <span className="chip sm">{project.stage}</span>
                {project.sample && <span className="chip sm warn">Training example</span>}
                {/* Inside the build too, not just on the card that got you
                    here. A student reading their task list is exactly who needs
                    to know whether these are their generated stories or the
                    browser's ten-task template. */}
                {!project.sample && project.origin === 'pipeline' && (
                  <span className="chip sm" title="Generated from your answers, scheduled against your cohort, every requirement traced to a story.">Your tailored plan</span>
                )}
                {!project.sample && project.origin === 'local' && (
                  <span className="chip sm warn" title="A general starter template built in your browser — no schedule, no Command Center, generic prompts.">Starter template</span>
                )}
              </div>
              <a className="prev" href={`https://${project.slug}.preview.colaberry.ai`} target="_blank" rel="noreferrer">
                {project.slug}.preview.colaberry.ai
              </a>
            </div>
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

          {/* Where this build sits between an idea and a case study. Only for
              a real pipeline build: the browser template has no truth to sit
              on the ladder, and the training example is nobody's project. */}
          {!project.sample && project.origin === 'pipeline' && (
            <CaseStudyReadinessCard projectId={project.pipelineProjectId || project.id} />
          )}
        </aside>
      </div>
    </>
  );
};

export default ProjectInterior;
