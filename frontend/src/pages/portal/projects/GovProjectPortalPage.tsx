import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPortalGovCockpitFull, portalGovCockpitApi, portalGovStudioApi, portalGovReviewApiReadOnly, portalGovReviewApiAuthor, type StudentGovProjectView } from '../../../services/govProjectPortalApi';
import StudioShell from './proposalStudio/StudioShell';

/**
 * GovProjectPortalPage — the STUDENT entry to an assigned government project, rendered as the Build Cockpit.
 *
 * It owns only the load + state machine (loading / ready / not_found / error) and hands the one student-safe
 * projection to CockpitView, which arranges the task board, commit feed and copilot. A project the student is not
 * assigned to answers 404 server-side, shown here as an honest "not found" rather than a leak of its existence.
 */
export default function GovProjectPortalPage(): React.ReactElement {
  const { projectId = '' } = useParams();
  const [view, setView] = useState<StudentGovProjectView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading');

  const load = useCallback(async () => {
    try {
      setView(await getPortalGovCockpitFull(projectId));
      setState('ready');
    } catch (err: any) {
      setState(err?.response?.status === 404 ? 'not_found' : 'error');
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  if (state === 'loading') {
    return <div className="container py-5 text-secondary" data-testid="gov-project-loading">Loading your project&hellip;</div>;
  }
  if (state === 'not_found') {
    return (
      <div className="container py-5" data-testid="gov-project-not-found">
        <h1 className="h4">Project not found</h1>
        <p className="text-secondary">This government project isn&rsquo;t assigned to you, or it doesn&rsquo;t exist.</p>
      </div>
    );
  }
  if (state === 'error' || !view) {
    return (
      <div className="container py-5" data-testid="gov-project-error">
        <p className="text-danger" role="alert">Couldn&rsquo;t load this project.</p>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => { setState('loading'); void load(); }}>Try again</button>
      </div>
    );
  }

  return (
    <div className="container-fluid py-4" data-testid="gov-project-view">
      {/* Phase B: an EDIT-shared intern (view.proposal.canEdit, auto-granted when assigned the build) AUTHORS the
          proposal lane — author reviewApi + proposalAuthoring. Without the share, both fall back to read-only. */}
      <StudioShell view={view} projectId={view.projectId} onReload={() => void load()} cockpitApi={portalGovCockpitApi} studioApi={portalGovStudioApi}
        reviewApi={view.proposal?.canEdit ? portalGovReviewApiAuthor : portalGovReviewApiReadOnly} readOnly proposalAuthoring={view.proposal?.canEdit === true}
        bugReportEndpoint={`/api/portal/gov-projects/${encodeURIComponent(view.projectId)}/bug-report`} />
    </div>
  );
}
