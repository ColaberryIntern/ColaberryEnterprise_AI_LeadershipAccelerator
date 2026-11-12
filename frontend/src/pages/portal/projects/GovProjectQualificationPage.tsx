import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import PortalShell from '../today/PortalShell';
import AdminGovQualificationPage, { type QualPageApi } from '../../admin/AdminGovQualificationPage';
import { getPortalGovQualification, getPortalGovOpportunityDetail } from '../../../services/govProjectPortalApi';

/**
 * GovProjectQualificationPage — the intern's READ-ONLY view of the pre-award Qualification Workspace. It mounts the
 * REAL `AdminGovQualificationPage` component (not a look-alike) in `readOnly` mode, fed by participant-scoped,
 * award-stripped endpoints. The intern reaches it from the Proposal Studio stepper (steps 1-4 open qualification);
 * access is enforced server-side (the participant endpoints 404 a non-member), so a project the intern is not on
 * resolves to the admin page's own "could not load" state.
 *
 * It renders INSIDE `PortalShell` (the intern's portal navigation) exactly as the admin qualification page lives
 * inside the admin navigation — so the intern keeps their nav and a clear way back to the Proposal Studio, rather
 * than being stranded on a bare full-page view.
 *
 * `opportunityKey` is the projectId: the injected api fetches by projectId (the page's key is used only for its own
 * React keys/labels), so the real canonical id is never needed on the client.
 */
export default function GovProjectQualificationPage(): React.ReactElement {
  const { projectId = '' } = useParams();
  const api = useMemo<QualPageApi>(() => ({
    getWorkspace: () => getPortalGovQualification(projectId),
    getOpportunityDetail: () => getPortalGovOpportunityDetail(projectId),
  }), [projectId]);
  return (
    <PortalShell>
      <div className="container-fluid py-4" data-testid="gov-project-qualification-readonly">
        <div className="mb-3">
          <Link to={`/portal/gov-projects/${encodeURIComponent(projectId)}`} className="text-decoration-none">
            &larr; Back to Proposal Studio
          </Link>
        </div>
        <AdminGovQualificationPage readOnly opportunityKey={projectId} api={api} />
      </div>
    </PortalShell>
  );
}
