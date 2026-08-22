# Migration & Backfill Map

**Session:** CC-20260821-m6t4 · **Base:** `bb152ded`

---

## Mechanism

No migration framework exists (see [CURRENT_STATE.md](CURRENT_STATE.md) §2). All schema work
in this project goes through **one** new module:

```
backend/src/db/ensureMultiTenantSchema.ts   →  called from server.ts boot
```

Rules it inherits from `ensureOrgAccountSchema.ts`:

- `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` /
  `CREATE INDEX IF NOT EXISTS` only.
- Every statement in its own try/catch, logging a structured error, never fatal to boot.
- `DO $$ ... END $$` guards for constraints with no `IF NOT EXISTS` form.
- Additive only: no drop, no rename, no retype, no `NOT NULL` on an existing column.

## Stage A — new tables + nullable columns

New tables: `tenants`, `brands`, `brand_domains`, `sender_profiles`, `platform_identities`,
`platform_identity_links`, `tenant_memberships`, `lead_tenant_contexts`,
`communication_preferences`.

Nullable columns added to existing tables:

| Table | Columns |
|---|---|
| `lead_sources` | `tenant_id`, `brand_id`, `source_type` |
| `entry_points` | `entry_type` |
| `visitor_sessions` | `tenant_id`, `brand_id`, `source_id`, `entry_point_id`, `campaign_id`, `campaign_lead_id`, `organization_id` |
| `page_events` | same seven — **no FK constraints** (write-hot table, matches existing `lead_id` policy) |
| `campaigns` | `tenant_id`, `brand_id`, `organization_id`, `sender_profile_id` |
| `organizations` | `tenant_id`, `brand_id`, `organization_type` |
| `org_members` | `platform_identity_id` |
| `event_ledger` | `tenant_id`, `brand_id` |
| `follow_up_sequences` | `tenant_id` |

## Stage B — deterministic seeds

Seeded by stable slug, not by generated UUID, so re-running is a no-op and IDs are stable
across environments.

| Tenant | Brands |
|---|---|
| `colaberry` | `colaberry-enterprise`, `colaberry-training` |
| `cpn` | `cpn` |
| `ai-flotation` | `ai-flotation` |
| `refactored` | `refactored` |

## Stage C — backfill policy

**Deterministic map, no guessing.**

| Existing `lead_sources.slug` / hostname | → tenant | → brand |
|---|---|---|
| `enterprise` , `enterprise.colaberry.ai` | `colaberry` | `colaberry-enterprise` |
| `colaberry` , `colaberry.ai` , `www.colaberry.ai` | `colaberry` | `colaberry-enterprise` |
| `training.colaberry.com` , `myfreeaiclass.com` | `colaberry` | `colaberry-training` |
| `cpn.org` | `cpn` | `cpn` |
| `aiflotation.com` | `ai-flotation` | `ai-flotation` |
| `refactored.ai` | `refactored` | `refactored` |
| `trustbeforeintelligence` | `colaberry` | `colaberry-enterprise` |
| `worldoftaxonomy` | **`legacy-unclassified`** | — |
| `advisor` | **`legacy-unclassified`** | — |
| anything else | **`legacy-unclassified`** | — |

`trustbeforeintelligence` is classified to Colaberry Enterprise because it is Ram's book
microsite feeding enterprise demand — a business fact, recorded here so the assignment is
auditable rather than assumed.

`worldoftaxonomy` and `advisor` are **deliberately unclassified**. `advisor.colaberry.ai` is a
separate FastAPI product with its own repository; asserting it belongs to Colaberry Enterprise
would be a guess. Plan Stage C says: *do not silently guess* — produce an unresolved report.

## Backfill order (dependency-driven)

```
1. tenants, brands, brand_domains, sender_profiles      (seed)
2. lead_sources.tenant_id/brand_id                       (from slug map)
3. lead_tenant_contexts                                  (from leads × source_id)
4. visitor_sessions.tenant_id/brand_id                   (from site_slug → lead_sources)
5. page_events.tenant_id/brand_id                        (from session_id → visitor_sessions)
6. campaigns.tenant_id/brand_id                          (default: colaberry/enterprise)
7. organizations.tenant_id/brand_id                      (default: colaberry/enterprise)
```

Steps 4 and 5 are the large ones. `page_events` is the highest-row-count table in the
database, so its backfill runs **batched with a bounded row limit per invocation**, is
resumable, and is **not** run at boot — it is an explicitly invoked script.

Steps 6 and 7 default to Colaberry Enterprise because every existing campaign and organization
in the database today *is* Colaberry Enterprise: there has never been another tenant. That is
a defensible deterministic assignment rather than a guess, and it is logged as an assumption.

## Stage D — dual write

Ingest and tracking write both the legacy fields (`source`, `form_type`, `site_slug`,
`pipeline_stage`, …) and the new context rows. Legacy `Lead` fields remain the compatibility
surface until every consumer is migrated. `lead_tenant_contexts` is authoritative for
**tenant-specific** lifecycle; legacy `Lead` fields stay authoritative for the Colaberry
Enterprise view until a later project retires them.

Metric emitted on every write with unresolved context:
`event: "tenant_context_unresolved"`, with `site_slug` / `source_slug` in context.

## Stage E / F — out of scope for this project

Context-aware reads land in this project for the admin surfaces named in
[ROUTE_IMPACT_MATRIX.md](ROUTE_IMPACT_MATRIX.md). `NOT NULL` enforcement (Stage F) is
**explicitly deferred** — it requires zero unresolved rows across all environments and a clean
metrics window, neither of which can be established inside this project.

## Idempotency (plan §55)

Every seed and backfill:

- keyed on stable slugs or on `(lead_id, tenant_id, brand_id)` uniques,
- uses `INSERT ... ON CONFLICT DO NOTHING` or find-or-create,
- second run changes zero rows,
- emits `{processed, updated, already_correct, unresolved, failed}` and writes a
  machine-readable artifact to `tmp/`.
