/**
 * renderProjectDocs - everything a published project's documents are rendered from, gathered once.
 *
 * ## Why this was lifted out of refreshRepoDocuments
 *
 * Two callers now need the SAME rendered files for a project:
 *
 *   1. `refreshRepoDocuments`, which commits them to the student's repository after a sync.
 *   2. The platform build (`platformBuild/`), which hands them to the build runner as the
 *      workspace the agent builds the Command Center in, and which serves `.colaberry/*.json`
 *      live beside the platform-hosted Command Center.
 *
 * If each caller gathered its own inputs (schedule, progress snapshot, truth, write access,
 * domain override, connected-demo flag), the platform-hosted Command Center and the repo copy
 * would drift the first time one of them gained an input the other did not. One function is
 * what makes "the same project renders the same files" true by construction.
 *
 * ## What it does not do
 *
 * It never writes. It never decides whether a repo exists: `repoUrl` is the caller's to pass,
 * and `null` is a supported value (the platform build renders projects that have no repo yet).
 *
 * Throws on unexpected errors; each caller owns its own failure posture (the repo refresh
 * never throws, the platform view returns a 503).
 */
import { BuildPlan } from './planContract';
import { getPublishedPlan, StoredPlan } from './planStore';
import { repoWriteAccessForProject } from './repoWriteAccess';
import { renderDocs, RenderedFile } from './renderDocs';
import { loadBuildProgress } from './buildProgressSnapshot';
import { scheduleForEnrollment, truthForRender } from './scheduleForEnrollment';
import { ensureGovPlanPublishedForSync, isGovBuildProjectVariables } from './govPlanForSync';
import { scheduleFromBoard } from './scheduleFromBoard';
import { connectedDemoMaterializedFor } from './connectedDemoFlag';
import { setupStoriesRetiredFor } from './setupStories';
import type { Schedule } from './buildSchedule';

export interface RenderProjectDocsOptions {
  correlationId?: string | null;
  /** The student's repo URL, or null when the project has none (platform-hosted build). */
  repoUrl: string | null;
  /** The caller already ran `ensureGovPlanPublishedForSync` for this project. */
  govPlanEnsured?: boolean;
}

export interface RenderedProjectDocs {
  stored: StoredPlan;
  enrollmentId: string;
  files: RenderedFile[];
  /** The schedule the files were dated from, for callers that build a prompt beside them. */
  schedule: Schedule | null;
}

/** Null when the project has no published plan. */
export async function renderProjectDocs(
  projectId: string,
  opts: RenderProjectDocsOptions,
): Promise<RenderedProjectDocs | null> {
  const correlationId = opts.correlationId ?? null;

  // Gov builds publish their plan only when the gov cockpit view is opened, so a render must
  // publish it itself. Idempotent, gated to gov builds, best-effort.
  if (!opts.govPlanEnsured) await ensureGovPlanPublishedForSync(projectId, correlationId);

  const stored = await getPublishedPlan(projectId);
  if (!stored) return null;

  const { default: Project } = await import('../../models/Project');
  const project = await Project.findByPk(projectId);
  const enrollmentId = String((project as any)?.enrollment_id ?? '');

  const plan = stored.plan as BuildPlan;
  // A GOV build's tasks are dated by the deadline back-scheduler, so its plan.json takes its
  // dates FROM THE BOARD. `stored.published_at`, never `new Date()`: this runs on every sync,
  // and a wall-clock floor would push the whole schedule out each time the student pushed.
  const isGov = isGovBuildProjectVariables((project as { project_variables?: unknown } | null)?.project_variables);
  const schedule =
    (isGov ? await scheduleFromBoard(projectId) : null)
    ?? (enrollmentId
      ? await scheduleForEnrollment(enrollmentId, plan, correlationId, stored.published_at)
      : null);
  const snapshot = await loadBuildProgress(projectId, enrollmentId || null);

  // Asked explicitly, never inferred from a repo being present. See repoWriteAccess.ts.
  const writeAccess = await repoWriteAccessForProject(projectId, correlationId);

  // AF3.9. An agent-domain project's Command Center is `<domain>.STORY-000`. Null for every
  // ordinary build. Never throws.
  const { domainCommandCenterOverrideForProject } =
    await import('../agentDomain/agentDomainCommandCenterForSync');
  const commandCenterOverride = await domainCommandCenterOverrideForProject(projectId, correlationId);

  // The student's own account of the project. Never throws.
  const truth = await truthForRender(projectId, correlationId);

  const files = renderDocs(plan, {
    repoUrl: opts.repoUrl,
    generatedAt: new Date().toISOString(),
    planVersion: stored.version,
    planSha256: stored.plan_sha256,
    correlationId: correlationId ?? undefined,
    projectId,
    truthRevision: stored.truth_revision ?? null,
    truth,
    schedule,
    progress: snapshot.progress,
    baselineByStory: snapshot.baselineByStory,
    repoWriteAccess: writeAccess,
    commandCenterOverride,
    // From the BOARD, not from the env flag, so a narrowed rollout never deletes the demo
    // instructions out from under a student already building one. See connectedDemoFlag.ts.
    connectedDemo: await connectedDemoMaterializedFor(projectId),
    setupRetired: await setupStoriesRetiredFor(projectId),
  });

  return { stored, enrollmentId, files, schedule: schedule ?? null };
}
