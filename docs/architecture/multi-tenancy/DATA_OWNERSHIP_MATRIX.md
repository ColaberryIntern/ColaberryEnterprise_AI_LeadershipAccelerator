# Data Ownership Matrix

**Session:** CC-20260821-m6t4 · **Base:** `bb152ded`

Classification vocabulary (from master plan §14):

- **GLOBAL** — platform-wide, deliberately shared across tenants. Never gets a `tenant_id`.
- **TENANT** — owned by exactly one tenant. Must carry `tenant_id` and be scoped on read.
- **BRAND** — owned by one brand within a tenant. Carries `tenant_id` + `brand_id`.
- **DERIVED** — inherits scope from its parent row; scoped by joining, not by its own column.
- **NEW** — does not exist yet; created by this project.

---

## Core identity & contact

| Table | Ownership | Scope key | Current state | Required change |
|---|---|---|---|---|
| `leads` | GLOBAL (canonical person) | `id` (INTEGER) | global, has `source_id`/`entry_point_id`/`visitor_id` | **keep global** — never partition |
| `lead_tenant_contexts` | BRAND | `tenant_id`+`brand_id` | NEW | create |
| `platform_identities` | GLOBAL (canonical human) | `id` | NEW | create |
| `platform_identity_links` | GLOBAL bridge | `link_type`+`linked_entity_id` | NEW | create |
| `tenant_memberships` | TENANT | `tenant_id` | NEW | create |
| `enrollments` | GLOBAL (learner identity) | `id` | global, no tenancy | leave alone; bridge via identity link |
| `admin_users` | GLOBAL (operator) | `id` | global | bridge via identity link; authorization moves to `tenant_memberships` |

`leads` stays global on purpose. One human who is a CPN scholarship applicant, a Training
learner, and an Enterprise participant is **one** `leads` row with three
`lead_tenant_contexts` rows. Splitting `leads` per tenant would make cross-brand journey
reconstruction impossible and would duplicate suppression state.

## Tenancy spine (all NEW)

| Table | Ownership | Scope key | Notes |
|---|---|---|---|
| `tenants` | GLOBAL registry | `slug` | the hard security boundary |
| `brands` | TENANT | `tenant_id` | unique `(tenant_id, slug)` |
| `brand_domains` | BRAND | `brand_id` | unique `(hostname, purpose)` |
| `sender_profiles` | BRAND | `brand_id` | fail-closed gate for live sends |
| `communication_preferences` | BRAND | `tenant_id`+`brand_id` | unique `(lead_id, tenant_id, brand_id, category)` |

## Acquisition & attribution

| Table | Ownership | Scope key | Current state | Required change |
|---|---|---|---|---|
| `lead_sources` | BRAND | `tenant_id`+`brand_id` | **missing both** | add nullable, backfill, keep `slug` stable |
| `entry_points` | DERIVED (from source) | via `source_id` | no `entry_type` | add `entry_type`; scope by join |
| `form_definitions` | DERIVED (from entry point) | via `entry_point_id` | fine as-is | none |
| `raw_lead_payloads` | DERIVED (from source slug) | via `source_slug` | fine as-is | none |
| `activities` | DERIVED (from lead) | via `lead_id` | fine as-is | none — scoped through lead context |
| `event_ledger` | GLOBAL audit | `id` | no tenancy | add nullable `tenant_id`/`brand_id` for filtering |

## Tracking (high-write — see §57 performance guardrails)

| Table | Ownership | Scope key | Current state | Required change |
|---|---|---|---|---|
| `visitors` | GLOBAL (browser identity) | `id` | global, has `site_slug` first-touch | **keep global** — one browser legitimately crosses brands |
| `visitor_sessions` | BRAND | `tenant_id`+`brand_id` | has `site_slug` only | add tenant/brand/source/entry/campaign/org, all nullable |
| `page_events` | BRAND | `tenant_id`+`brand_id` | **no `site_slug` at all** | add same columns, **no FKs** (write-hot table) |
| `behavioral_signals` | DERIVED (from session) | via `session_id` | — | scope by join |
| `intent_scores` | DERIVED (from visitor) | via `visitor_id` | — | scope by join |

`visitors` stays global for the same reason `leads` does: the entity is a browser, and the
whole point of the ecosystem is that one browser moves between brands. Brand ownership
attaches at the **session**, which is the natural "which site was this?" container.

## Campaign & communications

| Table | Ownership | Scope key | Current state | Required change |
|---|---|---|---|---|
| `campaigns` | BRAND | `tenant_id`+`brand_id` | **missing** | add tenant/brand/org/sender_profile |
| `campaign_leads` | DERIVED (from campaign) | via `campaign_id` | — | scope by join |
| `scheduled_emails` | DERIVED (from campaign) | via `campaign_id` | — | scope by join; sender resolved at send |
| `communication_logs` | DERIVED (campaign+lead) | via `campaign_id`/`lead_id` | — | scope by join |
| `interaction_outcomes` | DERIVED | via `lead_id`+`campaign_id` | — | scope by join |
| `campaign_health` / `_errors` / `_variants` / `_insights` | DERIVED | via `campaign_id` | — | scope by join |
| `campaign_test_runs` / `_steps` | DERIVED | via `campaign_id` | — | scope by join |
| `campaign_simulations` / `_steps` | DERIVED | via `campaign_id` | — | scope by join |
| `campaign_experiments` / `_deployments` / `_governance_config` | DERIVED | via `campaign_id` | — | scope by join |
| `follow_up_sequences` | TENANT (reusable content) | `tenant_id` | — | add nullable `tenant_id`; null = shared library |
| `lead_recommendations` | DERIVED | via `campaign_id` | — | scope by join |
| `unsubscribe_events` | GLOBAL safety | `lead_id` | global | **stays global** — infrastructure suppression is not brand-scoped |

**Deliberate design call:** only `campaigns` gets its own tenancy columns. Every
campaign-derived table is scoped by joining to `campaigns`. Stamping `tenant_id` on eighteen
child tables would mean eighteen backfills, eighteen drift risks, and eighteen places for a
mismatched pair to appear. The join is one hop and the parent is immutable in its ownership.

`unsubscribe_events` stays global on purpose. A hard bounce, an abuse complaint, or a
provider-level suppression is a fact about the **address**, not about a brand relationship.
Brand preference (§16) is a separate, additive concern in `communication_preferences`.

## Organizations

| Table | Ownership | Scope key | Current state | Required change |
|---|---|---|---|---|
| `organizations` | BRAND | `tenant_id`+`brand_id` | **missing**; anchored on `owner_enrollment_id` | add nullable tenant/brand/`organization_type` |
| `org_members` | DERIVED (from org) | via `org_id` | — | add nullable `platform_identity_id` |
| `org_cohorts` | DERIVED (from org) | via `org_id` | — | none |

## Intelligence

| Surface | Ownership | Required change |
|---|---|---|
| graph nodes / edges / events | TENANT | must accept an allowed-tenant filter before returning rows |
| decision logs | TENANT | carry tenant context |
| cross-tenant reasoning | GLOBAL | requires explicit platform-superadmin privilege |

## Summary of schema deltas

**7 new tables:** `tenants`, `brands`, `brand_domains`, `sender_profiles`,
`platform_identities`, `platform_identity_links`, `tenant_memberships`,
`lead_tenant_contexts`, `communication_preferences` (9 counting the two lead-scoped ones).

**Tables extended with nullable columns:** `lead_sources`, `entry_points`,
`visitor_sessions`, `page_events`, `campaigns`, `organizations`, `org_members`,
`event_ledger`, `follow_up_sequences`.

**Zero destructive changes.** No column is dropped, renamed, retyped, or made `NOT NULL`
in this project. `NOT NULL` is deferred to a later project per plan Stage F.
