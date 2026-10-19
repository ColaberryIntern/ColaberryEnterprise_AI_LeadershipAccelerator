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
 * ## CORRECTED 19 Oct 2026: that is the COHORTS TAB, not the page
 *
 * `/admin/projects` has two tabs and opens on DELIVERY, which is a different endpoint:
 * `GET /api/admin/projects/delivery` -> `projectDeliveryService.getProjectDelivery()`. Its query
 * runs `FROM projects p LEFT JOIN enrollments e` and only appends `AND e.cohort_id = :cohortId`
 * when a cohort is actually supplied, which this route never does. A NULL-cohort enrollment is
 * therefore not excluded. Measured by calling the real service in production on 19 Oct 2026:
 * **10 of 10 returned**, among 57 rows, each as `audience: 'unenrolled'` with `cohort_name: null`.
 *
 * So the sentence above is right about the query it names and wrong about the page. The reason
 * this module still exists is unchanged and worth restating, because "they are visible after all"
 * is the wrong lesson to take: the Delivery board shows them as anonymous unenrolled builds with
 * no domain_key, no manager, no intended builder and no build-authorization count. It can tell
 * you the rows exist. It cannot tell you whose they are.
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
 *
 * ## IT MATCHES TWO ADDRESSES, AND THAT IS NOT DEFENSIVENESS
 *
 * People here hold a work login and a personal address, and `org_members` sometimes carries the
 * personal one. Measured 15 Oct 2026 across all ten domain managers, 2 of 10 differ:
 *
 *   admissions  org_members taiwooludimimu@gmail.com  ->  enrollment taiwo@colaberry.com
 *   platform    org_members kesetebirhan@gmail.com    ->  enrollment kes@colaberry.com
 *
 * An exact `org_members.email` match therefore resolves TAIWO TO ZERO IDENTITIES even though he
 * signs in as a full admin, and he would open his own portal to an empty list. The first version
 * of this function did exactly that.
 *
 * The join goes through `org_members.enrollment_id`, which is a REAL FOREIGN KEY and is populated
 * on 29 of 29 rows. It is not a string heuristic: matching on the localpart would have failed here
 * anyway, because `taiwo` and `taiwooludimimu` do not share one. `platform_identity_id` would be
 * the proper identity link and is NULL on all 29 rows, so that layer cannot be used yet.
 */
export async function resolveOwnerIdentityIds(
  sequelize: Sequelize,
  email: string,
): Promise<string[]> {
  const trimmed = (email || '').trim();
  if (!trimmed) return [];
  const rows = await sequelize.query<{ id: string }>(
    `SELECT om.id::text AS id
       FROM org_members om
       LEFT JOIN enrollments e ON e.id = om.enrollment_id
      WHERE om.org_id = $2
        AND (lower(om.email) = lower($1) OR lower(e.email) = lower($1))`,
    { bind: [trimmed, AGENT_DOMAIN_ORG_ID], type: QueryTypes.SELECT },
  );
  // One person can hold more than one member row; de-duplicate so a domain is not counted twice.
  return [...new Set(rows.map((r) => r.id))];
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
 * The provisioned domains this caller is the intended BUILDER of.
 *
 * ## Why this exists at all
 *
 * `loadProvisionedDomainsForOwner` scopes by accountable MANAGER, and that is correct for a
 * manager. It is useless for an intern: all six granted interns opened My Domain on 17 Oct 2026
 * and got `resolved_identities=0, domains=0` -- a page that loads and says nothing. They are
 * recorded as `intended_builder`, which is a plain text name on `agent_domain_projects` with no
 * foreign key to anything. AF2.4 recorded that limit when the resolver was written.
 *
 * ## Matching a NAME, carefully, because the last time we did this it was wrong
 *
 * AF2.6 was an entire ticket spent on a name that resolved to the wrong record, and the lesson
 * was to follow a foreign key instead. There is no foreign key here, so the name is all there
 * is -- which makes the guard the important part rather than the match:
 *
 *   - the caller is resolved from their VERIFIED token's email, never from a supplied name
 *   - the email is turned into a display name through `community_members`, so the comparison is
 *     between a name the platform holds and a name the registry holds, not between a name and
 *     user input
 *   - a name matching MORE THAN ONE community_members row returns nothing, because at that point
 *     the platform cannot say who the caller is and guessing is how someone sees another
 *     intern's domain
 *
 * Measured before shipping: all seven intended builders resolve to exactly one row today.
 * The guard is for the eighth.
 */
export async function loadProvisionedDomainsForBuilder(
  sequelize: Sequelize,
  email: string,
): Promise<ProvisionedDomainRow[]> {
  const trimmed = (email || '').trim();
  if (!trimmed) return [];

  // One row, or nothing. An ambiguous identity is not a licence to pick one.
  const names = await sequelize.query<{ display_name: string }>(
    `SELECT cm.display_name
       FROM community_members cm
       JOIN enrollments e ON e.id = cm.enrollment_id
      WHERE lower(e.email) = lower($1)
        AND cm.display_name IS NOT NULL AND btrim(cm.display_name) <> ''`,
    { bind: [trimmed], type: QueryTypes.SELECT },
  );
  if (names.length !== 1) return [];

  return sequelize.query<ProvisionedDomainRow>(
    `${BASE_SQL}
      WHERE lower(btrim(adp.intended_builder)) = lower(btrim($1))
      ORDER BY adp.domain_key`,
    { bind: [names[0].display_name], type: QueryTypes.SELECT },
  );
}

/**
 * Everything this caller should see on My Domain: what they manage, plus what they build.
 *
 * De-duplicated on `domain_key`, because a person can legitimately be both -- and a domain
 * appearing twice on the page would read as a data error rather than as two true facts.
 */
export async function loadMyDomains(
  sequelize: Sequelize,
  email: string,
  identityIds: readonly string[],
): Promise<ProvisionedDomainRow[]> {
  const [managed, built] = await Promise.all([
    loadProvisionedDomainsForOwner(sequelize, identityIds),
    loadProvisionedDomainsForBuilder(sequelize, email),
  ]);
  const seen = new Set(managed.map((r) => r.domain_key));
  return [...managed, ...built.filter((r) => !seen.has(r.domain_key))]
    .sort((a, b) => a.domain_key.localeCompare(b.domain_key));
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
