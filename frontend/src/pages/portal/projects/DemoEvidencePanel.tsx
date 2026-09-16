import React, { useState } from 'react';
import portalApi from '../../../utils/portalApi';
import { refreshProjectsFromBackend } from './projectSync';
import type { ProjectTask } from './projectsStore';

/**
 * The workspace for a demo-prep task: submit the evidence it asks for.
 *
 * Ali, 2026-09-14: "Demos should provide points as well." A story is verified
 * from the repo; a demo task has no repo to read. Its evidence is the thing
 * itself — the narrative, the recording, the slides — so the student hands
 * that in here and the platform verifies the task from the submission. Same
 * principle as a story, different evidence.
 *
 * "Present at Demo Day" is the one exception: nobody can vouch for their own
 * presentation, so staff mark it on the day, and this panel says so instead
 * of offering a form.
 *
 * The rules of what counts live server-side (demoEvidenceService); the form
 * only chooses which control to show. A 422 comes back with the reason and is
 * shown verbatim, so the student fixes the evidence rather than guessing.
 */
export const PREP_RE = /^PREP-([1-6])$/;
export const DEMO_DAY_STORY_ID = 'PREP-6';
/** The two recordings: a link is the only evidence that fits. */
const LINK_ONLY = new Set(['PREP-2', 'PREP-5']);

const ASK: Record<string, { lead: string; placeholder: string }> = {
  'PREP-1': { lead: 'Write the demo narrative here, or paste a link to it.', placeholder: 'The problem is… The one moment is… The guardrail is…' },
  'PREP-2': { lead: 'Paste a link to your first run-through recording.', placeholder: 'https://…' },
  'PREP-3': { lead: 'Paste a link to your slides, or describe them here.', placeholder: 'https://… (Google Slides, PowerPoint, PDF)' },
  'PREP-4': { lead: 'Who did you rehearse with, and what did they tell you?', placeholder: 'Rehearsed with… Their notes: …' },
  'PREP-5': { lead: 'Paste a link to the final demo video.', placeholder: 'https://…' },
};

export function isPrepStory(storyId: string | null | undefined): boolean {
  return !!storyId && PREP_RE.test(storyId);
}

type Kind = 'link' | 'text';

const DemoEvidencePanel: React.FC<{
  task: ProjectTask;
  /** The backend project id (the route param), never the local store's id. */
  projectId: string;
  /** Story id first (what the portal links by), row id as a fallback — resolved server-side. */
  taskId: string;
  points?: number;
  demo?: boolean;
}> = ({ task, projectId, taskId, points, demo }) => {
  const storyId = task.storyId ?? '';
  const linkOnly = LINK_ONLY.has(storyId);
  const [kind, setKind] = useState<Kind>(linkOnly ? 'link' : 'text');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ points: number } | null>(task.verifiedAt ? { points: 0 } : null);

  if (storyId === DEMO_DAY_STORY_ID) {
    return (
      <section className="rt-step">
        <div className="rt-step-h"><span className="rt-step-n">1</span><span className="rt-step-t">Demo Day</span></div>
        <div className="rt-card">
          <p className="rt-muted" style={{ margin: 0 }}>
            {task.verifiedAt
              ? 'Marked presented by staff.'
              : `Present on the day. A member of staff marks this one once you have — it is the one task nobody can vouch for themselves${points ? `, and it pays +${points} pts` : ''}.`}
          </p>
        </div>
      </section>
    );
  }

  const ask = ASK[storyId] ?? { lead: 'Hand in what this task asks for.', placeholder: '' };

  const submit = async () => {
    if (demo) return;
    setBusy(true); setError(null);
    try {
      const r = await portalApi.post(`/api/portal/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/demo-evidence`, { kind, value });
      setDone({ points: Number(r.data?.points_awarded ?? 0) });
      // Pull the verified row back into the local store so the card flips to
      // Completed everywhere without a reload. Fire-and-forget: the server has
      // already recorded the completion, and a failed refresh must not undo
      // the confirmation on screen.
      refreshProjectsFromBackend().catch(() => undefined);
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { error?: string } } };
      setError(err.response?.data?.error || 'Could not submit. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <section className="rt-step">
        <div className="rt-step-h"><span className="rt-step-n">✓</span><span className="rt-step-t">Handed in</span></div>
        <div className="rt-card">
          <p style={{ margin: 0 }}>
            {done.points > 0
              ? <>Verified — <strong>+{done.points} pts</strong> added to your total.</>
              : 'Verified.'}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rt-step">
      <div className="rt-step-h">
        <span className="rt-step-n">1</span>
        <span className="rt-step-t">Hand it in{points ? <> · <strong>+{points} pts</strong></> : null}</span>
      </div>
      <div className="rt-card">
        <p className="rt-muted" style={{ marginTop: 0 }}>{ask.lead}</p>
        {!linkOnly && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button type="button" className={`rt-btn${kind === 'text' ? ' cta' : ''}`} onClick={() => setKind('text')} aria-pressed={kind === 'text'}>Write it</button>
            <button type="button" className={`rt-btn${kind === 'link' ? ' cta' : ''}`} onClick={() => setKind('link')} aria-pressed={kind === 'link'}>Paste a link</button>
          </div>
        )}
        {kind === 'link' ? (
          <input
            type="url"
            className="rt-in"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={ask.placeholder || 'https://…'}
            aria-label="Link to your evidence"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        ) : (
          <textarea
            className="rt-in"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={ask.placeholder}
            rows={6}
            aria-label="Your evidence"
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
          />
        )}
        {error && <p role="alert" style={{ margin: '8px 0 0', color: 'var(--cherry-deep, #C20E1E)', fontSize: 13 }}>{error}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <button
            type="button"
            className="rt-btn cta"
            onClick={submit}
            disabled={busy || demo || !value.trim()}
            title={demo ? 'Demo — enroll to hand in for real' : undefined}
          >
            {busy ? 'Submitting…' : points ? `Submit · +${points} pts` : 'Submit'}
          </button>
          <span className="rt-muted" style={{ fontSize: 12 }}>The platform verifies the task from what you hand in. Points land on submission.</span>
        </div>
      </div>
    </section>
  );
};

export default DemoEvidencePanel;
