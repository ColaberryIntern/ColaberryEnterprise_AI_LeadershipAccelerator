# Current State — Pre-Tenancy Baseline

**Session:** CC-20260821-m6t4
**Base commit:** `bb152ded` (origin/main, 2026-08-20)
**Branch:** `workstream/multi-tenant-ecosystem`
**Date:** 2026-08-21

Everything below was read out of the codebase at `bb152ded`. Nothing here is inferred from
the master plan; where the plan and the code disagree, the code wins and the disagreement is
recorded in [IMPLEMENTATION_DEVIATIONS.md](IMPLEMENTATION_DEVIATIONS.md).

---

## 1. Repository shape

```
/
├── frontend/        CRA + TypeScript (npm workspace)
├── backend/         Express + TypeScript + Sequelize (npm workspace)
├── directives/      SOPs
├── docs/            in-repo docs
├── scripts/         repo-root operational scripts
├── system/          portal-owned generated maps (DO NOT EDIT)
├── tests/           Playwright (systemV2)
├── execution/       legacy Python (read-only reference)
└── intelligence/    in-flight subsystem outside backend tree
```

Root `package.json` declares `workspaces: ["frontend", "backend"]`. There is **no `apps/`
and no `packages/`** directory yet. Node engine `>=20`.

`backend/src/models/` holds **229 model files**. `backend/src/models/index.ts` is 1,110 lines:
it imports every model, declares all associations inline, and re-exports them from a single
`export { ... }` block starting at line 1161.

## 2. How schema changes actually happen here

There is **no migration framework**. There is no `sequelize-cli`, no `umzug`, no
`migrations/` directory. Schema evolves through two mechanisms:

1. **`backend/src/db/ensure*Schema.ts`** — 32 modules, each exporting one
   `ensureXxxSchema(): Promise<void>` that runs an array of idempotent raw DDL statements
   (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS`) inside a per-statement try/catch that logs a structured
   error and never fails boot.
2. **Inline `ensureXxx()` functions in `backend/src/server.ts`** — the older form of the same
   pattern (`ensureIngestionSchema`, `ensureOrgSchema`, `ensureCampaignLinkColumns`, …).

`server.ts:193` documents *why*: `sequelize.sync({ alter: true })` on a 215+ model graph
previously generated ~50k duplicate constraints and drove Postgres into OOM. **Boot-time
schema work is CREATE/ADD ... IF NOT EXISTS only.**

`ensureOrgAccountSchema.ts` is the best exemplar of the current house style and is what the
tenancy DDL in this project imitates: additive only, per-statement error isolation,
`DO $$ ... END $$` guards for constraints Postgres has no `IF NOT EXISTS` form for, and a
comment explaining the business reason for every column.

## 3. Lead / CRM pipeline (as built)

```
POST /api/ingest?source=<slug>&entry=<slug>
   → RawLeadPayload.create(status:'pending')      # raw kept before anything else
   → LeadSource.findOne({slug, is_active})        # 400 if unknown
   → EntryPoint.findOne({source_id, slug})        # 400 if unknown
   → verifyHmacSignature (if source.hmac_secret)  # 403 if bad
   → FormDefinition (latest active version)       # field_map + required_fields
   → normalizeWithFieldMap → validateNormalized
   → createLead()                                 # leadService, dedups by email
   → lead.update({source_id, entry_point_id})
   → findOrCreateVisitor + resolveIdentity        # attribution, non-fatal
   → logActivity(type:'system', subtype:'form_submit')
   → routingEngineService.evaluateAndDispatch     # optional
   → raw.update({status:'accepted', resulting_lead_id})
```

Source: `backend/src/services/leadIngestionService.ts`.

Notable facts that constrain the tenancy design:

- `leads.id` is an **INTEGER autoincrement**, not a UUID. Every FK pointing at a lead must be
  `INTEGER`, not `UUID`. The master plan's `lead_tenant_contexts.lead_id INTEGER FK` is right;
  its sibling `first_visitor_id UUID` is also right because visitors *are* UUID.
- `lead_sources.hmac_secret` may hold either a literal secret **or the name of an env var**
  (`resolveSecret()`); any new sender/domain secret handling should reuse that convention.
- Ingest already refuses phone-only leads (`email is required`).
- The visitor link step is wrapped in try/catch and only warns — attribution is **fail-soft**,
  lead creation is **fail-closed**. The tenancy work must preserve that split.

## 4. Source registry (as built)

`lead_sources` columns: `id UUID`, `slug UNIQUE`, `name`, `domain`, `api_key_hash`,
`hmac_secret`, `hmac_secret_prev`, `rate_limit`, `is_active`, timestamps.
**No tenant, no brand, no source_type.**

`entry_points` columns: `id UUID`, `source_id UUID`, `slug`, `name`, `page`, `form_name`,
`description`, `is_active`, timestamps, unique on `(source_id, slug)`.
**No entry_type.**

Seeded sources today (`backend/src/seeds/seedLeadSources.ts`): `trustbeforeintelligence`,
`colaberry`, and others. These are real external microsites already ingesting — the backfill
must classify them, not assume they are all Enterprise.

## 5. Visitor / journey tracking (as built)

- `visitors` — global browser identity, UUID PK, carries first-touch UTM + `lead_id`.
- `visitor_sessions` — UUID PK, `visitor_id`, nullable `lead_id`, timing/counters, entry/exit
  page, referrer, `utm_source/campaign/medium`, `ip_address`, `device_type`, `is_bounce`,
  `landing_page_category`, **`site_slug VARCHAR(64)`**, `metadata JSONB`.
- `page_events` — UUID PK, `session_id`, `visitor_id`, nullable `lead_id`, `event_type`,
  `page_url`, `page_path`, `page_title`, `page_category`, `event_data JSONB`, `timestamp`.

`site_slug` exists on the **session** but **not** on `page_events`. That asymmetry matters:
page-event-level brand attribution today can only be reached by joining to the session.

`page_events.lead_id` deliberately has **no foreign key** — the DDL omits it so Postgres never
validate-scans this high-write table. The model comment says so explicitly. Any tenancy column
added to `page_events` must follow the same no-FK rule.

`backend/src/controllers/trackingController.ts` (487 lines) holds a hard-coded
`HOST_TO_SITE_SLUG` map (8 hostnames) and `normalizeSiteSlug()` which prefers the tracker's
`data-site` value and falls back to the host map, returning `'unknown'` on a miss. There are
27 accepted `event_type` values; the ingest **rejects unknown types**, which is why the
skeleton apps' events must use existing type names or the list must be extended.

`frontend/public/v1/track.js` exists and is the live drop-in tracker. Per the plan's rule 4,
it is not to be removed.

Identity resolution in `handleTrackEvent` currently accepts a raw **`email` query/body param**
and an **`lid`** (lead id) param. Both are unauthenticated identity assertions. This is exactly
what §10.1 of the plan says to deprecate for new cross-domain flows.

## 6. Campaign engine (as built)

`campaigns` has 30+ columns but **no tenant, brand, organization or sender-profile column**.
Sender identity lives in the untyped `settings JSONB` blob:

```
backend/src/services/schedulerService.ts:892
  if (settings.sender_email) senderEmail = settings.sender_email;
  if (settings.sender_name)  senderName  = settings.sender_name;
```

That is the *only* per-campaign sender override in the send path. Everything else falls back
to a module-level default. There is no domain verification, no SPF/DKIM/DMARC check, and no
concept of an approved sender.

Campaign-derived tables confirmed present: `Campaign`, `CampaignLead`, `ScheduledEmail`,
`CommunicationLog`, `InteractionOutcome`, `CampaignHealth`, `CampaignError`, `CampaignVariant`,
`CampaignInsight`, `FollowUpSequence`, `CampaignTestRun`, `CampaignTestStep`,
`CampaignSimulation`, `CampaignSimulationStep`, `CampaignExperiment`, `CampaignDeployment`,
`CampaignGovernanceConfig`, `LeadRecommendation`. See
[CAMPAIGN_DEPENDENCY_MAP.md](CAMPAIGN_DEPENDENCY_MAP.md) for the ownership classification.

There is **no `EmailSuppression` model**. Suppression today is `UnsubscribeEvent` plus
`unsubscribeRoutes.ts` plus bounce handling in `mandrillWebhookController.ts`. The plan's
§16 assumption of "one simplistic global marketing unsubscribe flag" is close enough to true
that brand-scoped preferences are genuinely new.

## 7. Organization / account foundation (as built)

- `organizations` — `id UUID`, `name`, `owner_enrollment_id UUID UNIQUE → enrollments`,
  `auto_staff_sync`, `status`, `status_changed_at/by`, `lead_id INTEGER` (unconstrained),
  timestamps. **No tenant, no brand, no organization_type.**
- `org_members` — `id UUID`, `org_id`, `enrollment_id`, `email`, `team`, `role`
  (`manager|member`), `invite_status`, `invited_by`, `joined_at`. Unique `(org_id, email)`.
- `org_cohorts` — many-to-many org↔cohort, added by `ensureOrgAccountSchema`.

The organization identity anchor is **`owner_enrollment_id`**, i.e. an organization cannot
exist without an `Enrollment`. That is a real constraint on the identity bridge: a CPN
community partner has no enrollment, so `platform_identities` must be able to stand alone
rather than being derived from enrollments.

## 8. Baseline verification

| Check | Result |
|---|---|
| `backend: tsc --noEmit` | **clean, 0 errors** |
| targeted jest (7 suites: org, adminOrg, visitorTrackingIdentity, externalLeadIngest, campaignTransport, ensurePageEventLeadId, ingestStatusCounts) | **77/77 passed** |

Recorded in full in [BASELINE_TEST_RESULTS.md](BASELINE_TEST_RESULTS.md). Any failure appearing
after this point is attributable to the tenancy work, not pre-existing.

## 9. The five facts that most shape the implementation

1. **No migration framework** → tenancy DDL must be an `ensure*Schema` module wired into
   `server.ts` boot, additive and idempotent, never `sync({alter:true})`.
2. **`leads.id` is INTEGER** → `lead_tenant_contexts.lead_id` is INTEGER; mixed UUID/INTEGER
   FKs across the new tables are unavoidable and must be deliberate.
3. **`page_events` intentionally has no lead FK** → new tenancy columns on it get no FK either.
4. **Organizations are anchored to enrollments** → `platform_identities` must be independent
   of `Enrollment`, bridged by a link table, exactly as §5.5/5.6 of the plan specifies.
5. **Sender identity is an untyped JSONB blob read at send time** → the sender-profile resolver
   can be introduced as a preferred path with the JSONB read demoted to a logged fallback,
   with no flag day.
