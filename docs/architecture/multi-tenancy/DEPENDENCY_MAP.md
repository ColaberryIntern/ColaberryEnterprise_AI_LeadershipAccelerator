# Dependency Map

**Session:** CC-20260821-m6t4 · **Base:** `bb152ded`

Per-concept map of what touches what. Compiled from the code at `bb152ded`, not from the plan.

---

## Lead / CRM

| Aspect | Detail |
|---|---|
| **Models** | `Lead` (419 ln), `LeadSource`, `EntryPoint`, `FormDefinition`, `RawLeadPayload`, `Activity`, `EventLedger`, `EnrollmentLead` |
| **Services** | `leadService.createLead()`, `leadIngestionService.handleIngest()`, `activityService.logActivity()`, `routingEngineService.evaluateAndDispatch()`, `externalLeadIngestService` |
| **Controllers** | `v1LeadController`, admin `leadRoutes`, `ingestLogRoutes`, `formDefinitionRoutes` |
| **Routes** | `POST /api/ingest`, `POST /api/v1/leads` (service-token gated), admin `/api/admin/leads/*`, `/api/admin/sources/*` |
| **Frontend** | `AdminSourcesPage.tsx`, `components/campaign/CRMTab.tsx` |
| **Tests** | `externalLeadIngestService.test.ts`, `ingestStatusCountsBySource.test.ts` |
| **Seeds** | `seedLeadSources.ts` |
| **Known assumption** | `leads.email` is the dedup key; `leads.id` is **INTEGER** |
| **Migration risk** | Low. Additive `lead_tenant_contexts` sits beside the pipeline; ingest gains one call at step 8. |

## Visitor / tracking

| Aspect | Detail |
|---|---|
| **Models** | `Visitor`, `VisitorSession`, `PageEvent`, `BehavioralSignal`, `IntentScore` |
| **Services** | `visitorTrackingService` (`findOrCreateVisitor`, `getOrCreateSession`, `recordPageEvent`, `categorizePagePath`, `updateHeartbeat`, `resolveIdentity`), `visitorAnalyticsService`, `behavioralSignalService`, `intentScoringService`, `behavioralTriggerService` |
| **Controllers** | `trackingController` — `handleTrackEvent`, `handleTrackBatch`, `handleHeartbeat`, `handleIdentify` |
| **Routes** | `POST /api/t/event`, `/api/t/batch`, `/api/t/heartbeat`, `/api/t/identify` — all rate-limited |
| **Frontend** | `frontend/public/v1/track.js` (drop-in tracker), `AdminVisitorsPage.tsx` |
| **Tests** | `visitorTrackingIdentity.test.ts`, `ensurePageEventLeadId.test.ts`, `backfillPageEventLeadId.test.ts` |
| **Known assumptions** | `HOST_TO_SITE_SLUG` is hard-coded (8 hosts); unknown host ⇒ `'unknown'`; `VALID_EVENT_TYPES` is a closed list of 27 and unknown types are **rejected**; `page_events.lead_id` has **no FK** by design |
| **Migration risk** | **Highest write volume in the system.** Resolution must be cached and fail-soft. A synchronous DB lookup per pageview to resolve tenant would be a performance regression. |

## Campaign

| Aspect | Detail |
|---|---|
| **Models** | 18 campaign-derived (see [CAMPAIGN_DEPENDENCY_MAP.md](CAMPAIGN_DEPENDENCY_MAP.md)) |
| **Services** | `schedulerService` (send path, sender override at :892), `campaignTransport`, campaign agents |
| **Controllers** | `mandrillWebhookController`, admin `campaignRoutes`, `campaignTestRoutes`, `campaignSimulationRoutes`, `campaignDiagnosticsRoutes`, `campaignIntelligenceRoutes` |
| **Frontend** | `AdminCampaignsPage.tsx`, `components/campaign/*` |
| **Tests** | `campaignTransport.test.ts`, `campaignSendWindow.test.ts`, `mandrillBounceSuppression.test.ts` |
| **External** | Mandrill (send + webhooks) |
| **Known assumption** | Sender identity is `campaign.settings.sender_email/sender_name` — untyped JSONB read at send time, with a module default fallback |
| **Migration risk** | Medium. Adding `sender_profile_id` as the *preferred* path with the JSONB read demoted to a logged fallback is non-breaking; a flag-day switch would not be. |

## Organization / account

| Aspect | Detail |
|---|---|
| **Models** | `Organization`, `OrgMember`, `OrgCohort` |
| **Services** | `orgService`, `adminOrgService` |
| **Middleware** | `orgAuth` |
| **Routes** | admin `organizationRoutes`, portal company routes |
| **Frontend** | `services/orgApi.ts`, `services/adminOrgApi.ts`, `pages/portal/company/` |
| **Tests** | `orgService.test.ts`, `adminOrgService.test.ts`, `organizationRoutes.paths.test.ts` |
| **Known assumption** | **`owner_enrollment_id` is `NOT NULL` and `UNIQUE`** — an organization cannot exist without an `Enrollment` |
| **Migration risk** | Low for additive columns. **High if the identity bridge tried to replace `owner_enrollment_id`** — it must not. |

## Identity / auth

| Aspect | Detail |
|---|---|
| **Models** | `Enrollment` (portal/student identity + payment state), `AdminUser` (operator), `Lead` (contact) |
| **Known assumption** | Three parallel identity notions with no unifying row |
| **Migration risk** | **Highest blast radius if done wrong.** `platform_identities` must be introduced additively and must never become a required participant in an existing auth path during this project. |

## Intelligence

| Aspect | Detail |
|---|---|
| **Location** | `backend/src/services/intelligence/`, `backend/src/intelligence/`, `docs/architecture/enterprise-intelligence/` |
| **Migration risk** | Cross-tenant leakage is the risk, not breakage. Every query that reaches lead/campaign/org memory needs an allowed-tenant filter. |

---

## Cross-cutting: what a tenant column must never break

1. **Ingest must keep working with no tenant context** — an unregistered source still creates
   a lead. Missing context is a logged metric, not a rejection.
2. **Tracking must stay fail-soft** — a tenancy resolution failure drops to `null` context and
   still records the event.
3. **Authorization must be fail-closed** — an unresolved tenant on an admin read is a 403, not
   an unscoped `findAll()`.

That asymmetry (telemetry fails soft, authorization fails closed) is the single most important
invariant in this project and is stated in plan §57.
