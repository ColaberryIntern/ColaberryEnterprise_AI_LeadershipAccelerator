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
        <span className={`rt-pill ${done ? 'done' : ''}`} style={{ marginLeft: 'auto' }}>{done ? '✓ Completed' : blocked.blocked ? 'Waiting on another task' : 'In progress'}</span>
      </header>

      <div className="rt-body">
        {/* CENTER — the story, then the prompt that builds it */}
        <main className="rt-mid">
          {blocked.blocked && (
            <div className="rt-card" style={{ marginBottom: 14 }}>
              <div className="rt-lab">Not yet</div>
              <p className="rt-muted" style={{ margin: 0 }}>
                This one waits on {blocked.waitingOn.join(', ')}. Finish that first — the order is what keeps the build working end to end.
              </p>
            </div>
          )}

          <section className="rt-card">
            <div className="rt-lab">What you are building</div>
            <p style={{ margin: '6px 0 0' }}>{task.what || task.title}</p>
            {task.req && <p className="rt-muted" style={{ marginTop: 10 }}>Fulfils <b>{task.req}</b></p>}
          </section>

          {task.acceptance && task.acceptance.length > 0 && (
            <section className="rt-card" style={{ marginTop: 14 }}>
              <div className="rt-lab">Done means</div>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {task.acceptance.map((a, i) => <li key={i} style={{ marginBottom: 6 }}>{a}</li>)}
              </ul>
            </section>
          )}

          <section className="rt-card" style={{ marginTop: 14 }}>
            <div className="rt-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="rt-lab" style={{ margin: 0 }}>Your Claude Code prompt</div>
              <button className={`rt-btn${copied ? ' pri' : ''}`} onClick={copyPrompt} disabled={!prompt}>
                {copied ? 'Copied' : 'Copy prompt'}
              </button>
            </div>
            <pre className="rt-in mono" style={{ marginTop: 10, maxHeight: 340, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {prompt || 'This task has no prompt yet.'}
            </pre>
          </section>

          <section className="rt-card" style={{ marginTop: 14 }}>
            <div className="rt-lab">Your workspace repo</div>
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
