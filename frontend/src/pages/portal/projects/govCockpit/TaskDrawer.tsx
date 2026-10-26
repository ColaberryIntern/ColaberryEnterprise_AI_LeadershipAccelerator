import React, { useState } from 'react';
import {
  submitBuildStoryEvidence, verifyBuildStoryEvidence, saveGovProposalResponse, resolveGovProposalGap,
  type StudentGovProjectView, type SharedProposalResponse,
} from '../../../../services/govProjectPortalApi';
import type { CockpitTask } from './cockpitModel';

/**
 * TaskDrawer — the per-task detail panel. It carries EVERY action the cockpit supports, each on its real guarded
 * endpoint:
 *  - a build task shows acceptance, the Claude Code prompt, the linked commit, and its evidence; a reviewer verifies
 *    or sends back each submitted hand-in, and a non-reviewer gets the manual hand-in form (recorded `submitted` —
 *    never self-verified).
 *  - a proposal task shows the response; an edit-shared intern drafts it (any save lands `draft`) and resolves its
 *    open gaps (answered / filler); a comment/view member sees it read-only with the gap questions.
 * Local busy/error; after any write it calls onReload() to pull the fresh projection, then the panel re-renders.
 */
function Acceptance({ items, done }: { items: string[]; done: boolean }): React.ReactElement | null {
  if (!items.length) return null;
  return (
    <div className="gck-sec">
      <h4>Acceptance criteria</h4>
      <ul className="gck-ac">
        {items.map((a, i) => <li key={i}><span className={`box ${done ? 'on' : ''}`} aria-hidden="true">{done ? '✓' : ''}</span><span>{a}</span></li>)}
      </ul>
    </div>
  );
}

function ProposalGap(
  { gap, busy, onResolve }: { gap: NonNullable<SharedProposalResponse['gaps']>[number]; busy: boolean; onResolve: (res: 'answered' | 'filler', answer?: string) => void },
): React.ReactElement {
  const [answer, setAnswer] = useState('');
  return (
    <li className="gck-sec" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
      <div style={{ fontSize: 13 }}>{gap.question}{gap.resolution === 'filler' ? ' (filler — needs a real answer)' : ''}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 6 }}>
        <input className="gck-input" style={{ maxWidth: 280 }} value={answer} placeholder="answer this question" onChange={(e) => setAnswer(e.target.value)} />
        <button type="button" className="gck-btn" disabled={busy || !answer.trim()} onClick={() => onResolve('answered', answer)}>Save answer</button>
        <button type="button" className="gck-btn ghost" disabled={busy} onClick={() => onResolve('filler')}>Mark filler</button>
      </div>
    </li>
  );
}

export default function TaskDrawer(
  { task, view, projectId, onReload, onClose }: { task: CockpitTask; view: StudentGovProjectView; projectId: string; onReload: () => void; onClose: () => void },
): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [artifactRef, setArtifactRef] = useState('');
  const [copied, setCopied] = useState(false);
  const response = task.track === 'proposal' ? (view.proposal?.responses ?? []).find((r) => r.requirementId === task.key) ?? null : null;
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(response?.content ?? '');

  const run = async (fn: () => Promise<unknown>, fail: string) => {
    setBusy(true); setError(null);
    try { await fn(); onReload(); } catch { setError(fail); } finally { setBusy(false); }
  };
  const copyPrompt = () => {
    if (!task.prompt) return;
    try { void navigator.clipboard.writeText(task.prompt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => setCopied(false)); } catch { /* clipboard unavailable */ }
  };

  const canVerify = view.viewerCanVerify;
  const canEdit = !!view.proposal?.canEdit;
  const canComment = !!view.proposal?.canComment;
  const openGaps = (response?.gaps ?? []).filter((g) => g.resolution === 'open' || g.resolution === 'filler');

  return (
    <>
      <div className="gck-scrim" onClick={onClose} />
      <aside className="gck-drawer" role="dialog" aria-modal="true" aria-labelledby="gck-dtitle">
        <div className="gck-dh">
          <span className="gck-key">{task.key}</span>{' '}
          <span className={`gck-tag ${task.owner === 'ai' ? 'ai' : 'human'}`}>{task.owner === 'ai' ? 'AI task · needs your approval' : 'Your task'}</span>
          <h2 id="gck-dtitle">{task.title}</h2>
        </div>
        <div className="gck-db">
          <Acceptance items={task.acceptance} done={task.stage === 'done'} />

          {task.track === 'build' && task.commit && (
            <div className="gck-sec">
              <h4>Linked commit</h4>
              <p className="gck-mono" style={{ overflowWrap: 'anywhere', margin: 0 }}>{task.commit.sha.slice(0, 10)} &middot; {task.commit.message}</p>
            </div>
          )}

          {task.track === 'build' && task.prompt && (
            <div className="gck-sec">
              <h4>Claude Code prompt</h4>
              <pre className="gck-prompt">{task.prompt}</pre>
              <button type="button" className="gck-btn" style={{ marginTop: 8 }} onClick={copyPrompt}>
                <i className="ri-file-copy-line" aria-hidden="true" />{copied ? 'Copied' : 'Copy prompt'}
              </button>
            </div>
          )}

          {task.track === 'build' && task.evidence.length > 0 && (
            <div className="gck-sec">
              <h4>Evidence</h4>
              <ul className="gck-ac">
                {task.evidence.map((e) => (
                  <li key={e.id}>
                    <span className={`gck-tag ${e.status === 'verified' ? 'ok' : e.status === 'rejected' ? 'warn' : ''}`}>{e.status}</span>
                    <span style={{ flex: 1 }}>{e.description}{e.source === 'github_push' ? ' (from a commit)' : ''}</span>
                    {e.artifactRef && <a href={e.artifactRef} target="_blank" rel="noopener noreferrer">artifact</a>}
                    {canVerify && e.status === 'submitted' && (
                      <span style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="gck-btn ok" disabled={busy} onClick={() => void run(() => verifyBuildStoryEvidence(projectId, e.id, 'verified'), 'Could not verify. Try again.')}>Verify</button>
                        <button type="button" className="gck-btn ghost" disabled={busy} onClick={() => void run(() => verifyBuildStoryEvidence(projectId, e.id, 'rejected'), 'Could not reject. Try again.')}>Send back</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {task.track === 'build' && !canVerify && task.storyId && (
            <div className="gck-sec">
              <h4>Hand in evidence</h4>
              <p className="gck-hint" style={{ margin: '0 0 6px' }}>A reviewer verifies it — you can&rsquo;t mark it done yourself. Or just commit with {task.key} in the message and it files itself.</p>
              <textarea rows={3} value={description} placeholder="What did you build? How does it meet the requirement?" onChange={(e) => setDescription(e.target.value)} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 6 }}>
                <input className="gck-input" style={{ maxWidth: 320 }} value={artifactRef} placeholder="link to repo PR / screenshot (optional)" onChange={(e) => setArtifactRef(e.target.value)} />
                <button type="button" className="gck-btn primary" disabled={busy} onClick={() => {
                  if (!description.trim()) { setError('Add a short description of what you built.'); return; }
                  void run(() => submitBuildStoryEvidence(projectId, task.storyId as string, { canonicalReqId: task.key, description, artifactRef: artifactRef || null }), 'Could not submit your evidence. Try again.');
                }}><i className="ri-upload-2-line" aria-hidden="true" />{busy ? 'Submitting…' : 'Submit evidence'}</button>
              </div>
            </div>
          )}

          {task.track === 'proposal' && (
            <div className="gck-sec" data-testid="gck-proposal-task">
              <h4>Proposal response</h4>
              {!response ? (
                <p className="gck-hint" style={{ margin: 0 }}>This proposal response isn&rsquo;t shared with you.</p>
              ) : canEdit && editing ? (
                <>
                  <textarea rows={6} value={content} placeholder="Draft the response to this requirement…" onChange={(e) => setContent(e.target.value)} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 6 }}>
                    <button type="button" className="gck-btn primary" disabled={busy} onClick={() => void run(async () => { await saveGovProposalResponse(projectId, task.key, content); setEditing(false); }, 'Could not save your answer. Try again.')}>{busy ? 'Saving…' : 'Save draft'}</button>
                    <button type="button" className="gck-btn ghost" disabled={busy} onClick={() => { setContent(response.content); setEditing(false); setError(null); }}>Cancel</button>
                    <span className="gck-hint">Saving marks it a draft — a reviewer approves it.</span>
                  </div>
                </>
              ) : (
                <>
                  {response.content ? <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{response.content}</div> : <div className="gck-hint">Not drafted yet.</div>}
                  {canEdit && (
                    <button type="button" className="gck-btn" style={{ marginTop: 8 }} onClick={() => { setContent(response.content); setEditing(true); }}>
                      <i className="ri-edit-line" aria-hidden="true" />{response.content ? 'Edit response' : 'Draft response'}
                    </button>
                  )}
                </>
              )}
              {response && (canEdit ? openGaps.length > 0 : canComment && (response.gaps?.length ?? 0) > 0) && (
                <ul className="gck-ac" style={{ marginTop: 10 }}>
                  {canEdit
                    ? openGaps.map((g) => <ProposalGap key={g.id} gap={g} busy={busy} onResolve={(res, ans) => void run(() => resolveGovProposalGap(projectId, task.key, g.id, res, ans), 'Could not update the question. Try again.')} />)
                    : response.gaps!.map((g) => <li key={g.id} style={{ fontSize: 13 }}>{g.question}{g.resolution === 'filler' ? ' (filler)' : g.resolution === 'answered' ? ' (answered)' : ''}</li>)}
                </ul>
              )}
            </div>
          )}

          {error && <div className="gck-err" role="alert">{error}</div>}
        </div>
        <div className="gck-actions">
          <span className="gck-spacer" />
          <button type="button" className="gck-btn ghost" onClick={onClose}>Close</button>
        </div>
      </aside>
    </>
  );
}
