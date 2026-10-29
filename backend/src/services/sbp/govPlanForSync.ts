import { ensureGovBuildPlanPublished } from '../factory/govBuildPublish';

/**
 * govPlanForSync — publish a government build's plan on the repo-sync path (gov sync-recovery).
 *
 * Gov builds publish their BuildPlan LAZILY: `ensureGovBuildPlanPublished` runs only from the gov
 * cockpit projection (`getStudentGovProjectView`). A gov student who connects a repo and clicks
 * "Sync from GitHub" never hits that path, so `build_plans` stays empty, `refreshRepoDocuments`
 * returns `no_plan`, and the platform never writes `.colaberry/plan.json` / manifest / docs into
 * their repo — even though their access is fine and their build is fully materialized. (Found on a
 * live gov intern whose repo stayed empty after she granted access, pushed, and synced.)
 *
 * This bridges the gap: the sync path publishes the gov plan itself, before reading it. Gated to gov
 * builds (`project_variables.kind === 'gov'`) so it never fabricates a plan for a non-gov project —
 * regular SBP builds also carry STORY tasks, so calling the publisher unconditionally would be
 * wrong. Idempotent (the publisher is a no-op once a plan exists) and best-effort (any failure is
 * logged and the caller falls through to its normal `no_plan` handling).
 */

/** PURE. Is this project a materialized GOVERNMENT build, per its stored `project_variables`? */
export function isGovBuildProjectVariables(vars: unknown): boolean {
  if (!vars || typeof vars !== 'object') return false;
  return (vars as { kind?: unknown }).kind === 'gov';
}

function logLine(event: string, correlationId: string | null | undefined, outcome: 'success' | 'failure', context: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'backend', event, outcome, correlation_id: correlationId ?? null, context,
  }));
}

/**
 * If `projectId` is a gov build, publish its plan (idempotent). Returns true when it ran for a gov
 * build, false for a non-gov project or a handled failure. NEVER throws — the repo sync must not
 * break because a best-effort plan publish did.
 */
export async function ensureGovPlanPublishedForSync(projectId: string, correlationId?: string | null): Promise<boolean> {
  if (!projectId) return false;
  try {
    const { default: Project } = await import('../../models/Project');
    const project: any = await Project.findByPk(projectId);
    if (!project || !isGovBuildProjectVariables(project.project_variables)) return false;
    const res: any = await ensureGovBuildPlanPublished(projectId);
    logLine('sbp_sync_gov_plan_publish', correlationId, 'success', {
      projectId, action: res?.action ?? null, published: res?.published ?? null,
    });
    return true;
  } catch (err: unknown) {
    logLine('sbp_sync_gov_plan_publish_failed', correlationId, 'failure', {
      projectId, error_class: (err as { constructor?: { name?: string } })?.constructor?.name ?? 'Error',
    });
    return false;
  }
}
