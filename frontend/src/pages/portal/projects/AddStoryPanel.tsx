import React, { useCallback, useEffect, useState } from 'react';
import { addStory, getBuildState, type AddStoryRefusal, type AddStoryResult, type BuildPlanSummary } from '../../../services/sbpApi';

/**
 * AddStoryPanel — a student adds one story to a build that is already published.
 *
 * WHAT IT DOES NOT DO. No editing, no deleting. A story's acceptance lines are
 * the verification contract, and changing them on a verified story would either
 * silently un-verify it or leave a stamp on a criterion that no longer exists.
 * That needs a rule before it needs a form.
 *
 * THE SERVER IS THE AUTHORITY. The rules below (3 to 7 lines, exactly one that
 * starts with "Trust", a release that is not r0) are repeated here only so a
 * student reads the rule before a round trip, not instead of one. Every refusal
 * the server sends names the rule that fired, and that is what gets shown.
 *
 * THE SHA IS THE LOCK. The plan sha is read on open and sent with the add. If
 * the plan moved in between (another tab, a re-publish), the server refuses
 * with HashMismatch and the panel reloads rather than guessing.
 */

/** One criterion per non-empty line. */
export function parseAcceptance(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

const TRUST = /^trust\b/i;

/**
 * The first thing wrong with a set of acceptance lines, in the words the server
 * would use, or null when it would pass. Pure, so it can be tested without a
 * render and so the message never drifts from the rule.
 */
export function acceptanceProblem(lines: string[]): string | null {
  if (lines.length < 3) return `${lines.length} of at least 3 acceptance lines`;
  if (lines.length > 7) return `${lines.length} lines; the most a story takes is 7`;
  const trust = lines.filter((l) => TRUST.test(l)).length;
  if (trust === 0) return 'one line must start with "Trust" — what makes this story safe to trust';
  if (trust > 1) return `exactly one line may start with "Trust"; there are ${trust}`;
  const short = lines.find((l) => l.length < 8);
  if (short) return `"${short}" is too short to be a criterion`;
  return null;
}

/** A refusal, in a sentence a student can act on. */
export function describeRefusal(r: AddStoryRefusal): { headline: string; lines: string[] } {
  const violations = Array.isArray((r.details as any)?.violations)
    ? ((r.details as any).violations as Array<{ message?: string }>).map((v) => String(v.message ?? '')).filter(Boolean)
    : [];
  switch (r.error_class) {
    case 'HashMismatch':
      return { headline: 'Your build changed since this panel opened. Reloading it now.', lines: [] };
    case 'NotPublished':
      return { headline: 'This build is not published yet. Publish it first, then add stories.', lines: [] };
    case 'PlanPredatesGate':
      return { headline: 'This is not your story. The build itself no longer passes the publish gate, so nothing can be added until it is repaired. Tell your instructor.', lines: violations };
    case 'GateBlocked':
      return { headline: 'The build would not pass the publish gate with this story in it.', lines: violations };
    case 'StoryCap':
    case 'UnknownRelease':
    case 'UnknownAgent':
    case 'NoAgents':
    case 'NoTrustLine':
      return { headline: r.message, lines: [] };
    default:
      return { headline: r.message || 'Something went wrong adding the story.', lines: violations };
  }
}

interface Props {
  /** The backend project id (a uuid), not the local card id. */
  projectId: string;
  onAdded: (result: AddStoryResult) => void;
}

type Load = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; plan: BuildPlanSummary } | { kind: 'unpublished' } | { kind: 'error'; message: string };

const AddStoryPanel: React.FC<Props> = ({ projectId, onAdded }) => {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ kind: 'idle' });
  const [title, setTitle] = useState('');
  const [narrative, setNarrative] = useState('');
  const [acceptanceText, setAcceptanceText] = useState('');
  const [release, setRelease] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<AddStoryRefusal | null>(null);
  const [added, setAdded] = useState<AddStoryResult | null>(null);

  const loadPlan = useCallback(async () => {
    setLoad({ kind: 'loading' });
    const r = await getBuildState(projectId);
    if (!r.ok) { setLoad({ kind: 'error', message: r.error.message }); return; }
    const plan = r.state?.plan ?? null;
    const published = r.state?.status === 'published' || r.state?.status === 'awaiting_repo';
    if (!plan || !published) { setLoad({ kind: 'unpublished' }); return; }
    setLoad({ kind: 'ready', plan });
    // Default to the last release: a story thought of after publishing usually
    // belongs at the end, and r0 is never offered.
    const open_ = plan.releases.filter((x) => x.key !== 'r0');
    setRelease((cur) => cur || open_[open_.length - 1]?.key || '');
  }, [projectId]);

  useEffect(() => { if (open && load.kind === 'idle') void loadPlan(); }, [open, load.kind, loadPlan]);

  const lines = parseAcceptance(acceptanceText);
  const problem = acceptanceText.trim() ? acceptanceProblem(lines) : null;
  const canSubmit = load.kind === 'ready' && !submitting
    && title.trim().length >= 4 && narrative.trim().length >= 20 && !!release && lines.length > 0 && !problem;

  const submit = useCallback(async () => {
    if (load.kind !== 'ready' || !canSubmit) return;
    setSubmitting(true); setRefusal(null); setAdded(null);
    const r = await addStory(projectId, {
      title: title.trim(), narrative: narrative.trim(), acceptance: lines, release,
      expected_sha256: load.plan.sha256,
    });
    setSubmitting(false);
    if (r.ok) {
      setAdded(r.result);
      setTitle(''); setNarrative(''); setAcceptanceText('');
      // The plan has a new sha now. Reload so the next add is locked to it.
      setLoad({ kind: 'idle' });
      onAdded(r.result);
      return;
    }
    setRefusal(r.refusal);
    if (r.refusal.error_class === 'HashMismatch') setLoad({ kind: 'idle' });
  }, [load, canSubmit, projectId, title, narrative, lines, release, onAdded]);

  if (!open) {
    return (
      <div className="pjs-collapsed">
        <button type="button" className="pw-act skip" onClick={() => setOpen(true)}>Add a story</button>
        <span className="pjs-why">Thought of a feature after publishing? Add it here and it gets a task, a prompt, and a place in your repo like every other story.</span>
        {added && <span className="pjs-added">{added.story_id} added</span>}
      </div>
    );
  }

  const releases = load.kind === 'ready' ? load.plan.releases.filter((x) => x.key !== 'r0') : [];
  const shown = refusal ? describeRefusal(refusal) : null;

  return (
    <section className="pjs-panel" aria-label="Add a story">
      <div className="pjs-head">
        <h3>Add a story</h3>
        <button type="button" className="pw-act close" onClick={() => setOpen(false)} aria-label="Close">Close</button>
      </div>

      {load.kind === 'loading' && <p className="pjs-hint">Loading your plan…</p>}
      {load.kind === 'error' && <p className="pja-err">{load.message}</p>}
      {load.kind === 'unpublished' && (
        <p className="pjs-hint">This build is not published yet. Publish it first; stories are added to a published plan.</p>
      )}

      {load.kind === 'ready' && (
        <>
          <label className="pjs-field">
            <span>Title</span>
            <input className="pja-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
              placeholder="Export the roster as CSV" />
          </label>

          <label className="pjs-field">
            <span>What it does, for whom</span>
            <textarea className="pja-input" rows={2} value={narrative} onChange={(e) => setNarrative(e.target.value)} maxLength={600}
              placeholder="As a coordinator, I want to export the roster, so that I can share it with the venue." />
          </label>

          <label className="pjs-field">
            <span>Acceptance — one line each, 3 to 7, one starting with "Trust"</span>
            <textarea className="pja-input" rows={5} value={acceptanceText} onChange={(e) => setAcceptanceText(e.target.value)}
              placeholder={'Given a roster, when I click export, then a CSV downloads\nGiven an empty roster, when I click export, then I am told there is nothing to export\nTrust: the export is logged with who asked and when'} />
            <span className={problem ? 'pja-err' : 'pjs-hint'}>
              {problem ?? (lines.length ? `${lines.length} line${lines.length === 1 ? '' : 's'}, one Trust line — this will pass` : 'The lines are what verification checks against, so write what can be observed.')}
            </span>
          </label>

          <label className="pjs-field">
            <span>Release</span>
            <select className="pja-input" value={release} onChange={(e) => setRelease(e.target.value)}>
              {releases.map((x) => (
                <option key={x.key} value={x.key}>{x.key} · {x.name} (weeks {x.week_start}–{x.week_end})</option>
              ))}
            </select>
            <span className="pjs-hint">r0 is the walking skeleton and is closed to additions.</span>
          </label>

          {shown && (
            <div className="pjs-refusal" role="alert">
              <p className="pja-err">{shown.headline}</p>
              {shown.lines.length > 0 && <ul className="pjs-violations">{shown.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
            </div>
          )}

          <div className="pja-foot">
            <button type="button" className="pw-act skip" onClick={() => setOpen(false)} disabled={submitting}>Cancel</button>
            <button type="button" className="pw-act copy" onClick={() => { void submit(); }} disabled={!canSubmit}>
              {submitting ? 'Adding…' : 'Add to my build'}
            </button>
          </div>
        </>
      )}
    </section>
  );
};

export default AddStoryPanel;
