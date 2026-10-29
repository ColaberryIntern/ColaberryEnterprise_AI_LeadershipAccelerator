import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/admin/shell';
import CockpitView from '../portal/projects/govCockpit/CockpitView';
import { fetchGovContractCockpit, errorMessage } from '../../services/adminGovContractsApi';
import type { StudentGovProjectView } from '../../services/govProjectPortalApi';

/**
 * AdminGovContractCockpitPage — an owner/admin reads ONE government contract exactly as the assigned
 * intern sees it, reached from the left-nav "Interns → Gov Contracts" per-contract sub-items. It
 * renders the SAME CockpitView the intern's portal uses, in read-only mode (no copilot, no proposal
 * edits — see CockpitView's `readOnly`), from the admin-token projection at
 * GET /api/admin/gov-contracts/:projectId/cockpit. `projectId` is the delivery project id.
 */
type State =
  | { k: 'loading' }
  | { k: 'ready'; view: StudentGovProjectView }
  | { k: 'not_found' }
  | { k: 'error'; message: string };

const AdminGovContractCockpitPage: React.FC = () => {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ k: 'loading' });

  const load = useCallback(() => {
    let live = true;
    setState({ k: 'loading' });
    fetchGovContractCockpit(projectId)
      .then((view) => { if (live) setState({ k: 'ready', view }); })
      .catch((e: unknown) => {
        if (!live) return;
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 404) { setState({ k: 'not_found' }); return; }
        setState({ k: 'error', message: errorMessage(e, 'Could not load this government contract.') });
      });
    return () => { live = false; };
  }, [projectId]);

  useEffect(() => load(), [load]);

  return (
    <div>
      <PageHeader
        title="Gov Contract"
        subtitle="The contract exactly as the assigned intern sees it (read-only)"
        icon="government-line"
        breadcrumb={[
          { label: 'Admin', to: '/admin/dashboard' },
          { label: 'Interns', to: '/admin/internship' },
          { label: 'Gov Contracts' },
        ]}
      />
      {state.k === 'loading' && <div className="text-muted p-4">Loading the contract…</div>}
      {state.k === 'not_found' && (
        <div className="p-4">
          <p className="text-muted">That government contract was not found, or it is not an active build yet.</p>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => navigate('/admin/internship')}>
            Back to Interns
          </button>
        </div>
      )}
      {state.k === 'error' && (
        <div className="p-4">
          <p className="text-danger">{state.message}</p>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={load}>Try again</button>
        </div>
      )}
      {state.k === 'ready' && <CockpitView view={state.view} projectId={projectId} onReload={load} readOnly />}
    </div>
  );
};

export default AdminGovContractCockpitPage;
