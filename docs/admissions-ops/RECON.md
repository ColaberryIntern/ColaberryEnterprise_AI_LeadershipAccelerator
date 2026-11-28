# RECON: Admissions & Ops Command Center

Kit Phase 0, step 1. Written by session CC-20261127-jgh1 against origin/main 8fec472e6, 2026-11-27 (Central).
Basecamp list: https://app.basecamp.com/3945211/buckets/47502609/todolists/10553095637 (ticket AO1.1).

## What is committed here, and what is not

This repository is public. This folder holds the kit's README, `docs/SPEC.md`, `docs/AGENT_CONTROL_SURFACE.md` and the 16-screen demo.
Taiwo's blueprint PDF is **not** committed; it stays in Basecamp (Admissions & Ops Command Center > 01 - Build kit).
The demo's opportunity counts and TFC audit counts, which came from the blueprint, were replaced with invented numbers
(opportunities 140 / 117 / 20 / 3 / $1,250; TFC 28 accounts: 15 cancelled, 9 withdrawn, 4 completed, 6 with no withdrawal
request, 5 previously extended). "3 students active in IPBC on cancelled contracts" is kept because the demo's three
invented students are named around it. Every name in `demo/` is invented, and every number is invented except that one kept 3. None of it may ship.

## Did the kit's facts hold?

All of them. Details and line numbers are in the Build Contract on Basecamp. Corrections that change the build:

| Finding | Consequence |
|---|---|
| Repo is public | This folder is sanitized (above); fixtures use only the demo's invented names |
| `admissions` role is Dhee's (dashboard, lead_ingestion, internship) | New section key `admissions_ops`; the admissions role does not get it (M0 Q2 default) |
| `/api/admin/admissions` maps to `lead_ingestion`; gate matches `prefix` or `prefix + '/'` | All new APIs live under `/api/admin/admissions-ops`, never `/api/admin/admissions/ops` |
| `admissions_ops` is already an AiAgent category string | No collision (not a section key); expect grep hits in agentFactory.ts, AiAgent.ts, domainAgents.ts |
| Oversize files: adminNav.ts 604, mgmtSectionGate.ts 511, PersonProfilePage.tsx 513, backend routes/adminRoutes.ts 538, ghlService.ts 626, paysimpleService.ts 512 | Split before adding (AO1.2, AO3.2, AO4.2); new backend routes mount from their own module |
| frontend routes/adminRoutes.tsx is 493 lines | One lazy layout route there; the 16 children live in `admissionsOpsRoutes.tsx` |
| Tables are created at boot by `backend/src/db/ensure*Schema.ts` modules; no migrations | Each new table group gets `ensureAdmissionsOps<X>Schema.ts`, awaited from server.ts |

## Shared building blocks

| Need | Exists today | Decision |
|---|---|---|
| Route layout with in-page navigation | `pages/admin/marketing/MarketingShell.tsx` (Outlet), `components/admin/commsHub/CommsHubLayout.tsx` (Outlet + context) | **Reuse the pattern**: new `AdmissionsOpsLayout` modelled on CommsHubLayout |
| Page chrome | `components/admin/shell`: PageHeader, SectionCard, StatCard, StatusBadge, EmptyState, TrustBadge, trust.ts | **Reuse** everywhere; TrustBadge for source and freshness |
| Access | `mgmtRoles.ts` SECTION_KEYS + effectiveSections; `mgmtSectionGate.ts` PATH_SECTION; nav `section` field | **Extend**: one new key `admissions_ops` |
| Agent audit log | `AgentWriteAudit` (DB writes by registered ai_agents, FK to ai_agents); `AdmissionsActionLog` (website visitor conversations) | **New** `admissions_ops_agent_log`: neither has on-behalf-of, screen, action, mode, sources read, or a request-id key |
| Approvals | `ApprovalRequest` (tickets / work units / agent runs, FKs); `CommsHubApproval` (hub posts) | **New** `admissions_ops_approvals`, modelled on CommsHubApproval; keeps "the agent can never decide" a local, testable rule |
| Policies | `AdmissionsKnowledgeEntry` (feeds the prospect-facing admissions assistant) | **New** versioned `admissions_ops_knowledge`; the existing store is linked read-only, never written, so an ops policy edit cannot change what prospects are told |
| Circuit breaker | `services/agents/openclaw/openclawCircuitBreaker.ts` | **Reuse the pattern** in the SourceAdapter wrapper |
| Person resolution | `PersonProfilePage` + `services/adminOs/personScope.ts` | **Reuse** keys for identity links |

## The 16 screens

| Screen | Route | Exists today | Decision | Builds on |
|---|---|---|---|---|
| Today | /admin/admissions-ops | Nothing equivalent (My Day is an external link to advisor.colaberry.ai/my-day/) | **New** | fixture endpoint (R1), alerts (R3) |
| Admissions | .../admissions | AdminLeadsPage, AdminPipelinePage, AdminOpportunitiesPage, AdminFunnelPage, AdminOpenHouseAttendeesPage; `/api/admin/admissions/*` (Dhee's surface) | **Wrap**: read GHL through the adapter, link to the existing pages, change none of them | ghlMirrorService, open-house attendee data |
| Students | .../students | PlacementStudentsPage (placement only), person search behind /admin/people | **New** list, **reuse** person keys | identity links, search endpoint |
| Student 360 | .../students/:ref | PersonProfilePage (513 lines), AdminStudentStoryPage, PersonHistoryDrawer | **Grow out of PersonProfilePage**: split it into sections, compose them plus four status cards; /admin/people/:ref unchanged | PersonProfilePage sections, PersonHistoryDrawer |
| Academics | .../academics | Cohort, CohortMembership, Enrollment models | **New** screen over existing tables | platform adapter |
| Payments | .../payments | AdminRefundsPage; paysimpleService, paysimpleRecurring, paysimpleWebhookHealth | **New** screen, **reuse** services read-only; link Refunds | PaySimple adapter, reconciliation module |
| TFC audit | .../payments/tfc-audit | Nothing (no TFC code) | **New**, CSV upload snapshots (M0 Q5 default) | snapshot table |
| Support | .../support | AdminTicketBoardPage (internal tickets); no Zendesk code | **New**, Zendesk shown Not connected | platform + PaySimple adapters |
| Communications | .../communications | AdminCommunicationsPage, pages/admin/inbox/* (Ali's inbox tooling), gmailService | **New** screen over GHL conversation history; inbox pages untouched | GHL adapter |
| Compliance | .../compliance | Nothing | **New** | tracker table, Knowledge templates |
| Reports | .../reports | AdminReportsPage | **New** screen, link the existing page | report_runs |
| Weekly Opportunity Report | .../reports/weekly-opportunity | Nothing | **New** | report builder + Approvals |
| Ask AURA | .../agent | Nothing (pages/admin/agents is the agent registry) | **New** | audit log, manifest |
| Approvals | .../approvals | ApprovalRequestsPage (agent-run approvals) | **New** queue on its own table | admissions_ops_approvals |
| Knowledge | .../knowledge | AdminKnowledgeOpsPage, AdmissionsKnowledgeEntry | **New** versioned store; existing ones linked read-only | admissions_ops_knowledge |
| Setup | .../setup | Nothing | **New** | source_sync_state, thresholds, audit log |

## Source systems

| System | Code in repo | Release 2 adapter |
|---|---|---|
| Platform DB (app.colaberry: registration, enrollment, cohorts, progress, activation) | Sequelize models | Real, read only |
| GHL | ghlService.ts, ghlMirrorService.ts, leads/ghlAccountRouting.ts | Real, read only |
| PaySimple | paysimpleService.ts, paysimpleRecurring.ts, paysimpleWebhookHealth.ts | Real, read only, no card or bank fields |
| Gmail | gmailService.ts (not Taiwo's mailbox) | Fixture, Not connected |
| Zendesk, TFC, Retool, Google Sheets | none | Fixture, Not connected (TFC via CSV upload in R3) |

## Existing pages that are only linked

Student Story, My Day, Leads, Pipeline, Opportunities, Funnel, Refunds, Communications, Placement and Reports keep their
routes and nav entries. The workspace links to them. Folding any of them in is decided page by page at milestone M4.
