import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getStudentGovProject, type StudentGovProjectView } from '../../../services/govProjectPortalApi';

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
    </div>
  );
}
