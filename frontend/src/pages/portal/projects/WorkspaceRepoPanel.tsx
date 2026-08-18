import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  WorkspaceRepoView, ConnectStateView, ConnectApiError, connectErrorOf,
  startRepoConnect, confirmRepoConnect, provisionWorkspaceRepo,
  syncWorkspaceRepo, downloadDocsBundle,
} from '../../../services/workspaceRepoApi';
import WebhookSetupBlock from './WebhookSetupBlock';

/**
 * WorkspaceRepoPanel — the step that connects a student's EXISTING folder to
 * the platform.
 *
 * ## The copy assumes they already started
 *
 * On day one of class students set up a local folder with their own CLAUDE.md.
 * They are already working in it. This panel used to offer one thing — "give me
 * your GitHub username and I'll create you a repo" — which hands a student a
 * SECOND home for one project and leaves them to reconcile the two. Every
 * sentence here is written for someone with a folder open in another window.
 * Nothing says "start", "new project", or "clone".
 *
 * ## Two doors, in order of how many students need them
 *
 * **Connect the repo you already have** leads, because student build repos are
 * student-owned (decision, 2026-08-14): the platform holds a pointer and the
 * record of what was finished, never the code. **Have one created** is folded
 * away underneath, for a student whose folder is not on GitHub yet — and even
 * that path adopts their existing folder rather than starting a new one.
 *
 * A download is offered third, so someone with no GitHub account at all can
 * still get the documents their prompts reference today. It states plainly that
 * verification and points need a connected repo, because they do.
 */

type Props = {
  projectId: string;
  repo: WorkspaceRepoView | null;
  onRepoChange: (view: WorkspaceRepoView) => void;
  onConnectChange: (connect: ConnectStateView) => void;
};

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 12.5, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
  margin: 0,
};

/** A copyable block of shell. The commands are the deliverable, so Copy is loud. */
const CommandBlock: React.FC<{ label: string; commands: string[] }> = ({ label, commands }) => {
  const [copied, setCopied] = useState(false);
  const text = commands.join('\n');
  const copy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div style={{ marginTop: 10 }}>
      <div className="rt-prompt-h">
        <div className="rt-lab" style={{ margin: 0 }}>{label}</div>
        <button className={`rt-btn${copied ? ' pri' : ''}`} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre className="rt-in" style={mono}>{text}</pre>
    </div>
  );
};

const ErrorNote: React.FC<{ err: ConnectApiError; onConfirmReplace?: () => void }> = ({ err, onConfirmReplace }) => (
  <div style={{ marginTop: 10 }}>
    <p style={{ color: 'var(--cherry, #E5121D)', margin: 0 }}>{err.error}</p>
    {err.error_class === 'RepoRebindRefused' && onConfirmReplace && (
      <button className="rt-btn" style={{ marginTop: 8 }} onClick={onConfirmReplace}>
        Move this build to the new repo anyway
      </button>
    )}
  </div>
);

const WorkspaceRepoPanel: React.FC<Props> = ({ projectId, repo, onRepoChange, onConnectChange }) => {
  const connect = repo?.connect ?? null;
  const state = connect?.state ?? (repo?.connected ? 'connected' : 'not_connected');

  const [refInput, setRefInput] = useState('');
  const refTouched = useRef(false);

  /**
   * Seed the box with the repo already on the row. This is what makes an expired
   * challenge a one-click recovery: the backend degrades `awaiting_proof` to
   * `not_connected` once the token dies but KEEPS the repo, so the student lands
   * here with their own address already filled in rather than retyping it.
   *
   * Seeded from an effect rather than `useState(url)` because the parent loads
   * the repo asynchronously — on first render there is no url to seed from. It
   * runs once and never fights the student for the field afterwards.
   */
  useEffect(() => {
    if (refTouched.current || !connect?.url || state === 'connected') return;
    setRefInput(connect.url);
  }, [connect?.url, state]);

  const editRef = useCallback((value: string) => { refTouched.current = true; setRefInput(value); }, []);
  const [ghLogin, setGhLogin] = useState('');
  const [showFallback, setShowFallback] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState<ConnectApiError | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = useCallback(async (
    tag: string, fallbackMessage: string, fn: () => Promise<void>,
  ) => {
    setErr(null); setNote(null); setBusy(tag);
    try {
      await fn();
    } catch (e: any) {
      setErr(connectErrorOf(e, fallbackMessage));
    } finally {
      setBusy('');
    }
  }, []);

  const doStart = useCallback((confirmReplace = false) => run(
    'connect', 'Could not connect that repo. Check the address and try again.',
    async () => onConnectChange(await startRepoConnect(projectId, refInput.trim(), confirmReplace)),
  ), [run, projectId, refInput, onConnectChange]);

  const doConfirm = useCallback(() => run(
    'confirm', 'Could not check your repo just now. Try again in a moment.',
    async () => onConnectChange(await confirmRepoConnect(projectId)),
  ), [run, projectId, onConnectChange]);

  const doProvision = useCallback(() => run(
    'provision', 'Could not create a repo. Check the username and try again.',
    async () => onConnectChange(await provisionWorkspaceRepo(projectId, ghLogin.trim())),
  ), [run, projectId, ghLogin, onConnectChange]);

  const doSync = useCallback(() => run(
    'sync', 'Sync failed. Make sure you have pushed your work.',
    async () => onRepoChange(await syncWorkspaceRepo(projectId)),
  ), [run, projectId, onRepoChange]);

  const doDownload = useCallback(() => run(
    'download', 'Could not build your document bundle just now.',
    async () => {
      const { blob, filename } = await downloadDocsBundle(projectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      // Revoked on the next tick: revoking synchronously can beat the download
      // in some browsers and produce an empty file.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNote(`Downloaded ${filename}. Unzip it into your project folder. Verification and points still need a connected repo.`);
    },
  ), [run, projectId]);

  // ── connected ─────────────────────────────────────────────────────────────
  if (state === 'connected' && repo?.repo_owner) {
    const lostAccess = connect?.access && connect.access.ok === false;
    return (
      <div className="rt-card">
        <div className="rt-lab" style={{ marginTop: 0 }}>Your repo</div>
        <p style={{ margin: '8px 0' }}>
          <a href={repo.repo_url || '#'} target="_blank" rel="noreferrer">{repo.repo_owner}/{repo.repo_name}</a>
          {typeof repo.file_count === 'number' && <span className="rt-muted"> · {repo.file_count} files</span>}
          {connect?.method === 'byo' && <span className="rt-muted"> · yours</span>}
        </p>

        {lostAccess && (
          <p className="rt-muted" style={{ margin: '8px 0' }}>
            The platform cannot read this repo at the moment. If you renamed it, made it private, or removed
            the platform's access, reconnect it below. <strong>Everything you have already had verified stays
            exactly as it is</strong> — that record lives here, not in the repo.
          </p>
        )}

        {/* PULL-ONLY IS A CHOICE, AND ITS CONSEQUENCE IS THE STUDENT'S TO KNOW.
            The platform holds read access to this repo and nothing more, so it
            never installs the managed block or seeds `.colaberry/progress.json`.
            Left unsaid, that reads to a student as a working connection: they
            press Sync, nothing lands, their agent has no contract to copy, and
            it invents a file the platform cannot read. That is the whole of the
            2026-08-17 failure, and it was silent from end to end.

            Stated plainly here, with the one thing they have to do about it, and
            deliberately not styled as an error — verification, points and the
            whole build work exactly the same on a repo we only read. */}
        {connect?.write_access === 'pull_only' && (
          <p className="rt-muted" style={{ margin: '8px 0' }}>
            <strong>The platform has read-only access to this repo.</strong> That is fine — it reads your
            commits and confirms your stories exactly as normal, and everything you earn is recorded here
            rather than in the repo. It does mean the platform cannot put files INTO your repo, so
            <code> .colaberry/progress.json</code> is yours to create. Open <strong>STORY-000</strong> and
            copy the JSON block under Step 3 — it is generated from the criteria the platform actually
            checks. If you would rather the platform maintained it for you, add it as a collaborator with
            write access and reconnect.
          </p>
        )}

        <div className="rt-row">
          <button className="rt-btn" disabled={busy === 'sync'} onClick={doSync}>
            {busy === 'sync' ? 'Syncing…' : 'Sync from GitHub'}
          </button>
          <button className="rt-btn" onClick={() => { editRef(''); onConnectChange({ ...(connect as ConnectStateView), state: 'not_connected' }); }}>
            {lostAccess ? 'Reconnect' : 'Use a different repo'}
          </button>
        </div>

        {/* One-time plumbing, only offered once a repo is actually connected —
            there is nothing to register a hook against before that. */}
        <WebhookSetupBlock projectId={projectId} repoLabel={`${repo.repo_owner}/${repo.repo_name}`} />

        {repo.recent_commits?.length > 0 && (
          <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
            {repo.recent_commits.slice(0, 3).map((c) => (
              <li key={c.sha} className="rt-muted" style={{ marginBottom: 4 }}>{c.message}</li>
            ))}
          </ul>
        )}
        {err && <ErrorNote err={err} />}
      </div>
    );
  }

  // ── door A, step 2: prove the push ────────────────────────────────────────
  if (state === 'awaiting_proof' && connect?.challenge) {
    return (
      <div className="rt-card">
        <div className="rt-lab" style={{ marginTop: 0 }}>Finish connecting</div>
        <p className="rt-muted" style={{ margin: '8px 0' }}>
          The platform can see <strong>{connect.owner}/{connect.repo}</strong>. Run these in the folder you are
          already working in. They turn it into a git repo if it is not one yet, then push it — which is what
          proves the repo is yours, and the only thing that does.
        </p>
        <p className="rt-muted" style={{ margin: '8px 0' }}>
          <strong>This first push uploads everything in the folder</strong>, not just the connection file — so
          check the <code>git status</code> list before you commit, and keep anything private (a{' '}
          <code>.env</code>, scratch files in <code>tmp/</code>) out of it.
        </p>
        <CommandBlock label={`Run in your project folder`} commands={connect.challenge.commands} />
        <div className="rt-row" style={{ marginTop: 12 }}>
          <button className="rt-btn pri" disabled={busy === 'confirm'} onClick={doConfirm}>
            {busy === 'confirm' ? 'Checking…' : "I've pushed — connect it"}
          </button>
          <button className="rt-btn" onClick={() => { editRef(''); onConnectChange({ ...connect, state: 'not_connected', challenge: null }); }}>
            Use a different repo
          </button>
        </div>
        {err && <ErrorNote err={err} />}
      </div>
    );
  }

  // ── door B, step 2: point the existing folder at the new empty repo ───────
  if (state === 'awaiting_push' && connect?.adopt_commands) {
    return (
      <div className="rt-card">
        <div className="rt-lab" style={{ marginTop: 0 }}>Point your folder at it</div>
        <p className="rt-muted" style={{ margin: '8px 0' }}>
          <strong>{connect.owner}/{connect.repo}</strong> is created and empty, and you have push access.
          Run these in the folder you already have — your files and your whole history go up exactly as they
          are. Nothing is overwritten and nothing is forced. <strong>Everything in the folder goes up</strong>,
          so check the <code>git status</code> list before you commit.
        </p>
        <CommandBlock label="Run in your project folder" commands={connect.adopt_commands} />
        <div className="rt-row" style={{ marginTop: 12 }}>
          <button className="rt-btn pri" disabled={busy === 'sync'} onClick={doSync}>
            {busy === 'sync' ? 'Checking…' : "I've pushed — check it"}
          </button>
        </div>
        {err && <ErrorNote err={err} />}
      </div>
    );
  }

  // ── not connected: both doors, plus the download ──────────────────────────
  return (
    <div className="rt-card">
      <div className="rt-lab" style={{ marginTop: 0 }}>Connect your project folder</div>
      <p className="rt-muted" style={{ margin: '8px 0 12px' }}>
        You already have a folder for this build. Point the platform at its GitHub repo and everything stays
        where it is — <strong>the repo stays yours</strong>, under your own account. The platform keeps a
        pointer to it and the record of what you finish, never your code. It only ever writes{' '}
        <code>CLAUDE.md</code> (inside a marked block, around what you wrote), <code>docs/</code> and{' '}
        <code>.colaberry/</code>.
      </p>

      <div className="rt-row">
        <input
          className="rt-in"
          value={refInput}
          onChange={(e) => editRef(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && refInput.trim()) doStart(); }}
          placeholder="https://github.com/you/your-project"
          aria-label="Your GitHub repository address"
        />
        <button className="rt-btn pri" disabled={busy === 'connect' || !refInput.trim()} onClick={() => doStart()}>
          {busy === 'connect' ? 'Checking…' : 'Connect this repo'}
        </button>
      </div>
      {err && <ErrorNote err={err} onConfirmReplace={() => doStart(true)} />}

      <hr style={{ border: 0, borderTop: '1px solid var(--rt-line, rgba(128,128,128,.25))', margin: '16px 0 12px' }} />

      {!showFallback ? (
        <button className="rt-btn" onClick={() => setShowFallback(true)}>
          My folder is not on GitHub yet
        </button>
      ) : (
        <>
          <p className="rt-muted" style={{ margin: '0 0 8px' }}>
            The platform will create an <strong>empty</strong> private repo and add you to it, then give you the
            two commands that push your existing folder into it. Empty on purpose: your history arrives intact,
            with nothing to merge and nothing to force.
          </p>
          <div className="rt-row">
            <input
              className="rt-in"
              value={ghLogin}
              onChange={(e) => setGhLogin(e.target.value)}
              placeholder="your-github-username"
              aria-label="Your GitHub username"
            />
            <button className="rt-btn" disabled={busy === 'provision' || !ghLogin.trim()} onClick={doProvision}>
              {busy === 'provision' ? 'Creating…' : 'Create an empty repo'}
            </button>
          </div>
        </>
      )}

      <p className="rt-muted" style={{ margin: '14px 0 0', fontSize: 12.5 }}>
        No GitHub account yet?{' '}
        <button
          className="rt-btn"
          style={{ padding: '2px 8px', fontSize: 12.5 }}
          disabled={busy === 'download'}
          onClick={doDownload}
        >
          {busy === 'download' ? 'Building…' : 'Download the documents'}
        </button>{' '}
        — the same files, as a zip you drop into your folder. Your prompts will work today, but stories cannot
        be verified and no points are awarded until a repo is connected: verification is a read of your repo.
      </p>
      {note && <p className="rt-muted" style={{ margin: '8px 0 0' }}>{note}</p>}
    </div>
  );
};

export default WorkspaceRepoPanel;
