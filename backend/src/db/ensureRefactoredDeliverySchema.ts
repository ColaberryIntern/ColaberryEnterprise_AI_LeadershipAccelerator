import { sequelize } from '../config/database';

/**
 * Refactored AI Delivery OS — Gate 1 schema. Idempotent raw DDL, same pattern as
 * ensureMultiTenantSchema.ts / ensureOrgAccountSchema.ts.
 *
 * WHY RAW DDL AND NOT sync({alter:true}): this repo has a 365-model graph, and an
 * ungated boot-time sync previously generated ~50k duplicate constraints and drove
 * Postgres into OOM (see the note at server.ts and multi-tenancy Gate 0 D-02).
 * Everything here is CREATE/ADD ... IF NOT EXISTS, so a partial database self-heals
 * and re-running boot is a no-op.
 *
 * TENANCY BY PARENT (Gate 0, DATA_OWNERSHIP_MATRIX). Only two tables carry their own
 * tenant_id/brand_id: `delivery_engagements` and `delivery_projects`. Both are reachable
 * without their parent — they are listed, searched and authorized directly, and they are
 * what a cross-tenant enumeration would target, so denormalizing there is what makes the
 * fail-closed check cheap and unconditional. Every other table below is a strict child of
 * `delivery_projects` and scopes by join. This is the multi-tenancy work's D-05 finding
 * applied a second time: 17 of its 18 campaign tables were strict children, and giving
 * each its own tenant_id would have meant 17 backfills and 17 chances for two answers to
 * "who owns this row" to drift apart.
 *
 * KEY TYPE WARNING: `leads.id` is an INTEGER autoincrement, not a UUID (multi-tenancy
 * D-03). `delivery_engagements.source_lead_id` is therefore INTEGER. It will look like a
 * typo next to every other id column here; it is not.
 *
 * NO FOREIGN KEYS TO WRITE-HOT TABLES. `delivery_events` is an append-only stream and
 * carries no FK, for the same reason the multi-tenancy work kept them off `page_events`
 * and `visitor_sessions`.
 *
 * NOT DEPLOYED. Master plan §20 does not authorize production DDL. This module is wired
 * into boot so it is armed for the next deploy, and — per MIGRATION_STRATEGY.md §3 — must
 * be rehearsed against a structure-only dump of the production schema before that happens.
 */

/** Structured, non-fatal failure log. One bad statement must never stop the server. */
function logStatementFailure(sql: string, err: unknown): void {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'ensure_refactored_delivery_schema_statement_failed',
      outcome: 'failure',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      context: {
        sql: sql.slice(0, 160),
        message: err instanceof Error ? err.message : String(err),
      },
    }),
  );
}

/**
 * ESC-1 — approved by Ali on 2026-08-23 (Gate 0 SCHEMA_CONFLICTS C-02).
 *
 * `organizations.owner_enrollment_id` was NOT NULL + UNIQUE with an FK to `enrollments`,
 * which models "a manager's management account" and cannot represent an external client
 * company whose acceptance owner never enrolled in anything. Master plan §6 hangs the
 * whole commercial ownership chain off Organization, so this blocked delivery entirely.
 *
 * This is a RELAXATION, which is the safe direction: every existing row keeps its owner
 * and its foreign key, and nothing currently valid becomes invalid. Only new rows may
 * omit an owner.
 *
 * It is also the one genuinely non-reversible statement in this module. Once a client
 * organization exists with a null owner, re-adding NOT NULL fails. Recorded here so a
 * later rollback plan does not assume otherwise.
 *
 * THE UNIQUE CONSTRAINT IS DELIBERATELY KEPT. Gate 0's C-02 recommended dropping it
 * alongside NOT NULL; that was wrong on both counts. PostgreSQL treats NULLs as distinct
 * in a UNIQUE index, so any number of client organizations with a null owner are already
 * permitted — NOT NULL was the only thing blocking them. And the constraint is
 * load-bearing: `orgService.registerManager()` is idempotent via
 * `Organization.findOrCreate({ where: { owner_enrollment_id } })`, and findOrCreate is
 * only race-safe because a concurrent duplicate insert hits a unique violation that
 * Sequelize catches and converts back into a find. Dropping it would leave two
 * simultaneous registrations for one manager able to create two organizations, which is
 * exactly the "works once, breaks on the second run" class root CLAUDE.md calls a
 * production defect.
 *
 * DROP NOT NULL is idempotent — a no-op on an already-nullable column.
 */
const ORGANIZATION_RELAXATION: string[] = [
  `ALTER TABLE organizations ALTER COLUMN owner_enrollment_id DROP NOT NULL`,
  // The discriminator between a manager's management account and a client company.
  // The column already exists on the model; this guarantees it exists in the database
  // and backfills every current row to the meaning it already had.
  `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS organization_type VARCHAR(40)`,
  `UPDATE organizations SET organization_type = 'management_account'
     WHERE organization_type IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations (organization_type)`,
];

/** The two tables that carry their own tenancy. */
const DELIVERY_SPINE: string[] = [
  `CREATE TABLE IF NOT EXISTS delivery_engagements (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     brand_id UUID,
     organization_id UUID,
     engagement_type VARCHAR(40) NOT NULL DEFAULT 'commercial_client',
     name VARCHAR(255) NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'active',
     source_lead_id INTEGER,
     client_owner_identity_id UUID,
     delivery_owner_identity_id UUID,
     start_at TIMESTAMPTZ,
     target_end_at TIMESTAMPTZ,
     metadata JSONB,
     archived_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_engagements_tenant_status
     ON delivery_engagements (tenant_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_engagements_org
     ON delivery_engagements (organization_id)`,

  `CREATE TABLE IF NOT EXISTS delivery_projects (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     engagement_id UUID NOT NULL,
     tenant_id UUID NOT NULL,
     brand_id UUID,
     organization_id UUID,
     name VARCHAR(255) NOT NULL,
     slug VARCHAR(120) NOT NULL,
     project_class VARCHAR(40) NOT NULL DEFAULT 'sandbox',
     starting_point VARCHAR(40),
     status VARCHAR(30) NOT NULL DEFAULT 'discovery',
     industry VARCHAR(120),
     business_problem TEXT,
     product_idea TEXT,
     workflow_summary TEXT,
     existing_system_summary TEXT,
     delivery_profile_key VARCHAR(60),
     trust_profile_key VARCHAR(60),
     current_release_id UUID,
     health_score INTEGER,
     created_by_identity_id UUID,
     archived_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // Slug uniqueness is per tenant, not global: two tenants naming a project
  // "customer-portal" is normal and must not collide.
  `CREATE UNIQUE INDEX IF NOT EXISTS delivery_projects_tenant_slug_unique
     ON delivery_projects (tenant_id, slug)`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_projects_tenant_status
     ON delivery_projects (tenant_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_projects_engagement
     ON delivery_projects (engagement_id)`,
];

/** Strict children of delivery_projects. No tenant_id — they scope by join. */
const DELIVERY_CHILDREN: string[] = [
  /**
   * The bridge to a student Project. Nullable, additive, and deliberately a separate
   * table rather than a column on `projects`: master plan §Gate 1 forbids destructively
   * migrating student projects, and 32 files read `projects` today.
   *
   * UNIQUE on student_project_id enforces master plan §15's "same source link ⇒ one
   * link" and stops one student project being claimed by two delivery projects.
   */
  `CREATE TABLE IF NOT EXISTS delivery_project_source_links (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     delivery_project_id UUID NOT NULL,
     student_project_id UUID NOT NULL,
     linked_by_identity_id UUID,
     link_reason TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS delivery_project_source_links_student_unique
     ON delivery_project_source_links (student_project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_source_links_delivery
     ON delivery_project_source_links (delivery_project_id)`,

  /**
   * Project-scoped membership. Distinct from TenantMembership by design (Gate 0
   * AUTHORIZATION_MATRIX): tenant roles answer "may this identity act in this tenant at
   * all", delivery roles answer "may they approve THIS design decision". Both must pass.
   */
  `CREATE TABLE IF NOT EXISTS delivery_project_members (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     delivery_project_id UUID NOT NULL,
     platform_identity_id UUID NOT NULL,
     delivery_role VARCHAR(40) NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'active',
     granted_by_identity_id UUID,
     granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     revoked_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // One active row per (project, identity, role). Re-granting the same role is an
  // idempotent no-op rather than a second row that makes revocation ambiguous.
  `CREATE UNIQUE INDEX IF NOT EXISTS delivery_project_members_unique_active
     ON delivery_project_members (delivery_project_id, platform_identity_id, delivery_role)`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_members_identity
     ON delivery_project_members (platform_identity_id, status)`,

  /**
   * The versioned delivery contract. `approved_snapshot` is the frozen copy taken at
   * approval: the working row may keep changing, but what was agreed must remain
   * readable exactly as it was agreed.
   */
  `CREATE TABLE IF NOT EXISTS delivery_contracts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     delivery_project_id UUID NOT NULL,
     version INTEGER NOT NULL DEFAULT 1,
     status VARCHAR(20) NOT NULL DEFAULT 'draft',
     business_outcome TEXT,
     primary_users TEXT,
     success_measures JSONB,
     scope_in JSONB,
     scope_out JSONB,
     constraints JSONB,
     data_sensitivity VARCHAR(30) NOT NULL DEFAULT 'internal',
     delivery_class VARCHAR(40),
     acceptance_owner_identity_id UUID,
     technical_owner_identity_id UUID,
     client_responsibilities JSONB,
     required_approvals JSONB,
     required_delivery_profile VARCHAR(60),
     definition_of_done JSONB,
     operational_expectations JSONB,
     change_policy TEXT,
     approved_snapshot JSONB,
     approved_by_identity_id UUID,
     approved_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS delivery_contracts_project_version_unique
     ON delivery_contracts (delivery_project_id, version)`,

  /**
   * The decision ledger. Append-only in practice: a superseded decision is never
   * updated in place, it gets a successor and a back-pointer. Master plan §24 lists
   * "design approval can be silently overwritten" as a stop condition, and an UPDATE is
   * exactly how that would happen.
   */
  `CREATE TABLE IF NOT EXISTS delivery_decisions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     delivery_project_id UUID NOT NULL,
     decision_type VARCHAR(40) NOT NULL,
     question TEXT NOT NULL,
     options JSONB,
     recommendation TEXT,
     final_decision TEXT,
     rationale TEXT,
     affected_nodes JSONB,
     status VARCHAR(20) NOT NULL DEFAULT 'open',
     decided_by_identity_id UUID,
     approved_by_identity_id UUID,
     decided_at TIMESTAMPTZ,
     supersedes_decision_id UUID,
     superseded_by_decision_id UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_decisions_project_type
     ON delivery_decisions (delivery_project_id, decision_type, status)`,

  /**
   * The structured event stream (master plan §14). Append-only and write-hot, so it
   * carries NO foreign keys — it must outlive whatever it describes, exactly like
   * `tenant_access_audits`. No updated_at for the same reason: an event is not edited.
   */
  `CREATE TABLE IF NOT EXISTS delivery_events (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     delivery_project_id UUID,
     engagement_id UUID,
     tenant_id UUID,
     event_type VARCHAR(60) NOT NULL,
     correlation_id UUID,
     actor_identity_id UUID,
     outcome VARCHAR(20),
     context JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_events_project_created
     ON delivery_events (delivery_project_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_events_correlation
     ON delivery_events (correlation_id)`,
];

/**
 * Gate 2 — Builder Authority Profile.
 *
 * Scoped to a platform identity rather than a project: authority is a property of a
 * person's demonstrated capability and travels with them. Per-project limits are
 * expressed through delivery roles instead.
 *
 * Every default is the least-privileged value, because a row that exists but has never
 * been evaluated must not confer more than no row at all. `last_evaluated_at` is
 * deliberately nullable and has no default — it is the signal that a human stood behind
 * these numbers, and defaulting it to NOW() would fabricate exactly that.
 */
const BUILDER_AUTHORITY: string[] = [
  `CREATE TABLE IF NOT EXISTS builder_authority_profiles (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     platform_identity_id UUID NOT NULL,
     builder_level VARCHAR(40),
     allowed_project_classes JSONB,
     max_parallel_projects INTEGER NOT NULL DEFAULT 1,
     max_risk_without_review VARCHAR(4) NOT NULL DEFAULT 'R0',
     client_interaction_allowed BOOLEAN NOT NULL DEFAULT FALSE,
     release_authority BOOLEAN NOT NULL DEFAULT FALSE,
     last_evaluated_at TIMESTAMPTZ,
     evaluated_by_identity_id UUID,
     evidence_summary JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // One profile per identity. Two rows would make "what is this person allowed to do?"
  // depend on which one a query happened to read first.
  `CREATE UNIQUE INDEX IF NOT EXISTS builder_authority_profiles_identity_unique
     ON builder_authority_profiles (platform_identity_id)`,
];


/**
 * Gate 4 — discovery snapshots and the AI-native Opportunity Map.
 *
 * `delivery_discoveries` follows the same freeze discipline as `delivery_contracts`:
 * versioned, with an `approved_snapshot`, because what the client confirmed we understood
 * must stay readable exactly as they confirmed it.
 *
 * `delivery_opportunities` is unique on (project, capability). A capability assessed
 * twice with different answers is not richer information, it is an unresolved
 * disagreement, and the map is meant to be the resolved view.
 */
const DISCOVERY_AND_OPPORTUNITIES: string[] = [
  `CREATE TABLE IF NOT EXISTS delivery_discoveries (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     delivery_project_id UUID NOT NULL,
     version INTEGER NOT NULL DEFAULT 1,
     status VARCHAR(20) NOT NULL DEFAULT 'draft',
     business_goal TEXT,
     users JSONB,
     jobs_to_be_done JSONB,
     workflow JSONB,
     systems JSONB,
     data_sources JSONB,
     pain_points JSONB,
     human_judgment JSONB,
     constraints JSONB,
     compliance JSONB,
     success_measures JSONB,
     understood TEXT,
     recommended TEXT,
     remains_human TEXT,
     software_handles TEXT,
     ai_recommends TEXT,
     agents_may_act TEXT,
     open_decisions JSONB,
     approved_snapshot JSONB,
     approved_by_identity_id UUID,
     approved_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS delivery_discoveries_project_version_unique
     ON delivery_discoveries (delivery_project_id, version)`,

  `CREATE TABLE IF NOT EXISTS delivery_opportunities (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     delivery_project_id UUID NOT NULL,
     discovery_id UUID,
     capability VARCHAR(255) NOT NULL,
     disposition VARCHAR(30) NOT NULL DEFAULT 'traditional_software',
     traditional_software TEXT,
     ai_recommendation TEXT,
     agent_opportunity TEXT,
     automation TEXT,
     human_only_decision TEXT,
     data_dependency JSONB,
     trust_requirement JSONB,
     value_score INTEGER,
     complexity_score INTEGER,
     notes TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS delivery_opportunities_project_capability_unique
     ON delivery_opportunities (delivery_project_id, capability)`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_opportunities_discovery
     ON delivery_opportunities (discovery_id)`,
];

/**
 * Order matters across the groups: the spine must exist before its children reference
 * it, and the organization relaxation runs first because delivery engagements point at
 * organizations that may now legitimately have no owner.
 */
export async function ensureRefactoredDeliverySchema(): Promise<void> {
  for (const sql of REFACTORED_DELIVERY_SCHEMA_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      // Never fatal to boot. A statement Postgres has no IF NOT EXISTS form for (or a
      // race with a second booting container) must not stop the server coming up, but it
      // must be visible rather than swallowed.
      logStatementFailure(sql, err);
    }
  }

  console.log('[DB] Refactored delivery schema ensured');
}

/** Exported so the schema test can assert the statement list without a database. */
export const REFACTORED_DELIVERY_SCHEMA_STATEMENTS: readonly string[] = [
  ...ORGANIZATION_RELAXATION,
  ...DELIVERY_SPINE,
  ...DELIVERY_CHILDREN,
  ...BUILDER_AUTHORITY,
  ...DISCOVERY_AND_OPPORTUNITIES,
];
