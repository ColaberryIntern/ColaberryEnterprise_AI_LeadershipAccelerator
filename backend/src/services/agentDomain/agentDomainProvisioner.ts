/**
 * Provision the ten agent-domain projects: one transaction per domain, idempotent by derived id,
 * writing only the declared tables and reaching no post-approval stage.
 *
 * Run `20261007-school-agent-factory` (T14), session CC-20261006-a4k7.
 *
 * ## What makes a second run write nothing
 *
 * Every id is derived from the domain key (`agentDomainProvisionPlan.ts`). The three INSERTs this
 * module issues carry that id explicitly with `ON CONFLICT DO NOTHING ... RETURNING id`.
 * CORRECTED: this used to say "every INSERT", which stopped being true at the LC-01 rework --
 * `projects` now goes through `Project.findOrCreate` so the model hooks fire, and
 * `project_lifecycle_states` is written by the afterCreate HOOK, not by this module at all.
 * So the thing that stops a
 * duplicate is a PRIMARY KEY or a UNIQUE INDEX, enforced by Postgres inside the transaction, not a
 * read-then-write check that two concurrent callers could both pass. See correction C in the plan
 * module for why the anchor cannot be inserted first.
 *
 * **Counts are read from `RETURNING`, never from the length of what was submitted.** A row that
 * `ON CONFLICT` discarded still has an id on the client side, so `rows.length` of the input is
 * always the input size and can never report zero. That exact mistake shipped in this repo on
 * 2026-10-02 in a different feature; it is not repeated here.
 *
 * ## What it refuses to do
 *
 * It never calls `createNewProjectForEnrollment` (`projectService.ts:121` always creates AND
 * ACTIVATES), never calls `publishBuild`, never writes `enrollments.active_project_id`, never adds
 * to `AGENT_REGISTRY` and never writes `ai_agents`. Those are grepped for by name in the test
 * rather than promised here.
 *
 * It writes `project_lifecycle_states` at `discovery` only. `FORBIDDEN_STAGES` is a deliberate
 * superset of the repo's `POST_APPROVAL_STAGES`, and the stage is checked against it at runtime as
 * well as in a test, because a readiness figure that overstates itself is the specific failure the
 * owner named.
 *
 * ## Failure path
 *
 * One transaction per domain, so a failure rolls that domain back whole and leaves the other nine
 * untouched — there is no partial project. A domain that throws is recorded in `failed` with its
 * error class and the run continues, because nine provisioned projects plus one named failure is a
 * better outcome than ten unprovisioned ones. No retry: an insert that failed for a real reason
 * fails the same way twice, and an unbounded retry is forbidden by CLAUDE.md. Recovery is to fix
 * the cause and re-run, which is safe precisely because the operation is idempotent.
 */

import { randomUUID } from 'crypto';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import Project from '../../models/Project';
import {
  AGENT_DOMAIN_PROGRAM_BLUEPRINT_ID,
  AGENT_DOMAIN_PROGRAM_BLUEPRINT_NAME,
  FORBIDDEN_STAGES,
  PERMITTED_BUILDER_STATES,
  PROVISION_STAGE,
  TENANT_SLUG,
  planAllProvisions,
  planProvision,
  type ProvisionPlan,
} from './agentDomainProvisionPlan';
import { domainProjectName } from './agentDomainRegistry';

export interface ProvisionContext {
  readonly sequelize: Sequelize;
  /** Recorded on the anchor as `provisioned_by`. A real actor string, not a placeholder. */
  readonly provisionedBy: string;
  /** Propagated to every log line so a partial run can be traced end to end. Minted if absent. */
  readonly correlationId?: string;
}

export interface DomainProvisionResult {
  readonly domain_key: string;
  readonly project_id: string;
  readonly anchor_id: string;
  /** Rows genuinely inserted, read back from RETURNING. Zero on a re-run. */
  readonly inserted: Readonly<Record<string, number>>;
  readonly already_present: boolean;
}

export interface ProvisionRunResult {
  readonly provisioned: ReadonlyArray<DomainProvisionResult>;
  readonly failed: ReadonlyArray<{ domain_key: string; error_class: string; message: string }>;
}

/**
 * The tenant these projects belong to, resolved by slug.
 *
 * EXPORTED, because every writer into `agent_domain_projects` needs it and the one that did not
 * have it clobbered another tenant's row. `uq_agent_domain_key` is on (tenant_id, domain_key), so
 * a domain key is NOT unique on its own and an UPDATE without this predicate reaches every
 * tenant that holds the same key.
 */
export async function resolveTenantId(sequelize: Sequelize, tx: Transaction): Promise<string> {
  const rows = await sequelize.query<{ id: string }>(
    `SELECT id FROM tenants WHERE slug = $1`,
    { bind: [TENANT_SLUG], type: QueryTypes.SELECT, transaction: tx },
  );
  if (rows.length !== 1) {
    throw new Error(
      `TenantResolutionError: expected exactly one tenant with slug '${TENANT_SLUG}', found ${rows.length}`,
    );
  }
  return rows[0].id;
}

/**
 * The enrollment a provisioned project is owned by, which must be an AI-staff enrollment.
 *
 * `projects.enrollment_id` is NOT NULL and references a real person's enrollment, so this is the
 * one place a mistake here would attach an agent-domain project to a human's portal. The guard is
 * therefore a positive assertion against `admin_users.role = 'ai_staff'` rather than a check that
 * the enrollment is *not* one of the interns: an allowlist cannot be defeated by a name nobody
 * thought of.
 */
async function resolveAiStaffEnrollment(sequelize: Sequelize, tx: Transaction): Promise<string> {
  const rows = await sequelize.query<{ id: string; email: string }>(
    `SELECT e.id, au.email
       FROM enrollments e
       JOIN admin_users au ON lower(au.email) = lower(e.email)
      WHERE au.role = 'ai_staff'
      ORDER BY e.created_at ASC
      LIMIT 1`,
    { type: QueryTypes.SELECT, transaction: tx },
  );
  if (rows.length !== 1) {
    throw new Error(
      'AiStaffEnrollmentError: no enrollment resolves to an admin_users row with role=\'ai_staff\'. '
      + 'Provisioning is refused rather than attaching an agent-domain project to a human enrollment.',
    );
  }
  return rows[0].id;
}

/**
 * The blueprint these projects belong to, resolved BY ID and verified by name.
 *
 * This used to be `ORDER BY created_at ASC LIMIT 1`. Measured against production before the first
 * provisioning run, that returns "Enterprise AI Leadership Accelerator" -- the customer programme.
 * Ten internal AI-employee projects would have been created against it and nothing would have
 * failed; the only trace would have been a `program_id` nobody reads.
 *
 * The name is checked as well as the id, so a recycled id cannot pass silently, and absence is a
 * named refusal rather than a fallback to whatever happens to be oldest.
 */
async function resolveProgramId(sequelize: Sequelize, tx: Transaction): Promise<string> {
  const rows = await sequelize.query<{ id: string; name: string }>(
    `SELECT id, name FROM program_blueprints WHERE id = $1`,
    {
      bind: [AGENT_DOMAIN_PROGRAM_BLUEPRINT_ID],
      type: QueryTypes.SELECT,
      transaction: tx,
    },
  );
  if (rows.length !== 1) {
    throw new Error(
      `ProgramBlueprintError: no program_blueprints row with id ${AGENT_DOMAIN_PROGRAM_BLUEPRINT_ID}. `
      + 'That is the blueprint T02 seeded for internal AI-employee work. Run '
      + 'seedAgentDomainIdentityPrereqs.js first. Refusing rather than falling back to another '
      + 'blueprint: the fallback this replaced resolved to the customer-facing accelerator.',
    );
  }
  if (rows[0].name !== AGENT_DOMAIN_PROGRAM_BLUEPRINT_NAME) {
    throw new Error(
      `ProgramBlueprintError: ${AGENT_DOMAIN_PROGRAM_BLUEPRINT_ID} is named '${rows[0].name}', `
      + `expected '${AGENT_DOMAIN_PROGRAM_BLUEPRINT_NAME}'. The id has been reused for something `
      + 'else; refusing rather than attaching ten projects to it.',
    );
  }
  return rows[0].id;
}

/** A scalar count, for reading back what a hook wrote rather than assuming it. */
async function countRows(
  sequelize: Sequelize, tx: Transaction, sql: string, bind: unknown[],
): Promise<number> {
  const rows = await sequelize.query<{ n: string }>(sql, { bind, type: QueryTypes.SELECT, transaction: tx });
  return Number(rows[0]?.n ?? 0);
}

/** Rows actually inserted by one statement, counted from RETURNING. */
async function insertedCount(
  sequelize: Sequelize, tx: Transaction, sql: string, bind: unknown[],
): Promise<number> {
  const rows = await sequelize.query<{ id: string }>(sql, { bind, type: QueryTypes.SELECT, transaction: tx });
  return rows.length;
}

async function provisionOne(
  ctx: ProvisionContext, plan: ProvisionPlan, tx: Transaction, correlationId: string,
): Promise<DomainProvisionResult> {
  const { sequelize } = ctx;
  const started = Date.now();

  // Runtime guard, not only a test: a stage outside the permitted one never reaches the database.
  if (plan.stage !== PROVISION_STAGE || FORBIDDEN_STAGES.has(plan.stage)) {
    throw new Error(`ForbiddenStageError: refusing to provision '${plan.domain_key}' at stage '${plan.stage}'`);
  }
  if (plan.intended_builder_state && !PERMITTED_BUILDER_STATES.includes(plan.intended_builder_state)) {
    throw new Error(
      `BuilderStateError: '${plan.intended_builder_state}' is not one of ${PERMITTED_BUILDER_STATES.join(', ')}`,
    );
  }

  const tenantId = await resolveTenantId(sequelize, tx);
  const enrollmentId = await resolveAiStaffEnrollment(sequelize, tx);
  const programId = await resolveProgramId(sequelize, tx);

  const inserted: Record<string, number> = {};

  // THROUGH THE MODEL, not raw SQL. `Project` carries two hooks that a raw INSERT fires neither
  // of: `beforeCreate` resolves the tenant, `afterCreate` registers the lifecycle. Upstream's
  // LC-01 work added a tripwire forbidding a raw insert here, and the reasoning is not a nit -- a
  // hand-maintained list of creation chokepoints was measured wrong within a week, and this repo
  // had already lost ledger events on ~90% of 16,070 production tickets to the same bypass.
  //
  // `findOrCreate` rather than `create`: the id is derived, so a re-run would otherwise raise a
  // unique violation. It fires `afterCreate` ONLY when it actually creates, which is what keeps
  // the second run a no-op -- `studentProjectLifecycleHook`'s own docblock says so.
  //
  // `tenant_id` is passed explicitly even though `beforeCreate` would resolve it: this function
  // already resolved the tenant by slug and refuses when it is ambiguous, and the hook honours an
  // id that is already set (`if (instance.tenant_id) return`).
  //
  // AF2.7 item 3: `name` is the domain's TITLE, not its key. This read `plan.domain_key`, so the
  // ten shipped reading `admissions` / `product_experience` on a page where every other project
  // has a human name. Note `findOrCreate` honours `defaults` only when it actually creates, so
  // fixing this does NOT repair the ten rows already in production — a re-run is a no-op by
  // design. `backend/src/scripts/renameAgentDomainProjects.js` does that, using this same
  // `domainProjectName` so the two can never disagree.
  const [, projectCreated] = await Project.findOrCreate({
    where: { id: plan.project_id },
    defaults: {
      id: plan.project_id,
      enrollment_id: enrollmentId,
      program_id: programId,
      name: domainProjectName(plan.domain_key),
      project_stage: PROVISION_STAGE,
      tenant_id: tenantId,
    } as never,
    transaction: tx,
    // The hook reads this and records it as the lifecycle's `entry_point`, which is how
    // `discovery`'s own prerequisite ("project registered against a tenant; entry point
    // recorded") is satisfied. Cast because the option is an extension Sequelize does not type.
    lifecycleEntryPoint: plan.entry_point,
  } as never);
  inserted.projects = projectCreated ? 1 : 0;

  // `manager_can_reach` and `manager_blocker` were MISSING from this list, so all ten anchors
  // landed in production with NULL in both. The schema declares them and the plan says the anchor
  // records them; a column that is always NULL is a column the next person deletes.
  inserted.agent_domain_projects = await insertedCount(sequelize, tx,
    `INSERT INTO agent_domain_projects
       (id, tenant_id, student_project_id, domain_key, agent_id, manager_identity_id,
        manager_can_reach, manager_blocker,
        intended_builder, intended_builder_state, provisioned_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [plan.anchor_id, tenantId, plan.project_id, plan.domain_key, plan.agent_id,
      plan.manager_identity_id, plan.manager_can_reach, plan.manager_blocker,
      plan.intended_builder, plan.intended_builder_state, ctx.provisionedBy],
  );

  // NOT written here. `studentProjectLifecycleHook` wrote this row inside this transaction when
  // `findOrCreate` created the project above, at `INITIAL_STAGE` ('discovery' -- the same stage
  // this provisioner declares) with `entry_point` set to what was passed. Writing it by hand as
  // well would be the parallel path the hook exists to eliminate, and would double-count.
  //
  // The count is READ BACK rather than assumed, because "the hook did it" is exactly the kind of
  // claim this run has been caught making without evidence.
  // READ BACK, then scoped to THIS run. The count query proves the hook actually wrote a row --
  // a silent hook failure shows up as 0 rather than as an assumption -- but `inserted` means
  // "written by this run" for every other table, and reporting an existing row as an insert broke
  // `already_present` on a re-run. So the read-back is the evidence and `projectCreated` is the
  // scope.
  const lifecycleRows = await countRows(sequelize, tx,
    `SELECT count(*)::text AS n FROM project_lifecycle_states WHERE student_project_id = $1`,
    [plan.project_id],
  );
  inserted.project_lifecycle_states = projectCreated ? lifecycleRows : 0;

  let releases = 0;
  for (const r of plan.releases) {
    releases += await insertedCount(sequelize, tx,
      `INSERT INTO student_task_lists
         (id, project_id, enrollment_id, cluster, title, status, position, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'not_started', $6, now(), now())
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [r.id, plan.project_id, enrollmentId, r.cluster, r.title, r.position],
    );
  }
  inserted.student_task_lists = releases;

  const releaseIdByCluster = new Map(plan.releases.map((r) => [r.cluster, r.id]));
  let stories = 0;
  for (const s of plan.stories) {
    const listId = releaseIdByCluster.get(s.release_cluster);
    if (!listId) {
      throw new Error(`OrphanStoryError: story '${s.story_id}' names release '${s.release_cluster}', which has none`);
    }
    stories += await insertedCount(sequelize, tx,
      // `title` and `description` carry the same VALUE through two separate PLACEHOLDERS ($4, $5).
      // Sharing one placeholder across them is a parse error, not a style choice: Postgres deduces
      // a parameter's type from each use site, `title` is varchar(500) and `description` is text,
      // and one parameter cannot be both. The Command Center backfill shipped with them sharing
      // `$4` and refused all ten domains in production with "inconsistent types deduced for
      // parameter $4". The same applies to `acceptance`, which is why it is cast once, explicitly.
      `INSERT INTO student_tasks
         (id, task_list_id, project_id, title, description, narrative, build, status, position,
          story_id, release_key, capability_id, autonomy_stage, story_kind, acceptance,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'not_started', $8, $9, $10, $11, $12, $13, $14::jsonb,
               now(), now())
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [s.id, listId, plan.project_id, s.title, s.title, s.narrative, s.build, s.position,
        s.story_id, s.release_key, s.capability_id, s.autonomy_stage, s.kind,
        // NULL rather than `[]` when the generator has no criteria to give. An empty array would
        // read as "acceptance was authored and is empty", and AF10.2 owns that column for every
        // kind except `release_behaviour`, whose criteria come straight from the capability record.
        s.acceptance.length > 0 ? JSON.stringify([...s.acceptance]) : null],
    );
  }
  inserted.student_tasks = stories;

  // `agent_domain_build_authorizations` is in the declared write-set and receives ZERO rows: an
  // authorization records a named human's approval, and nobody has approved a build.
  inserted.agent_domain_build_authorizations = 0;

  const total = Object.values(inserted).reduce((a, b) => a + b, 0);
  const result: DomainProvisionResult = {
    domain_key: plan.domain_key,
    project_id: plan.project_id,
    anchor_id: plan.anchor_id,
    inserted,
    already_present: total === 0,
  };

  // Logged HERE, not in the loop that calls this. It used to live in `provisionAllDomains`, so a
  // single-domain `provisionDomain` call wrote 76 rows for marketing (1+1+1+3+70, MEASURED after
  // "roughly 45" was found wrong) and emitted nothing -- the same
  // observability gap one level down, attached to the loop instead of to the unit of work.
  //
  // `already_present` is a re-run that wrote nothing, which is a DIFFERENT outcome from a run that
  // created the project. This was `? 'success' : 'success'` -- a conditional that could not
  // condition, in the one field CLAUDE.md constrains to success|failure|partial.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'backend',
    event: 'agent_domain_provisioned',
    correlation_id: correlationId,
    duration_ms: Date.now() - started,
    outcome: result.already_present ? 'partial' : 'success',
    context: {
      domain_key: plan.domain_key,
      project_id: result.project_id,
      already_present: result.already_present,
      inserted,
    },
  }));

  return result;
}

export interface AnchorReconcileResult {
  readonly domain_key: string;
  readonly changed: boolean;
  readonly manager_can_reach: boolean;
  readonly manager_blocker: string | null;
}

/**
 * Bring existing anchor rows in line with the registry's MEASURED reachability.
 *
 * An INSERT cannot fix rows that already exist, and folding this into `ON CONFLICT DO UPDATE` is
 * not an option: the conflict would then RETURN a row, `insertedCount` would report a re-run as an
 * insert, and `already_present` -- the signal the idempotency tests check -- would stop being true.
 *
 * Idempotent by construction: the UPDATE is scoped `WHERE ... IS DISTINCT FROM`, so a second run
 * changes nothing and says so. `IS DISTINCT FROM` rather than `<>` because the columns are
 * nullable and `NULL <> false` is NULL, which would match nothing and silently do no work -- the
 * exact failure this function exists to repair.
 *
 * ## TENANT-SCOPED, after an independent re-grade REPRODUCED A CROSS-TENANT WRITE here
 *
 * This UPDATE was `WHERE domain_key = $1` with no tenant predicate. `uq_agent_domain_key` is on
 * **(tenant_id, domain_key)**, so the same domain key may legitimately exist for several tenants --
 * and the statement reached every one of them. A verifier planted a second tenant holding
 * `domain_key = 'marketing'` with its own measured blocker, ran this function, and watched the
 * other tenant's `manager_can_reach` and `manager_blocker` get CLOBBERED. `changed: true` was
 * misreported too: it was true when the only row touched belonged to a different tenant.
 *
 * Latent with one tenant, and still a destructive write in net-new code. `provisionOne` resolved
 * the tenant 170 lines above for its INSERT path; this function simply did not. The long comment
 * above about `IS DISTINCT FROM` being load-bearing was written while the tenant scope was missing
 * entirely, which is what reasoning carefully about the wrong clause looks like.
 */
export async function reconcileAnchorMetadata(
  ctx: ProvisionContext,
): Promise<AnchorReconcileResult[]> {
  const out: AnchorReconcileResult[] = [];
  // One transaction for the whole reconcile: the tenant is resolved once, and every UPDATE is
  // bound to it. `resolveTenantId` throws unless EXACTLY one tenant carries the slug, so an
  // ambiguous environment fails loudly rather than reconciling into whichever row came back first.
  await ctx.sequelize.transaction(async (tx) => {
    const tenantId = await resolveTenantId(ctx.sequelize, tx);
    for (const plan of planAllProvisions()) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await ctx.sequelize.query<{ id: string }>(
        `UPDATE agent_domain_projects
            SET manager_can_reach = $2, manager_blocker = $3, updated_at = now()
          WHERE domain_key = $1
            AND tenant_id = $4
            AND (manager_can_reach IS DISTINCT FROM $2 OR manager_blocker IS DISTINCT FROM $3)
          RETURNING id`,
        {
          bind: [plan.domain_key, plan.manager_can_reach, plan.manager_blocker, tenantId],
          type: QueryTypes.SELECT,
          transaction: tx,
        },
      );
      out.push({
        domain_key: plan.domain_key,
        changed: rows.length > 0,
        manager_can_reach: plan.manager_can_reach,
        manager_blocker: plan.manager_blocker,
      });
    }
  });
  return out;
}

/** One domain, one transaction. A failure rolls that domain back whole. */
export async function provisionDomain(
  ctx: ProvisionContext, domainKey: string,
): Promise<DomainProvisionResult> {
  const plan = planProvision(domainKey);
  const correlationId = ctx.correlationId ?? randomUUID();
  return ctx.sequelize.transaction((tx) => provisionOne(ctx, plan, tx, correlationId));
}

/**
 * All ten, each in its own transaction. A domain that throws is named in `failed` with its error
 * class and the run continues; nine provisioned projects plus one named failure beats ten
 * unprovisioned ones, and the operation is idempotent so the fix is to re-run.
 */
export async function provisionAllDomains(ctx: ProvisionContext): Promise<ProvisionRunResult> {
  const provisioned: DomainProvisionResult[] = [];
  const failed: { domain_key: string; error_class: string; message: string }[] = [];

  // One correlation id for the whole run, propagated to every per-domain line, per CLAUDE.md's
  // Observability Framework. This writes 563 rows across ten transactions (10 projects, 10 anchors, 10 lifecycle rows, 30 releases, 503 stories -- MEASURED, after 'roughly 450' was found to be wrong) and emitted
  // nothing at all until now, so a partial run could not be traced from symptom to cause.
  const correlation_id = ctx.correlationId ?? randomUUID();

  for (const plan of planAllProvisions()) {
    try {
      // eslint-disable-next-line no-await-in-loop
      provisioned.push(
        await ctx.sequelize.transaction((tx) => provisionOne(ctx, plan, tx, correlation_id)),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Derived BEFORE the log line, so the line and the `failed` record cannot disagree
      // about what failed. `error_class` is required when outcome is failure, and the line
      // a responder greps for triage carried it nowhere.
      const error_class = /^([A-Z][A-Za-z]*Error):/.exec(message)?.[1]
        ?? (e instanceof Error ? e.constructor.name : 'UnknownError');
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        error_class,
        service: 'backend',
        event: 'agent_domain_provision_failed',
        correlation_id,
        outcome: 'failure',
        context: { domain_key: plan.domain_key },
        message,
      }));
      failed.push({ domain_key: plan.domain_key, error_class, message });
    }
  }

  return { provisioned, failed };
}

export default provisionAllDomains;
