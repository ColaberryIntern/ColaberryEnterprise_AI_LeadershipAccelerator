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
import type { PrerequisiteGap, LifecycleEvidence, EvidenceField } from './lifecyclePrerequisites';
import type { TransitionDecision } from './lifecycleTransition';
import type { ManifestRefs } from './adapters/manifestRefs';
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
  // The project ids. WITHOUT THESE the manifest holding the evidence cannot be located from
  // a row, which is why `EVIDENCE_MEASUREMENTS` sat empty: the signature could not reach the
  // data. Exactly one is set, enforced by the table CHECK.
  student_project_id: string | null;
  delivery_project_id: string | null;
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
    student_project_id: (row.get('student_project_id') as string | null) ?? null,
    delivery_project_id: (row.get('delivery_project_id') as string | null) ?? null,
    stage: String(row.get('stage')),
    condition: (row.get('condition') as string | null) ?? null,
    condition_reason: (row.get('condition_reason') as string | null) ?? null,
  };
}

/**
 * THE MEASUREMENTS THIS READER CAN ACTUALLY TAKE, and the single source of the assessed set.
 *
 * Empty today. Nothing outside `lifecycle/generation/` imports the validators that would
 * populate these, and production never writes an `operating_blueprint_manifests` row, so there
 * is nothing to read. P5-T1.3 and P5-T1.4 add entries here as they add the writer and the
 * orchestrator.
 *
 * WHY A MAP RATHER THAN A HAND-WRITTEN SET. A verifier set the assessed set to three field
 * names while this function still returned `[]` for all three: 811 tests passed. Three fields
 * declared measured that nobody measured, and nothing noticed. A value-based assertion cannot
 * close that, because **`[]` is a legitimate MEASURED value** meaning "assessed, nothing
 * wrong" — so "declared measured but actually a placeholder" is undecidable from the value.
 *
 * Deriving the set from this map makes the two impossible to separate: there is one list, and
 * a field cannot appear in it without a function that measures it. `Partial` keyed on
 * `EvidenceField` also means a typo is a compile error rather than a phantom claim.
 */
/**
 * What a measurement is given. The ROW alone was not enough, which is why this exists.
 *
 * `Measurement` used to be `(row: LifecycleRow) => unknown`, and `LifecycleRow` is five columns:
 * id, tenant_id, stage, condition, condition_reason. **Not one of the ~25 fields on
 * `LifecycleEvidence` is derivable from those** — requirement provenance, process graphs,
 * allocation classes and approvals all live elsewhere. The map was empty because the signature
 * could not reach the data, not because nobody had got round to it.
 *
 * The evidence lives in the blueprint the `/compose` route validates and `manifestWriter`
 * persists as `operating_blueprint_manifests.refs_json`. So the I/O happens once, here, and each
 * measurement stays a PURE function of the result — which is what keeps them unit-testable with
 * a non-empty map, the property an earlier version of this file lost.
 */
export interface EvidenceContext {
  row: LifecycleRow;
  /** `null` when no manifest exists yet, or its refs could not be read. NOT an empty refs. */
  refs: ManifestRefs | null;
}

/**
 * What a measurement returns when it cannot measure THIS TIME.
 *
 * THIS CLOSES A FABRICATION PATH. `assessedFields` used to be `Object.keys(map)`, so a field was
 * claimed assessed because a function for it EXISTED — even on a call where that function had no
 * data and returned a placeholder. Every predicate would then trust the placeholder and the
 * NOT_ASSESSED refusal would silently become a pass: the exact gate bypass the T1.1
 * carry-forward named.
 *
 * "Assessed" now means MEASURED ON THIS CALL. A measurement that cannot see its data returns
 * this, the placeholder stands, and the field stays unassessed and therefore still blocking.
 */
export const NOT_MEASURED: unique symbol = Symbol('not measured');

type Measurement = (ctx: EvidenceContext) => unknown;

export const EVIDENCE_MEASUREMENTS: Partial<Record<EvidenceField, Measurement>> = {
  /**
   * Requirements carrying no recorded provenance.
   *
   * An EXACT mapping, which is why it is one of only two here. `SourceRef.provenanceKind` is
   * documented as "`null` means unrecorded. Never inferred by an adapter.", so the field and the
   * data mean the same thing and no judgement is being smuggled in.
   */
  requirementsWithoutProvenance: (ctx) => (!Array.isArray(ctx.refs?.sources)
    ? NOT_MEASURED
    : ctx.refs.sources.filter((s) => s.provenanceKind === null).map((s) => s.id)),

  /**
   * Source blocks still genuinely undecided.
   *
   * `SOURCE_STATES` documents `open` as "genuinely undecided. NOT zero, and NOT a default." It is
   * the only state of the six that means unresolved, so this is a mapping rather than a guess.
   */
  unresolvedSourceBlocks: (ctx) => (!Array.isArray(ctx.refs?.sources)
    ? NOT_MEASURED
    : ctx.refs.sources.filter((s) => s.state === 'open').map((s) => s.id)),

  // DELIBERATELY NOT `requirementCount: refs.sources.length`. `SourceRef` is documented as "a
  // requirement OR OTHER CAPTURED STATEMENT", so sources is a superset of requirements and
  // equating them would publish a count that means something slightly different from its name.
  // That is the shape of error this phase has been caught on repeatedly, and it is cheaper to
  // leave the field unassessed — where it BLOCKS — than to measure it approximately.
};

/**
 * The fields a measurement EXISTS for. Not the same as the fields measured on a given call.
 *
 * Still derived from the map, so a field cannot be listed without a function behind it. But the
 * authority on any single evidence object is its own `assessedFields`, which records what was
 * actually measured that time — see `NOT_MEASURED`.
 */
export const ASSESSED_EVIDENCE_FIELDS: ReadonlySet<EvidenceField> =
  new Set(Object.keys(EVIDENCE_MEASUREMENTS) as EvidenceField[]);

/**
 * Overlay real measurements onto the placeholder snapshot, and report EXACTLY what was
 * measured.
 *
 * PURE AND EXPORTED so it can be driven with a NON-EMPTY map. The previous version inlined this
 * loop inside the reader and the only test for it iterated the real map, which is empty — so the
 * test body never executed and **deleting the whole loop left 850 of 850 tests green.** A
 * verifier found it. The comment I had written there claimed it "CANNOT be vacuously satisfied
 * by a non-empty map", which is a declared expectation, and this run allows two categories
 * only: tested or removed.
 *
 * `assessedFields` is computed FROM THE MAP ARGUMENT, at call time, not read from a module-load
 * snapshot. That is what makes the wiring isolatable: a test can inject one measurement and
 * watch both the value and the set change together. With a snapshot, substituting an empty set
 * was undetectable, because at an empty map the snapshot IS empty.
 */
export function applyMeasurements(
  base: LifecycleEvidence,
  map: Partial<Record<EvidenceField, Measurement>>,
  ctx: EvidenceContext,
): LifecycleEvidence {
  const out: Record<string, unknown> = { ...base };
  const assessed = new Set<EvidenceField>();
  for (const [field, take] of Object.entries(map)) {
    const value = (take as Measurement)(ctx);
    // NOT_MEASURED leaves the placeholder standing AND the field unassessed, so the
    // prerequisite keeps blocking. Writing the placeholder while claiming the field was
    // assessed is the gate bypass this symbol exists to prevent.
    if (value === NOT_MEASURED) continue;
    out[field] = value;
    assessed.add(field as EvidenceField);
  }
  out.assessedFields = assessed;
  return out as unknown as LifecycleEvidence;
}

/**
 * Gather the evidence a prerequisite predicate needs.
 *
 * STILL STUBBED, and now HONESTLY stubbed. The previous version returned the "nothing assessed
 * yet" VALUE for each field — but `false` is not a non-answer, it is the strongest possible claim.
 * `graphHasStart: false` asserts that somebody read the transition graph and found no start node.
 * Three fields did that, and every array returned `[]`, which reads as "checked, nothing wrong"
 * and made `allocation_ready` and `plan_ready` permit unconditionally.
 *
 * Transitions were still refused overall, which is why this never bit — but the moment a surface
 * renders the blocker list (P5-T2), those become fabricated blockers shown to a human. So the
 * values stay as placeholders and `assessedFields` carries the truth: the predicates consult it
 * before trusting any field, and an unassessed prerequisite BLOCKS.
 *
 * EXPORTED because it was module-private, and an acceptance criterion that asserts what this
 * returns cannot be written against a private function.
 */
/**
 * The refs of the newest manifest for this project, or `null`.
 *
 * `null` on ANY of: no project id, no manifest row, no `refs_json`, unparseable JSON, or a
 * query that throws. Every one of those means the same thing to a caller — the evidence could
 * not be read — and the measurements above turn that into NOT_MEASURED, which leaves the
 * prerequisite BLOCKING rather than passing on a placeholder.
 *
 * The throw is caught and LOGGED with an `error_class`, not swallowed. CLAUDE.md forbids the
 * silent catch, and the honest answer here really is `null`: a status read should report "not
 * measured" rather than 500, because a project with no blueprint yet is the NORMAL case, not
 * an error.
 */
async function latestManifestRefs(row: LifecycleRow): Promise<ManifestRefs | null> {
  const projectId = row.student_project_id ?? row.delivery_project_id;
  if (projectId === null) return null;
  const column = row.student_project_id === null ? 'delivery_project_id' : 'student_project_id';

  try {
    const { sequelize } = await import('../../config/database');
    const rows = await sequelize.query<{ refs_json: unknown }>(
      `SELECT refs_json
         FROM operating_blueprint_manifests
        WHERE tenant_id = $1 AND ${column} = $2
        ORDER BY revision DESC
        LIMIT 1`,
      {
        bind: [row.tenant_id, projectId],
        type: (await import('sequelize')).QueryTypes.SELECT,
      },
    );
    const raw = rows[0]?.refs_json ?? null;
    if (raw === null) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed === null || typeof parsed !== 'object') return null;
    // NO SHAPE CHECK HERE ANY MORE. One lived here and survived mutation, because it sits
    // behind a database query and no test could reach it. Amendment 4 gives two options and
    // "untestable where it is" is not one of them, so the check moved INTO the measurements,
    // which take a plain context a test can hand a malformed object to directly.
    return parsed as ManifestRefs;
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'lifecycle_evidence_refs_unavailable',
      outcome: 'partial',
      error_class: e?.name ?? 'UnclassifiedError',
      context: { lifecycle_id: row.id, measured: false },
    }));
    return null;
  }
}

export async function readLifecycleEvidence(row: LifecycleRow): Promise<LifecycleEvidence> {
  // Placeholders for everything unmeasured. Their VALUES carry no meaning — `assessedFields`
  // is the authority, and a predicate that reads one of these without consulting it is a bug
  // (one such bug shipped in attempt 1 and a verifier found it in `blueprint_approved`).
  const base: LifecycleEvidence = {
    // Overwritten by `applyMeasurements` from the map it is handed. An empty set here rather
    // than the module snapshot, so the two cannot agree by coincidence.
    assessedFields: new Set<EvidenceField>(),
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

  return applyMeasurements(base, EVIDENCE_MEASUREMENTS, {
    row,
    refs: await latestManifestRefs(row),
  });
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
  const blockers = nextStage ? blockingGaps(prerequisiteGaps(nextStage, await readLifecycleEvidence(row))) : [];

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
      from: null, to: input.to, actorPermissions: [], evidence: await readLifecycleEvidence({
        id: '', tenant_id: '', stage: 'discovery', condition: null, condition_reason: null,
        // Both null: there is no project, so there is no manifest and nothing is measurable.
        // Every field stays unassessed, which keeps every prerequisite BLOCKING — the right
        // answer for a transition request against a project with no lifecycle row at all.
        student_project_id: null, delivery_project_id: null,
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
    evidence: await readLifecycleEvidence(row),
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
