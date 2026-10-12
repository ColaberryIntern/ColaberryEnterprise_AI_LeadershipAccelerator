/**
 * Provision the ten agent-domain projects: one transaction per domain, idempotent by derived id,
 * writing only the declared tables and reaching no post-approval stage.
 *
 * Run `20261007-school-agent-factory` (T14), session CC-20261006-a4k7.
 *
 * ## What makes a second run write nothing
 *
 * Every id is derived from the domain key (`agentDomainProvisionPlan.ts`), and every INSERT carries
 * that id explicitly with `ON CONFLICT DO NOTHING ... RETURNING id`. So the thing that stops a
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
import {
  FORBIDDEN_STAGES,
  PERMITTED_BUILDER_STATES,
  PROVISION_STAGE,
  TENANT_SLUG,
  planAllProvisions,
  planProvision,
  type ProvisionPlan,
} from './agentDomainProvisionPlan';

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

async function resolveTenantId(sequelize: Sequelize, tx: Transaction): Promise<string> {
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

async function resolveProgramId(sequelize: Sequelize, tx: Transaction): Promise<string> {
  // `projects.program_id` is NOT NULL and references program_blueprints. T02 pre-approved the
  // blueprint row this uses; it is resolved rather than hardcoded so a missing prerequisite is a
  // named refusal instead of a foreign-key violation.
  const rows = await sequelize.query<{ id: string }>(
    `SELECT id FROM program_blueprints ORDER BY created_at ASC LIMIT 1`,
    { type: QueryTypes.SELECT, transaction: tx },
  );
  if (rows.length !== 1) {
    throw new Error('ProgramBlueprintError: no program_blueprints row exists; run T02\'s prerequisite seed first');
  }
  return rows[0].id;
}

/** Rows actually inserted by one statement, counted from RETURNING. */
async function insertedCount(
  sequelize: Sequelize, tx: Transaction, sql: string, bind: unknown[],
): Promise<number> {
  const rows = await sequelize.query<{ id: string }>(sql, { bind, type: QueryTypes.SELECT, transaction: tx });
  return rows.length;
}

async function provisionOne(
  ctx: ProvisionContext, plan: ProvisionPlan, tx: Transaction,
): Promise<DomainProvisionResult> {
  const { sequelize } = ctx;

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

  inserted.projects = await insertedCount(sequelize, tx,
    `INSERT INTO projects (id, enrollment_id, program_id, name, project_stage, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'discovery', now(), now())
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [plan.project_id, enrollmentId, programId, plan.domain_key],
  );

  inserted.agent_domain_projects = await insertedCount(sequelize, tx,
    `INSERT INTO agent_domain_projects
       (id, tenant_id, student_project_id, domain_key, agent_id, manager_identity_id,
        intended_builder, intended_builder_state, provisioned_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [plan.anchor_id, tenantId, plan.project_id, plan.domain_key, plan.agent_id,
      plan.manager_identity_id, plan.intended_builder, plan.intended_builder_state, ctx.provisionedBy],
  );

  inserted.project_lifecycle_states = await insertedCount(sequelize, tx,
    `INSERT INTO project_lifecycle_states
       (tenant_id, student_project_id, stage, entry_point, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [tenantId, plan.project_id, plan.stage, plan.entry_point],
  );

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
      `INSERT INTO student_tasks
         (id, task_list_id, project_id, title, description, narrative, build, status, position,
          story_id, release_key, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'not_started', $8, $9, $10, now(), now())
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [s.id, listId, plan.project_id, s.title, s.title, s.narrative, s.build, s.position,
        s.story_id, s.release_key],
    );
  }
  inserted.student_tasks = stories;

  // `agent_domain_build_authorizations` is in the declared write-set and receives ZERO rows: an
  // authorization records a named human's approval, and nobody has approved a build.
  inserted.agent_domain_build_authorizations = 0;

  const total = Object.values(inserted).reduce((a, b) => a + b, 0);
  return {
    domain_key: plan.domain_key,
    project_id: plan.project_id,
    anchor_id: plan.anchor_id,
    inserted,
    already_present: total === 0,
  };
}

/** One domain, one transaction. A failure rolls that domain back whole. */
export async function provisionDomain(
  ctx: ProvisionContext, domainKey: string,
): Promise<DomainProvisionResult> {
  const plan = planProvision(domainKey);
  return ctx.sequelize.transaction((tx) => provisionOne(ctx, plan, tx));
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
  // Observability Framework. This writes roughly 450 rows across ten transactions and emitted
  // nothing at all until now, so a partial run could not be traced from symptom to cause.
  const correlation_id = ctx.correlationId ?? randomUUID();

  for (const plan of planAllProvisions()) {
    try {
      const started = Date.now();
      // eslint-disable-next-line no-await-in-loop
      const result = await ctx.sequelize.transaction((tx) => provisionOne(ctx, plan, tx));
      provisioned.push(result);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'backend',
        event: 'agent_domain_provisioned',
        correlation_id,
        duration_ms: Date.now() - started,
        // `already_present` is a re-run that wrote nothing, which is a DIFFERENT outcome
        // from a run that created the project. This was `? 'success' : 'success'` -- a
        // conditional that could not condition, shipped as a placeholder for a distinction
        // never made, in the one field CLAUDE.md constrains to success|failure|partial.
        outcome: result.already_present ? 'partial' : 'success',
        context: {
          domain_key: plan.domain_key,
          project_id: result.project_id,
          already_present: result.already_present,
          inserted: result.inserted,
        },
      }));
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
