/**
 * THE REPAIR PATH FOR LC-01: register the lifecycle of a project the hooks left behind.
 * L7.6 blocker B3.
 *
 * ## The defect this closes
 *
 * `projectLifecycleRegistration` registers a lifecycle from a model hook that fires ONCE, at
 * creation. It is the only writer of `project_lifecycle_states` anywhere in the codebase. There
 * was no backfill job, no repair script, and no re-registration on next touch - so a project that
 * missed its hook missed it permanently, and `unregisteredStudentProjectsSince` could report the
 * condition while nothing in the system could act on it. A detector whose finding has no remedy
 * reports a fact an operator cannot use.
 *
 * Measured on production, 2026-11-16 (read-only):
 *
 *   | Student projects created since the hook went live (2026-10-12) | 29      |
 *   | Registered                                                     | 28      |
 *   | NOT registered                                                 | 1       |
 *   | Delivery projects since 2026-10-09, unregistered               | 0 of 11 |
 *   | POSITIVE CONTROL: the same two joins reaching back to 2020      | 63 and 4 |
 *
 * The control is the load-bearing row. A one and a zero from joins never shown returning rows are
 * indistinguishable from broken joins, and that is the mistake the B1 census caught in itself.
 *
 * ## It repairs WHAT THE DETECTOR FINDS, and nothing else
 *
 * The population comes from `unregisteredStudentProjectsSince` and
 * `unregisteredDeliveryProjectsSince`, not from a query written here. Three consequences, all
 * wanted:
 *
 *   - the repair can never register something the detector does not report, so it cannot act on a
 *     population nobody has measured;
 *   - the `since` cutoffs stay in one place, so this cannot drift into reporting the known legacy
 *     cohort (63 student rows that predate the hook) as repairable;
 *   - if the detector is ever corrected, the repair follows without being touched.
 *
 * ## What it refuses to do, and why each refusal is the honest branch
 *
 * **It does not resolve a tenant.** `project_lifecycle_states.tenant_id` is `NOT NULL REFERENCES
 * tenants(id)`, and a student project can exist with none - that is precisely how the one
 * production case arose, via `resolveStudentTenantId` returning null on a transient read.
 * Attributing a tenant from a repair script is a multi-tenancy DATA decision taken five days after
 * the fact on evidence that no longer exists, not a repair. Those rows are refused and named.
 *
 * AND THIS MODULE ONLY WORKS BECAUSE SOMETHING ELSE ALREADY MADE THAT DECISION. The one
 * production case is repairable solely because `db/ensureProjectTenantSchema` backfills
 * `tenant_id` at boot, so by the time this runs the row carries `colaberry`. That is a dependency
 * worth stating rather than a property of this code: on a database where the backfill had not run,
 * this module would refuse the very row it exists for.
 *
 * **It does not write a stage beyond the initial one.** `discovery` is the hook's value and the
 * column default, and it is the only stage a backfill can honestly claim: advancing a stage is a
 * governance event with evidence requirements, and this module has no evidence. The stage is not a
 * parameter, so no caller can turn a repair into a gate.
 *
 * **It does not claim the hook ran.** Repaired rows carry `entry_point` =
 * `lifecycle_repair.backfill`, a value no hook writes. Production currently holds exactly three
 * entry points - `project.afterCreate` (18), `delivery_project.afterCreate` (11) and
 * `agent_domain_factory_provisioner` (10), accounting for all 39 rows - so a repaired row stays
 * distinguishable from a hook-registered one for as long as the row exists. Reusing
 * `project.afterCreate` would have been fabricated provenance.
 *
 * **It does not report its own success.** `remainingAfter` is the detector RE-RUN after the
 * writes, not `candidates.length` minus the successes. Arithmetic over this module's own return
 * values would make the report a restatement of its intentions; the re-run makes it a measurement.
 *
 * ## Dry run is the default
 *
 * Following `backfillExplorerEnteredAt` and `backfillFreeAccountCoherence`: a module that derives
 * its own population must have the harmless call be the default one, so that writing takes an
 * explicit `dryRun: false`.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import {
  unregisteredDeliveryProjectsSince, unregisteredStudentProjectsSince,
} from './projectLifecycleRegistration';

/**
 * The provenance a repaired row carries forever. A value no hook writes, so a repaired lifecycle
 * is never mistaken for one the creation path registered.
 */
export const REPAIR_ENTRY_POINT = 'lifecycle_repair.backfill';

/** The only stage a backfill may write. Not a parameter - see the header. */
const INITIAL_STAGE = 'discovery';

export type RepairOutcome =
  /** The INSERT wrote a row. */
  | 'registered'
  /**
   * `ON CONFLICT DO NOTHING` fired, so a lifecycle already existed. The detector had just said
   * otherwise, so this means something registered the project between the two statements. Counted
   * separately rather than as a repair: this run did not do it.
   */
  | 'already_registered'
  /** A student project with no tenant. Not this module's decision to make. */
  | 'refused_no_tenant'
  /** The write itself failed. Reported per row so one bad row cannot hide the others. */
  | 'failed';

export interface RepairCandidate {
  id: string;
  side: 'student' | 'delivery';
  /** Null only on the student side, and the reason that row will be refused. */
  tenantId: string | null;
  createdAt: Date;
}

export interface RepairResult extends RepairCandidate {
  outcome: RepairOutcome;
  /** The lifecycle row written, when one was. */
  lifecycleId: string | null;
  /** The error CLASS on a failure, never the driver message: it can carry the connection string. */
  errorClass?: string;
}

export interface RepairReport {
  dryRun: boolean;
  candidates: RepairCandidate[];
  /** Empty on a dry run, because nothing was attempted. */
  results: RepairResult[];
  /**
   * The detector re-run AFTER the writes. `null` on a dry run, where nothing was written and the
   * candidate list is itself the measurement.
   */
  remainingAfter: number | null;
}

function log(fields: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: fields.outcome === 'failure' ? 'error' : 'info',
    service: 'backend',
    ...fields,
  }));
}

/**
 * Two literal statements rather than one with an interpolated column name.
 *
 * The side comes from a closed union so interpolation would be safe today, and a SQL identifier
 * assembled from a variable is the kind of thing a later edit widens without noticing. Each
 * conflict target names its partial unique index's predicate so inference resolves to it -
 * `uq_lifecycle_student_project` and `uq_lifecycle_delivery_project`, both verified present in
 * production.
 */
const INSERT_SQL: Record<RepairCandidate['side'], string> = {
  student: `INSERT INTO project_lifecycle_states
       (tenant_id, student_project_id, stage, entry_point)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (student_project_id) WHERE student_project_id IS NOT NULL DO NOTHING
     RETURNING id`,
  delivery: `INSERT INTO project_lifecycle_states
       (tenant_id, delivery_project_id, stage, entry_point)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (delivery_project_id) WHERE delivery_project_id IS NOT NULL DO NOTHING
     RETURNING id`,
};

/** Both detectors, in one list, with the side carried so the right statement can be chosen. */
async function findUnregistered(): Promise<RepairCandidate[]> {
  const [student, delivery] = await Promise.all([
    unregisteredStudentProjectsSince(),
    unregisteredDeliveryProjectsSince(),
  ]);
  return [
    ...student.map((r) => ({
      id: r.id, side: 'student' as const, tenantId: r.tenant_id, createdAt: r.created_at,
    })),
    ...delivery.map((r) => ({
      id: r.id, side: 'delivery' as const, tenantId: r.tenant_id, createdAt: r.created_at,
    })),
  ];
}

/**
 * One row, in its own statement.
 *
 * Deliberately NOT one transaction over the whole run: an unrepairable row must not roll back the
 * repairs that worked, and each row is independent of every other.
 */
async function registerOne(candidate: RepairCandidate): Promise<RepairResult> {
  if (!candidate.tenantId) {
    log({
      event: 'lifecycle_repair_refused',
      outcome: 'failure',
      error_class: 'ContractViolation',
      project_id: candidate.id,
      side: candidate.side,
      reason: 'tenant_unresolved',
      impact: 'This project cannot be registered without attributing it to a tenant, which is a '
        + 'data decision and not a repair. It stays unregistered and keeps being reported.',
    });
    return { ...candidate, outcome: 'refused_no_tenant', lifecycleId: null };
  }

  try {
    const inserted = await sequelize.query<{ id: string }>(INSERT_SQL[candidate.side], {
      bind: [candidate.tenantId, candidate.id, INITIAL_STAGE, REPAIR_ENTRY_POINT],
      type: QueryTypes.SELECT,
    });
    const lifecycleId = inserted[0]?.id ?? null;
    log({
      event: 'lifecycle_repair_registered',
      outcome: 'success',
      project_id: candidate.id,
      side: candidate.side,
      tenant_id: candidate.tenantId,
      lifecycle_id: lifecycleId,
      entry_point: REPAIR_ENTRY_POINT,
      // false means the detector raced us, which is not a repair this run performed.
      created: Boolean(lifecycleId),
    });
    return {
      ...candidate,
      outcome: lifecycleId ? 'registered' : 'already_registered',
      lifecycleId,
    };
  } catch (err: unknown) {
    log({
      event: 'lifecycle_repair_failed',
      outcome: 'failure',
      project_id: candidate.id,
      side: candidate.side,
      error_class: (err as { name?: string })?.name ?? 'UnclassifiedError',
    });
    return {
      ...candidate,
      outcome: 'failed',
      lifecycleId: null,
      errorClass: (err as { name?: string })?.name ?? 'UnclassifiedError',
    };
  }
}

/**
 * Register a lifecycle for every project the detectors report as having none.
 *
 * Dry run unless `dryRun: false` is passed explicitly. Never throws for a single row's sake: a
 * run reports every row's outcome, because a repair that aborts on the first failure leaves an
 * operator unable to tell what it did.
 */
export async function repairUnregisteredLifecycles(
  opts: { dryRun?: boolean } = {},
): Promise<RepairReport> {
  const dryRun = opts.dryRun !== false;
  const candidates = await findUnregistered();

  if (dryRun || candidates.length === 0) {
    log({
      event: 'lifecycle_repair_run',
      outcome: 'success',
      dry_run: dryRun,
      candidates: candidates.length,
      written: 0,
    });
    return { dryRun, candidates, results: [], remainingAfter: null };
  }

  const results: RepairResult[] = [];
  for (const candidate of candidates) {
    // Sequentially on purpose. The population is a handful of rows by construction, and a
    // concurrent fan-out onto the pool buys nothing while making the log order useless.
    // eslint-disable-next-line no-await-in-loop
    results.push(await registerOne(candidate));
  }

  // THE DETECTOR, RE-RUN. Not arithmetic over `results` - see the header.
  const remainingAfter = (await findUnregistered()).length;
  log({
    event: 'lifecycle_repair_run',
    outcome: remainingAfter > 0 ? 'failure' : 'success',
    dry_run: false,
    candidates: candidates.length,
    registered: results.filter((r) => r.outcome === 'registered').length,
    already_registered: results.filter((r) => r.outcome === 'already_registered').length,
    refused_no_tenant: results.filter((r) => r.outcome === 'refused_no_tenant').length,
    failed: results.filter((r) => r.outcome === 'failed').length,
    // Measured, not inferred. A non-zero here after a run is the honest report of a partial fix.
    remaining_after: remainingAfter,
  });

  return { dryRun: false, candidates, results, remainingAfter };
}

/**
 * Undo a repair, from the ledger the script wrote.
 *
 * NARROW BY CONSTRUCTION, because this is a DELETE on a governance table. A row is removed only
 * when its id is in the ledger AND its `entry_point` is `REPAIR_ENTRY_POINT`, so this can never
 * remove a lifecycle the creation hooks registered, whatever a ledger file claims. The predicate
 * is the guard; the ledger is only the list.
 *
 * It exists because the alternative to a reversible repair is a hand-written DELETE against
 * production, which is worse in every respect.
 */
export async function revertRepairedLifecycles(
  lifecycleIds: ReadonlyArray<string>,
  opts: { dryRun?: boolean } = {},
): Promise<{ dryRun: boolean; requested: number; deleted: string[] }> {
  const dryRun = opts.dryRun !== false;
  if (dryRun || lifecycleIds.length === 0) {
    return { dryRun, requested: lifecycleIds.length, deleted: [] };
  }

  const deleted = await sequelize.query<{ id: string }>(
    `DELETE FROM project_lifecycle_states
      WHERE id IN (:ids) AND entry_point = :entryPoint
      RETURNING id`,
    {
      // IN with a bound array, never ANY(:x): a Sequelize array replacement renders a malformed
      // Postgres array literal there, and that crash-looped production once already.
      replacements: { ids: [...lifecycleIds], entryPoint: REPAIR_ENTRY_POINT },
      type: QueryTypes.SELECT,
    },
  );

  log({
    event: 'lifecycle_repair_reverted',
    outcome: 'success',
    requested: lifecycleIds.length,
    deleted: deleted.length,
    // A gap means a ledger id was not a repaired row. The guard held; say so rather than hide it.
    not_deleted: lifecycleIds.length - deleted.length,
  });

  return { dryRun: false, requested: lifecycleIds.length, deleted: deleted.map((r) => r.id) };
}
