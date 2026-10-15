/**
 * Read the ten PROVISIONED agent-domain projects out of the database, optionally scoped to the
 * human who owns the domain.
 *
 * Ticket AF2.4. Run `20261007-school-agent-factory`.
 *
 * ## Why this exists at all
 *
 * The ten projects were provisioned on 14 Oct 2026 and NO PAGE SHOWED THEM. `/admin/projects`
 * renders from `projectOverviewRoutes.ts:20`, which walks cohorts -> enrollments (by `cohort_id`)
 * -> projects and `continue`s past any cohort with no enrollments. All ten belong to one
 * `ai_staff` enrollment whose `cohort_id` is NULL, so the page renders nothing about them.
 * Measured, twice, on 14 and 15 Oct: `ten 10, with_cohort 0, invisible 10`.
 *
 * Being an ordinary `projects` row is NECESSARY AND NOT SUFFICIENT for being visible. The earlier
 * claim that these appear at `/admin/projects` "because they are ordinary projects rows" was
 * wrong, and wrong in the instructive direction: it inferred what a user can see from the shape of
 * the data instead of from the query that draws the screen.
 *
 * ## The join is LEFT on purpose
 *
 * `project_lifecycle_states` is LEFT JOINed even though all ten currently have a row. An inner
 * join is exactly the semantics that caused the defect this file repairs: a project with no
 * matching parent silently disappears rather than appearing with a null. A missing lifecycle row
 * should read as `stage: null` and be visible, not vanish.
 *
 * ## The sibling routes read code, this one reads the database
 *
 * `agentDomainRoutes`'s existing handlers answer from the registry and the capability files, which
 * is why they work regardless of provisioning. That is useful and it is not the same question.
 * This module answers "what is actually in the database", so a caller can tell a plan from a row.
 */
import { QueryTypes, type Sequelize } from 'sequelize';
import { AGENT_DOMAIN_ORG_ID } from './agentDomainRegistry';

export interface ProvisionedDomainRow {
  readonly domain_key: string;
  readonly student_project_id: string;
  readonly anchor_id: string;
  /** Null means the lifecycle row is missing, which is a finding rather than a default. */
  readonly stage: string | null;
  readonly entry_point: string | null;
  readonly manager_identity_id: string | null;
  readonly manager_email: string | null;
  readonly manager_can_reach: boolean | null;
  readonly manager_blocker: string | null;
  readonly intended_builder_state: string | null;
  readonly agent_id: string | null;
  readonly releases: number;
  readonly stories: number;
  readonly stories_verified: number;
  readonly build_authorizations: number;
}

/**
 * `manager_identity_id` is TEXT and `org_members.id` is UUID, so the comparison needs an explicit
 * cast. Without it Postgres raises `operator does not exist: uuid = text` rather than returning
 * nothing, which is the good failure mode -- but it means the cast is load-bearing and not
 * cosmetic.
 */
const BASE_SQL = `
  SELECT adp.domain_key,
         adp.student_project_id::text              AS student_project_id,
         adp.id::text                              AS anchor_id,
         pls.stage,
         pls.entry_point,
         adp.manager_identity_id,
         om.email                                  AS manager_email,
         adp.manager_can_reach,
         adp.manager_blocker,
         adp.intended_builder_state,
         adp.agent_id::text                        AS agent_id,
         (SELECT count(*) FROM student_task_lists l
           WHERE l.project_id = adp.student_project_id)::int                         AS releases,
         (SELECT count(*) FROM student_tasks t
           WHERE t.project_id = adp.student_project_id)::int                         AS stories,
         (SELECT count(*) FROM student_tasks t
           WHERE t.project_id = adp.student_project_id
             AND t.verified_at IS NOT NULL)::int                                     AS stories_verified,
         (SELECT count(*) FROM agent_domain_build_authorizations b
           WHERE b.agent_domain_project_id = adp.id)::int                            AS build_authorizations
    FROM agent_domain_projects adp
    LEFT JOIN project_lifecycle_states pls ON pls.student_project_id = adp.student_project_id
    LEFT JOIN org_members om ON om.id::text = adp.manager_identity_id`;

/**
 * The org_members ids this email owns, inside the ORG OF RECORD only.
 *
 * Scoped to one org deliberately. Three organisations are named "Colaberry" and the org of record
 * was measured rather than picked: `acdfa378` holds 21 members including every manager in the
 * ownership map, the other two hold one member each. An unscoped email lookup could match a
 * member row in a stale org and hand someone a domain through it.
 *
 * Returns ids as TEXT, because that is what `manager_identity_id` stores.
 */
export async function resolveOwnerIdentityIds(
  sequelize: Sequelize,
  email: string,
): Promise<string[]> {
  const trimmed = (email || '').trim();
  if (!trimmed) return [];
  const rows = await sequelize.query<{ id: string }>(
    `SELECT id::text AS id FROM org_members
      WHERE lower(email) = lower($1) AND org_id = $2`,
    { bind: [trimmed, AGENT_DOMAIN_ORG_ID], type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.id);
}

/** Every provisioned domain, unscoped. */
export async function loadProvisionedDomains(
  sequelize: Sequelize,
): Promise<ProvisionedDomainRow[]> {
  return sequelize.query<ProvisionedDomainRow>(
    `${BASE_SQL} ORDER BY adp.domain_key`,
    { type: QueryTypes.SELECT },
  );
}

/**
 * The provisioned domains owned by these identity ids.
 *
 * AN EMPTY `identityIds` RETURNS AN EMPTY ARRAY, never everything. A caller who resolves to no
 * org_members row owns no domain, and the alternative -- treating "no filter" as "no restriction"
 * -- is how a scoping bug becomes a disclosure. `= ANY($1::text[])` over an empty array is already
 * false for every row, but the early return makes the intent explicit rather than relying on that.
 */
export async function loadProvisionedDomainsForOwner(
  sequelize: Sequelize,
  identityIds: readonly string[],
): Promise<ProvisionedDomainRow[]> {
  if (!identityIds.length) return [];
  return sequelize.query<ProvisionedDomainRow>(
    `${BASE_SQL}
      WHERE adp.manager_identity_id = ANY($1::text[])
      ORDER BY adp.domain_key`,
    { bind: [[...identityIds]], type: QueryTypes.SELECT },
  );
}

/**
 * A summary that states what is NOT true alongside what is.
 *
 * `stories_verified` and `build_authorizations` are surfaced at the top level because they are the
 * two figures that distinguish "provisioned" from "working", and a reader who sees 503 stories
 * without them will reasonably assume progress.
 */
export function summariseProvisioned(rows: readonly ProvisionedDomainRow[]) {
  const stories = rows.reduce((n, r) => n + r.stories, 0);
  const verified = rows.reduce((n, r) => n + r.stories_verified, 0);
  const auths = rows.reduce((n, r) => n + r.build_authorizations, 0);
  return {
    domains: rows.length,
    releases: rows.reduce((n, r) => n + r.releases, 0),
    stories,
    stories_verified: verified,
    build_authorizations: auths,
    missing_lifecycle_row: rows.filter((r) => r.stage === null).length,
    managers_blocked: rows.filter((r) => r.manager_can_reach === false).length,
    disclosure:
      verified === 0 && auths === 0
        ? 'These projects are PLANS. No story is verified and no build is authorized, so no agent '
          + 'has done any of this work.'
        : 'Some stories are verified or some builds are authorized; read the per-domain figures '
          + 'rather than the totals.',
  };
}
