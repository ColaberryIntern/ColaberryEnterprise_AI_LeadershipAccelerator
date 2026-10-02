/**
 * The service layer behind the lifecycle admin API: read status, request a transition, approve.
 *
 * WHY THE AUDITED GUARD LIVES HERE AND NOT IN THE ROUTE. `services/growthJourney/execution/
 * approvalApply.ts:48-62` is the one existing precedent for the audited tenancy guards, and it
 * calls them from a SERVICE: the route resolves the admin, the service builds the
 * `PlatformRequestContext` and judges access. That also matches `backend/CLAUDE.md`'s rule that
 * "identity resolution lives in services, not controllers".
 *
 * ROW CHECKS COME AFTER THE AUDITED GUARD, never instead of it. The guard records the decision —
 * allowed or denied — so a review can see who tried to reach what and whether they could. A row
 * check that runs first would answer the question without leaving a trace.
 *
 * Models and the connection are lazy-loaded inside each function, for the reason documented at
 * `routes/admin/factoryRoutes.ts:9-11`: a static model import initialises Sequelize at module
 * load and breaks every route test that stubs `config/database`.
 */
import type { LifecycleStage, LifecycleCondition } from './lifecycleStages';
import type { PrerequisiteGap, LifecycleEvidence } from './lifecyclePrerequisites';
import type { TransitionDecision } from './lifecycleTransition';
import type { ApprovalScope, ApproveBlueprintResult } from './blueprintApproval';

export type ProjectKind = 'student' | 'delivery';

export interface AdminIdentity {
  id?: string;
  email?: string;
  role?: string;
}

const RESOURCE_TYPE = 'project_lifecycle';

/**
 * What a project page needs to say where things stand without anyone opening a log.
 *
 * `blocker` and `nextActor` are part of the payload rather than something a caller infers from
 * the stage name, because the request is explicit: a user must be able to tell where a project
 * stands, what is missing, who acts next, and what the recoverable error is.
 */
export interface LifecycleStatus {
  projectId: string;
  kind: ProjectKind;
  stage: LifecycleStage;
  condition: LifecycleCondition | null;
  conditionReason: string | null;
  completedStages: ReadonlyArray<LifecycleStage>;
  /** The next stage, or null at steady state. */
  nextStage: LifecycleStage | null;
  /** What is missing before the next stage. Empty when it is ready. */
  blockers: ReadonlyArray<PrerequisiteGap>;
  /** The role that has to act, resolved from the next stage's required permission. */
  nextActorRole: string | null;
  /** One plain sentence. Safe to show a non-developer. */
  nextAction: string;
}

/** Narrow the Sequelize row to the fields this service reads. */
interface LifecycleRow {
  id: string;
  tenant_id: string;
  stage: string;
  condition: string | null;
  condition_reason: string | null;
}

/**
 * Load the lifecycle row for a project, then judge tenant access with the AUDITED guard.
 *
 * The read has to happen first because the guard needs the resource's tenant to judge against —
 * which is the same ordering `approvalApply` uses, and why the guard records the decision rather
 * than the caller silently returning null. Nothing is returned to the caller before the guard
 * has run.
 */
async function loadAndAuthorize(
  projectId: string,
  kind: ProjectKind,
  admin: AdminIdentity | undefined,
  action: 'read' | 'write',
): Promise<LifecycleRow | null> {
  if (!admin) {
    const { TenantAccessError } = await import('../../modules/tenancy/tenantAuthorization');
    throw new TenantAccessError('An authenticated identity is required.', 403, 'AuthorizationError');
  }

  const { default: ProjectLifecycleState } = await import('../../models/ProjectLifecycleState');
  const where = kind === 'student'
    ? { student_project_id: projectId }
    : { delivery_project_id: projectId };

  const row = await ProjectLifecycleState.findOne({ where });
  if (!row) return null;

  const tenantId = String(row.get('tenant_id'));
  const { contextFromAdminRequest } = await import('../../modules/tenancy/adminScopeBridge');
  const { requireTenantAccessAudited } = await import('../../modules/tenancy/tenantAccessGuards');
  const ctx = await contextFromAdminRequest(admin, { requestedTenantId: tenantId });

  // Throws TenantAccessError on denial, and records the decision either way.
  await requireTenantAccessAudited(ctx, tenantId, {
    resourceType: RESOURCE_TYPE,
    action,
    resourceId: String(row.get('id')),
    actorEmail: admin.email ?? null,
  });

  return {
    id: String(row.get('id')),
    tenant_id: tenantId,
    stage: String(row.get('stage')),
    condition: (row.get('condition') as string | null) ?? null,
    condition_reason: (row.get('condition_reason') as string | null) ?? null,
  };
}

/**
 * Gather the evidence a prerequisite predicate needs.
 *
 * STUBBED DELIBERATELY, and visibly. Every field is the honest "nothing assessed yet" value, not
 * a value that would let a stage pass. The adapters (P2-T5) produce the pinned references and
 * Phase 3 produces the allocation and effort measures that fill these in; wiring those here
 * before they exist would mean inventing readiness. The consequence is that a transition request
 * is currently REFUSED with the real list of what is missing, which is the correct behaviour for
 * a feature that ships dark — not a stub that waves projects through.
 */
async function gatherEvidence(row: LifecycleRow): Promise<LifecycleEvidence> {
  return {
    tenantId: row.tenant_id,
    requirementCount: 0,
    requirementsWithoutProvenance: [],
    uncitedRequirementSourceBlocks: [],
    unresolvedSourceBlocks: [],
    processesWithoutTasks: [],
    graphHasStart: false,
    graphHasEnd: false,
    unreachableTasks: [],
    unboundedReworkLoops: [],
    tasksWithoutExecutionClass: [],
    tasksWithoutAccountableHuman: [],
    agentTasksAccountableForThemselves: [],
    tasksUnmappedToSurface: [],
    screensWithoutRationale: [],
    selectedDesignRef: null,
    manifestContentHash: null,
    unknownAllocationCount: 0,
    effortCoverageDisclosed: false,
    proposedBy: null,
    approval: null,
    currentManifestRevision: null,
    actorStillAuthorized: true,
    mustHaveRequirementsWithoutStory: [],
    storiesWithoutTraceability: [],
  };
}

export async function readLifecycleStatus(input: {
  projectId: string;
  kind: ProjectKind;
  admin: AdminIdentity | undefined;
}): Promise<LifecycleStatus | null> {
  const row = await loadAndAuthorize(input.projectId, input.kind, input.admin, 'read');
  if (!row) return null;

  const stages = await import('./lifecycleStages');
  const { prerequisiteGaps, blockingGaps } = await import('./lifecyclePrerequisites');
  const { STAGE_PERMISSION } = await import('./lifecycleTransition');

  const stage = stages.isLifecycleStage(row.stage) ? row.stage : 'discovery';
  const nextStage = stages.ADVANCE[stage];
  const blockers = nextStage ? blockingGaps(prerequisiteGaps(nextStage, await gatherEvidence(row))) : [];

  return {
    projectId: input.projectId,
    kind: input.kind,
    stage,
    condition: stages.isLifecycleCondition(row.condition) ? row.condition : null,
    conditionReason: row.condition_reason,
    completedStages: stages.completedStages(stage),
    nextStage,
    blockers,
    nextActorRole: nextStage ? STAGE_PERMISSION[nextStage] : null,
    nextAction: !nextStage
      ? 'This project is operating. Changes re-enter blueprint approval.'
      : blockers.length === 0
        ? `Ready to advance to ${nextStage}.`
        : `${blockers.length} thing(s) must be resolved before ${nextStage}.`,
  };
}

export async function requestTransition(input: {
  projectId: string;
  kind: ProjectKind;
  to: LifecycleStage;
  reason: string | null;
  isDraftScenario: boolean;
  admin: AdminIdentity | undefined;
}): Promise<TransitionDecision> {
  const row = await loadAndAuthorize(input.projectId, input.kind, input.admin, 'write');
  if (!row) {
    const { evaluateTransition } = await import('./lifecycleTransition');
    // No lifecycle row means nothing to transition. Returned as a refusal rather than thrown, so
    // the route maps it like any other refusal instead of a 500.
    return evaluateTransition({
      from: null, to: input.to, actorPermissions: [], evidence: await gatherEvidence({
        id: '', tenant_id: '', stage: 'discovery', condition: null, condition_reason: null,
      }),
    });
  }

  const { evaluateTransition } = await import('./lifecycleTransition');
  const { deliveryPermissionsFor } = await import('../../modules/delivery/deliveryRoles');
  const roles = input.admin?.role ? [input.admin.role] : [];

  const decision = evaluateTransition({
    from: row.stage,
    to: input.to,
    actorPermissions: deliveryPermissionsFor(roles),
    isDraftScenario: input.isDraftScenario,
    evidence: await gatherEvidence(row),
  });

  if (!decision.allowed) return decision;

  // Conditional update, the pattern approvalApply uses: the write is scoped to the stage we
  // decided FROM, so two concurrent callers cannot both apply a transition — the loser updates
  // zero rows and is told the stage moved.
  const { default: ProjectLifecycleState } = await import('../../models/ProjectLifecycleState');
  const [updated] = await ProjectLifecycleState.update(
    {
      stage: decision.to as string,
      condition: decision.nextCondition,
      condition_reason: decision.nextCondition ? input.reason : null,
    },
    { where: { id: row.id, stage: row.stage } },
  );

  if (updated === 0) {
    return {
      ...decision,
      allowed: false,
      refusal: 'illegal_edge',
      message: 'The project stage changed while this request was in flight; nothing was applied.',
    };
  }

  return decision;
}

export async function approveLifecycleBlueprint(input: {
  projectId: string;
  kind?: ProjectKind;
  manifestId: string;
  expectedRevision: number;
  scope: ApprovalScope;
  rationale: string | null;
  selectedDesignRef: string | null;
  admin: AdminIdentity;
}): Promise<ApproveBlueprintResult> {
  // The manifest carries its own tenant, and approveBlueprint scopes its lookup by it — so the
  // tenant is resolved from the resource rather than from the caller's claim. The audited guard
  // runs on the lifecycle row first, which is what records the attempt.
  const kind: ProjectKind = input.kind ?? 'student';
  const row = await loadAndAuthorize(input.projectId, kind, input.admin, 'write');
  if (!row) {
    const { ManifestNotFoundError } = await import('./blueprintApproval');
    throw new ManifestNotFoundError();
  }

  const { approveBlueprint } = await import('./blueprintApproval');
  return approveBlueprint({
    tenantId: row.tenant_id,
    manifestId: input.manifestId,
    expectedRevision: input.expectedRevision,
    scope: input.scope,
    // From the authenticated session. Never from a request body.
    approvedBy: input.admin.email ?? input.admin.id ?? 'unknown-admin',
    approvedByRole: input.admin.role ?? null,
    rationale: input.rationale,
    selectedDesignRef: input.selectedDesignRef,
  });
}
