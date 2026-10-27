import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import portalApi from '../../../utils/portalApi';
import { runtimeCss } from '../runtime/runtimeKit';
import {
  getProject, canonicalProjectId, mirrorVerifiedCompletion, markSelfDirectedDone, skipTask, isTaskBlocked, projectProgress,
  StudentProject, ProjectTask,
} from './projectsStore';
import {
  WorkspaceRepoView, ConnectStateView, getWorkspaceRepo,
} from '../../../services/workspaceRepoApi';
import { foldConnect } from './foldConnect';
import { repoConnectionState } from './WorkspaceRepoPanel';
import HowToBuild from './HowToBuild';
import { refreshProjectsFromBackend } from './projectSync';
import { useStoryVerification } from './useStoryVerification';
import AcceptanceChecklist from './AcceptanceChecklist';
import StoryCompletionPanel, { isSelfDirectedStory } from './StoryCompletionPanel';
import DemoEvidencePanel, { isPrepStory } from './DemoEvidencePanel';
import PresentationStudio from './presentation/PresentationStudio';
import { usePortalFlags } from '../../../hooks/usePortalFlags';
import { useIsExplorer } from '../useIsExplorer';
import { useAgentAttachments } from '../../../components/portal/AgentAttachments';
import MentorRail, { type MentorMsg, type MentorMode } from '../../../components/portal/workspace/MentorRail';
import WorkspaceStuckHelp from './WorkspaceStuckHelp';
import { useCampus } from '../../../components/campus/CampusContext';
import WorkstationShell, { returnToOf, type WorkstationOrigin } from '../../../components/campus/workstation/WorkstationShell';
import RepoTerminal from '../../../components/campus/workstation/RepoTerminal';
import { storyBench, storyTitle, workstationBuilding, workstationPlace } from '../../../components/campus/workstation/workstationModel';

/**
 * ProjectWorkspacePage — the build-side twin of the classroom's RuntimeWorkspace.
 *
 * A student inside a lesson gets a full workspace: the activity in the middle,
 * a live mentor on the right, and their evidence along the bottom. A student
 * inside a BUILD had a slide-over drawer, which is not the same thing and does
 * not feel like the same product. This is the same page shape, driven by a
 * story instead of a card — it deliberately imports `runtimeCss` and reuses the
 * `.rt-*` classes rather than restating them, so the two cannot drift apart.
 *
 * Route: /portal/projects/workspace/:projectId/:taskId  (taskId is the STORY id,
 * which is what a student sees and what survives a republish).
 *
 * HALF SCREEN IS THE DESIGN TARGET. Students build with this page in one half
 * of the display and their editor in the other, so ~700px is the normal width,
 * not the degraded one. The center column therefore reads in one order — what
 * this story IS, what DONE MEANS, then HOW TO BUILD IT — with the Claude Code
 * prompt collapsed behind an affordance rather than occupying the fold. See the
 * <=760px block in runtimeCss for the matching density pass.
 */

type Msg = MentorMsg;
type Mode = MentorMode;

const ProjectWorkspacePage: React.FC = () => {
  const { projectId: routeProjectId = '', taskId = '' } = useParams();
  // The URL may still carry the browser's `p<epoch>` placeholder (a bookmark, a
  // tab open since before the project adopted its server UUID). Resolve it to
  // the canonical id ONCE, here, so every id-keyed thing below — the workspace
  // API calls, the mentor endpoint, the store lookup, the acceptance-tick key —
  // is fed a UUID rather than a value the backend will reject with a 400.
  const projectId = canonicalProjectId(routeProjectId);
  const navigate = useNavigate();
  const location = useLocation();
  // Back out to THAT project, not the list (Ali, 2026-10-26): ProjectsPage opens the project named by ?project=.
  const backTo = ((location.state as { from?: string } | null)?.from) || `/portal/projects?project=${encodeURIComponent(projectId)}`;
  const goBack = useCallback(() => navigate(backTo), [navigate, backTo]);

  // Same theme handling as the runtime: this page renders its own chrome rather
  // than PortalShell, so it has to carry the portal's light/dark setting itself.
  const theme = useMemo<'light' | 'dark'>(() => {
    try { return localStorage.getItem('te-theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  }, []);
  useEffect(() => {
    try { document.documentElement.setAttribute('data-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  const [project, setProject] = useState<StudentProject | null>(null);
  const [tick, setTick] = useState(0);          // bumped after a store mutation
  const [busy, setBusy] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [mentorInput, setMentorInput] = useState('');
  const [repo, setRepo] = useState<WorkspaceRepoView | null>(null);
  const mentorEnd = useRef<HTMLDivElement | null>(null);
  // Screenshots the student hands Cory — drag, paste, or click. Same hook the
  // classroom mentor and Reese's DMs use, so the gesture is identical everywhere.
  const attach = useAgentAttachments();
  // A screenshot with no caption is a perfectly good message, so Send unlocks
  // on text OR a finished upload — but never while one is still in flight,
  // which would send a turn missing the very thing it is about.
  const canSend = (mentorInput.trim().length > 0 || attach.refs().length > 0) && !attach.busy;

  // Acceptance ticks are the student's own working memory ("have I got that one
  // yet?"), so they survive a reload. Deliberately localStorage and NOT the
  // project store: the server knows nothing about them, and putting them in the
  // store would dress them up as reportable progress.
  //
  // THEY ARE NO LONGER THE STATE THE BOX RENDERS. A criterion is CONFIRMED only
  // when the platform read it as passing out of the repo (see useStoryVerification);
  // a local tick is a note-to-self and is drawn as a visibly different thing. The
  // two must never be confusable, because one of them is evidence and the other
  // is an intention.
  const accKey = `te_ws_acc_${projectId}_${taskId}`;
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { setTicked(JSON.parse(localStorage.getItem(accKey) || '{}')); }
    catch { setTicked({}); }
  }, [accKey]);
  const toggleAcc = useCallback((i: number) => {
    setTicked((prev) => {
      const next = { ...prev, [i]: !prev[i] };
      try { localStorage.setItem(accKey, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, [accKey]);

  useEffect(() => { setProject(getProject(projectId) ?? null); }, [projectId, tick]);

  /**
   * PULL THE PROJECT ITSELF FROM THE SERVER ON ARRIVAL.
   *
   * This page used to read localStorage and nothing else, which made it show a
   * snapshot of the project taken whenever ProjectsPage last synced. That is
   * fine for the plan (it does not move) and wrong for anything the server
   * records mid-session — the Command Center URL above being the case that bit:
   * it is written when STORY-000 ships, so the student who just earned it walks
   * into the next story holding a copy of the project from before it existed,
   * and the header correctly renders nothing. Only a hard refresh fixed it.
   *
   * `refreshProjectsFromBackend` and not `syncProjectsWithBackend`, for two
   * reasons. It is deliberately NOT subject to the once-per-session latch, which
   * ProjectsPage has already tripped by the time anyone reaches a story. And it
   * is pull-only: the push half would mirror this device's snapshot back over
   * rows the server just wrote, which is the wrong direction to run at the exact
   * moment we came here to read the server's newer truth.
   *
   * Fails soft by design. The pull swallows its own errors, and the `.catch` is
   * the second line: on any failure the page keeps rendering the store copy it
   * already had, which is the same thing it showed before this effect existed.
   * A student offline mid-build loses the refresh, not the workspace.
   */
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    refreshProjectsFromBackend()
      .then(() => { if (!cancelled) setTick((t) => t + 1); })
      .catch(() => { /* keep the store copy — see above */ });
    return () => { cancelled = true; };
  }, [projectId]);

  const task: ProjectTask | null = useMemo(() => {
    if (!project) return null;
    const all = project.lists.flatMap((l) => l.tasks);
    return all.find((t) => t.storyId === taskId) || all.find((t) => t.id === taskId) || null;
  }, [project, taskId]);

  const listName = useMemo(() => {
    if (!project || !task) return null;
    return project.lists.find((l) => l.tasks.some((t) => t.id === task.id))?.name ?? null;
  }, [project, task]);

  /**
   * SERVER TRUTH for this story — polled while the page is open, so a push in
   * the student's editor lands here without a refresh. Called before the
   * not-found guard below because hooks cannot be conditional; it no-ops on an
   * empty story id.
   */
  const storyKey = task?.storyId || taskId;
  const verif = useStoryVerification(projectId, storyKey);

  // Greet once the task is known, so the opening line can name it. C57: one conversation per story, as the rail's header is per story.
  // Moving to another story on the pinned strip keeps this page mounted (only the URL changes), so the conversation is keyed on the
  // story: a new story starts a fresh greeting that names it (it used to keep the previous story's greeting and turns).
  const convoFor = useRef<string | null>(null);
  useEffect(() => {
    if (!task || convoFor.current === task.id) return;
    convoFor.current = task.id;
    setMsgs([{
      role: 'assistant',
      // The screenshot line is here rather than in a tooltip because a
      // paperclip nobody notices is the same as no paperclip. Cory saying it
      // in the opening turn is the one place every student actually reads.
      content: `I'm Cory, your mentor for "${task.title}". Ask me anything, or hit a shortcut below — I'll coach, not hand you answers. Stuck on an error? Paste or drag a screenshot straight in and I'll read it.`,
    }]);
  }, [task]);

  useEffect(() => { mentorEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  // Repo state — fails soft, exactly as the drawer does. No repo is a normal
  // state on day one, not an error worth shouting about.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    getWorkspaceRepo(projectId)
      .then((r) => { if (!cancelled) setRepo(r); })
      .catch(() => { if (!cancelled) setRepo(null); });
    return () => { cancelled = true; };
  }, [projectId]);

  const ask = useCallback(async (mode: Mode, message: string) => {
    if (!task) return;
    const asked = task.id; // C57: an answer that lands after you moved to another story is not shown on that story
    const history = msgs.slice(-12).map((m) => ({ role: m.role, content: m.content }));
    // Snapshot the tray BEFORE clearing it, so the sent message keeps its
    // thumbnails and the composer is empty again immediately.
    const attachments = attach.refs();
    const shown = attach.sentPreviews();
    setMsgs((m) => [...m, { role: 'user', content: message, attachments: shown }]);
    setMentorInput('');
    attach.clear(false);
    setBusy('mentor');
    try {
      const { data } = await portalApi.post(
        `/api/portal/projects/${projectId}/tasks/${encodeURIComponent(task.storyId || task.id)}/mentor`,
        { mode, message, history, attachments },
      );
      if (convoFor.current === asked) setMsgs((m) => [...m, { role: 'assistant', content: data?.reply || data?.message || 'I could not answer that one.' }]);
    } catch {
      // Say so rather than dropping the turn silently — a mentor that goes
      // quiet reads as a mentor that ignored you.
      if (convoFor.current === asked) setMsgs((m) => [...m, { role: 'assistant', content: 'I could not reach the mentor just then. Try again in a moment — your work is saved.' }]);
    } finally {
      setBusy('');
    }
  }, [msgs, projectId, task, attach]);

  // Fold the connect endpoints' CONNECT state onto the view (foldConnect: one source of truth for the repo).
  const applyConnect = useCallback((next: ConnectStateView) => { setRepo((prev) => foldConnect(prev, next)); }, []);

  // Hook: above the early return below, as every hook must be.
  const demo = useIsExplorer();   // Explorer = demo mode: nothing is handed in for real
  // Presentation Studio gate. `flags` is null while usePortalFlags resolves, and
  // `?? false` means that first render shows the EXISTING evidence panel — which is
  // the correct answer for everyone today, since the flag is off in production.
  // Read in render, never in a useState initializer: an initializer sees the null
  // and would lock onto "flag off" permanently even after the real value arrives.
  const { flags } = usePortalFlags();
  const studioOn = flags?.presentation_studio ?? false;
  // C19: with the campus on, the same page is drawn as the workstation (the shell only arranges what is built below).
  const campus = useCampus();
  if (!project || !task) {
    return (
      <div className="rt" data-theme={theme}>
        <style>{runtimeCss}</style>
        <div className="rt-mid" style={{ padding: 40 }}>
          That task is not on this build. <button className="rt-btn" onClick={goBack}>← Projects</button>
        </div>
      </div>
    );
  }

  const blocked = isTaskBlocked(project, task);
  const prog = projectProgress(project);
  const prompt = task.prompt || '';

  /**
   * The criteria list comes from the SERVER when it has answered, because the
   * published plan is the authority on what this story asks for. The store's
   * copy is the fallback for a deep-link that arrives before the first poll.
   * Pairing a fresh `outstanding` set against a stale criteria list would
   * mis-mark boxes, and mis-marking them in the confident direction is the one
   * failure this feature must not have.
   */
  const acceptance = verif.acceptance.length ? verif.acceptance : (task.acceptance ?? []);

  /**
   * THE GATE and the DISPLAY are two different questions, and conflating them
   * is how a stale local flag would quietly become a completion.
   *
   * `verified` is the gate: `verified_at` is a one-way latch the platform sets
   * after reading the repo, and nothing the client can do produces it. It is the
   * ONLY thing that unlocks the button.
   *
   * `locallyDone` is the student's own board state, which for a task completed
   * before this gate existed can say `done` with no server verification behind
   * it. It is allowed to affect what the page SHOWS — a finished task should not
   * nag — and is deliberately not allowed anywhere near the unlock.
   */
  const locallyDone = task.state === 'done';
  // Display only — see the header pill. The GATE lives in StoryCompletionPanel
  // and reads `verified_at` alone.
  const done = Boolean(verif.verifiedAt) || locallyDone;
  // Which workspace this is: a story is built and verified from the repo; a
  // demo-prep task is evidenced. Decides the whole centre column below.
  const isPrep = isPrepStory(task.storyId);
  // "How to build it" is step 1 when there is no acceptance list to be step 1 —
  // a lone step numbered 2 reads like something failed to load.
  const buildStepNo = acceptance.length ? 2 : 1;

  // Only rendered once the student's Command Center is actually running.
  // An <a> rather than a <button> because it navigates: middle-click,
  // copy-link and the screen-reader link role all come free, and a
  // button faking navigation gives up all three. The URL is
  // https-validated server-side (projectTreeDto.commandCenterUrl), so
  // there is nothing left to check here. 
  const commandCenter = project.commandCenterUrl ? (
    <a className="rt-btn" href={project.commandCenterUrl} target="_blank" rel="noopener noreferrer" title="Open your Command Center in a new tab">
      Command Center ↗
    </a>
  ) : null;
  const pill = <span className={`rt-pill ${done ? 'done' : ''}`}>{done ? '✓ Completed' : blocked.blocked ? 'Waiting on another task' : 'In progress'}</span>;

  // CENTER — read in one order: what this story is, what done means, then how to build it.
  const centre = (<>
          {blocked.blocked && (
            <div className="rt-card" style={{ marginBottom: 14 }}>
              <div className="rt-lab">Not yet</div>
              <p className="rt-muted" style={{ margin: 0 }}>
                This one waits on {blocked.waitingOn.join(', ')}. Finish that first — the order is what keeps the build working end to end.
              </p>
            </div>
          )}

          {/* THE STORY. Prose, not a card — at half screen the first thing on
              the page should read like a sentence someone wrote you. This used
              to be a card identical to the two below it, which left all three
              competing for the same attention and none of them winning. */}
          <section className="rt-lead">
            <p>{task.what || task.title}</p>
            {task.req && <span className="rt-req">Fulfils {task.req}</span>}
          </section>

          {/* A DEMO-PREP TASK IS HANDED IN, NOT BUILT. There is no repo to
              verify, no acceptance to tick and no Claude Code prompt to copy,
              so those sections would be theatre. The evidence panel is the
              whole workspace: what to hand in, the box to hand it in, what it
              pays. Demo Day says staff mark it. (Ali, 2026-09-14: "Demos
              should provide points as well.") */}
          {/* PRESENTATION STUDIO, BEHIND A FLAG. With PRESENTATION_STUDIO_ENABLED off
              — which is the default, and production today — this renders exactly the
              line it always did, so flag-off is byte-identical. With it on, the Studio
              wraps six stages around the SAME DemoEvidencePanel rather than replacing
              it: the guide, the link-only rule on PREP-2/5, the staff-marked note on
              PREP-6 and the points all keep working because it is literally the same
              component, mounted inside the stage the task opens on. */}
          {isPrep && !studioOn && (
            <DemoEvidencePanel task={task} projectId={projectId} taskId={task.storyId || task.id} points={task.points} demo={demo} />
          )}
          {isPrep && studioOn && (
            <PresentationStudio task={task} projectId={projectId} taskId={task.storyId || task.id} points={task.points} demo={demo} />
          )}
          {!isPrep && (<>

          {/* WHAT DONE MEANS — checkable, because acceptance criteria are a
              pre-flight the student walks, not a paragraph they re-read. The
              count in the header answers "how close am I?" without scrolling.
              `writeAccess` is passed because it changes the INSTRUCTION: a
              pull-only student was never given a `.colaberry/progress.json`,
              so telling them to open theirs points at a file that may not
              exist. See the prop's own note in AcceptanceChecklist.
              `repoConnected` is the same argument taken one step further: with
              NO repo, every noun in that instruction is missing, not just the
              file. It reads `repoConnectionState`, the SAME derivation the
              repo panel below renders from, rather than `write_access` — which
              is null both for "no repo" and for "connected before the
              permission was recorded" and so cannot tell them apart. */}
          <AcceptanceChecklist
            acceptance={acceptance}
            stepNo={1}
            isConfirmed={verif.isConfirmed}
            isJustConfirmed={verif.isJustConfirmed}
            ticked={ticked}
            onToggle={toggleAcc}
            writeAccess={repo?.connect?.write_access ?? null}
            repoConnected={repoConnectionState(repo) === 'connected'}
          />

          {/* HOW TO BUILD IT — the repo first, then the prompt: see HowToBuild. */}
          <HowToBuild stepNo={buildStepNo} projectId={projectId} taskId={taskId} prompt={prompt} repo={repo} onRepoChange={setRepo} onConnectChange={applyConnect} />

          {/* Two doors, named by the KIND OF PROBLEM rather than by the tool,
              because a student who knew which tool to pick was never stuck in
              the first place. Rendered even on a blocked story: being blocked is
              one of the things people need to ask about. */}
          <WorkspaceStuckHelp taskTitle={task.title} />

          {!blocked.blocked && (
            <StoryCompletionPanel
              verif={verif}
              storyKey={storyKey}
              locallyDone={locallyDone}
              onMarkDone={() => {
                // Two different completions behind one button. A verified story
                // is the platform's call being mirrored locally; a Demo Prep
                // task is the student's own, because nothing ever verifies it.
                // Neither pushes a status: `complete` is not client-settable.
                if (isSelfDirectedStory(storyKey)) {
                  markSelfDirectedDone(project.id, task.id);
                } else {
                  mirrorVerifiedCompletion(project.id, task.id);
                }
                setTick((n) => n + 1);
                goBack();
              }}
              onSkip={() => { skipTask(project.id, task.id); setTick((n) => n + 1); goBack(); }}
            />
          )}
          </>)}
  </>);

  // RIGHT — the mentor, same coach the classroom uses.
  const mentor = (
    <MentorRail
      msgs={msgs}
      busy={busy === 'mentor'}
      attach={attach}
      input={mentorInput}
      onInput={setMentorInput}
      canSend={canSend}
      onAsk={ask}
      shortcut={(mo) => (mo === 'review' ? 'Review what I have built for this story so far.' : `Give me a ${mo} for this story.`)}
      endRef={mentorEnd}
      subtitle={campus.active ? `Your mentor for ${task.storyId || task.title}` : undefined}
    />
  );

  // BOTTOM — where this build stands.
  const stats = (<>
        <div className="rt-stat"><span className="l">Build</span><span className="v sm">{project.name}</span></div>
        <div className="rt-stat"><span className="l">Release</span><span className="v sm">{listName || '—'}</span></div>
        <div className="rt-stat"><span className="l">Tasks done</span><span className="v">{prog.done}<small>/{prog.total}</small></span></div>
        <div className="rt-stat"><span className="l">Progress</span><span className="v">{prog.pct}%</span></div>
        {repo?.provisioned && <div className="rt-stat"><span className="l">GitHub</span><span className="v">{repo.recent_commits?.length ?? 0}<small> commits</small></span></div>}
  </>);

  if (campus.active) {
    const release = project.lists.find((l) => l.tasks.some((t) => t.id === task.id))?.tasks ?? [task];
    return (
      <WorkstationShell
        theme={theme}
        place={workstationPlace(workstationBuilding(backTo, 'studio', (location.state as WorkstationOrigin | null)?.at), campus.settings.workplaceNames)}
        returnTo={returnToOf(location.state)}
        cardTitle={storyTitle(task.storyId, task.title)}
        heading={{ kicker: `${listName || project.name}${task.points ? ` · +${task.points} pts` : ''}`, title: storyTitle(task.storyId, task.title) }}
        pill={pill}
        actions={commandCenter}
        bench={storyBench(release, task.id, (t) => `/portal/projects/workspace/${project.id}/${encodeURIComponent(t.storyId || t.id)}`)}
        left={<RepoTerminal repo={repo} />}
        mentor={mentor}
        status={stats}
      >
        {centre}
      </WorkstationShell>
    );
  }

  return (
    <div className="rt" data-theme={theme}>
      <style>{runtimeCss}</style>

      <header className="rt-top">
        <button className="rt-back" onClick={goBack} aria-label="Back to Projects" title="Back to Projects">
          <svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div>
          <div className="rt-kick">{listName || project.name}{task.storyId ? ` · ${task.storyId}` : ''}</div>
          <div className="rt-title">{task.title}</div>
        </div>
        <div className="rt-topright">
          {commandCenter}
          {pill}
        </div>
      </header>

      <div className="rt-body">
        {/* CENTER — read in one order: what this story is, what done means,
            then how to build it. */}
        <main className="rt-mid">
          {centre}
        </main>

        {mentor}
      </div>

      {/* BOTTOM — where this build stands */}
      <footer className="rt-bar">
        {stats}
      </footer>
    </div>
  );
};

export default ProjectWorkspacePage;
