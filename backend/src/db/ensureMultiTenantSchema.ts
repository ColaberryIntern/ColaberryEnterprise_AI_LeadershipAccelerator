import { sequelize } from '../config/database';

/**
 * Multi-tenant ecosystem schema — idempotent raw DDL, same pattern as
 * ensureOrgAccountSchema.ts / ensureApprovalRequestsSchema.ts.
 *
 * WHY RAW DDL AND NOT sync({alter:true}): this repo has a 229-model graph, and an
 * ungated boot-time sync previously generated ~50k duplicate constraints and drove
 * Postgres into OOM (see the note at server.ts:193). Boot-time schema work here is
 * CREATE/ADD ... IF NOT EXISTS only, so a partial database self-heals and re-running
 * boot is a no-op.
 *
 * ADDITIVE ONLY. This module creates nine new tables and adds nullable/defaulted
 * columns to nine existing ones. It never drops, renames, retypes, backfills, or adds
 * NOT NULL to an existing column. Enforcing NOT NULL on tenant columns is deliberately
 * deferred to a later project (master plan Stage F) because it requires zero unresolved
 * rows across every environment, which cannot be established from here.
 *
 * Column names and types must match the Sequelize models exactly:
 *   Tenant, Brand, BrandDomain, SenderProfile, PlatformIdentity,
 *   PlatformIdentityLink, TenantMembership, LeadTenantContext, CommunicationPreference.
 *
 * KEY TYPE WARNING: `leads.id` is an INTEGER autoincrement, not a UUID. Every other
 * table referenced here uses UUID keys. Any FK pointing at a lead is INTEGER; getting
 * this wrong produces a boot-time error that is silently logged and leaves the column
 * missing, so it is called out rather than left to be rediscovered.
 */

/** Structured, non-fatal failure log. One bad statement must never stop the server. */
function logStatementFailure(sql: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'ensure_multi_tenant_schema_statement_failed',
      outcome: 'failure',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      context: { sql: sql.slice(0, 160), message },
    }),
  );
}

/** The tenancy spine: tenants, brands, the domains they own, and their senders. */
const TENANCY_SPINE: string[] = [
  `CREATE TABLE IF NOT EXISTS tenants (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     slug VARCHAR(64) NOT NULL,
     name VARCHAR(255) NOT NULL,
     tenant_type VARCHAR(30) NOT NULL DEFAULT 'commercial',
     status VARCHAR(20) NOT NULL DEFAULT 'active',
     legal_name VARCHAR(255),
     metadata JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_unique ON tenants (slug)`,
  `CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status)`,

  `CREATE TABLE IF NOT EXISTS brands (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     slug VARCHAR(64) NOT NULL,
     name VARCHAR(255) NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'active',
     default_public_url VARCHAR(500),
     default_theme_key VARCHAR(64),
     support_email VARCHAR(255),
     metadata JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // Unique per tenant, not globally: two tenants may each have a brand called 'main'.
  `CREATE UNIQUE INDEX IF NOT EXISTS brands_tenant_slug_unique ON brands (tenant_id, slug)`,
  `CREATE INDEX IF NOT EXISTS idx_brands_status ON brands (status)`,

  `CREATE TABLE IF NOT EXISTS brand_domains (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     hostname VARCHAR(255) NOT NULL,
     purpose VARCHAR(20) NOT NULL,
     is_primary BOOLEAN NOT NULL DEFAULT FALSE,
     provider VARCHAR(64),
     provider_domain_id VARCHAR(255),
     verification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
     spf_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
     dkim_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
     dmarc_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
     activation_state VARCHAR(20) NOT NULL DEFAULT 'configured',
     verified_at TIMESTAMPTZ,
     last_checked_at TIMESTAMPTZ,
     metadata JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // (hostname, purpose) and not hostname alone: cpn.org is legitimately both the web
  // host and the email envelope domain, and those rows carry different DNS state.
  `CREATE UNIQUE INDEX IF NOT EXISTS brand_domains_hostname_purpose_unique
     ON brand_domains (hostname, purpose)`,
  `CREATE INDEX IF NOT EXISTS idx_brand_domains_brand ON brand_domains (brand_id)`,
  `CREATE INDEX IF NOT EXISTS idx_brand_domains_tenant ON brand_domains (tenant_id)`,

  `CREATE TABLE IF NOT EXISTS sender_profiles (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     name VARCHAR(255) NOT NULL,
     from_name VARCHAR(255) NOT NULL,
     from_email VARCHAR(255) NOT NULL,
     reply_to_email VARCHAR(255),
     sending_domain_id UUID REFERENCES brand_domains(id) ON DELETE SET NULL,
     tracking_domain_id UUID REFERENCES brand_domains(id) ON DELETE SET NULL,
     provider VARCHAR(20) NOT NULL DEFAULT 'mandrill',
     provider_subaccount VARCHAR(120),
     unsubscribe_url VARCHAR(500),
     physical_mailing_address TEXT,
     status VARCHAR(30) NOT NULL DEFAULT 'draft',
     is_default BOOLEAN NOT NULL DEFAULT FALSE,
     metadata JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sender_profiles_tenant_brand_status
     ON sender_profiles (tenant_id, brand_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_sender_profiles_from_email ON sender_profiles (from_email)`,
  // At most one default per brand. Two defaults is not a preference, it is a coin flip
  // at send time, and a partial unique index is the only place that can be guaranteed.
  `CREATE UNIQUE INDEX IF NOT EXISTS sender_profiles_one_default_per_brand
     ON sender_profiles (brand_id) WHERE is_default`,
];

/** Platform identity: one human, bridged to the three identities that already exist. */
const IDENTITY_TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS platform_identities (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     primary_email VARCHAR(255) NOT NULL,
     display_name VARCHAR(255),
     avatar_url TEXT,
     status VARCHAR(20) NOT NULL DEFAULT 'active',
     metadata JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS platform_identities_email_unique
     ON platform_identities (primary_email)`,
  `CREATE INDEX IF NOT EXISTS idx_platform_identities_status ON platform_identities (status)`,

  // linked_entity_id is VARCHAR and carries no FK: it points at leads (INTEGER key),
  // enrollments (UUID) or admin_users (UUID) depending on link_type, and one column
  // cannot reference three tables. The service layer owns that integrity.
  `CREATE TABLE IF NOT EXISTS platform_identity_links (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     platform_identity_id UUID NOT NULL REFERENCES platform_identities(id) ON DELETE CASCADE,
     link_type VARCHAR(30) NOT NULL,
     linked_entity_id VARCHAR(64) NOT NULL,
     is_primary BOOLEAN NOT NULL DEFAULT FALSE,
     link_source VARCHAR(40),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // The safety property: one lead/enrollment/admin row belongs to exactly one identity.
  // Without it two identities could both claim the same lead and the journey would fork.
  `CREATE UNIQUE INDEX IF NOT EXISTS platform_identity_links_type_entity_unique
     ON platform_identity_links (link_type, linked_entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_platform_identity_links_identity
     ON platform_identity_links (platform_identity_id)`,

  `CREATE TABLE IF NOT EXISTS tenant_memberships (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     platform_identity_id UUID NOT NULL REFERENCES platform_identities(id) ON DELETE CASCADE,
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
     role VARCHAR(64) NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'invited',
     permissions JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_tenant_memberships_identity_tenant
     ON tenant_memberships (platform_identity_id, tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_status
     ON tenant_memberships (tenant_id, status)`,
];

/** Lead-scoped tenancy: the brand relationship and its communication permissions. */
const LEAD_CONTEXT_TABLES: string[] = [
  // lead_id is INTEGER because leads.id is an INTEGER autoincrement. Attribution
  // columns carry no FKs on purpose: they reference high-churn tracking rows, and a
  // constraint would mean a retention sweep on page_events / visitor_sessions could not
  // delete without first rewriting attribution history here.
  `CREATE TABLE IF NOT EXISTS lead_tenant_contexts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     organization_id UUID,
     relationship_type VARCHAR(64) NOT NULL,
     status VARCHAR(40) NOT NULL DEFAULT 'active',
     pipeline_stage VARCHAR(64),
     lead_temperature VARCHAR(20),
     consent_contact BOOLEAN NOT NULL DEFAULT FALSE,
     consent_source VARCHAR(64),
     consent_at TIMESTAMPTZ,
     first_source_id UUID,
     first_entry_point_id UUID,
     first_visitor_id UUID,
     first_session_id UUID,
     first_campaign_id UUID,
     first_campaign_lead_id UUID,
     first_touch_at TIMESTAMPTZ,
     last_source_id UUID,
     last_entry_point_id UUID,
     last_session_id UUID,
     last_campaign_id UUID,
     last_touch_at TIMESTAMPTZ,
     assigned_platform_identity_id UUID,
     metadata JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // The idempotency key for the whole lead-context pipeline. Re-submitting the same
  // form must update one row, never create a second relationship.
  `CREATE UNIQUE INDEX IF NOT EXISTS lead_tenant_contexts_lead_tenant_brand_unique
     ON lead_tenant_contexts (lead_id, tenant_id, brand_id)`,
  `CREATE INDEX IF NOT EXISTS idx_lead_tenant_contexts_tenant_brand_stage
     ON lead_tenant_contexts (tenant_id, brand_id, pipeline_stage)`,
  `CREATE INDEX IF NOT EXISTS idx_lead_tenant_contexts_lead ON lead_tenant_contexts (lead_id)`,

  `CREATE TABLE IF NOT EXISTS communication_preferences (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
     category VARCHAR(64) NOT NULL,
     email_allowed BOOLEAN NOT NULL DEFAULT FALSE,
     sms_allowed BOOLEAN NOT NULL DEFAULT FALSE,
     voice_allowed BOOLEAN NOT NULL DEFAULT FALSE,
     source VARCHAR(64),
     metadata JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS communication_preferences_lead_tenant_brand_category_unique
     ON communication_preferences (lead_id, tenant_id, brand_id, category)`,
  `CREATE INDEX IF NOT EXISTS idx_communication_preferences_tenant_brand
     ON communication_preferences (tenant_id, brand_id)`,

  // --- tenant isolation audit trail (DEC-05) ---------------------------------
  // CPN's isolation is a formal grant and donor requirement, not just good practice,
  // and a control that silently works produces no evidence it worked. The DENIALS are
  // the evidence: a log of successful reads proves nothing about a boundary.
  //
  // No foreign keys, on purpose. This table has to outlive the rows it describes —
  // deleting a suspended operator or archiving a tenant must not cascade away the
  // record of what they reached. No updated_at either: nothing here is ever updated.
  `CREATE TABLE IF NOT EXISTS tenant_access_audits (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     platform_identity_id UUID,
     actor_email VARCHAR(255),
     resource_tenant_id UUID,
     resource_brand_id UUID,
     context_tenant_id UUID,
     resource_type VARCHAR(64) NOT NULL,
     resource_id VARCHAR(64),
     action VARCHAR(32) NOT NULL,
     decision VARCHAR(16) NOT NULL,
     reason VARCHAR(64),
     permission VARCHAR(64),
     correlation_id VARCHAR(64),
     ip_address VARCHAR(45),
     metadata JSONB
   )`,
  // The query an auditor actually asks: every attempt against this tenant, newest first.
  `CREATE INDEX IF NOT EXISTS idx_tenant_access_audits_tenant_time
     ON tenant_access_audits (resource_tenant_id, occurred_at)`,
  // The query a security review asks: show me the denials.
  `CREATE INDEX IF NOT EXISTS idx_tenant_access_audits_decision_time
     ON tenant_access_audits (decision, occurred_at)`,
  `CREATE INDEX IF NOT EXISTS idx_tenant_access_audits_identity
     ON tenant_access_audits (platform_identity_id)`,
];

/**
 * Additive tenancy columns on existing tables. All nullable, no defaults that would
 * rewrite existing rows, no FK constraints on the write-hot tracking tables.
 */
const EXISTING_TABLE_EXTENSIONS: string[] = [
  // --- acquisition -------------------------------------------------------------
  `ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS tenant_id UUID`,
  `ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS brand_id UUID`,
  `ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS source_type VARCHAR(30)`,
  `CREATE INDEX IF NOT EXISTS idx_lead_sources_tenant_brand ON lead_sources (tenant_id, brand_id)`,

  // Answers "what was the lead's actual entry experience?", which the existing
  // page/form_name pair cannot: a landing page, a form and a campaign link are all
  // entry points but behave differently in attribution.
  `ALTER TABLE entry_points ADD COLUMN IF NOT EXISTS entry_type VARCHAR(30)`,

  // --- tracking: sessions carry brand context ----------------------------------
  // The session is the natural "which site was this browsing on?" container. Visitors
  // stay global because one browser legitimately moves between ecosystem brands.
  `ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS tenant_id UUID`,
  `ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS brand_id UUID`,
  `ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS source_id UUID`,
  `ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS entry_point_id UUID`,
  `ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS campaign_id UUID`,
  `ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS campaign_lead_id UUID`,
  `ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS organization_id UUID`,
  `CREATE INDEX IF NOT EXISTS idx_visitor_sessions_tenant_brand_started
     ON visitor_sessions (tenant_id, brand_id, started_at)`,

  // --- tracking: page events -----------------------------------------------------
  // NO foreign keys here, matching the existing policy on page_events.lead_id: the DDL
  // deliberately omits constraints so Postgres never validate-scans this table, which
  // is the highest-write table in the system. Declaring FKs in the model but not here
  // would be a lie about the schema.
  //
  // page_events never had site_slug, so brand attribution at event level required a
  // join to the session. These columns remove that join for the journey and analytics
  // queries that need it most.
  `ALTER TABLE page_events ADD COLUMN IF NOT EXISTS tenant_id UUID`,
  `ALTER TABLE page_events ADD COLUMN IF NOT EXISTS brand_id UUID`,
  `ALTER TABLE page_events ADD COLUMN IF NOT EXISTS source_id UUID`,
  `ALTER TABLE page_events ADD COLUMN IF NOT EXISTS entry_point_id UUID`,
  `ALTER TABLE page_events ADD COLUMN IF NOT EXISTS campaign_id UUID`,
  `ALTER TABLE page_events ADD COLUMN IF NOT EXISTS campaign_lead_id UUID`,
  `ALTER TABLE page_events ADD COLUMN IF NOT EXISTS organization_id UUID`,
  `CREATE INDEX IF NOT EXISTS idx_page_events_tenant_brand_timestamp
     ON page_events (tenant_id, brand_id, timestamp)`,

  // --- campaigns -----------------------------------------------------------------
  // Only campaigns gets tenancy columns. The seventeen campaign-derived tables scope by
  // joining to their parent; stamping tenant_id on each would mean seventeen backfills
  // and seventeen chances for a child's tenant to drift from its parent's.
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS tenant_id UUID`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brand_id UUID`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS organization_id UUID`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sender_profile_id UUID`,
  `CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_brand_status
     ON campaigns (tenant_id, brand_id, status)`,

  // Reusable sequence content. NULL means "shared platform library", which is what
  // every existing row is.
  `ALTER TABLE follow_up_sequences ADD COLUMN IF NOT EXISTS tenant_id UUID`,

  // --- organizations ---------------------------------------------------------------
  // owner_enrollment_id is untouched. Making an organization creatable without an
  // enrollment is real work on the registration path and belongs to the CPN product
  // project, not to this foundation.
  `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tenant_id UUID`,
  `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_id UUID`,
  `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS organization_type VARCHAR(40)`,
  `CREATE INDEX IF NOT EXISTS idx_organizations_tenant_brand ON organizations (tenant_id, brand_id)`,

  `ALTER TABLE org_members ADD COLUMN IF NOT EXISTS platform_identity_id UUID`,
  `CREATE INDEX IF NOT EXISTS idx_org_members_platform_identity
     ON org_members (platform_identity_id)`,

  // --- memory graph tenant scoping -------------------------------------------------
  // The graph is one shared store. Before this, globalSearch was an unbounded findAll
  // over every node, so a CPN operator searching a keyword could receive AI Flotation
  // client memory. CPN's isolation is a formal grant commitment, so that is a leak
  // rather than an untidiness.
  //
  // Nodes and events carry the tenant. EDGES DO NOT, deliberately: an edge is scoped by
  // the nodes it joins, and a cross-tenant edge is refused at write time instead
  // (assertSameTenant). Stamping edges too would invite a row whose own tenant disagrees
  // with the nodes on either end, which is worse than not having the column.
  //
  // Nullable, because every one of the 227 existing nodes predates the ecosystem. Those
  // stay unclassified and are reachable only by a platform superadmin — treating
  // unclassified memory as public would void the boundary the moment a backfill missed
  // something.
  `ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS tenant_id UUID`,
  `ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS brand_id UUID`,
  `ALTER TABLE graph_events ADD COLUMN IF NOT EXISTS tenant_id UUID`,
  `CREATE INDEX IF NOT EXISTS idx_graph_nodes_tenant ON graph_nodes (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_graph_events_tenant ON graph_events (tenant_id)`,

  // --- audit -----------------------------------------------------------------------
  `ALTER TABLE event_ledger ADD COLUMN IF NOT EXISTS tenant_id UUID`,
  `ALTER TABLE event_ledger ADD COLUMN IF NOT EXISTS brand_id UUID`,
];

/**
 * Order matters across the groups: the spine must exist before anything references it,
 * and lead_tenant_contexts references both tenants and brands. Within a group the
 * statements are already dependency-ordered.
 */
export async function ensureMultiTenantSchema(): Promise<void> {
  const statements = [
    ...TENANCY_SPINE,
    ...IDENTITY_TABLES,
    ...LEAD_CONTEXT_TABLES,
    ...EXISTING_TABLE_EXTENSIONS,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      // Never fatal to boot. A statement Postgres has no IF NOT EXISTS form for (or a
      // race with a second booting container) must not stop the server coming up, but
      // it must be visible rather than swallowed.
      logStatementFailure(sql, err);
    }
  }

  console.log('[DB] Multi-tenant ecosystem schema ensured');
}

/** Exported for the schema test so the statement list can be asserted without a database. */
export const MULTI_TENANT_SCHEMA_STATEMENTS: readonly string[] = [
  ...TENANCY_SPINE,
  ...IDENTITY_TABLES,
  ...LEAD_CONTEXT_TABLES,
  ...EXISTING_TABLE_EXTENSIONS,
];
