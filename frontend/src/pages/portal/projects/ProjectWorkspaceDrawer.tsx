import React, { useEffect, useMemo, useRef, useState } from 'react';
import Drawer from '../../../components/workspace/Drawer';
import { StudentProject, ProjectTask } from './projectsStore';
import { DELIVERY_MODES, getModeId, setModeId } from '../../../services/deliveryModes';
import { buildProjectTaskPrompt } from './projectWorkspacePrompt';
import {
  getWorkspaceRepo, provisionWorkspaceRepo, syncWorkspaceRepo, WorkspaceRepo,
} from '../../../services/workspaceRepoApi';

// The project workspace — a right-side slide-over (same shell as the labs /
// Readiness / Coverage drawers) that replaces the old inline "detail falls
// below" expansion. It carries the delivery-mode selector (UI/UX, Visual, …),
// the build context, a your-context box, the student's workspace repo (provision
// + commit/sync), and a TRUNCATED, scrollable prompt preview — never the whole
// prompt at once.

interface Props {
  open: boolean;
  project: StudentProject;
  task: ProjectTask | null;
  listName: string;
  onClose: () => void;
  onMarkDone: (taskId: string) => void;
}

const notesKey = (taskId: string) => `pw-notes-${taskId}`;

function errMsg(e: any): string {
  return e?.response?.data?.error || e?.message || '';
}

const ProjectWorkspaceDrawer: React.FC<Props> = ({ open, project, task, listName, onClose, onMarkDone }) => {
  const [mode, setMode] = useState<string>(() => getModeId());
  const [notes, setNotes] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // the student's workspace repo (ONE per student, across all builds)
  const [repo, setRepo] = useState<WorkspaceRepo | null>(null);
  const [repoLoaded, setRepoLoaded] = useState(false);
  const [ghLogin, setGhLogin] = useState('');
  const [busy, setBusy] = useState<'' | 'provision' | 'sync'>('');
  const [repoErr, setRepoErr] = useState('');

  // Keep the last opened task so the body stays populated during the slide-out.
  const shownRef = useRef<{ task: ProjectTask; listName: string } | null>(null);
  if (task) shownRef.current = { task, listName };
  const shown = task ? { task, listName } : shownRef.current;

  // Load the student's saved notes for this task when it opens.
  useEffect(() => {
    if (!open || !task) return;
    try { setNotes(localStorage.getItem(notesKey(task.id)) || ''); } catch { setNotes(''); }
  }, [open, task]);

  // Fetch the workspace repo once when the drawer first opens. Fails soft: if
  // there's no backend/auth (e.g. the local demo), just show the connect state.
  useEffect(() => {
    if (!open || repoLoaded) return;
    setRepoLoaded(true);
    getWorkspaceRepo()
      .then(setRepo)
      .catch(() => setRepo({ connected: false, provisioned: false }));
  }, [open, repoLoaded]);

  const onNotes = (v: string) => {
    setNotes(v);
    if (shown) { try { localStorage.setItem(notesKey(shown.task.id), v); } catch { /* ignore */ } }
  };

  const pickMode = (id: string) => { setMode(id); setModeId(id); };

  const prompt = useMemo(() => {
    if (!shown) return '';
    const repoRef = repo?.provisioned && repo.repo_url
      ? { url: repo.repo_url, fullName: `${repo.repo_owner}/${repo.repo_name}` }
      : undefined;
    return buildProjectTaskPrompt(project, shown.task, shown.listName, mode, notes, repoRef);
  }, [project, shown, mode, notes, repo]);

  const copyPrompt = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const doProvision = async () => {
    if (!ghLogin.trim()) return;
    setRepoErr(''); setBusy('provision');
    try { setRepo(await provisionWorkspaceRepo(ghLogin.trim())); }
    catch (e) { setRepoErr(errMsg(e) || 'Could not provision your repo.'); }
    finally { setBusy(''); }
  };

  const doSync = async () => {
    setRepoErr(''); setBusy('sync');
    try { setRepo(await syncWorkspaceRepo()); }
    catch (e) { setRepoErr(errMsg(e) || 'Sync failed — commit + push first, then try again.'); }
    finally { setBusy(''); }
  };

  if (!shown) return <Drawer open={false} onClose={onClose} title="Workspace">{null}</Drawer>;
  const t = shown.task;
  const req = t.req ? project.reqs.find((r) => r.id === t.req) : undefined;
  const done = t.state === 'done';

  const footer = (
    <>
      <button type="button" className="pw-btn ghost" onClick={onClose}>Close</button>
      {!done && (
        <button type="button" className="pw-btn leaf" onClick={() => { onMarkDone(t.id); onClose(); }}>
          Mark done
        </button>
      )}
      <button type="button" className={`pw-btn berry${copied ? ' ok' : ''}`} onClick={copyPrompt}>
        {copied ? '✓ Copied' : 'Copy prompt'}
      </button>
    </>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow={`WORKSPACE · ${t.storyId || (t.release || shown.listName)}`}
      title={t.title}
      subtitle={t.what}
      titleBadge={done ? { text: 'Done', tone: 'good' } : undefined}
      width={480}
      footer={footer}
    >
      {/* delivery-mode selector — the "parameters" that change how Claude responds */}
      <div className="pw-sec">
        <div className="pw-h">How should Claude respond?</div>
        <div className="pw-modes">
          {DELIVERY_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`pw-mode${mode === m.id ? ' active' : ''}`}
              style={mode === m.id ? { borderColor: project.accent, boxShadow: `inset 0 0 0 1px ${project.accent}` } : undefined}
              title={m.blurb}
              onClick={() => pickMode(m.id)}
            >
              <span className="em">{m.emoji}</span>{m.label}
            </button>
          ))}
        </div>
        <div className="pw-modeblurb">{DELIVERY_MODES.find((m) => m.id === mode)?.blurb}</div>
      </div>

      {/* build context */}
      <div className="pw-sec">
        <div className="pw-h">Owner &amp; requirement</div>
        <div className="pw-kv">
          {t.owner && <div><b>Agent</b> {t.owner}</div>}
          {req ? <div><b>{req.id}</b> {req.name} <span className={`pj-st ${req.state}`}>{req.state}</span></div>
            : t.req && <div><b>Requirement</b> {t.req}</div>}
          <div><b>Release</b> {t.release || shown.listName}</div>
        </div>
      </div>

      {t.acceptance && t.acceptance.length > 0 && (
        <div className="pw-sec">
          <div className="pw-h">Acceptance · demo script + build-loop stop</div>
          <ul className="pw-accept">{t.acceptance.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}

      {/* your workspace repo — where files live + where commits sync from */}
      <div className="pw-sec">
        <div className="pw-h">Your workspace repo</div>
        {!repoLoaded ? (
          <div className="pw-note">Checking your workspace…</div>
        ) : repo?.provisioned && repo.repo_url ? (
          <>
            <a className="pw-repo" href={repo.repo_url} target="_blank" rel="noreferrer">{repo.repo_owner}/{repo.repo_name}</a>
            <div className="pw-note">
              Clone it, build here in Claude Code, then commit + push when the acceptance passes.
              {typeof repo.file_count === 'number' ? ` · ${repo.file_count} files` : ''}
              {repo.last_sync ? ` · synced ${new Date(repo.last_sync).toLocaleDateString()}` : ''}
            </div>
            <button type="button" className="pw-btn dark sm" disabled={busy === 'sync'} onClick={doSync}>
              {busy === 'sync' ? 'Syncing…' : 'Commit & sync'}
            </button>
          </>
        ) : (
          <>
            <div className="pw-note">
              Get a private repo (created under ColaberryIntern) that holds all your files and artifacts, so
              this prompt can point Claude Code at your files. Enter your GitHub username — we&apos;ll create it
              and add you as a collaborator.
            </div>
            <div className="pw-repoform">
              <input
                className="pw-input"
                placeholder="your-github-username"
                value={ghLogin}
                onChange={(e) => setGhLogin(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doProvision(); }}
              />
              <button type="button" className="pw-btn berry sm" disabled={busy === 'provision' || !ghLogin.trim()} onClick={doProvision}>
                {busy === 'provision' ? 'Creating…' : 'Create my repo'}
              </button>
            </div>
          </>
        )}
        {repoErr && <div className="pw-err">{repoErr}</div>}
      </div>

      {/* your context */}
      <div className="pw-sec">
        <div className="pw-h">Your context</div>
        <textarea
          className="pw-notes"
          rows={3}
          placeholder="Anything you already know — a decision, a constraint, files to reuse, a follow-up question…"
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
        />
      </div>

      {/* the prompt — truncated + scrollable, never the whole thing at once */}
      <div className="pw-sec">
        <div className="pw-h pw-h-row">
          <span>Claude Code prompt</span>
          <button type="button" className={`pw-copy${copied ? ' ok' : ''}`} onClick={copyPrompt}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <pre className="pw-prompt">{prompt}</pre>
        <div className="pw-note">Scroll to read the full prompt, or just copy it and paste into Claude Code.</div>
      </div>
    </Drawer>
  );
};

export default ProjectWorkspaceDrawer;
