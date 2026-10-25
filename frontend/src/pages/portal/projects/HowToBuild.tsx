import React, { useEffect, useState } from 'react';
import type { ConnectStateView, WorkspaceRepoView } from '../../../services/workspaceRepoApi';
import WorkspaceRepoPanel from './WorkspaceRepoPanel';

/**
 * HOW TO BUILD IT — the prompt and the repo are the same job (get to work), so they sit under one heading instead of reading as
 * two more peers of the story. Lifted out of ProjectWorkspacePage unchanged when the page passed the 500-line ceiling (Campus C19).
 *
 * ── THE REPO COMES FIRST, AND THAT ORDER IS LOAD-BEARING ──────────
 * This section used to render the prompt above the connect panel, which invited the student to read top-to-bottom and paste the
 * prompt before connecting anything. STORY-000's prompt opens with "Step 1 — let the platform see your pushes", and that step
 * tells the agent to find the panel **Let the platform see your pushes** in the workspace. That panel is rendered by
 * WorkspaceRepoPanel ONLY in its `connected` branch, so on an unconnected project it does not exist yet: the very first
 * instruction of the prompt pointed at something the page had not drawn. Swati Raman, running STORY-000 herself as curriculum
 * owner, reported exactly this on 2026-08-19 — repository setup should come first, then the build prompt. Connect first and the
 * prompt's Step 1 has a panel to find. Keep the repo panel above the prompt.
 */
export interface HowToBuildProps {
  stepNo: number;
  projectId: string;
  /** The story being built: the prompt closes again whenever it changes. */
  taskId: string;
  prompt: string;
  repo: WorkspaceRepoView | null;
  onRepoChange: (r: WorkspaceRepoView | null) => void;
  onConnectChange: (next: ConnectStateView) => void;
}

export default function HowToBuild(p: HowToBuildProps): React.ReactElement {
  const [copied, setCopied] = useState(false);
  // The prompt opens CLOSED. At half screen — the posture this page is actually
  // used in, editor in the other half — a 340px <pre> IS the column, so the page
  // led with the thing a student pastes instead of the thing they have to
  // understand before pasting it. Reset per task so every story reads the same
  // way the last one did.
  const [promptOpen, setPromptOpen] = useState(false);
  useEffect(() => { setPromptOpen(false); }, [p.taskId]);

  const copyPrompt = () => {
    if (navigator.clipboard && p.prompt) navigator.clipboard.writeText(p.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="rt-step">
      <div className="rt-step-h">
        <span className="rt-step-n">{p.stepNo}</span>
        <span className="rt-step-t">How to build it</span>
      </div>

      {/* The connect step. Owns its own busy/error state because it is a
          small state machine (validate → prove → bind) and threading that
          through the page's single `busy` string made both harder to read. */}
      <WorkspaceRepoPanel
        projectId={p.projectId}
        repo={p.repo}
        onRepoChange={p.onRepoChange}
        onConnectChange={p.onConnectChange}
      />

      <div className="rt-card">
        <div className="rt-prompt-h">
          <div className="rt-lab" style={{ margin: 0 }}>Your Claude Code prompt</div>
          <div className="rt-prompt-acts">
            {/* Copy is ALWAYS visible: collapsing the prompt must not cost
                the student the one action they came here for. */}
            <button className={`rt-btn${copied ? ' pri' : ''}`} onClick={copyPrompt} disabled={!p.prompt}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              className="rt-btn"
              onClick={() => setPromptOpen((o) => !o)}
              aria-expanded={promptOpen}
              aria-controls="rt-prompt-body"
              disabled={!p.prompt}
            >
              {promptOpen ? 'Hide the full prompt' : 'Show the full prompt'}
            </button>
          </div>
        </div>
        {promptOpen ? (
          <pre id="rt-prompt-body" className="rt-in mono rt-prompt-full">
            {p.prompt || 'This task has no prompt yet.'}
          </pre>
        ) : (
          // A two-line clamp, so the student can still recognise the
          // prompt without it swallowing the column.
          <p id="rt-prompt-body" className="rt-prompt-peek">
            {p.prompt || 'This task has no prompt yet.'}
          </p>
        )}
      </div>
    </section>
  );
}
