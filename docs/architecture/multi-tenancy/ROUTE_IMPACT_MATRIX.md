# Route Impact Matrix

**Session:** CC-20260821-m6t4 · **Base:** `bb152ded`

Impact classes:

- **NONE** — route unchanged.
- **ADDITIVE** — route gains optional context; existing callers unaffected.
- **SCOPED** — route must enforce tenant authorization on reads/writes.
- **NEW** — created by this project.

---

## Public ingest & tracking (browser-facing, unauthenticated)

| Route | Impact | Change |
|---|---|---|
| `POST /api/t/event` | ADDITIVE | resolve tenant/brand server-side from `site_slug`/host; stamp session + event; fail-soft |
| `POST /api/t/batch` | ADDITIVE | same |
| `POST /api/t/heartbeat` | ADDITIVE | none beyond session context already resolved |
| `POST /api/t/identify` | ADDITIVE | accept optional signed `jx` journey token in addition to `email`/`lid` |
| `POST /api/ingest?source=&entry=` | ADDITIVE | after lead upsert, ensure `LeadTenantContext` from the resolved source |
| `POST /api/v1/leads` | ADDITIVE | same, service-token gated already |

**Invariant:** none of these routes may accept `tenant_id` or `brand_id` from the request
body. The server resolves them from `site_slug` → `LeadSource`, or hostname → `BrandDomain`.
A browser that could name its own tenant could write into another tenant's data.

## Admin — acquisition

| Route | Impact | Change |
|---|---|---|
| `GET /api/admin/sources/*` | SCOPED | filter by caller's authorized tenants; platform superadmin sees all |
| `POST/PUT /api/admin/sources/*` | SCOPED | require tenant/brand on create; reject cross-tenant writes |
| `GET /api/admin/ingest-log/*` | SCOPED | scope through `source_slug` → tenant |
| `GET /api/admin/form-definitions/*` | SCOPED | scope through entry point → source → tenant |
| `GET /api/admin/leads/*` | SCOPED | a lead is global, but the **context rows** returned must be filtered to authorized tenants |

The lead-detail route is the subtlest one in the system. The canonical `leads` row is global,
so returning it is fine; returning *all* of its `lead_tenant_contexts` to a CPN admin would
leak the existence of an AI Flotation relationship. The route returns the lead plus **only the
contexts the caller is authorized for**.

## Admin — tracking

| Route | Impact | Change |
|---|---|---|
| `GET /api/admin/visitors/*` | SCOPED | filter sessions/events by authorized tenant/brand |
| `GET /api/admin/journey/:leadId` | NEW | chronological cross-brand journey, tenant-filtered |

## Admin — campaigns

| Route | Impact | Change |
|---|---|---|
| `GET /api/admin/campaigns` | SCOPED | filter by tenant/brand |
| `POST /api/admin/campaigns` | SCOPED | require tenant/brand; validate sender profile belongs to same brand |
| `PUT /api/admin/campaigns/:id` | SCOPED | 404 (not 403) on foreign tenant to avoid existence disclosure |
| `campaignTestRoutes`, `campaignSimulationRoutes`, `campaignDiagnosticsRoutes`, `campaignIntelligenceRoutes` | SCOPED | scope via parent campaign |
| `POST /api/webhooks/mandrill` | ADDITIVE | restore tenant/brand from metadata before writing activity |

## Admin — organizations

| Route | Impact | Change |
|---|---|---|
| `GET/POST /api/admin/organizations/*` | SCOPED | filter by tenant; `organization_type` on create |
| portal `/api/portal/company/*` | ADDITIVE | unchanged behavior; org's tenant carried through |

## Admin — ecosystem (new)

| Route | Impact |
|---|---|
| `GET /api/admin/ecosystem/tenants` | NEW |
| `GET /api/admin/ecosystem/brands` | NEW |
| `GET /api/admin/ecosystem/domains` | NEW |
| `GET /api/admin/ecosystem/sender-profiles` | NEW |
| `GET /api/admin/ecosystem/health` | NEW — domain/sender readiness |

All ecosystem routes require **platform superadmin**.

## Unchanged (NONE)

Everything under `capePortalRoutes`, `sbpRoutes`, `communityRoomsRoutes`,
`participantRoutes`, `enrollmentRoutes`, `projectRoutes`, `workspaceRoutes`,
`healthRoutes`, `qrRedirectRoutes`, `unsubscribeRoutes`, `advisorRoutes`,
`studentOpsRoutes` — the learning platform is single-tenant (Colaberry) for this project and
gains nothing from tenancy columns until a second tenant actually delivers learning.

## Status-code policy for isolation failures

| Case | Response |
|---|---|
| authenticated, resource belongs to another tenant | **404** — never confirm existence |
| authenticated, no membership for requested tenant | **403** |
| unauthenticated | **401** |

Plan §19.1 permits "404/403"; this project standardises on **404 for cross-tenant resource
access** so that ID enumeration cannot distinguish "exists elsewhere" from "does not exist",
and 403 only for an explicit tenant-scope request the caller has no membership for.
