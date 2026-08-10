import React, { useState, useEffect, useCallback } from 'react';
import PortalShell from '../today/PortalShell';
import ProjectWizard from './ProjectWizard';
import { useIsExplorer } from '../useIsExplorer';
import ProjectPreview from './ProjectPreview';
import ProjectInterior from './ProjectInterior';
import NextSessionStrip from './NextSessionStrip';
import { resolveBackendProjectId, startBuild as startServerBuild, pollBuild } from '../../../services/sbpApi';
import ProjectsNextStepHero from './ProjectsNextStepHero';
import FeedCard, { FeedItem } from '../feed/FeedCard';
import {
  useProjectsList, createProjectFromAnswers, projectProgress, reqVerified, nextTask,
  StudentProject, ProjectTask, ProjectList, NewBuildAnswers,
} from './projectsStore';
import { syncProjectsWithBackend } from './projectSync';
import './projects.css';
import '../today/TodayShell.css';

// Projects tab, in the Today-page shape: a hero "your next step" (your build's
// next action, or "create a project" if you have none), the next live session,
// your builds, and a timeline of what's next across builds — with a right-side
// dashboard. Builds are portal-native (lists + tasks, FB vibe), not Basecamp.

type View = { kind: 'overview' } | { kind: 'wizard' } | { kind: 'preview'; id: string } | { kind: 'interior'; id: string };

const PROJ_ICON = (
  <svg viewBox="0 0 24 24" fill="none"><path d="M3 7l9-4 9 4-9 4-9-4z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /><path d="M3 12l9 4 9-4M3 17l9 4 9-4" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /></svg>
);
const DUE_RANK: Record<string, number> = { overdue: 0, today: 1, up: 2, done: 9 };

function BuildCard({ p, onOpen }: { p: StudentProject; onOpen: () => void }) {
  const prog = projectProgress(p);
  const rv = reqVerified(p);
  const creating = p.status === 'creating';
  return (
    <div className="pj-buildcard" role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}>
      <div className="pj-bc-cover" style={{ background: p.cover }}>
        <span className={`pj-bc-stage${creating ? ' creating' : ''}`}>{creating ? 'Creating…' : (prog.pct === 100 ? 'Complete' : p.stage.split(' · ')[0])}</span>
      </div>
      <div className="pj-bc-mid">
        <span className="pj-bc-ic" style={{ background: p.accent }}><svg viewBox="0 0 24 24" fill="none"><path d={p.icon} stroke="#fff" strokeWidth="2" strokeLinejoin="round" /></svg></span>
        <div className="pj-bc-name"><h4>{p.name}</h4><div className="pj-bc-desc">{p.descriptor}</div></div>
      </div>
      <div className="pj-bc-pad">
        <div className="pj-bc-bar"><i style={{ width: `${prog.pct}%`, background: creating ? '#367895' : '#5BA63C' }} /></div>
        <div className="pj-bc-stats">
          <span className="pj-bc-st"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>{prog.done}/{prog.total} tasks done</span>
          <span className="pj-bc-st"><svg viewBox="0 0 24 24" fill="none"><path d="M9 11l3 3L20 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>{rv.v}/{rv.total} verified</span>
          {p.sample && <span className="pj-bc-st">training example</span>}
        </div>
      </div>
    </div>
  );
}

type PipelineState =
  | { state: 'idle' }
  | { state: 'generating'; projectId: string; status?: string }
  | { state: 'ready'; projectId: string }
  | { state: 'gate_failed'; projectId: string; reason: string }
  | { state: 'local'; reason: string };

/**
 * Tells the student which path produced their plan, and why.
 *
 * Deliberately visible. The original defect survived for months precisely
 * because a degraded result looked identical to a good one — a student saw a
 * build and had no way to know it was a generic template rather than a plan
 * derived from what they wrote.
 */
const PipelineBanner: React.FC<{ pipeline: PipelineState }> = ({ pipeline }) => {
  if (pipeline.state === 'idle') return null;

  if (pipeline.state === 'generating') {
    return (
      <div className="card pjw-pane" role="status" aria-live="polite">
        <strong>Designing your system…</strong>
        <p className="lead" style={{ marginBottom: 0 }}>
          We are writing your requirements and breaking them into releases and stories.
          This takes a few minutes — you can keep working and come back.
        </p>
      </div>
    );
  }

  if (pipeline.state === 'ready') {
    return (
      <div className="card pjw-pane" role="status" aria-live="polite">
        <strong>Your plan is ready.</strong>
        <p className="lead" style={{ marginBottom: 0 }}>
          Built from your own answers, with every requirement traced to a story.
        </p>
      </div>
    );
  }

  if (pipeline.state === 'gate_failed') {
    return (
      <div className="card pjw-pane" role="status" aria-live="polite">
        <strong>Your plan has a gap.</strong>
        <p className="lead" style={{ marginBottom: 0 }}>
          {pipeline.reason} We would rather tell you than hand you a plan that
          quietly misses something. Regenerate to try again.
        </p>
      </div>
    );
  }

  return (
    <div className="card pjw-pane" role="status" aria-live="polite">
      <strong>We built you a starter plan.</strong>
      <p className="lead" style={{ marginBottom: 0 }}>
        The full requirements service was unavailable, so this is a general
        template rather than a plan written from your answers. Everything still
        works — regenerate later for the tailored version. ({pipeline.reason})
      </p>
    </div>
  );
};

const ProjectsPage: React.FC = () => {
  const projects = useProjectsList();
  // Backend-source flip: pull the student's persisted build (completions from
  // other devices, or a build this browser has never seen) then mirror back up.
  // Once per page session, flag-gated + best-effort (see projectSync).
  useEffect(() => { void syncProjectsWithBackend(); }, []);
  const demo = useIsExplorer();   // Explorer = demo mode: no real builds get created
  const [view, setView] = useState<View>({ kind: 'overview' });
  // Which path produced the student's plan, and why. Surfaced rather than
  // hidden: a student is entitled to know whether they got the real thing.
  const [pipeline, setPipeline] = useState<PipelineState>({ state: 'idle' });

  const active = (view.kind === 'preview' || view.kind === 'interior') ? projects.find((p) => p.id === view.id) : null;
  const openInterior = (id: string) => { setView({ kind: 'interior', id }); window.scrollTo(0, 0); };

  /**
   * Start a build.
   *
   * Tries the real server pipeline first — a genuine requirements document,
   * a gated plan, releases and stories derived from the student's own answers.
   * Falls back to the local generator on ANY failure, including the pipeline
   * being switched off (404).
   *
   * The fallback is deliberate rather than defensive: the local path still
   * produces something a student can work with, so a pipeline problem degrades
   * the quality of their plan instead of leaving them with nothing. The banner
   * tells them which one they got — silently serving the worse result is how
   * the original defect stayed invisible for months.
   */
  const handleCreate = useCallback(async (a: NewBuildAnswers) => {
    if (demo) return;   // demo — the wizard's create button is disabled; guard the store too

    // Optimistic local build first, so the student sees their project
    // immediately either way and the page has something to show.
    const localId = createProjectFromAnswers(a);
    setView({ kind: 'preview', id: localId });
    window.scrollTo(0, 0);

    const resolved = await resolveBackendProjectId();
    if (!resolved.ok) { setPipeline({ state: 'local', reason: resolved.error.message }); return; }

    const started = await startServerBuild({
      project_id: resolved.projectId,
      idea: a.idea,
      name: a.name || undefined,
      size: a.size,
      users: a.users || undefined,
      data_sources: a.dataSources || undefined,
      done_definition: a.done || undefined,
      target_weeks: a.weeks,
    });
    if (!started.ok) { setPipeline({ state: 'local', reason: started.error.message }); return; }

    setPipeline({ state: 'generating', projectId: resolved.projectId });
    const result = await pollBuild(resolved.projectId, {
      onUpdate: (st) => setPipeline({ state: 'generating', projectId: resolved.projectId, status: st.status }),
    });

    if (!result.ok) { setPipeline({ state: 'local', reason: result.error.message }); return; }
    if (result.state.status === 'gate_failed') {
      setPipeline({
        state: 'gate_failed',
        projectId: resolved.projectId,
        reason: `${result.state.gate?.violations.length ?? 0} requirement(s) are not yet covered by a story.`,
      });
      return;
    }
    setPipeline({ state: 'ready', projectId: resolved.projectId });
    // The persisted plan is pulled in by the normal sync on next load.
    void syncProjectsWithBackend();
  }, [demo]);

  // primary build + hero next-step
  const primary = projects[0] || null;
  const primaryNext = primary ? nextTask(primary) : null;
  const openBuildPrimary = () => { if (primary) openInterior(primary.id); };
  const copyPrompt = () => { if (navigator.clipboard && primaryNext?.task.prompt) navigator.clipboard.writeText(primaryNext.task.prompt); };
  const startBuild = () => setView({ kind: 'wizard' });

  // landing timeline: the next open tasks across all builds
  const feed: FeedItem[] = [];
  projects.forEach((p) => {
    const opens: { t: ProjectTask; l: ProjectList }[] = [];
    p.lists.forEach((l) => l.tasks.forEach((t) => { if (t.state === 'todo') opens.push({ t, l }); }));
    opens.sort((a, b) => DUE_RANK[a.t.due] - DUE_RANK[b.t.due]);
    opens.slice(0, 4).forEach(({ t, l }) => feed.push({
      id: `t-${t.id}`, source: 'projects', sourceLabel: p.name, color: p.accent, icon: PROJ_ICON,
      title: t.title, meta: l.name, desc: t.what,
      cta: { label: 'Open build', onClick: () => openInterior(p.id), variant: 'berry' },
    }));
  });
  const feedTop = feed.slice(0, 6);

  // ── interior + wizard + preview take over the whole page ──
  if (view.kind === 'interior' && active) {
    if (active.status === 'creating') {
      return (
        <PortalShell><div className="pj-root">
          <div className="page-h"><div className="crumbs0">Building</div><h1>{active.name}</h1><div className="sub">Your build is being assembled. This preview updates the moment it's ready.</div></div>
          <ProjectPreview project={active} onOpen={() => { }} onExplore={() => { setView({ kind: 'overview' }); window.scrollTo(0, 0); }} />
        </div></PortalShell>
      );
    }
    return <PortalShell><div className="pj-root"><ProjectInterior project={active} onBack={() => { setView({ kind: 'overview' }); window.scrollTo(0, 0); }} /></div></PortalShell>;
  }

  if (view.kind === 'preview' && active) {
    return (
      <PortalShell><div className="pj-root">
        <div className="page-h"><div className="crumbs0">Building</div><h1>{active.name}</h1><div className="sub">A preview of the AI tool you're building. It's assembling in the background — open the workspace to watch it fill in, or keep exploring.</div></div>
        <ProjectPreview project={active} onOpen={() => openInterior(active.id)} onExplore={() => { setView({ kind: 'overview' }); window.scrollTo(0, 0); }} />
      </div></PortalShell>
    );
  }

  if (view.kind === 'wizard') {
    return (
      <PortalShell><div className="pj-root">
        <div className="page-h"><div className="crumbs0">Where work happens</div><h1>Start a new build</h1><div className="sub">Turn a raw idea into a scheduled build with lists and tasks — created in the background, right here in your portal.</div></div>
        <button className="pj-back" onClick={() => setView({ kind: 'overview' })}><svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> Back to projects</button>
        <PipelineBanner pipeline={pipeline} />
        <ProjectWizard onCreate={handleCreate} />
      </div></PortalShell>
    );
  }

  // ── overview (Today-shaped) ──
  return (
    <PortalShell
      condensedSlot={(
        <ProjectsNextStepHero
          variant="condensed"
          primary={primary}
          primaryNext={primaryNext}
          demo={demo}
          onOpenBuild={openBuildPrimary}
          onCopyPrompt={copyPrompt}
          onStartBuild={startBuild}
        />
      )}
    >
      {(condensed) => (
    <div className="pj-root">
      <div className="page-h">
        <div className="crumbs0">Build and learn</div>
        <h1>Projects</h1>
        <div className="sub">Your builds live here — every project you ship, as lists and tasks in the same feed you see across the platform.</div>
      </div>

      {demo && (
        <div className="te-card" style={{ borderLeft: '3px solid var(--cherry)', padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flex: 'none', color: 'var(--cherry)' }}><path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700 }}>Projects are a demo</div>
            <div className="small">Explore how a real build works — click around the lists and tasks. Running prompts, marking done, and creating a build unlock when you enroll. (Your demo builds reset when you enroll.)</div>
          </div>
        </div>
      )}

      <div className="te-grid">
        <div>
          {/* hero: your next step */}
          <div className={`te-condense-body${condensed ? ' is-condensed' : ''}`}>
            <ProjectsNextStepHero
              variant="full"
              primary={primary}
              primaryNext={primaryNext}
              demo={demo}
              onOpenBuild={openBuildPrimary}
              onCopyPrompt={copyPrompt}
              onStartBuild={startBuild}
            />
          </div>

          <NextSessionStrip />

          {/* your builds */}
          <div className="te-sec-title">Your builds</div>
          <div className="pj-builds">
            {projects.map((p) => <BuildCard key={p.id} p={p} onOpen={() => openInterior(p.id)} />)}
            <button className="pj-newbuild" onClick={() => setView({ kind: 'wizard' })}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
              Start a new build
              <span className="small" style={{ fontWeight: 400 }}>Idea → shaping → requirements → schedule</span>
            </button>
          </div>

          {/* timeline: up next across builds */}
          {feedTop.length > 0 && (
            <div className="te-feed" style={{ marginTop: 24 }}>
              <div className="te-feed-head"><span className="h"><svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> Up next across your builds</span></div>
              {feedTop.map((it) => <FeedCard key={it.id} item={it} />)}
            </div>
          )}
        </div>

        {/* right sidebar: builds dashboard */}
        <aside className="te-side">
          <div className="te-card te-scard">
            <h3><svg viewBox="0 0 24 24" fill="none"><path d="M3 7l9-4 9 4-9 4-9-4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M3 12l9 4 9-4M3 17l9 4 9-4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg> Your builds</h3>
            <div className="te-stat"><span className="lab">Active builds</span><span className="num">{projects.length}</span></div>
            {projects.map((p) => {
              const prog = projectProgress(p);
              return (
                <button key={p.id} className="pj-sidebuild" onClick={() => openInterior(p.id)}>
                  <span className="pj-sb-ic" style={{ background: p.accent }}><svg viewBox="0 0 24 24" fill="none"><path d={p.icon} stroke="#fff" strokeWidth="2" strokeLinejoin="round" /></svg></span>
                  <span className="pj-sb-t">
                    <span className="nm">{p.name}</span>
                    <span className="bar"><i style={{ width: `${prog.pct}%`, background: p.status === 'creating' ? '#367895' : '#5BA63C' }} /></span>
                  </span>
                  <span className="pj-sb-pct">{p.status === 'creating' ? '…' : `${prog.pct}%`}</span>
                </button>
              );
            })}
            <button className="te-btn cherry sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => setView({ kind: 'wizard' })}>Start a new build</button>
          </div>

          <div className="te-card te-scard">
            <h3><svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.6 7.4H22l-6.2 4.6 2.4 7.4L12 16.9 5.8 21.4l2.4-7.4L2 9.4h7.4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg> How builds work</h3>
            <p className="te-muted" style={{ margin: '0 0 6px', fontSize: 14, lineHeight: 1.5 }}>Each build is decomposed into releases (lists) and stories (tasks). Every task carries a Claude Code prompt and acceptance you can check off. Completing tasks advances your requirements toward verified.</p>
          </div>
        </aside>
      </div>
    </div>
      )}
    </PortalShell>
  );
};

export default ProjectsPage;
