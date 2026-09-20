import React, { useMemo, useState } from 'react';
import { StudentProject, reqVerified } from './projectsStore';

/**
 * "Review your project" — the screen a freshly built project opens onto before
 * its workspace unlocks. It shows the student everything the build actually is,
 * so they can confirm it matches what they asked for, then Approve it (the
 * workspace opens) or Request changes (it is flagged for revision, with a note).
 *
 * Read-only about the build: it renders what is already on the project (the same
 * data the interior shows), owns only the request-changes note + submit state,
 * and never fetches. Reachable ONLY for a project whose approval_state is
 * 'pending_approval' — the gate lives in ProjectsPage; this pane assumes it.
 */
interface Props {
  project: StudentProject;
  onApprove: () => Promise<boolean> | void;
  onRequestChanges: (notes: string) => Promise<boolean> | void;
  onBack: () => void;
}

const ProjectReviewPane: React.FC<Props> = ({ project, onApprove, onRequestChanges, onBack }) => {
  const [mode, setMode] = useState<'review' | 'requesting' | 'submitted'>('review');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // STORY-000 is the Command Center every build leads with. Slotted at position
  // 0 by the hydrate, so it is normally the first task; found by id so its
  // position never matters.
  const commandCenter = useMemo(
    () => project.lists.flatMap((l) => l.tasks).find((t) => t.storyId === 'STORY-000') ?? null,
    [project.lists],
  );
  const reqs = reqVerified(project);
  const whatItDoes = project.preview?.summary?.trim() || project.descriptor?.trim() || project.idea?.trim() || '';

  const approve = async () => {
    setBusy(true); setError(null);
    const ok = await onApprove();
    // On success the parent navigates away to the workspace, so this pane
    // unmounts; only a failure returns here, and it must say so rather than
    // silently doing nothing.
    if (ok === false) { setBusy(false); setError('We could not record your approval just now. Please try again.'); }
  };

  const submitChanges = async () => {
    setBusy(true); setError(null);
    const ok = await onRequestChanges(notes.trim());
    setBusy(false);
    if (ok === false) { setError('We could not send that just now. Please try again.'); return; }
    setMode('submitted');
  };

  return (
    <>
      <button className="pj-back" onClick={onBack}>
        <svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        Back to projects
      </button>

      <div className="page-h">
        <div className="crumbs0">Review your project</div>
        <h1>{project.name}</h1>
        <div className="sub">Here is the build we put together from your answers. Look it over and confirm it is what you wanted before you start working on it.</div>
      </div>

      {whatItDoes && (
        <>
          <div className="section-title" style={{ margin: '4px 0 10px' }}>What it does</div>
          <div className="pjw-review">{whatItDoes}</div>
        </>
      )}

      {commandCenter && (
        <>
          <div className="section-title" style={{ margin: '18px 0 10px' }}>Your Command Center</div>
          <div className="small" style={{ opacity: .75, marginBottom: 10 }}>The first thing you build, and where you will run and demo this project.</div>
          <div className="pjw-review">
            <div style={{ fontWeight: 600 }}>{commandCenter.title}</div>
            {commandCenter.what && <div className="small" style={{ opacity: .8, marginTop: 4 }}>{commandCenter.what}</div>}
          </div>
        </>
      )}

      <div className="section-title" style={{ margin: '18px 0 10px' }}>
        What you will build{project.lists.length > 0 ? ` — ${project.lists.length} release${project.lists.length === 1 ? '' : 's'}` : ''}
      </div>
      {project.lists.length === 0 ? (
        <div className="small" style={{ opacity: .75 }}>The build is still assembling its releases. Give it a moment and refresh.</div>
      ) : (
        project.lists.map((l) => (
          <div className="pjw-review" key={l.id}>
            <div style={{ fontWeight: 600 }}>{l.name}</div>
            {l.sub && <div className="small" style={{ opacity: .7, margin: '2px 0 6px' }}>{l.sub}</div>}
            <ul className="pjw-next" style={{ marginBottom: 0 }}>
              {l.tasks.map((t) => <li key={t.id}>{t.title}</li>)}
            </ul>
          </div>
        ))
      )}

      {project.reqs.length > 0 && (
        <>
          <div className="section-title" style={{ margin: '18px 0 10px' }}>Requirements it covers</div>
          <div className="small" style={{ opacity: .75, marginBottom: 8 }}>{reqs.total} requirement{reqs.total === 1 ? '' : 's'} in this build. These are what your stories are checked against.</div>
          <ul className="pjw-next">
            {project.reqs.map((r) => <li key={r.id}>{r.name}</li>)}
          </ul>
        </>
      )}

      {mode === 'submitted' ? (
        <div className="pjw-review" style={{ margin: '22px 0 0' }} data-testid="changes-submitted">
          <div style={{ fontWeight: 600 }}>Thanks — we have noted that this is not quite right.</div>
          <div className="small" style={{ opacity: .8, marginTop: 4 }}>
            Your project is flagged for revision. What you told us has been recorded, and we will follow up on the changes you asked for.
          </div>
          <div className="pw-acts" style={{ marginTop: 14 }}>
            <button className="btn ghost" onClick={onBack}>Back to projects</button>
          </div>
        </div>
      ) : mode === 'requesting' ? (
        <div className="pjw-tf" style={{ display: 'block', margin: '22px 0 0' }} data-testid="request-changes">
          <div className="section-title" style={{ margin: '0 0 6px' }}>What is not right?</div>
          <div className="small" style={{ opacity: .85, marginBottom: 10 }}>Tell us what does not match what you wanted. This is recorded on your project so the revision starts from the right place.</div>
          <textarea
            className="txt"
            rows={4}
            maxLength={5000}
            value={notes}
            placeholder="e.g. It should also check SAM.gov, and the profile fields are missing."
            onChange={(e) => setNotes(e.target.value)}
            style={{ width: '100%', resize: 'vertical' }}
          />
          {error && <div className="small" style={{ marginTop: 6, color: '#B5710A' }}>{error}</div>}
          <div className="pw-acts" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={submitChanges} disabled={busy || notes.trim().length === 0}>
              {busy ? 'Sending…' : 'Send this for revision'}
            </button>
            <button className="btn ghost" onClick={() => { setMode('review'); setError(null); }} disabled={busy}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ margin: '24px 0 0' }}>
          {error && <div className="small" style={{ marginBottom: 10, color: '#B5710A' }}>{error}</div>}
          <div className="pw-acts">
            <button className="btn primary" onClick={approve} disabled={busy} data-testid="approve-project">
              {busy ? 'Approving…' : 'This is what I wanted — approve'}
            </button>
            <button className="btn ghost" onClick={() => { setMode('requesting'); setError(null); }} disabled={busy}>
              Request changes
            </button>
          </div>
          <div className="small" style={{ opacity: .7, marginTop: 10 }}>Approving opens your build so you can start working on it.</div>
        </div>
      )}
    </>
  );
};

export default ProjectReviewPane;
