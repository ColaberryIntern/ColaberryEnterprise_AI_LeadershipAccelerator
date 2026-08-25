import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalShell from '../today/PortalShell';
import ProjectWizard from './ProjectWizard';
import { useIsExplorer } from '../useIsExplorer';
import ProjectPreview from './ProjectPreview';
import ProjectInterior from './ProjectInterior';
import NextSessionStrip from './NextSessionStrip';
import {
  resolveBackendProjectId, startBuild as startServerBuild, pollBuild,
  isDelivered, blockingReasons, describeFailure, type SbpError,
} from '../../../services/sbpApi';
import ProjectsNextStepHero from './ProjectsNextStepHero';
import FeedCard, { FeedItem } from '../feed/FeedCard';
import {
  useProjectsList, createProjectFromAnswers, claimBackendProject, projectProgress, reqVerified, nextTask,
  removeProjectLocally,
  StudentProject, ProjectTask, ProjectList, NewBuildAnswers,
} from './projectsStore';
import { syncProjectsWithBackend, refreshProjectsFromBackend, hydrateProjectById, pushActiveProject } from './projectSync';
import ArchiveProjectDialog from './ArchiveProjectDialog';
import {
  fetchArchivedProjects, restoreProject as callRestore,
  type ArchivedProjectSummary,
} from './projectArchiveApi';
import { deriveLegacyScope } from './deriveLegacyScope';
import portalApi from '../../../utils/portalApi';
import './projects.css';
import '../today/TodayShell.css';

// Projects tab, in the Today-page shape: a hero "your next step" (your build's
// next action, or "create a project" if you have none), the next live session,
// your builds, and a timeline of what's next across builds — with a right-side
// dashboard. Builds are portal-native (lists + tasks, FB vibe), not Basecamp.

// `taskId` is which task the workspace should open on the right. It lives in
// the view rather than inside the interior so that everything which can ask
// for a task — a feed card, the condensed header, a card inside the build —
// drives the SAME drawer. Two sources of truth here meant clicking "Open
// build" in the feed landed you in the project with nothing open.
type View =
  | { kind: 'overview' }
  | { kind: 'wizard' }
  | { kind: 'preview'; id: string }
  | { kind: 'interior'; id: string; taskId?: string | null };

const PROJ_ICON = (
  <svg viewBox="0 0 24 24" fill="none"><path d="M3 7l9-4 9 4-9 4-9-4z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /><path d="M3 12l9 4 9-4M3 17l9 4 9-4" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /></svg>
);
const DUE_RANK: Record<string, number> = { overdue: 0, today: 1, up: 2, done: 9 };

/**
 * Says which pipeline produced this build, on the card itself.
 *
 * The whole point is that a student can tell the two apart at a glance. A local
 * starter template and a real generated plan rendered identically — same card,
 * same progress bar, same task list — so the only way to know you had been
 * served the lesser one was to notice the missing dates and count to ten.
 */
const OriginChip: React.FC<{ p: StudentProject }> = ({ p }) => {
  if (p.sample) return <span className="pj-bc-st">training example</span>;
  if (p.origin === 'pipeline') {
    return (
      <span className="pj-bc-st pj-origin real" title="Generated from your answers by the build pipeline, with scheduled dates and full prompts.">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
        your tailored plan
      </span>
    );
  }
  if (p.origin === 'local') {
    return (
      <span className="pj-bc-st pj-origin starter" title="A general starter template built in your browser. It has no schedule and no Command Center. Regenerate for the tailored version.">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
        starter template
      </span>
    );
  }
  return null;
};

/**
 * "Not syncing to GitHub", on the one page a returning student actually lands on.
 *
 * Every other surface that says this fires on an ACTION — uploading an artifact,
 * connecting a repo — and the students it needs to reach are precisely the ones
 * who have stopped taking those actions. Measured 2026-08-23: of 17 students
 * with a connected repo, 16 could not be written to, and eight of those had not
 * uploaded in over five days. Nothing in the product told any of them.
 *
 * Renders ONLY on a recorded `blocked`. `unknown` (permission never recorded)
 * and `no_repo` (weeks 1-3, expected) both render nothing — a badge that cries
 * wolf on a repo that is fine is worse than no badge, because the next real one
 * gets ignored too.
 */
const RepoSyncChip: React.FC<{ state?: string }> = ({ state }) => {
  if (state !== 'blocked') return null;
  return (
    <span
      className="pj-bc-st pj-origin starter"
      title="Your artifacts are saved on the platform but are not being written to your GitHub repo, because Colaberry does not have push access. Open the project to see how to grant it — everything you have already built syncs as soon as you do."
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
      not syncing to GitHub
    </span>
  );
};

/**
 * One build in the list — in the SAME visual language as the project interior.
 *
 * Ali: "the cards on the pre project select screen look different from the post
 * project select screen. they should look like the latter."
 *
 * They did, and for no good reason: the list card had a coloured gradient banner,
 * a 48px rounded icon tile hanging off it, and grey pill badges, while the
 * interior's `TaskCard` uses a calm row — a small coloured dot, an uppercase
 * eyebrow of chips, the title, the description, and a footer of actions. Two
 * implementations of one look is how they drifted apart, so this card now RENDERS
 * THE INTERIOR'S OWN CLASSES (`.pjt-card`, `.pjt-head`, `.pjt-ic`, `.pjt-main`,
 * `.pjt-src`, `.chip`/`.sw`, `.pj-st`, `.pj-due`, `.pjt-owner`, `.pjt-title`,
 * `.pjt-sub`, `.pjt-foot`, `.pw-act`) rather than a parallel set of its own. The
 * only genuinely new rules are the progress bar and the list-specific footer,
 * because the interior carries no equivalent.
 *
 * What the list keeps that the interior does not carry: progress, the task and
 * verified counts, and the project's own name (real names shipped 2026-08-16).
 *
 * The card is no longer one big click target. It used to be a `role="button"`
 * div, which cannot hold a Remove button inside it — a nested control inside a
 * clickable parent is an accident waiting to happen, and this particular accident
 * removes a build. Opening is now an explicit action in the footer, matching how
 * the interior's task cards already behave.
 */
export function BuildCard({ p, onOpen, onRemove, repoSync }: {
  p: StudentProject; onOpen: () => void; onRemove: (() => void) | null;
  /** 'blocked' when artifacts are not reaching GitHub. Optional: absent renders nothing. */
  repoSync?: string;
}) {
  const prog = projectProgress(p);
  const rv = reqVerified(p);
  const creating = p.status === 'creating';
  const stageLabel = creating ? 'Creating…' : (prog.pct === 100 ? 'Complete' : p.stage.split(' · ')[0]);
  // Mirrors the interior's requirement-chip vocabulary so the same state reads
  // the same way on both screens.
  const progState = prog.pct === 100 ? 'verified' : (prog.done > 0 ? 'built' : 'planned');

  return (
    <div className={`pjt-card pjb-card${creating ? ' pjb-creating' : ''}`}>
      <div className="pjt-head pjb-head">
        <span className="pjt-ic" style={{ background: p.accent }}>
          <svg viewBox="0 0 24 24" fill="none"><path d={p.icon} stroke="#fff" strokeWidth="2" strokeLinejoin="round" /></svg>
        </span>
        <div className="pjt-main">
          <div className="pjt-src">
            <span className="chip" style={{ padding: '2px 9px', background: 'rgba(54,120,149,.12)', color: '#2E6A86' }}>
              <span className="sw" style={{ background: p.accent }} />{stageLabel}
            </span>
            <span className={`pj-st ${progState}`}>{prog.done}/{prog.total} tasks</span>
            {rv.total > 0 && <span className={`pj-due ${rv.v === rv.total ? 'done' : 'up'}`}>{rv.v}/{rv.total} verified</span>}
            <OriginChip p={p} />
            <RepoSyncChip state={repoSync} />
          </div>
          <div className="pjt-title">{p.name}</div>
          {p.descriptor && <div className="pjt-sub">{p.descriptor}</div>}
          <div className="pjb-bar" aria-hidden="true">
            <i style={{ width: `${prog.pct}%`, background: creating ? 'var(--berry)' : 'var(--leaf-action)' }} />
          </div>
        </div>
      </div>

      <div className="pjt-foot">
        <div className="pw-acts">
          <button type="button" className="pw-act open" onClick={onOpen}>
            <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Open build
          </button>
          {/* Destructive, but not alarming — this is a normal thing to want to
              do. A quiet outlined control that only reddens on hover, sitting
              apart from the primary action, and it opens a confirmation rather
              than doing anything itself. */}
          {onRemove && (
            <button type="button" className="pjb-remove" onClick={onRemove}
              aria-label={`Remove ${p.name}`}>
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type PipelineState =
  | { state: 'idle' }
  | { state: 'generating'; projectId: string; status?: string }
  /** Generated, gate-clean, AND materialized into the portal. The real thing. */
  | { state: 'delivered'; projectId: string }
  /**
   * Generated and gate-clean, but not promoted. Rare and always a server-side
   * problem — it is the state five students were silently parked in. It is a
   * failure and is worded as one.
   */
  | { state: 'stalled'; projectId: string }
  | { state: 'gate_failed'; projectId: string; reasons: string[] }
  /**
   * Fell back to the browser template. `error` carries WHY, classified — a
   * refused request and an unreachable server are different failures needing
   * different actions, and this used to hold only a message string, so the
   * banner narrated every one of them as an outage.
   */
  | { state: 'local'; error: SbpError };

/**
 * Tells the student which path produced their plan, and why.
 *
 * Deliberately visible, and deliberately rendered on EVERY view rather than
 * only inside the wizard. It used to live on the wizard screen alone, while
 * `handleCreate` switched to the preview screen on its very first line — so the
 * banner was mounted for about one frame and no student ever read a word of it.
 * A warning nobody can see is the same as no warning, which is precisely how a
 * silent fallback stayed silent.
 */
const PipelineBanner: React.FC<{ pipeline: PipelineState }> = ({ pipeline }) => {
  if (pipeline.state === 'idle') return null;

  if (pipeline.state === 'generating') {
    return (
      <div className="card pjw-pane pj-pipe" role="status" aria-live="polite">
        <strong>Designing your system…</strong>
        <p className="lead" style={{ marginBottom: 0 }}>
          We are writing your requirements and breaking them into releases and stories.
          This takes a few minutes — you can keep working and come back.
        </p>
      </div>
    );
  }

  if (pipeline.state === 'delivered') {
    return (
      <div className="card pjw-pane pj-pipe ok" role="status" aria-live="polite">
        <strong>Your plan is ready, and it is in your build.</strong>
        <p className="lead" style={{ marginBottom: 0 }}>
          Built from your own answers, with every requirement traced to a story,
          scheduled against your cohort's dates, and each task carrying its own
          Claude Code prompt.
        </p>
      </div>
    );
  }

  if (pipeline.state === 'stalled') {
    return (
      <div className="card pjw-pane pj-pipe warn" role="alert" aria-live="assertive">
        <strong>Your plan generated, but we could not open it up for you.</strong>
        <p className="lead" style={{ marginBottom: 0 }}>
          Nothing is lost — the plan is saved and the gate passed it. What failed
          is the step that turns it into your tasks and dates, so what you are
          looking at right now is the starter template, not your plan. Reload in
          a few minutes; we are told about this automatically.
        </p>
      </div>
    );
  }

  if (pipeline.state === 'gate_failed') {
    return (
      <div className="card pjw-pane pj-pipe warn" role="alert" aria-live="assertive">
        <strong>Your plan has a gap, so we have not opened it up yet.</strong>
        <p className="lead" style={{ marginBottom: 8 }}>
          We would rather tell you than hand you a plan that quietly misses
          something. Until it is fixed you are looking at the starter template.
        </p>
        <ul className="lead" style={{ margin: 0, paddingLeft: 20 }}>
          {pipeline.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <p className="lead" style={{ margin: '8px 0 0' }}>
          Start the build again with more detail on the missing part, and it
          should close.
        </p>
      </div>
    );
  }

  // Fell back to the browser template. What we say depends on WHY, because the
  // action differs: a refused payload is fixed by editing an answer, and an
  // unreachable service is fixed by waiting. Telling a refused student to wait
  // is how Taiwo Oludimimu spent three days believing he had done something
  // wrong with his connection.
  const copy = describeFailure(pipeline.error);
  return (
    <div className="card pjw-pane pj-pipe warn" role="alert" aria-live="assertive">
      <strong>{copy.title}</strong>
      <p className="lead" style={{ marginBottom: 0 }}>
        {copy.body} You are looking at a general ten-task template — no schedule,
        no Command Center, generic prompts. {copy.action}
      </p>
    </div>
  );
};

const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const projects = useProjectsList();
  // The builds that are actually the STUDENT'S. `projects` always carries the
  // seeded training example alongside them, so anything that counts, totals, or
  // says "you have N" must read this list and not `projects`.
  const ownBuilds = useMemo(() => projects.filter((p) => !p.sample), [projects]);
  // Backend-source flip: pull the student's persisted build (completions from
  // other devices, or a build this browser has never seen) then mirror back up.
  // Once per page session, flag-gated + best-effort (see projectSync).
  useEffect(() => { void syncProjectsWithBackend(); }, []);
  const demo = useIsExplorer();   // Explorer = demo mode: no real builds get created
  const [view, setView] = useState<View>({ kind: 'overview' });
  // Which path produced the student's plan, and why. Surfaced rather than
  // hidden: a student is entitled to know whether they got the real thing.
  const [pipeline, setPipeline] = useState<PipelineState>({ state: 'idle' });
  /** True while a build is being created, so a second confirm cannot start one. */
  const creatingRef = useRef(false);

  // ── remove / restore a build ──────────────────────────────────────────────
  const [removing, setRemoving] = useState<StudentProject | null>(null);
  const [archived, setArchived] = useState<ArchivedProjectSummary[]>([]);
  /**
   * Badge data only, fetched on its own and DELIBERATELY kept out of
   * projectSync/reconcileProjects. That machinery decides which builds exist and
   * which survive a prune; it was repaired recently and is not worth destabilising
   * so a card can show a chip. Read-only, display-only, and its failure mode is an
   * empty map, which renders no badges at all.
   */
  const [repoSync, setRepoSync] = useState<Record<string, string>>({});

  const loadArchived = useCallback(async () => {
    const r = await fetchArchivedProjects();
    // A failure here (API flag off, offline) just means no restore strip. It
    // must never break the page a student came to work on.
    setArchived(r.ok ? r.value : []);
  }, []);
  useEffect(() => { void loadArchived(); }, [loadArchived]);

  // Badge data. One request, once, purely for display — see the `repoSync` state
  // above for why this does not go through projectSync. Silent on failure: a
  // missing chip is invisible, whereas an error here would be noise on a page
  // whose actual job is listing builds.
  useEffect(() => {
    let alive = true;
    portalApi.get('/api/portal/projects')
      .then((res: any) => {
        if (!alive) return;
        const rows = res?.data?.projects;
        if (!Array.isArray(rows)) return;
        const next: Record<string, string> = {};
        for (const r of rows) {
          if (r?.id && typeof r.repo_sync === 'string') next[String(r.id)] = r.repo_sync;
        }
        setRepoSync(next);
      })
      .catch(() => { /* no badge is the correct degraded state */ });
    return () => { alive = false; };
  }, []);

  /**
   * The card goes NOW, not on the next pull.
   *
   * `pruneDeadProjects` would eventually drop it — the server stops listing an
   * archived project, which is exactly its "reached the server and is now gone"
   * case — but only on the next reconcile. Waiting for that would leave the
   * student looking at a build they just removed, which is indistinguishable
   * from the archive having failed. Removing locally on success keeps the two
   * views in step; the prune remains the durable backstop on other devices.
   */
  const handleArchived = useCallback(async (local: StudentProject) => {
    // Removed by its LOCAL id, which is not always the backend id — a
    // browser-built project that was later mirrored up keeps its own `p<epoch>`
    // id and carries the server's id in `pipelineProjectId`. Archiving talks to
    // the server about one; localStorage is keyed on the other.
    removeProjectLocally(local.id);
    setRemoving(null);
    await loadArchived();
    // The server may have repointed the active project, so re-pull the tree.
    await refreshProjectsFromBackend();
  }, [loadArchived]);

  /** A browser-only build has no server row: localStorage is the only copy. */
  const handleRemoveLocalOnly = useCallback((p: StudentProject) => {
    removeProjectLocally(p.id);
    setRemoving(null);
  }, []);

  const handleRestore = useCallback(async (projectId: string) => {
    const r = await callRestore(projectId);
    if (!r.ok) return;
    await loadArchived();
    // Put the card back explicitly. `/active` only describes the ACTIVE project,
    // so a restored non-active build has no other route onto this page — the row
    // would leave "Removed builds" and nothing would appear, which reads as a
    // broken button. Then the normal pull, in case the restore also adopted it
    // as active (it does when the student had none).
    await hydrateProjectById(projectId);
    await refreshProjectsFromBackend();
  }, [loadArchived]);

  /**
   * Which builds may be removed, and by which route.
   *
   * The seeded training example is never removable: `projectsStore.read()`
   * re-seeds it whenever it is absent, so the control would appear to work and
   * silently undo itself on the next load.
   *
   * A build with no backend id never reached the server, so there is nothing to
   * archive — it is dropped from this browser directly, with no confirmation
   * dialog fetch that would only 404.
   */
  const removalRouteFor = (p: StudentProject): 'server' | 'local' | null => {
    if (p.sample || demo) return null;
    const backendId = p.pipelineProjectId || (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id) ? p.id : null);
    return backendId ? 'server' : 'local';
  };

  const active = (view.kind === 'preview' || view.kind === 'interior') ? projects.find((p) => p.id === view.id) : null;
  const openInterior = (id: string, taskId?: string | null) => {
    setView({ kind: 'interior', id, taskId: taskId ?? null });
    window.scrollTo(0, 0);
    // Make the switch durable. Opening a build is the only signal the student
    // gives about which one they are working on, and until this call existed it
    // went nowhere: `enrollments.active_project_id` stayed on the previous
    // build, so the "Your next step" hero on the overview kept naming it and a
    // reload dropped them back onto it. Fire-and-forget by design — the view has
    // already changed and a failed preference write must not undo that.
    const target = projects.find((p) => p.id === id);
    if (target && !target.sample) void pushActiveProject(target.pipelineProjectId || target.id);
  };
  /**
   * Open a task in the project WORKSPACE — the full page with the mentor on the
   * right, the build-side twin of the classroom runtime. This used to open a
   * slide-over drawer, which is not the same thing and did not feel like the
   * same product. `from` is stamped so the workspace's back button returns to
   * wherever the student actually came from.
   */
  const openTaskWorkspace = (projectId: string, task: ProjectTask | null) => {
    if (!task) return;
    const key = task.storyId || task.id;
    navigate(`/portal/projects/workspace/${projectId}/${encodeURIComponent(key)}`,
      { state: { from: window.location.pathname } });
  };
  const openTaskById = (projectId: string, taskId: string | null) => {
    if (!taskId) return;
    const p = projects.find((x) => x.id === projectId);
    const t = p?.lists.flatMap((l) => l.tasks).find((x) => x.id === taskId) ?? null;
    openTaskWorkspace(projectId, t);
  };

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
   * the quality of their plan instead of leaving them with nothing.
   *
   * What was NOT deliberate was how quiet it had become. The optimistic local
   * build is created first, the view flips to it immediately, and every
   * downstream failure just set a banner on a screen that was no longer
   * mounted. Two of the five students on 2026-08-12/13 never reached the server
   * at all and were shown a template with no indication anything had gone
   * wrong. Three reached it, got correct plans, and were shown the same
   * template because nothing published those plans.
   *
   * So: the placeholder now CLAIMS the backend project (so the real plan
   * replaces it rather than joining it), every exit sets a pipeline state the
   * student can actually see, and success is defined as `delivered` — the plan
   * is in `student_tasks` — not merely as "the poll stopped".
   */
  const runCreate = useCallback(async (raw: NewBuildAnswers) => {
    // The interview is generated now, so the three legacy scoping fields are
    // derived from it rather than asked directly. Both the local fallback and
    // the server read them, so derive once and use the same object for both.
    const a: NewBuildAnswers = { ...raw, ...deriveLegacyScope(raw.answers) };

    // Optimistic local build first, so the student sees their project
    // immediately either way and the page has something to show. It is stamped
    // `origin: 'local'` by the store, so it is labelled from birth.
    const localId = createProjectFromAnswers(a);
    setView({ kind: 'preview', id: localId });
    window.scrollTo(0, 0);

    const resolved = await resolveBackendProjectId();
    if (!resolved.ok) { setPipeline({ state: 'local', error: resolved.error }); return; }

    // Durable, so a reload mid-generation still folds the real plan into this
    // placeholder instead of leaving the student with two lookalike builds.
    claimBackendProject(localId, resolved.projectId);

    const started = await startServerBuild({
      project_id: resolved.projectId,
      idea: a.idea,
      name: a.name || undefined,
      size: a.size,
      users: a.users || undefined,
      data_sources: a.dataSources || undefined,
      done_definition: a.done || undefined,
      answers: a.answers && a.answers.length ? a.answers : undefined,
      target_weeks: a.weeks,
    });
    if (!started.ok) { setPipeline({ state: 'local', error: started.error }); return; }

    setPipeline({ state: 'generating', projectId: resolved.projectId });
    const result = await pollBuild(resolved.projectId, {
      onUpdate: (st) => setPipeline({ state: 'generating', projectId: resolved.projectId, status: st.status }),
    });

    if (!result.ok) { setPipeline({ state: 'local', error: result.error }); return; }

    if (result.state.status === 'gate_failed') {
      // Say what is actually wrong, using the server's BLOCKING list rather
      // than the whole violation array. That array is mostly advisory quality
      // warnings, so taking the first three of it told a student blocked on an
      // uncovered must-have about a stylistically redundant story instead.
      const blocking = blockingReasons(result.state);
      setPipeline({
        state: 'gate_failed',
        projectId: resolved.projectId,
        reasons: blocking.length
          ? blocking.slice(0, 3).map((v) => v.message)
          : ['The plan could not be verified against your requirements.'],
      });
      return;
    }

    if (!isDelivered(result.state)) {
      // `drafted`: generated, gate-clean, and never promoted. This is exactly
      // the hole this whole change closes, so it is reported loudly rather than
      // celebrated as a ready plan the way it used to be.
      setPipeline({ state: 'stalled', projectId: resolved.projectId });
      return;
    }

    // Pull the published plan in NOW. `syncProjectsWithBackend` is latched to
    // once per page session and had already fired on mount, so calling it here
    // was a no-op — the plan existed on the server and still did not appear.
    await refreshProjectsFromBackend();
    setPipeline({ state: 'delivered', projectId: resolved.projectId });
    // The placeholder has been superseded by the real project, which carries
    // the backend id. Point the view at it so the student lands on their plan.
    setView({ kind: 'preview', id: resolved.projectId });
  }, []);

  /**
   * One build per confirm.
   *
   * Every confirm now genuinely creates a project (that is the fix — the wizard
   * used to build into whatever project was already active). So the double
   * press a student makes when the first one appears to do nothing is no longer
   * harmless: it would leave them with two builds from one intent. The guard is
   * a ref rather than state because it has to take effect within the same tick
   * as the first press, before any re-render.
   *
   * The banner is also cleared on entry: `pipeline` is set on every exit path
   * of `runCreate` but was never reset, so a previous attempt's `gate_failed`
   * or `stalled` message rendered over the new project's preview.
   */
  const handleCreate = useCallback(async (raw: NewBuildAnswers) => {
    if (demo) return;   // demo — the wizard's create button is disabled; guard the store too
    if (creatingRef.current) return;
    creatingRef.current = true;
    setPipeline({ state: 'idle' });
    try {
      await runCreate(raw);
    } finally {
      creatingRef.current = false;
    }
  }, [demo, runCreate]);

  // primary build + hero next-step
  const primary = projects[0] || null;
  const primaryNext = primary ? nextTask(primary) : null;
  const openBuildPrimary = () => { if (primary) openTaskWorkspace(primary.id, primaryNext?.task ?? null); };
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
      cta: { label: 'Open build', onClick: () => openTaskWorkspace(p.id, t), variant: 'berry' },
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
    // The interior gets the SAME condensed header the overview has. Without it,
    // scrolling inside a build left the next task pinned mid-page instead of
    // riding up into the header, so the two screens behaved differently for no
    // reason a student could see.
    const activeNext = nextTask(active);
    return (
      <PortalShell
        condensedSlot={(
          <ProjectsNextStepHero
            variant="condensed"
            primary={active}
            primaryNext={activeNext}
            demo={demo}
            onOpenBuild={() => openTaskWorkspace(active.id, activeNext?.task ?? null)}
            onCopyPrompt={() => { if (navigator.clipboard && activeNext?.task.prompt) navigator.clipboard.writeText(activeNext.task.prompt); }}
            onStartBuild={startBuild}
          />
        )}
      >
        {(condensed) => (
          <div className="pj-root">
            <ProjectInterior
              project={active}
              condensed={condensed}
              onOpenTask={(taskId) => openTaskById(active.id, taskId)}
              onBack={() => { setView({ kind: 'overview' }); window.scrollTo(0, 0); }}
            />
          </div>
        )}
      </PortalShell>
    );
  }

  if (view.kind === 'preview' && active) {
    return (
      <PortalShell><div className="pj-root">
        <div className="page-h"><div className="crumbs0">Building</div><h1>{active.name}</h1><div className="sub">A preview of the AI tool you're building. It's assembling in the background — open the workspace to watch it fill in, or keep exploring.</div></div>
        {/* The screen the student is actually on after creating a build. The
            banner used to render only in the wizard branch they had already
            left, so every degraded path arrived here saying nothing at all. */}
        <PipelineBanner pipeline={pipeline} />
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

      {/* Also here: a student who navigates back to the overview while their
          build is generating (or after it degraded) must not lose the only
          explanation they were given. */}
      <PipelineBanner pipeline={pipeline} />

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
            {projects.map((p) => {
              const route = removalRouteFor(p);
              return (
                <BuildCard
                  key={p.id} p={p} onOpen={() => openInterior(p.id)}
                  repoSync={repoSync[p.id]}
                  onRemove={route === null ? null : () => {
                    if (route === 'local') handleRemoveLocalOnly(p);
                    else setRemoving(p);
                  }}
                />
              );
            })}
            <button className="pj-newbuild" onClick={() => setView({ kind: 'wizard' })}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
              Start a new build
              <span className="small" style={{ fontWeight: 400 }}>Idea → shaping → requirements → schedule</span>
            </button>
          </div>

          {/* Removed builds — the other half of "nothing is deleted". A promise
              of reversibility with no visible way to reverse it is not a
              promise. Rendered only when there is something to restore. */}
          {archived.length > 0 && (
            <div className="pjb-archived">
              <div className="pjb-archived-h">Removed builds</div>
              {archived.map((a) => (
                <div className="pjb-archived-row" key={a.id}>
                  <span className="pjb-archived-nm">{a.name || 'Unnamed build'}</span>
                  <button type="button" className="pw-act skip" onClick={() => void handleRestore(a.id)}>
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}

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
            {/*
              COUNT THE STUDENT'S BUILDS, NOT THE FIXTURE. `projects` always
              carries the seeded training example — `read()` re-seeds
              `sample-salon` whenever it is missing — so `projects.length` read
              one too high at every value: 0 real builds showed "1", 1 showed
              "2", 2 showed "3". That is the "Active builds: 2 while the API
              returned 1" report; it was never a stale cache, it was a training
              fixture being counted as a build the student owns.
            */}
            <div className="te-stat"><span className="lab">Active builds</span><span className="num">{ownBuilds.length}</span></div>
            {projects.map((p) => {
              const prog = projectProgress(p);
              return (
                <button key={p.id} className="pj-sidebuild" onClick={() => openInterior(p.id)}>
                  <span className="pj-sb-ic" style={{ background: p.accent }}><svg viewBox="0 0 24 24" fill="none"><path d={p.icon} stroke="#fff" strokeWidth="2" strokeLinejoin="round" /></svg></span>
                  <span className="pj-sb-t">
                    {/*
                      The example still shows — it is a worked build a student
                      can open and learn the shape from, which is its whole job —
                      but it is named as one. Sitting unlabelled in "Your builds"
                      it read as the student's own work, which is the other half
                      of the same miscount.
                    */}
                    <span className="nm">{p.name}{p.sample && <span className="pj-sb-tag">example</span>}</span>
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

      {removing && (
        <ArchiveProjectDialog
          projectId={removing.pipelineProjectId || removing.id}
          fallbackName={removing.name}
          onCancel={() => setRemoving(null)}
          onArchived={() => { void handleArchived(removing); }}
        />
      )}
    </div>
      )}
    </PortalShell>
  );
};

export default ProjectsPage;
