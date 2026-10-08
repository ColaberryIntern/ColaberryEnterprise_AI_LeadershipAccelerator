import React, { useCallback, useEffect, useState } from 'react';
import { Route, useParams, useSearchParams } from 'react-router-dom';
import ProjectLifecycleHeader from '../components/lifecycle/ProjectLifecycleHeader';
import ProjectStageNav from '../components/lifecycle/ProjectStageNav';
import BlueprintRevisionCompare from '../components/lifecycle/BlueprintRevisionCompare';
import BlueprintChangeRequest from '../components/lifecycle/BlueprintChangeRequest';
import {
  fetchLifecycleStatus,
  type LifecycleResult,
  type ProjectKind,
} from '../services/projectLifecycleApi';
import {
  fetchRevisionCompare,
  requestBlueprintChanges,
  type ChangeRequestOutcome,
  type CompareResult,
} from '../services/blueprintReviewApi';

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

/** The revision a change request would be filed against, or null when there is nothing to file against. */
function revisionUnderReview(compare: CompareResult | null): number | null {
  if (compare === null) return null;
  if (compare.state === 'compared') return compare.to.revision;
  if (compare.state === 'single_revision') return compare.only.revision;
  // No revision means no change-request panel. Offering one with no target would record a
  // request against whatever turned up next.
  return null;
}

const ProjectLifecyclePage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [params] = useSearchParams();
  const kind = (params.get('kind') === 'delivery' ? 'delivery' : 'student') as ProjectKind;

  const [result, setResult] = useState<LifecycleResult | null>(null);
  const [compare, setCompare] = useState<CompareResult | null>(null);

  // EVERY HOOK RUNS BEFORE ANY EARLY RETURN. The disabled and error branches below return early,
  // and a hook declared after them would run on some renders and not others.
  const load = useCallback(async () => {
    if (!projectId) return;
    // Both reads in flight together: the compare is not a drill-down the operator has to ask for,
    // it is part of knowing where the project stands.
    const [status, cmp] = await Promise.all([
      fetchLifecycleStatus(projectId, kind),
      fetchRevisionCompare(projectId, kind),
    ]);
    setResult(status);
    setCompare(cmp);
  }, [projectId, kind]);

  useEffect(() => { load(); }, [load]);

  const revision = revisionUnderReview(compare);

  const submitChanges = useCallback(async (text: string): Promise<ChangeRequestOutcome> => {
    if (!projectId || revision === null) {
      return { state: 'error', message: 'There is no revision to request changes against.' };
    }
    const out = await requestBlueprintChanges(projectId, kind, revision, text);
    // Reload only when something actually changed. The project's condition moved to
    // `awaiting_input`, and the header is what shows that — leaving it stale would tell the
    // reviewer their request had no effect.
    if (out.state === 'recorded' && out.applied) await load();
    return out;
  }, [projectId, kind, revision, load]);

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
      {compare !== null && <BlueprintRevisionCompare result={compare} />}
      {revision !== null && (
        <BlueprintChangeRequest revision={revision} onSubmit={submitChanges} />
      )}
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

export { ProjectLifecyclePage, revisionUnderReview };
export default lifecycleRoutes;
