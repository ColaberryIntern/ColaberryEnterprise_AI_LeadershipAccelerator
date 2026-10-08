import React, { useCallback, useEffect, useState } from 'react';
import { Route, useParams, useSearchParams } from 'react-router-dom';
import ProjectLifecycleHeader from '../components/lifecycle/ProjectLifecycleHeader';
import ProjectStageNav from '../components/lifecycle/ProjectStageNav';
import {
  fetchLifecycleStatus,
  type LifecycleResult,
  type ProjectKind,
} from '../services/projectLifecycleApi';

/**
 * The operator's lifecycle workspace: one surface, mounted under `/admin`.
 *
 * ONE workspace rather than a second portal. The client-facing view is not this, and building
 * both at once is how two surfaces end up disagreeing about what stage a project is in.
 *
 * The feature ships dark. When `ENABLE_PROJECT_LIFECYCLE` is off every route answers
 * `409 { lifecycleDisabled: true }`, and this page renders that explicitly — never an empty
 * state, which would be indistinguishable from a project with nothing to show.
 */

const ProjectLifecyclePage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [params] = useSearchParams();
  const kind = (params.get('kind') === 'delivery' ? 'delivery' : 'student') as ProjectKind;

  const [result, setResult] = useState<LifecycleResult | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setResult(await fetchLifecycleStatus(projectId, kind));
  }, [projectId, kind]);

  useEffect(() => { load(); }, [load]);

  if (!result) {
    return <div className="container py-4" data-testid="lifecycle-loading">Loading…</div>;
  }

  if (result.state === 'disabled') {
    return (
      <div className="container py-4">
        <div className="alert alert-warning" data-testid="lifecycle-disabled">
          <div className="fw-semibold">{result.detail.error}</div>
          <div className="small">{result.detail.remedy}</div>
        </div>
      </div>
    );
  }

  if (result.state === 'error') {
    // Surfaced, not swallowed. A failure rendered as "nothing to show" tells an operator their
    // project is empty when the request simply failed.
    return (
      <div className="container py-4">
        <div className="alert alert-danger" data-testid="lifecycle-error">{result.message}</div>
      </div>
    );
  }

  return (
    <div className="container py-4" data-testid="lifecycle-page">
      <ProjectStageNav status={result.status} stages={result.status.stages} />
      <ProjectLifecycleHeader status={result.status} />
    </div>
  );
};

/**
 * The route fragment, exported for mounting rather than self-mounting.
 *
 * A component under `pages/` can sit unrouted and look finished; this repo has shipped that.
 * `adminRoutes.tsx` mounts this inside its protected block, and a test asserts the path
 * resolves rather than asserting the file exists.
 */
export const LIFECYCLE_PATH = '/admin/project-lifecycle/:projectId';

const lifecycleRoutes = (
  <Route path={LIFECYCLE_PATH} element={<ProjectLifecyclePage />} />
);

export { ProjectLifecyclePage };
export default lifecycleRoutes;
