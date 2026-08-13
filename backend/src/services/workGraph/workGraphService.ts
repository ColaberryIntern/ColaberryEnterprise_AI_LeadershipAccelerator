import { Op } from 'sequelize';
import { TicketWorkUnit, WorkUnitDependency, ResourceLease } from '../../models';
import {
  createWorkUnitInputSchema,
  createWorkUnitDependencySchema,
  type CreateWorkUnitInput,
  type CreateWorkUnitDependencyInput,
} from '../../schemas/workGraphSchema';

// ProofDesk Work Graph (Milestone 3) — read/write service backing T010's routes
// and T011's Work Graph tab. Work units are opt-in: nothing auto-creates them for
// a ticket, so most tickets have zero (see WorkGraphTab.tsx's honest empty state).
//
// Failure-First Design:
// 1. What happens if this fails? Malformed input rejected before any write
//    (WorkGraphValidationError, matching DecisionRecordValidationError's
//    established shape in this repo). A DB failure propagates to the caller.
// 2. Retry? None automatic — these are one-shot admin/API actions, not a
//    replay-safe background operation.
// 3. Recovery if exhausted? None automatic in this milestone; a failed write
//    never lands (no partial-commit — each is a single Sequelize .create()).
// 4. Explicit failure modes handled: malformed envelope, self-referential
//    dependency, cyclic dependency. Not handled: DB fully unavailable — propagates.

// `as any` justification (CLAUDE.md Contract Enforcement Layer), applies to every
// `as any`/`as any[]` cast in this file: Sequelize's `.create()` doesn't accept a
// plain attributes object without a generic hint these declare-style models (see
// AgentRun.ts) don't provide, and `.findAll()`'s return type doesn't expose raw
// column names without the same hint — this is the exact same, already-established
// pattern `decisionRecordService.ts`'s `DecisionRecord.create(... as any)` uses in
// this repo. One comment here rather than six identical inline ones.
export class WorkGraphValidationError extends Error {
  error_class = 'WorkGraphValidationError';
  issues?: unknown;

  constructor(message: string, issues?: unknown) {
    super(message);
    this.name = 'WorkGraphValidationError';
    this.issues = issues;
  }
}

export async function createWorkUnit(ticketId: string, input: CreateWorkUnitInput): Promise<TicketWorkUnit> {
  const parsed = createWorkUnitInputSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new WorkGraphValidationError(`Malformed work unit input: ${detail}`, parsed.error.issues);
  }
  const data = parsed.data;

  return TicketWorkUnit.create({
    ticket_id: ticketId,
    work_context_id: data.workContextId ?? null,
    title: data.title,
    description: data.description ?? null,
    required_capability: data.requiredCapability,
    target_resource_scope: data.targetResourceScope ?? null,
    acceptance_criteria: data.acceptanceCriteria ?? null,
    status: data.status ?? 'pending',
    risk_tier: data.riskTier ?? 'R0',
    approval_policy: data.approvalPolicy ?? 'auto',
    verification_contract: data.verificationContract ?? null,
    eligible_parallelism: data.eligibleParallelism ?? 1,
    expected_output_refs: data.expectedOutputRefs ?? [],
  } as any);
}

export async function listWorkUnitsForTicket(ticketId: string): Promise<TicketWorkUnit[]> {
  return TicketWorkUnit.findAll({ where: { ticket_id: ticketId }, order: [['created_at', 'ASC']] });
}

/** Follows depends_on edges forward from `fromId` looking for `toId` — used to
 * detect whether adding a new edge would close a cycle. Small graphs (per-ticket
 * work units), so a plain DFS is more than sufficient; no need for a graph library. */
async function hasPath(fromId: string, toId: string, visited: Set<string> = new Set()): Promise<boolean> {
  if (fromId === toId) return true;
  if (visited.has(fromId)) return false;
  visited.add(fromId);

  const edges = await WorkUnitDependency.findAll({ where: { work_unit_id: fromId } });
  for (const edge of edges) {
    if (await hasPath((edge as any).depends_on_work_unit_id, toId, visited)) return true;
  }
  return false;
}

/**
 * Adds a dependency edge: workUnitId depends on (is blocked by) the target in
 * `input`. Rejects a self-reference and rejects any edge that would create a
 * cycle (a path already exists from the target back to workUnitId) — both are
 * pure-validation failures caught before any DB write, matching the mandatory
 * failure-path/boundary-case test types.
 */
export async function addWorkUnitDependency(
  workUnitId: string,
  input: CreateWorkUnitDependencyInput
): Promise<WorkUnitDependency> {
  const parsed = createWorkUnitDependencySchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new WorkGraphValidationError(`Malformed dependency input: ${detail}`, parsed.error.issues);
  }
  const { dependsOnWorkUnitId, dependencyType } = parsed.data;

  if (dependsOnWorkUnitId === workUnitId) {
    throw new WorkGraphValidationError('A work unit cannot depend on itself');
  }

  const wouldCreateCycle = await hasPath(dependsOnWorkUnitId, workUnitId);
  if (wouldCreateCycle) {
    throw new WorkGraphValidationError(
      `Adding this dependency would create a cycle: work unit ${dependsOnWorkUnitId} already (transitively) depends on ${workUnitId}`
    );
  }

  return WorkUnitDependency.create({
    work_unit_id: workUnitId,
    depends_on_work_unit_id: dependsOnWorkUnitId,
    dependency_type: dependencyType ?? 'blocks',
  } as any);
}

export interface WorkGraphView {
  workUnits: Array<{
    id: string;
    title: string;
    status: string;
    required_capability: string;
    risk_tier: string;
    assigned_agent_name: string | null;
    assigned_run_id: string | null;
    activeLease: { id: string; lease_owner: string; expires_at: Date } | null;
  }>;
  dependencies: Array<{
    id: string;
    work_unit_id: string;
    depends_on_work_unit_id: string;
    dependency_type: string;
  }>;
}

/** Unified read for the Work Graph tab (T011): work units, their dependency
 * edges, and each unit's currently-active lease (if any), in one call. */
export async function getWorkGraphForTicket(ticketId: string): Promise<WorkGraphView> {
  const workUnits = await TicketWorkUnit.findAll({
    where: { ticket_id: ticketId },
    order: [['created_at', 'ASC']],
  });
  const workUnitIds = workUnits.map((u: any) => u.id);

  const [dependencies, activeLeases] = workUnitIds.length
    ? await Promise.all([
        WorkUnitDependency.findAll({ where: { work_unit_id: { [Op.in]: workUnitIds } } }),
        ResourceLease.findAll({ where: { work_unit_id: { [Op.in]: workUnitIds }, status: 'active' } }),
      ])
    : [[], []];

  const leaseByWorkUnit = new Map<string, any>();
  for (const lease of activeLeases as any[]) {
    leaseByWorkUnit.set(lease.work_unit_id, lease);
  }

  return {
    workUnits: (workUnits as any[]).map((u) => {
      const lease = leaseByWorkUnit.get(u.id);
      return {
        id: u.id,
        title: u.title,
        status: u.status,
        required_capability: u.required_capability,
        risk_tier: u.risk_tier,
        assigned_agent_name: u.assigned_agent_name,
        assigned_run_id: u.assigned_run_id,
        activeLease: lease ? { id: lease.id, lease_owner: lease.lease_owner, expires_at: lease.expires_at } : null,
      };
    }),
    dependencies: (dependencies as any[]).map((d) => ({
      id: d.id,
      work_unit_id: d.work_unit_id,
      depends_on_work_unit_id: d.depends_on_work_unit_id,
      dependency_type: d.dependency_type,
    })),
  };
}
