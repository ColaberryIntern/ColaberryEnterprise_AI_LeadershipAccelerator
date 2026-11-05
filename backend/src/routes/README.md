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
GET  /api/v1/open-house/event           (public, cached)
GET  /api/v1/events                     (public - already public on Eventbrite)
GET  /api/v1/knowledge/sales            (public - the frontend falls back to a bundle)
```

| Client | Variable | Held by |
|---|---|---|
| `enterprise_crm` | `ENTERPRISE_CRM_TOKEN` | training.colaberry.com (Sai's Cloud Run), Repo2Reputation |
| `cora` | `CORA_SERVICE_TOKEN` | the Cora recap engine, read-only |

**Before 2026-11-05 there was one shared token and every guarded route took it.** That gave any
holder the three writes, including `request-callback`, which asks Synthflow to dial a person. It
also could not be rotated: three systems hold the same value, so rotating it means changing all
three in the same minute or breaking lead capture. Scoping per client fixed both.

So: **a read-only consumer never gets `enterprise_crm`.** Add it as its own client — one line in
`ServiceClient`, one in `CLIENT_TOKENS`, one in `.env.example`, one in
`docker-compose.production.yml`, and the value on the host. `requireServiceClient` is a factory,
so it must be CALLED; the old `requireServiceToken` was passed directly and is gone, which makes
a stale call site a compile error rather than a route that hangs.

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
