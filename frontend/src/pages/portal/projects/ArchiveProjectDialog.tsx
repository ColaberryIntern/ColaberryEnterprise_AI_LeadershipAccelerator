/**
 * ArchiveProjectDialog — the confirmation step Ali asked for: "the system should
 * make sure 1st before just deleting."
 *
 * THREE THINGS IT DOES DIFFERENTLY FROM "ARE YOU SURE?"
 *
 * 1. IT COUNTS. Every figure is read live from `GET .../archive-preview` at the
 *    moment the dialog opens — tasks, lists, completions, published plan,
 *    confirmed stories, points, repo. "This removes 21 tasks, your published
 *    plan, 3 confirmed stories and 53 points" is something a student can
 *    actually agree to; "Are you sure?" is not. Nothing is precomputed, because
 *    a stale count asks for consent to a project that no longer exists.
 *
 * 2. IT TELLS THE TRUTH ABOUT POINTS. `evidence_records` and `xp_events` are
 *    ENROLLMENT-scoped and carry no `project_id`, so awarded points genuinely do
 *    survive an archive — and equally they do not come back on restore, because
 *    they never left. A student who archives expecting their XP to drop, or who
 *    restores expecting it to return, is confused either way. So the dialog says
 *    plainly what happens instead of staying silent and letting them guess.
 *
 * 3. IT REQUIRES A DELIBERATE ACT. The student types the project's name. Not for
 *    security — they are authorised — but because a single click sitting next to
 *    "Open build" is a click you can make by accident, and this one costs a
 *    build. Now that projects have real names, typing one reads naturally.
 *
 * Reversibility is stated up front rather than buried, because it is the single
 * most important fact and it changes how carefully someone needs to read the
 * rest.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchArchivePreview, archiveProject as callArchive,
  type ArchivePreview,
} from './projectArchiveApi';

const IC_WARN = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
      stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The list of things this archive actually takes with it, built from the counts.
 *
 * Only true statements appear: a project with no published plan does not get a
 * line claiming one, and a project with no repo does not get a repo line. A
 * confirmation that lists things that are not there teaches the student to stop
 * reading it.
 */
export function buildLossLines(p: ArchivePreview): string[] {
  const lines: string[] = [];
  if (p.task_count > 0) {
    const across = p.task_list_count > 0 ? ` across ${plural(p.task_list_count, 'list', 'lists')}` : '';
    const done = p.completed_task_count > 0 ? ` — ${p.completed_task_count} you have completed` : '';
    lines.push(`${plural(p.task_count, 'task', 'tasks')}${across}${done}`);
  }
  if (p.has_published_plan) lines.push('your published plan');
  if (p.confirmed_story_count > 0) {
    lines.push(`${plural(p.confirmed_story_count, 'story', 'stories')} the platform has confirmed`);
  }
  if (p.repo_connected && p.repo_full_name) lines.push(`its link to ${p.repo_full_name}`);
  if (lines.length === 0) lines.push('nothing yet — this build is empty');
  return lines;
}

/** What happens to the student's current build. Only shown when it is this one. */
export function buildActiveLine(p: ArchivePreview): string | null {
  if (!p.is_active) return null;
  if (p.next_active_project_id) {
    const name = p.next_active_project_name || 'your other build';
    return `This is your current build. Removing it moves you to ${name}.`;
  }
  return 'This is your current build, and your only one. Removing it leaves you with no active build until you start a new one.';
}

/**
 * The points sentence. Truthful in both directions, which is the whole point.
 * Returns null when no points are involved, because a paragraph about points a
 * student has not earned is noise that pushes the real content off the screen.
 */
export function buildPointsLine(p: ArchivePreview): string | null {
  if (p.points_awarded <= 0) return null;
  return `Your ${p.points_awarded} points stay yours. Points are banked to your account rather than to a project, `
    + 'so removing this build does not take them away — and putting it back does not award them again.';
}

interface Props {
  projectId: string;
  /** Used only as the heading until the live preview lands. */
  fallbackName: string;
  onCancel: () => void;
  /** Called after the server confirms the archive. */
  onArchived: (projectId: string) => void;
}

const ArchiveProjectDialog: React.FC<Props> = ({ projectId, fallbackName, onCancel, onArchived }) => {
  const [preview, setPreview] = useState<ArchivePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await fetchArchivePreview(projectId);
      if (!live) return;
      if (r.ok) setPreview(r.value);
      // The server's message carries the real reason, including the one that
      // matters most: a protected platform project answering 403.
      else setLoadError(r.error.message);
    })();
    return () => { live = false; };
  }, [projectId]);

  // Escape cancels. A destructive dialog you cannot back out of with the key
  // everyone reaches for is a trap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  useEffect(() => { if (preview) inputRef.current?.focus(); }, [preview]);

  const serverName = (preview?.name ?? '').trim();
  // An unnamed project cannot be confirmed by typing its name, so the gate
  // becomes the explicit word REMOVE. Every project is meant to have a real
  // name; this is the honest handling of the ones that slipped through rather
  // than a dead end the student cannot get past.
  const requiredPhrase = serverName || 'REMOVE';
  const matches = typed.trim().toLowerCase() === requiredPhrase.toLowerCase();

  const submit = useCallback(async () => {
    if (!matches || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const r = await callArchive(projectId, serverName || '');
    if (r.ok) { onArchived(projectId); return; }
    setSubmitting(false);
    setSubmitError(r.error.message);
  }, [matches, submitting, projectId, serverName, onArchived]);

  const heading = serverName || fallbackName;

  return (
    <div className="pja-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div
        className="pja-panel" ref={panelRef}
        role="dialog" aria-modal="true" aria-labelledby="pja-title"
      >
        <div className="pja-head">
          <span className="pja-ic">{IC_WARN}</span>
          <h3 id="pja-title">Remove {heading ? `“${heading}”` : 'this build'}?</h3>
        </div>

        {loadError && (
          <div className="pja-body">
            <p className="pja-err" role="alert">{loadError}</p>
            <div className="pja-foot">
              <button type="button" className="pw-act close" onClick={onCancel}>Close</button>
            </div>
          </div>
        )}

        {!loadError && !preview && (
          <div className="pja-body">
            <p className="pja-lead" role="status">Checking what is on this build…</p>
          </div>
        )}

        {!loadError && preview && (
          <div className="pja-body">
            <p className="pja-lead">
              This takes it off your Projects page. <strong>Nothing is deleted</strong> — we keep it,
              and you can put it back.
            </p>

            <div className="pja-loss">
              <div className="pja-loss-h">Removing it takes with it</div>
              <ul>
                {buildLossLines(preview).map((line) => <li key={line}>{line}</li>)}
              </ul>
            </div>

            {buildActiveLine(preview) && (
              <p className="pja-note">{buildActiveLine(preview)}</p>
            )}

            {buildPointsLine(preview) && (
              <p className="pja-points">{buildPointsLine(preview)}</p>
            )}

            <label className="pja-confirm" htmlFor="pja-confirm-input">
              {serverName
                ? <>Type <strong>{serverName}</strong> to confirm.</>
                : <>This build has no name yet. Type <strong>REMOVE</strong> to confirm.</>}
            </label>
            <input
              id="pja-confirm-input" ref={inputRef} className="pja-input" type="text"
              value={typed} onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && matches) void submit(); }}
              autoComplete="off" spellCheck={false}
              aria-describedby="pja-confirm-hint"
            />
            <div id="pja-confirm-hint" className="pja-hint">
              You can restore it from “Removed builds” at the bottom of this page.
            </div>

            {submitError && <p className="pja-err" role="alert">{submitError}</p>}

            <div className="pja-foot">
              <button type="button" className="pw-act close" onClick={onCancel} disabled={submitting}>
                Keep it
              </button>
              <button
                type="button" className="pja-danger" onClick={() => void submit()}
                disabled={!matches || submitting}
              >
                {submitting ? 'Removing…' : 'Remove this build'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArchiveProjectDialog;
