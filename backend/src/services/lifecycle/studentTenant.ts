/**
 * Which tenant owns a student capstone project.
 *
 * P6-T1b. `projects` had no tenant column and nothing on its join path had one either -- not
 * `enrollments`, not `programs`, not `cohorts`, not `users`. 60 tables in this database carry
 * `tenant_id` and `projects` was not among them, so a model hook had nothing to key on and
 * student projects could not be registered with a lifecycle at all.
 *
 * Escalated to the DRI, who chose `colaberry` on 2026-10-12 after seeing what the backfill does.
 * Measured before that decision: 4 tenants defined, exactly 1 in use on `delivery_projects`, and
 * all 62 existing `projects` rows carrying both an enrollment and a program with zero nulls. So
 * the backfill is a single constant rather than a join.
 *
 * ## What it refuses, and what it only WARNS about
 *
 * It refuses when the configuration is UNUSABLE: no tenant carries the slug, or the query
 * failed. Those are not ambiguities, they are breakage, and an answer invented from either
 * would be a guess.
 *
 * It does NOT refuse merely because more than one tenant owns `projects` rows. The first
 * version did, and running it showed why that is worse rather than safer: ONE project placed
 * in a second tenant -- one deliberate cross-tenant placement -- permanently disabled
 * automatic attribution for every project created afterwards. A refusal does not prevent the
 * harm it was aimed at. The harm is "filed under the wrong tenant"; the refusal converts it
 * into "no lifecycle at all", which under enforcement means refused story generation. It
 * breaks the working case to avoid a hypothetical one.
 *
 * So a multi-tenant observation is a loud WARNING with the observed list, not a refusal.
 *
 * ## The honest limit, recorded rather than engineered around
 *
 * While the default stands, a second tenant genuinely running cohorts WOULD have its projects
 * attributed to the configured tenant. That cannot be detected from `projects.tenant_id`
 * alone, because an explicitly-placed project is indistinguishable from a cohort. The actual
 * fix is to derive the tenant per project from its programme, and no table on that path
 * carries a tenant yet. The warning is what makes the condition visible so somebody can
 * build it; pretending a refusal solves it would be worse than saying this plainly.
 *
 * ## Why an unresolvable tenant does NOT refuse the creation
 *
 * Deliberate layering, and it matches every other gate in this phase. Setting a tenant column is
 * DATA; refusing to create a student's project is ENFORCEMENT. A data-layer module that threw
 * here would break student project creation on a live path for a governance reason, with the
 * feature flag off, which is exactly the blast radius this programme has been careful to avoid.
 *
 * The refusal happens where refusals belong: `services/sbp/storyAuthorization.ts` treats a
 * project with no lifecycle row as absence of evidence rather than approval, so an unattributable
 * project cannot reach authorized stories once enforcement is on.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

/**
 * The tenant that owns student capstone projects, BY SLUG.
 *
 * A slug and not a UUID on purpose: a hardcoded id is unreadable in a diff, differs between
 * environments, and cannot be checked against anything. The slug is stable, and resolution
 * fails loudly if no tenant carries it.
 *
 * CHANGING THIS IS A GOVERNANCE DECISION, not a configuration tweak. It is the enforcement
 * boundary for every student project. If a second tenant starts running cohorts, the answer
 * is not to change this constant -- it is to derive the tenant per project from its
 * programme. `resolveStudentTenantId` WARNS when it sees that state; it does not refuse,
 * because refusing breaks attribution for everyone while fixing nothing. See its header.
 */
export const STUDENT_TENANT_SLUG = 'colaberry';

export type StudentTenantRefusal =
  /** No tenant carries `STUDENT_TENANT_SLUG`. A misconfiguration, not an ambiguity. */
  | 'configured_tenant_missing'
  /** The query failed. Not an answer, and must not be treated as one. */
  | 'unreadable';

export interface StudentTenantResolution {
  /**
   * `null` only when the configuration is UNUSABLE -- no tenant carries the slug, or the
   * query failed. A multi-tenant observation still resolves, with a warning: see the header
   * for why refusing there was worse.
   */
  tenantId: string | null;
  reason: StudentTenantRefusal | 'resolved';
  /**
   * Every distinct tenant observed on `projects`. Returned on EVERY outcome, not just
   * refusals, because it is what a caller needs to notice the multi-tenant state.
   */
  observed: string[];
}

function log(
  event: string,
  outcome: 'success' | 'failure' | 'warning',
  context: Record<string, unknown>,
): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : (outcome === 'warning' ? 'warn' : 'info'),
    service: 'backend',
    event,
    outcome,
    ...(outcome === 'failure' ? { error_class: 'ContractViolation' } : {}),
    context,
  }));
}

/**
 * The tenant student projects belong to, or `null` with a reason.
 *
 * Reads the configured tenant AND what the data already says, then compares them. Checking both
 * is what makes this a measurement: a lookup by slug alone would return an answer long after that
 * answer stopped being true.
 */
export async function resolveStudentTenantId(): Promise<StudentTenantResolution> {
  let configured: string | null = null;
  let observed: string[] = [];
  try {
    const tenants = await sequelize.query<{ id: string }>(
      'SELECT id FROM tenants WHERE slug = $1',
      { bind: [STUDENT_TENANT_SLUG], type: QueryTypes.SELECT },
    );
    configured = tenants[0]?.id ?? null;

    const rows = await sequelize.query<{ tenant_id: string }>(
      'SELECT DISTINCT tenant_id FROM projects WHERE tenant_id IS NOT NULL',
      { type: QueryTypes.SELECT },
    );
    observed = rows.map((r) => r.tenant_id);
  } catch (err: unknown) {
    // LOGGED, not swallowed. An unreadable answer is not an answer, and treating it as "no tenant"
    // would be indistinguishable from a correctly-resolved absence.
    log('student_tenant_unreadable', 'failure', {
      error_class: (err as { name?: string })?.name ?? 'UnclassifiedError',
      slug: STUDENT_TENANT_SLUG,
    });
    return { tenantId: null, reason: 'unreadable', observed: [] };
  }

  if (configured === null) {
    log('student_tenant_unresolved', 'failure', {
      reason: 'configured_tenant_missing', slug: STUDENT_TENANT_SLUG, observed,
    });
    return { tenantId: null, reason: 'configured_tenant_missing', observed };
  }

  // A WARNING, not a refusal. See the header: refusing here disabled attribution for every
  // later project the moment one was placed in another tenant, which breaks the working case
  // to avoid a hypothetical one. This is the signal that somebody should build the
  // programme-to-tenant derivation, and the detector
  // `projectLifecycleRegistration.unregisteredStudentProjectsSince` is how its consequences
  // get found.
  if (observed.length > 1 || (observed.length === 1 && observed[0] !== configured)) {
    log('student_tenant_multi_tenant_observed', 'warning', {
      configured, observed, configured_slug: STUDENT_TENANT_SLUG,
      note: 'More than one tenant owns student projects, or the only one is not the '
        + 'configured default. New projects with no explicit tenant still default to the '
        + 'configured one, which would MIS-ATTRIBUTE a second tenant genuinely running '
        + 'cohorts. Deriving the tenant per project from its programme is the fix.',
    });
  }

  return { tenantId: configured, reason: 'resolved', observed };
}
