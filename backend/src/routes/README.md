# Routes

Express route registration, **167 files**, grouped by audience. Routers are mounted in [../server.ts](../server.ts).

Routes register paths and attach middleware. They do not contain business logic. The chain is `routes -> controllers -> services -> models`.

---

## Top-level routers

Mounted in this order in `server.ts`. **The order is load-bearing.**

| File | Mount | Audience |
|---|---|---|
| `webhookRoutes.ts` | pre-JSON | External webhook receivers |
| `healthRoutes.ts` | `/health*` | Infrastructure probes |
| `leadRoutes.ts` | public | Lead capture |
| `enrollmentRoutes.ts` | public | Enrollment and checkout |
| `adminRoutes.ts` | `/api/admin/*` | Staff — aggregates 94 sub-routers |
| `calendarRoutes.ts` | public | Booking |
| `strategyPrepRoutes.ts` | public | Strategy call prep |
| `trackingRoutes.ts` | public | Visitor tracking beacon |
| `participantRoutes.ts` | `/api/portal/*` | Students — 39 endpoints |
| `alumniReferralRoutes.ts` | alumni | Referral program |
| `qrRedirectRoutes.ts` | public | QR redirects with analytics |
| `v1Routes.ts` | `/api/v1/*` | Service-to-service |
| `projectRoutes.ts` | — | Project surfaces |

### Two ordering rules that have bitten before

**1. Webhooks mount before `express.json()`.** Signature verification needs the raw body. Move `webhookRoutes` below the JSON parser and every signature check silently fails. The preview proxy middleware mounts early for the same reason.

**2. Public routes registered after `adminRoutes` can inherit its auth guard.** This has produced 401s on endpoints that were meant to be open — the calendar booking endpoint being the known case. If a public route unexpectedly demands auth, check its mount position before anything else.

---

## `admin/` — 94 route modules

Everything behind staff auth. Grouped by what they operate on:

**Funnel and revenue** — `leadRoutes`, `admissionsRoutes`, `campaignRoutes`, `campaignIntelligenceRoutes`, `campaignDiagnosticsRoutes`, `campaignSimulationRoutes`, `campaignTestRoutes`, `marketingRoutes`, `marketingFunnelRoutes`, `missedOpportunitiesRoutes`, `sourceRoutes`, `alumniRoutes`, `formDefinitionRoutes`, `routingRuleRoutes`

**Program delivery** — `cohortRoutes`, `acceleratorRoutes`, `podcastRoutes`, `projectOverviewRoutes`, `implementationStrategyRoutes`

**AI operations** — `aiOpsRoutes`, `opsRoutes`, `cbSystemRoutes`, `orchestrationRoutes`, `coryRoutes`, `intelligenceRoutes`, `insightRoutes`, `automationRoutes`, `schedulerControlRoutes`, `autonomousRoutes`, `autonomyRoutes`, `generatorRoutes`

**Agent governance** — `agentGovernanceRoutes`, `agentOrphanRoutes`, `capabilityAgentRoutes`, `governanceRoutes`, `governanceCenterRoutes`, `securityRoutes`, `roleRoutes`

**Intelligence surfaces** — `strategicIntelligenceRoutes`, `departmentIntelligenceRoutes`, `executiveAwarenessRoutes`, `websiteIntelligenceRoutes`, `businessProcessRoutes`, `companyRoutes`, `artifactRelationshipRoutes`, `userJourneyMapsRoutes`

**Analytics and reporting** — `dashboardRoutes`, `reportingRoutes`, `automatedReportsRoutes`, `visitorAnalyticsRoutes`, `visitorFlowRoutes`, `qrAnalyticsRoutes`, `ingestLogRoutes`

**Inbox and comms** — `inboxRoutes`, `communicationRoutes`, `alertRoutes`, `contentQueueRoutes`, `openclawRoutes` (+ `openclawRoutes-Ali-AI`)

**Platform and infra** — `authRoutes`, `settingsRoutes`, `deploymentRoutes`, `previewRoutes`, `previewStackRoutes`, `testSetupRoutes`, `productionActivationRoute`, `productionCleanupRoute`, `ticketRoutes`, `anthropicRoutes`

---

## `v1Routes.ts` — the external API

The only service-to-service surface. Every route is rate-limited; the guarded ones name the
**client** whose token they accept, and each client has its own environment variable.

```
POST /api/v1/leads                      requireServiceClient('enterprise_crm')   WRITE
POST /api/v1/request-callback           requireServiceClient('enterprise_crm')   WRITE - dials
POST /api/v1/open-house/register        requireServiceClient('enterprise_crm')   WRITE
GET  /api/v1/enrollments/lookup         requireServiceClient('enterprise_crm')
GET  /api/v1/explorer-growth/outreach   requireServiceClient('cora')
POST /api/v1/explorer-growth/contact-activity  requireServiceClient('cora')   WRITE - forward-only
GET  /api/v1/open-house/event           (public, cached)
GET  /api/v1/events                     (public - already public on Eventbrite)
GET  /api/v1/knowledge/sales            (public - the frontend falls back to a bundle)
```

| Client | Variable | Held by |
|---|---|---|
| `enterprise_crm` | `ENTERPRISE_CRM_TOKEN` | training.colaberry.com (Sai's Cloud Run), Repo2Reputation |
| `cora` | `CORA_SERVICE_TOKEN` | the Cora recap engine. Reads the queue; since 2026-11-17 also writes `last_contacted_at` forward, and nothing else |

### `GET /api/v1/explorer-growth/outreach` — the paging contract

Query: `view` (`reach_out` default, or `engaged`), `limit` (1 to 200, **default 25**),
`offset` (default 0). The schema is `.strict()`, so any other parameter is a **400** rather
than being ignored.

```json
{ "view": "reach_out", "tracked_since": "2026-10-26",
  "count": 200, "total": 847, "offset": 0, "snapshot": "3f9a2c1d8e7b4056", "rows": [ ... ] }
```

`count` is this page, `total` is the whole ranked pool. **There is more to read while
`offset + count < total`.** Before `total` existed a consumer holding a full page could not
tell "that is everyone" from "that is the first 200 of more", so Cora read the capped page as
the whole queue and could not safely tag anyone out of it.

`snapshot` is a digest of the page's ordered enrollment ids. The pool is re-derived against the
clock on every call, so two counts taken minutes apart legitimately disagree and comparing them
proves nothing. Comparing snapshots is the check that works: equal means both sides hold the
same rows in the same order.

**Before 2026-11-05 there was one shared token and every guarded route took it.** That gave any
holder the three writes, including `request-callback`, which asks Synthflow to dial a person. It
also could not be rotated: three systems hold the same value, so rotating it means changing all
three in the same minute or breaking lead capture. Scoping per client fixed both.

So: **a read-only consumer never gets `enterprise_crm`.** Add it as its own client — one line in
`ServiceClient`, one in `CLIENT_TOKENS`, one in `.env.example`, one in
`docker-compose.production.yml`, and the value on the host. `requireServiceClient` is a factory,
so it must be CALLED; the old `requireServiceToken` was passed directly and is gone, which makes
a stale call site a compile error rather than a route that hangs.

### `POST /api/v1/explorer-growth/contact-activity` - the return leg

The queue above is only safe to act on because of this route. Cora tags the people in the feed
in GoHighLevel and Rose calls them; until 2026-11-17 nothing came back, so
`explorer_journey_profiles.last_contacted_at` was set on **0 of 1080 profiles**, the seven-day
suppression in `reachOutCandidate` had no input, and the same ~119 people would have been
re-tagged every night for ever.

```json
{ "source": "ghl-rose-calls",
  "rows": [ { "ghl_contact_id": "abc123", "last_connected_call_at": "2026-11-17T21:04:00Z" } ] }
```

```json
{ "source": "ghl-rose-calls", "received": 2, "matched": 2, "unmatched": 0,
  "written": 2, "unchanged": 0, "rejected_future": 0, "unmatched_ghl_contact_ids": [] }
```

**`matched` and `unmatched` count CONTACT IDS; `written` and `unchanged` count PROFILES.** They
are different units on purpose: production holds one `ghl_contact_id` attached to two leads, so
one row sent can move two profiles.

Four rules worth knowing before you call it:

- **CONNECTED CALLS ONLY.** The column means contacted, not attempted. A no-answer must stay out
  of the payload or it suppresses somebody nobody spoke to.
- **FORWARD-ONLY, which is the idempotency.** A timestamp is written only when it is strictly
  newer than the stored one. Replaying a file writes nothing, and a stale file cannot drag a
  contact time backwards and return that person to the queue early. There is no dedupe table
  because monotonicity makes one unnecessary.
- **AN OFFSET IS REQUIRED.** `2026-11-17T21:04:00` with no `Z` is a **400**, not an assumed UTC.
  The assumption is invisible and wrong by six hours in Central, which is enough to move someone
  across the seven-day window.
- **FUTURE TIMESTAMPS ARE REFUSED** beyond five minutes of clock skew, and counted in
  `rejected_future`. A far-future value would suppress that person permanently, because
  `last_contacted_at < NOW() - 7 days` could never become true again.

**THERE ARE TWO COLUMNS NAMED `last_contacted_at`.** This route writes
`explorer_journey_profiles.last_contacted_at`, the learner-side one, which is what the
suppression reads. `leads.last_contacted_at` is CRM-side, is not read by the queue at all, and is
where the incoming `ghl_contact_id` would naturally lead you - writing there succeeds and changes
nothing.

`request-callback` will not actually dial unless `ENABLE_VOICE_CALLS=true` and test mode is off.

Adding an endpoint here is a contract change with an external consumer — coordinate before shipping.

---

## `healthRoutes.ts` — deliberately three-tiered

| Endpoint | Checks | Auth |
|---|---|---|
| `/health` | Process liveness only. **Never touches the database.** | none |
| `/health/ready` | Probes Postgres with a 2s timeout. 503 when unreachable. | none |
| `/health/full` | Detailed per-check system report. | admin bearer token |

The container healthcheck in `docker-compose.production.yml` probes `/health`, not `/health/ready`. That is intentional: with `restart: always`, a readiness probe would let a brief Postgres blip restart-loop an otherwise healthy backend.

---

## Required patterns

- **Zod-validate every inbound payload** at the route or controller boundary. Failed parse returns 400 and never reaches a service. Schemas live in [../schemas/](../schemas/).
- **Auth is explicit per route**, via `authMiddleware`, `rbacMiddleware`, `participantAuth`, `alumniAuth`, or `serviceAuthMiddleware` from [../middlewares/](../middlewares/).
- **Test the unauthenticated path.** A route with only happy-path coverage is incomplete; "what happens when an anonymous caller hits this" is a required test.
- **Authorization is three checks, not one**: valid session, correct role, and the resource actually belongs to this user (or they are an admin).
- **Group by feature.** New admin surfaces get a new file in `admin/` and one import line in `adminRoutes.ts`.
- Keep route files thin. If a handler is growing logic, it belongs in a controller or a service.
