import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getStudentGovProject, submitBuildStoryEvidence, verifyBuildStoryEvidence, type StudentGovProjectView, type StudentGovBuildStory } from '../../../services/govProjectPortalApi';

/**
 * GovProjectPortalPage — the STUDENT view of an assigned government project (restricted shell).
 *
 * It renders only the student-safe projection the backend returns (project, the two tracks, the compliance
 * requirements) and no admin navigation. A project the student is not assigned to resolves to 404 server-side,
 * shown here as an honest "not found" rather than a leak of its existence. This is the student-facing half of
 * the gov workspace's two entry points; the admin facade is separate.
 */

const TRACK_LABEL: Record<string, string> = { proposal: 'Proposal', solution_build: 'Build' };
const EVIDENCE_TONE: Record<string, string> = { verified: 'success', unassessed: 'secondary' };

const BUILD_EVIDENCE_TONE: Record<string, string> = { submitted: 'info', verified: 'success', rejected: 'danger' };

/**
 * One build story for the student: its requirement citation, acceptance, the Claude Code prompt they run, the
 * evidence they have submitted, and a hand-in form. Submitting records the evidence as `submitted` — the student
 * cannot mark it verified (that is a reviewer-only act, enforced server-side).
 */
function StudentBuildStoryRow(
  { story, projectId, canVerify, onSubmitted }: { story: StudentGovBuildStory; projectId: string; canVerify: boolean; onSubmitted: () => void },
): React.ReactElement {
  const [showPrompt, setShowPrompt] = useState(false);
  const [description, setDescription] = useState('');
  const [artifactRef, setArtifactRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (evidenceId: string, decision: 'verified' | 'rejected') => {
    setBusy(true); setError(null);
    try { await verifyBuildStoryEvidence(projectId, evidenceId, decision); onSubmitted(); }
    catch { setError('Could not record your decision. Try again.'); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!description.trim()) { setError('Add a short description of what you built.'); return; }
    setBusy(true); setError(null);
    try {
      await submitBuildStoryEvidence(projectId, story.id, { canonicalReqId: story.requirementId, description, artifactRef: artifactRef || null });
      setDescription(''); setArtifactRef('');
      onSubmitted();
    } catch {
      setError('Could not submit your evidence. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="list-group-item">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
        <span className="badge bg-secondary-subtle text-secondary-emphasis">{story.id}</span>
        <span className="flex-grow-1 fw-semibold">{story.title}</span>
        <span className="badge bg-light text-dark border">{story.status}</span>
        <span className="small text-secondary">from {story.requirementId}</span>
      </div>
      <div className="small mb-1">{story.statement}</div>
      {story.acceptance.length > 0 && (
        <ul className="small text-secondary mb-1">{story.acceptance.map((a, i) => <li key={i}>{a}</li>)}</ul>
      )}
      <button type="button" className="btn btn-outline-primary btn-sm me-2" onClick={() => setShowPrompt((v) => !v)} aria-expanded={showPrompt}>
        <i className={`ri-${showPrompt ? 'arrow-down-s-line' : 'terminal-box-line'} me-1`} aria-hidden="true" />
        {showPrompt ? 'Hide prompt' : 'Open the build prompt'}
      </button>
      {showPrompt && <pre className="small bg-body-secondary rounded p-2 mt-2 mb-0" style={{ whiteSpace: 'pre-wrap' }}>{story.prompt}</pre>}

      {story.evidence.length > 0 && (
        <ul className="list-unstyled small mt-2 mb-0">
          {story.evidence.map((e) => (
            <li key={e.id} className="d-flex flex-wrap align-items-center gap-2 py-1 border-top">
              <span className={`badge bg-${BUILD_EVIDENCE_TONE[e.status] ?? 'secondary'}-subtle text-${BUILD_EVIDENCE_TONE[e.status] ?? 'secondary'}-emphasis`}>{e.status}</span>
              <span className="flex-grow-1">{e.description}</span>
              {e.artifactRef && <a href={e.artifactRef} target="_blank" rel="noopener noreferrer">artifact</a>}
              {canVerify && e.status === 'submitted' && (
                <span className="d-flex gap-1">
                  <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={() => void decide(e.id, 'verified')}>Verify</button>
                  <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => void decide(e.id, 'rejected')}>Reject</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {!canVerify && (
        <div className="mt-2">
          <label className="form-label small mb-1">Hand in your evidence <span className="text-secondary">(a reviewer verifies it — you can’t mark it done yourself)</span></label>
          <textarea className="form-control form-control-sm mb-1" rows={2} value={description} placeholder="What did you build? How does it meet the requirement?"
            onChange={(e) => setDescription(e.target.value)} />
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <input className="form-control form-control-sm" style={{ maxWidth: 320 }} value={artifactRef} placeholder="link to repo PR / screenshot (optional)"
              onChange={(e) => setArtifactRef(e.target.value)} />
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void submit()}>
              <i className="ri-upload-2-line me-1" aria-hidden="true" />{busy ? 'Submitting…' : 'Submit evidence'}
            </button>
          </div>
        </div>
      )}
      {error && <div className="small text-danger mt-1" role="alert">{error}</div>}
    </li>
  );
}

export default function GovProjectPortalPage(): React.ReactElement {
  const { projectId = '' } = useParams();
  const [view, setView] = useState<StudentGovProjectView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading');

  const load = useCallback(async () => {
    setState('loading');
    try {
      setView(await getStudentGovProject(projectId));
      setState('ready');
    } catch (err: any) {
      setState(err?.response?.status === 404 ? 'not_found' : 'error');
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  if (state === 'loading') {
    return <div className="container py-5 text-secondary" data-testid="gov-project-loading">Loading your project…</div>;
  }
  if (state === 'not_found') {
    return (
      <div className="container py-5" data-testid="gov-project-not-found">
        <h1 className="h4">Project not found</h1>
        <p className="text-secondary">This government project isn’t assigned to you, or it doesn’t exist.</p>
      </div>
    );
  }
  if (state === 'error' || !view) {
    return (
      <div className="container py-5" data-testid="gov-project-error">
        <p className="text-danger" role="alert">Couldn’t load this project.</p>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => void load()}>Try again</button>
      </div>
    );
  }

  return (
    <div className="container py-4" data-testid="gov-project-view">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
        <span className="badge bg-danger-subtle text-danger-emphasis"><i className="ri-government-line me-1" aria-hidden="true" />Government project</span>
        <span className="badge bg-secondary-subtle text-secondary-emphasis">{view.status}</span>
      </div>
      <h1 className="h3 mb-3">{view.name}</h1>

      <div className="row g-3 mb-4">
        {view.tracks.map((t) => (
          <div className="col-md-6" key={t.trackType}>
            <div className="card h-100">
              <div className="card-body">
                <h2 className="h6 text-uppercase text-secondary mb-2">{TRACK_LABEL[t.trackType] ?? t.trackType} track</h2>
                <div className="d-flex align-items-center gap-2">
                  <span className="badge bg-light text-dark border">{t.status}</span>
                  {t.trackType === 'solution_build' && (
                    <span className={`small ${t.hasBuild ? 'text-success' : 'text-secondary'}`}>
                      <i className={`me-1 ${t.hasBuild ? 'ri-git-repository-line' : 'ri-time-line'}`} aria-hidden="true" />
                      {t.hasBuild ? 'Build project linked' : 'No build linked yet'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="d-flex flex-wrap align-items-baseline gap-2 mb-2">
        <h2 className="h5 mb-0">Requirements</h2>
        <span className="small text-secondary">{view.requirementCounts.total} total · {view.requirementCounts.proposal} proposal · {view.requirementCounts.build} build</span>
      </div>
      {view.requirements.length === 0 ? (
        <p className="text-secondary small">No requirements have been established yet.</p>
      ) : (
        <ul className="list-group">
          {view.requirements.map((r) => (
            <li className="list-group-item d-flex flex-wrap align-items-start gap-2" key={r.canonicalReqId}>
              <span className="badge bg-secondary-subtle text-secondary-emphasis">{r.canonicalReqId}</span>
              <span className="flex-grow-1">{r.statement}</span>
              {r.tracks.map((tk) => (
                <span className="badge bg-light text-dark border" key={tk}>{TRACK_LABEL[tk] ?? tk}</span>
              ))}
              <span className={`badge bg-${EVIDENCE_TONE[r.evidenceState] ?? 'secondary'}-subtle text-${EVIDENCE_TONE[r.evidenceState] ?? 'secondary'}-emphasis`}>{r.evidenceState}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="d-flex flex-wrap align-items-baseline gap-2 mb-2 mt-4">
        <h2 className="h5 mb-0">Build stories</h2>
        <span className="small text-secondary">{view.build.buildStoryCount} to build — each with a prompt to run</span>
      </div>
      {view.build.stories.length === 0 ? (
        <p className="text-secondary small">No build stories — this project’s requirements are all administrative, so there’s nothing to build here.</p>
      ) : (
        view.build.releases.map((rel) => (
          <div className="mb-3" key={rel.key}>
            <h3 className="h6 text-uppercase text-secondary small mb-2">{rel.name}</h3>
            <ul className="list-group">
              {rel.storyIds.map((sid) => {
                const s = view.build.stories.find((x) => x.id === sid);
                return s ? <StudentBuildStoryRow key={sid} story={s} projectId={view.projectId} canVerify={view.viewerCanVerify} onSubmitted={() => void load()} /> : null;
              })}
            </ul>
          </div>
        ))
      )}

      {(view.build.orphanedStories?.length ?? 0) > 0 && (
        <div className="mb-3 mt-3 pt-2 border-top">
          <h3 className="h6 text-uppercase small mb-1 text-warning-emphasis"><i className="ri-alert-line me-1" aria-hidden="true" />Preserved work</h3>
          <p className="small text-secondary mb-2">A requirement changed, so these stories are no longer in the current plan — but your submitted work is kept here, not lost.</p>
          <ul className="list-group">
            {view.build.orphanedStories!.map((s) => (
              <StudentBuildStoryRow key={s.id} story={s} projectId={view.projectId} canVerify={view.viewerCanVerify} onSubmitted={() => void load()} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
