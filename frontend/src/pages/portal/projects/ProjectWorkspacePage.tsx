import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import portalApi from '../../../utils/portalApi';
import { runtimeCss } from '../runtime/runtimeKit';
import {
  getProject, markTaskDone, skipTask, isTaskBlocked, projectProgress,
  StudentProject, ProjectTask,
} from './projectsStore';
import {
  WorkspaceRepoView, getWorkspaceRepo, provisionWorkspaceRepo, syncWorkspaceRepo,
} from '../../../services/workspaceRepoApi';

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

type Msg = { role: 'user' | 'assistant'; content: string };
type Mode = 'ask' | 'hint' | 'explain' | 'review';

const ProjectWorkspacePage: React.FC = () => {
  const { projectId = '', taskId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = ((location.state as { from?: string } | null)?.from) || '/portal/projects';
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
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [mentorInput, setMentorInput] = useState('');
  const [repo, setRepo] = useState<WorkspaceRepoView | null>(null);
  const [ghLogin, setGhLogin] = useState('');
  const [repoError, setRepoError] = useState<string | null>(null);
  const mentorEnd = useRef<HTMLDivElement | null>(null);

  // The prompt opens CLOSED. At half screen — the posture this page is actually
  // used in, editor in the other half — a 340px <pre> IS the column, so the page
  // led with the thing a student pastes instead of the thing they have to
  // understand before pasting it. Reset per task so every story reads the same
  // way the last one did.
  const [promptOpen, setPromptOpen] = useState(false);
  useEffect(() => { setPromptOpen(false); }, [taskId]);

  // Acceptance ticks are the student's own working memory ("have I got that one
  // yet?"), so they survive a reload. Deliberately localStorage and NOT the
  // project store: the server knows nothing about them, and putting them in the
  // store would dress them up as reportable progress. Only "Mark done" reports.
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

  const task: ProjectTask | null = useMemo(() => {
    if (!project) return null;
    const all = project.lists.flatMap((l) => l.tasks);
    return all.find((t) => t.storyId === taskId) || all.find((t) => t.id === taskId) || null;
  }, [project, taskId]);

  const listName = useMemo(() => {
    if (!project || !task) return null;
    return project.lists.find((l) => l.tasks.some((t) => t.id === task.id))?.name ?? null;
  }, [project, task]);

  // Greet once the task is known, so the opening line can name it.
  useEffect(() => {
    if (!task || msgs.length) return;
    setMsgs([{
      role: 'assistant',
      content: `I'm Cory, your mentor for "${task.title}". Ask me anything, or hit a shortcut below — I'll coach, not hand you answers.`,
    }]);
  }, [task, msgs.length]);

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
    const history = msgs.slice(-12).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: 'user', content: message }]);
    setMentorInput('');
    setBusy('mentor');
    try {
      const { data } = await portalApi.post(
        `/api/portal/projects/${projectId}/tasks/${encodeURIComponent(task.storyId || task.id)}/mentor`,
        { mode, message, history },
      );
      setMsgs((m) => [...m, { role: 'assistant', content: data?.reply || data?.message || 'I could not answer that one.' }]);
    } catch {
      // Say so rather than dropping the turn silently — a mentor that goes
      // quiet reads as a mentor that ignored you.
      setMsgs((m) => [...m, { role: 'assistant', content: 'I could not reach the mentor just then. Try again in a moment — your work is saved.' }]);
    } finally {
      setBusy('');
    }
  }, [msgs, projectId, task]);

  const doProvision = useCallback(async () => {
    setRepoError(null); setBusy('repo');
    try { setRepo(await provisionWorkspaceRepo(projectId, ghLogin.trim())); }
    catch (err: any) { setRepoError(err?.response?.data?.error || 'Could not create your repo. Check the username and try again.'); }
    finally { setBusy(''); }
  }, [projectId, ghLogin]);

  const doSync = useCallback(async () => {
    setRepoError(null); setBusy('repo');
    try { setRepo(await syncWorkspaceRepo(projectId)); }
    catch (err: any) { setRepoError(err?.response?.data?.error || 'Sync failed. Make sure you have pushed your work.'); }
    finally { setBusy(''); }
  }, [projectId]);

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
  const done = task.state === 'done';
  const prog = projectProgress(project);
  const prompt = task.prompt || '';
  const acceptance = task.acceptance ?? [];
  const tickedCount = acceptance.reduce((n, _a, i) => (ticked[i] ? n + 1 : n), 0);
  // "How to build it" is step 1 when there is no acceptance list to be step 1 —
  // a lone step numbered 2 reads like something failed to load.
  const buildStepNo = acceptance.length ? 2 : 1;

  const copyPrompt = () => {
    if (navigator.clipboard && prompt) navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

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
          {/* Only rendered once the student's Command Center is actually running.
              An <a> rather than a <button> because it navigates: middle-click,
              copy-link and the screen-reader link role all come free, and a
              button faking navigation gives up all three. The URL is
              https-validated server-side (projectTreeDto.commandCenterUrl), so
              there is nothing left to check here. */}
          {project.commandCenterUrl && (
            <a
              className="rt-btn"
              href={project.commandCenterUrl}
              target="_blank"
              rel="noreferrer"
              title="Open your Command Center in a new tab"
            >
              Command Center ↗
            </a>
          )}
          <span className={`rt-pill ${done ? 'done' : ''}`}>{done ? '✓ Completed' : blocked.blocked ? 'Waiting on another task' : 'In progress'}</span>
        </div>
      </header>

      <div className="rt-body">
        {/* CENTER — read in one order: what this story is, what done means,
            then how to build it. */}
        <main className="rt-mid">
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

          {/* WHAT DONE MEANS — checkable, because acceptance criteria are a
              pre-flight the student walks, not a paragraph they re-read. The
              count in the header answers "how close am I?" without scrolling. */}
          {acceptance.length > 0 && (
            <section className="rt-step">
              <div className="rt-step-h">
                <span className="rt-step-n">1</span>
                <span className="rt-step-t">Done means</span>
                <span className="rt-step-c">{tickedCount} of {acceptance.length}</span>
              </div>
              <div className="rt-card">
                <ul className="rt-acc">
                  {acceptance.map((a, i) => (
                    <li key={i}>
                      <label>
                        <input type="checkbox" checked={!!ticked[i]} onChange={() => toggleAcc(i)} />
                        <span>{a}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* HOW TO BUILD IT — the prompt and the repo are the same job (get to
              work), so they sit under one heading instead of reading as two
              more peers of the story. */}
          <section className="rt-step">
            <div className="rt-step-h">
              <span className="rt-step-n">{buildStepNo}</span>
              <span className="rt-step-t">How to build it</span>
            </div>

            <div className="rt-card">
              <div className="rt-prompt-h">
                <div className="rt-lab" style={{ margin: 0 }}>Your Claude Code prompt</div>
                <div className="rt-prompt-acts">
                  {/* Copy is ALWAYS visible: collapsing the prompt must not cost
                      the student the one action they came here for. */}
                  <button className={`rt-btn${copied ? ' pri' : ''}`} onClick={copyPrompt} disabled={!prompt}>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    className="rt-btn"
                    onClick={() => setPromptOpen((o) => !o)}
                    aria-expanded={promptOpen}
                    aria-controls="rt-prompt-body"
                    disabled={!prompt}
                  >
                    {promptOpen ? 'Hide the full prompt' : 'Show the full prompt'}
                  </button>
                </div>
              </div>
              {promptOpen ? (
                <pre id="rt-prompt-body" className="rt-in mono rt-prompt-full">
                  {prompt || 'This task has no prompt yet.'}
                </pre>
              ) : (
                // A two-line clamp, so the student can still recognise the
                // prompt without it swallowing the column.
                <p id="rt-prompt-body" className="rt-prompt-peek">
                  {prompt || 'This task has no prompt yet.'}
                </p>
              )}
            </div>

            <div className="rt-card">
              <div className="rt-lab" style={{ marginTop: 0 }}>Your workspace repo</div>
              {repo?.provisioned ? (
                <>
                  <p style={{ margin: '8px 0' }}>
                    <a href={repo.repo_url || '#'} target="_blank" rel="noreferrer">{repo.repo_owner}/{repo.repo_name}</a>
                    {typeof repo.file_count === 'number' && <span className="rt-muted"> · {repo.file_count} files</span>}
                  </p>
                  <button className="rt-btn" disabled={busy === 'repo'} onClick={doSync}>{busy === 'repo' ? 'Syncing…' : 'Sync from GitHub'}</button>
                  {repo.recent_commits?.length > 0 && (
                    <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                      {repo.recent_commits.slice(0, 3).map((c) => (
                        <li key={c.sha} className="rt-muted" style={{ marginBottom: 4 }}>{c.message}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  <p className="rt-muted" style={{ margin: '8px 0' }}>
                    No repo yet. Give me your GitHub username and I'll create a private one and add you to it.
                  </p>
                  <div className="rt-row">
                    <input className="rt-in" value={ghLogin} onChange={(e) => setGhLogin(e.target.value)} placeholder="your-github-username" />
                    <button className="rt-btn pri" disabled={busy === 'repo' || !ghLogin.trim()} onClick={doProvision}>
                      {busy === 'repo' ? 'Creating…' : 'Create my repo'}
                    </button>
                  </div>
                </>
              )}
              {repoError && <p style={{ color: 'var(--cherry, #E5121D)', margin: '8px 0 0' }}>{repoError}</p>}
            </div>
          </section>

          {!done && !blocked.blocked && (
            <div className="rt-row" style={{ marginTop: 16 }}>
              <button
                className="rt-btn cta"
                onClick={() => { markTaskDone(project.id, task.id); setTick((n) => n + 1); }}
              >
                Mark done
              </button>
              <button
                className="rt-btn"
                onClick={() => { skipTask(project.id, task.id); setTick((n) => n + 1); goBack(); }}
              >
                Skip
              </button>
            </div>
          )}
        </main>

        {/* RIGHT — the mentor, same coach the classroom uses */}
        <aside className="rt-mentor">
          <div className="rt-mentor-h"><span className="rt-dot" /> Cory</div>
          <div className="rt-thread">
            {msgs.map((m, i) => <div key={i} className={`rt-msg ${m.role}`}>{m.content}</div>)}
            <div ref={mentorEnd} />
          </div>
          <div className="rt-modes">
            {(['hint', 'explain', 'review'] as const).map((mo) => (
              <button
                key={mo}
                className="rt-chip"
                disabled={busy === 'mentor'}
                onClick={() => ask(mo, mo === 'review'
                  ? 'Review what I have built for this story so far.'
                  : `Give me a ${mo} for this story.`)}
              >
                {mo}
              </button>
            ))}
          </div>
          <div className="rt-ask">
            <input
              className="rt-in"
              value={mentorInput}
              onChange={(e) => setMentorInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && mentorInput.trim() && ask('ask', mentorInput)}
              placeholder="Ask your mentor…"
            />
            <button className="rt-btn pri" disabled={busy === 'mentor' || !mentorInput.trim()} onClick={() => ask('ask', mentorInput)}>Send</button>
          </div>
        </aside>
      </div>

      {/* BOTTOM — where this build stands */}
      <footer className="rt-bar">
        <div className="rt-stat"><span className="l">Build</span><span className="v sm">{project.name}</span></div>
        <div className="rt-stat"><span className="l">Release</span><span className="v sm">{listName || '—'}</span></div>
        <div className="rt-stat"><span className="l">Tasks done</span><span className="v">{prog.done}<small>/{prog.total}</small></span></div>
        <div className="rt-stat"><span className="l">Progress</span><span className="v">{prog.pct}%</span></div>
        {repo?.provisioned && <div className="rt-stat"><span className="l">GitHub</span><span className="v">{repo.recent_commits?.length ?? 0}<small> commits</small></span></div>}
      </footer>
    </div>
  );
};

export default ProjectWorkspacePage;
