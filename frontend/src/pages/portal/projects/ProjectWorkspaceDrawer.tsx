import React, { useCallback, useEffect, useState } from 'react';
import Drawer from '../../../components/workspace/Drawer';
import { StudentProject, ProjectTask, markTaskDone, skipTask, isTaskBlocked } from './projectsStore';
import { buildProjectTaskPrompt } from './projectWorkspacePrompt';
import { useIsExplorer } from '../useIsExplorer';
import {
  DELIVERY_MODES, DeliveryModeId, loadDeliveryMode, saveDeliveryMode,
} from '../../../services/deliveryModes';
import {
  WorkspaceRepoView, getWorkspaceRepo, provisionWorkspaceRepo, syncWorkspaceRepo,
} from '../../../services/workspaceRepoApi';

// The right-side WORKSPACE drawer that replaces the inline task-detail
// expansion on the Projects page. Sections (spec order):
//   1) delivery-mode selector (persisted to the student's profile)
//   2) build context — owner & requirement
//   3) acceptance
//   4) "Your workspace repo" (Part B — the only part that calls the backend)
//   5) a your-context textarea (persisted per task in localStorage)
//   + a TRUNCATED, scrollable <pre> prompt preview (never the whole prompt).
// Footer: Close / Mark done / Copy prompt.
//
// Content is wrapped in `.pj-root pw-body` so the `.pw-*` rules in projects.css
// (which are scoped under `.pj-root`) resolve inside the Drawer, which renders
// at the document root outside the page's own `.pj-root`.

interface Props {
  project: StudentProject;
  task: ProjectTask | null;
  open: boolean;
  onClose: () => void;
}

const NOTES_KEY_PREFIX = 'te_task_notes_v1:';

function loadNotes(projectId: string, taskId: string): string {
  try {
    return localStorage.getItem(`${NOTES_KEY_PREFIX}${projectId}:${taskId}`) || '';
  } catch {
    return '';
  }
}
function saveNotes(projectId: string, taskId: string, notes: string): void {
  try {
    localStorage.setItem(`${NOTES_KEY_PREFIX}${projectId}:${taskId}`, notes);
  } catch {
    /* ignore */
  }
}

const ProjectWorkspaceDrawer: React.FC<Props> = ({ project, task, open, onClose }) => {
  const demo = useIsExplorer();
  const [modeId, setModeId] = useState<DeliveryModeId>(() => loadDeliveryMode());
  const [notes, setNotes] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Repo state (Part B). Fails soft — no backend/auth just leaves it unprovisioned.
  const [repo, setRepo] = useState<WorkspaceRepoView | null>(null);
  const [repoLoading, setRepoLoading] = useState(false);
  const [ghLogin, setGhLogin] = useState('');
  const [repoBusy, setRepoBusy] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);

  // Load per-task notes when the task changes / drawer opens.
  useEffect(() => {
    if (task) setNotes(loadNotes(project.id, task.id));
  }, [project.id, task]);

  // Fetch the repo on open (fail soft).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRepoError(null);
    setRepoLoading(true);
    getWorkspaceRepo()
      .then((r) => { if (!cancelled) setRepo(r); })
      .catch(() => { if (!cancelled) setRepo(null); }) // no backend/auth → stay unprovisioned
      .finally(() => { if (!cancelled) setRepoLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  const onNotesChange = useCallback((v: string) => {
    setNotes(v);
    if (task) saveNotes(project.id, task.id, v);
  }, [project.id, task]);

  const onPickMode = useCallback((id: DeliveryModeId) => {
    setModeId(id);
    saveDeliveryMode(id);
  }, []);

  const doProvision = useCallback(async () => {
    setRepoError(null);
    setRepoBusy(true);
    try {
      const r = await provisionWorkspaceRepo(ghLogin.trim());
      setRepo(r);
    } catch (err: any) {
      setRepoError(err?.response?.data?.error || 'Could not create your repo. Check the username and try again.');
    } finally {
      setRepoBusy(false);
    }
  }, [ghLogin]);

  const doSync = useCallback(async () => {
    setRepoError(null);
    setRepoBusy(true);
    try {
      const r = await syncWorkspaceRepo();
      setRepo(r);
    } catch (err: any) {
      setRepoError(err?.response?.data?.error || 'Sync failed. Make sure you have pushed your work.');
    } finally {
      setRepoBusy(false);
    }
  }, []);

  // The workspace must NEVER open for a blocked task (dependency gate). The
  // interior already refuses to resolve one, but guard here too (defense in depth).
  if (!task || isTaskBlocked(project, task).blocked) return null;

  const req = task.req ? project.reqs.find((r) => r.id === task.req) : null;
  const done = task.state === 'done';
  const promptRepo = repo && repo.provisioned
    ? { repo_url: repo.repo_url, repo_owner: repo.repo_owner, repo_name: repo.repo_name }
    : null;
  const prompt = buildProjectTaskPrompt(project, task, listNameFor(project, task), modeId, notes, promptRepo);

  const copyPrompt = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  // Footer reuses the SAME shared action-button styles/colors as the hero + cards
  // (.pw-act.copy/.done/.skip), so the set stays consistent. Open Workspace is
  // omitted here — you are already inside the workspace — and Close replaces it,
  // keeping a consistent 4-button footer. Wrapped in `.pj-root` so the
  // `.pj-root`-scoped `.pw-act` rules resolve (the Drawer renders the footer at
  // the document root, outside the page's own `.pj-root`).
  const lock = demo ? 'Demo — enroll to build for real' : undefined;
  const footer = (
    <div className="pj-root pw-acts" style={{ margin: 0 }}>
      <button type="button" className={`pw-act copy${copied ? ' ok' : ''}`} onClick={copyPrompt} disabled={demo} title={lock}>
        {copied ? 'Copied' : 'Copy Prompt'}
      </button>
      {!done && (
        <button type="button" className="pw-act done" onClick={() => { markTaskDone(project.id, task.id); onClose(); }} disabled={demo} title={lock}>
          Mark Done
        </button>
      )}
      {!done && (
        <button type="button" className="pw-act skip" onClick={() => { skipTask(project.id, task.id); onClose(); }} disabled={demo} title={lock}>
          Skip
        </button>
      )}
      <button type="button" className="pw-act close" onClick={onClose}>Close</button>
    </div>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={520}
      eyebrow="Workspace"
      title={task.title}
      titleBadge={done ? { text: 'Done', tone: 'good' } : undefined}
      subtitle={task.what}
      footer={footer}
    >
      <div className="pj-root pw-body">
        {/* 1) delivery-mode selector */}
        <section className="pw-sec">
          <h5 className="pw-h">How do you want to work?</h5>
          <div className="pw-modes">
            {DELIVERY_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`pw-mode${m.id === modeId ? ' sel' : ''}`}
                onClick={() => onPickMode(m.id)}
                aria-pressed={m.id === modeId}
              >
                <span className="pw-mode-emoji" aria-hidden="true">{m.emoji}</span>
                <span className="pw-mode-t">
                  <span className="pw-mode-label">{m.label}</span>
                  <span className="pw-mode-blurb">{m.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* 2) build context — owner & requirement */}
        <section className="pw-sec">
          <h5 className="pw-h">Owner &amp; requirement</h5>
          <div className="pw-kv">
            {task.owner && <div className="pw-b"><b>Agent</b> {task.owner}</div>}
            {task.release && <div className="pw-b"><b>Release</b> {task.release}</div>}
            {req && (
              <div className="pw-b">
                <b>{task.req}</b> {req.name} <span className={`pj-st ${req.state}`}>{req.state}</span>
              </div>
            )}
            {!task.owner && !task.release && !req && <div className="pw-muted">No owner or requirement linked yet.</div>}
          </div>
        </section>

        {/* 3) acceptance */}
        {task.acceptance && task.acceptance.length > 0 && (
          <section className="pw-sec">
            <h5 className="pw-h">Acceptance · demo script + build-loop stop</h5>
            <ul className="pw-accept">
              {task.acceptance.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </section>
        )}

        {/* 4) your workspace repo (Part B) */}
        <section className="pw-sec">
          <h5 className="pw-h">Your workspace repo</h5>
          {repoLoading ? (
            <div className="pw-muted">Checking your repo…</div>
          ) : repo && repo.provisioned ? (
            <div className="pw-repo">
              <a className="pw-repo-link" href={repo.repo_url || '#'} target="_blank" rel="noreferrer">
                {repo.repo_owner}/{repo.repo_name}
              </a>
              <div className="pw-repo-meta">
                {typeof repo.file_count === 'number' && <span>{repo.file_count} files</span>}
                {repo.last_sync && <span>synced {new Date(repo.last_sync).toLocaleString()}</span>}
                {!repo.last_sync && <span>not synced yet</span>}
              </div>
              <button type="button" className="pw-btn berry sm" disabled={repoBusy} onClick={doSync}>
                {repoBusy ? 'Syncing…' : 'Commit & sync'}
              </button>
              <p className="pw-hint">Commit and push from your machine, then sync to pull your latest state here.</p>
            </div>
          ) : (
            <div className="pw-repo">
              <p className="pw-hint">Create a private repo under ColaberryIntern. You will be added as a collaborator so you can push your work.</p>
              <div className="pw-repo-form">
                <input
                  className="txt"
                  placeholder="Your GitHub username"
                  value={ghLogin}
                  onChange={(e) => setGhLogin(e.target.value)}
                  aria-label="Your GitHub username"
                />
                <button type="button" className="pw-btn cherry sm" disabled={repoBusy || !ghLogin.trim()} onClick={doProvision}>
                  {repoBusy ? 'Creating…' : 'Create my repo'}
                </button>
              </div>
            </div>
          )}
          {repoError && <div className="pw-error">{repoError}</div>}
        </section>

        {/* 5) your-context textarea */}
        <section className="pw-sec">
          <h5 className="pw-h">Your context</h5>
          <textarea
            className="pw-notes"
            rows={3}
            placeholder="Anything Claude Code should know before starting this task…"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
          />
        </section>

        {/* truncated + scrollable prompt preview */}
        <section className="pw-sec">
          <h5 className="pw-h">Claude Code prompt · preview</h5>
          <pre className="pw-prompt">{prompt}</pre>
          <p className="pw-hint">Scroll to read it all — the full prompt copies with the button below.</p>
        </section>
      </div>
    </Drawer>
  );
};

// Find the human list name for a task (the interior passes it in via cards, but
// the drawer is opened by id, so re-derive it from the project's lists).
function listNameFor(project: StudentProject, task: ProjectTask): string {
  for (const l of project.lists) {
    if (l.tasks.some((t) => t.id === task.id)) return l.name;
  }
  return 'This build';
}

export default ProjectWorkspaceDrawer;
