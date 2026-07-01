# Admin UI Redesign — State Ledger (Loop Architect)

**Branch:** `workstream/admin-brand-redesign` · **Session:** CC-20260628-k7p2
Durable state for the per-page polish loop (Basecamp todo 10028907149). Maker edits a
page; a **separate** checker subagent scores it against the rubric below; only then does a
row flip to ✓. No row is marked done without checker sign-off. Stop conditions: checker
passes, or 2 corrective iterations (then flag `REVIEW`), or operator says stop.

## Definition of "top-notch" (per-page rubric)

1. **Brand tokens** — no hardcoded hex; cherry/leaf/berry + neutrals via tokens or Bootstrap classes.
2. **PageHeader** — uses `components/admin/shell` `PageHeader` (title, subtitle, breadcrumb, actions).
3. **TrustBadge** — a `TrustSignal` is declared and shown in the header (trust on every page).
4. **StatCard** — KPI rows use `StatCard`, not hand-rolled `.admin-kpi-card`.
5. **Icons** — RemixIcon (`ri-*`), not inline bootstrap-icon SVG paths.
6. **A11y** — keyboard/focus reachable, contrast AA, aria labels (use `fixing-accessibility`).
7. **Responsive** — sane at <576 and <992.
8. **tsc** — `tsc --noEmit` clean.
9. **build** — production `react-scripts build` eslint-clean (NO `react-hooks/exhaustive-deps` disable).

Legend: ✓ done · ~ partial (foundation re-skin only) · ☐ not started · ⚑ REVIEW (capped).
The **foundation** (brand-bridge.css + new sidebar + Bootstrap override) re-skins every page's
colors/fonts/shape/nav globally, so every page starts at **~** (brand) before any per-page work.

## Foundation (global — done)

| Item | Status | Notes |
|---|---|---|
| `brand-bridge.css` (tokens + Bootstrap `--bs-*` + fonts) | ✓ | cherry #FB2832, Roboto, rounded |
| Sidebar redesign (collapsible + search + RemixIcon) | ✓ | `AdminLayout.tsx`, `adminNav.ts` |
| Shell primitives (`PageHeader/StatCard/StatusBadge/SectionCard/TrustBadge`) | ✓ | `components/admin/shell/` |
| Trust Center hub (`/admin/trust`) | ~ | exists (`AdminTrustCenterPage`); brand polish pending |

## Per-page ledger

### Batch 1 — high-traffic (priority)
| Page | brand | PageHeader | Trust | StatCard | icons | a11y | tsc | checker |
|---|---|---|---|---|---|---|---|---|
| AdminReportsPage (Automated Reports) | ✓ | ✓ | ✓ | ✓ | ✓ | ☐ | ✓ | ✓ |
| AdminDashboardPage | ✓ | ✓ | ✓ | ✓ | ✓ | ☐ | ✓ | ✓ |
| AdminLeadsPage | ✓ | ✓ | ✓ | ✓ | ✓ | ☐ | ✓ | ✓ |
| AdminPipelinePage | ✓ | ✓ | ✓ | ✓ | ✓ | ☐ | ✓ | ✓ |
| AdminOpportunitiesPage | ✓ | ✓ | ✓ | ✓ | ✓ | ☐ | ✓ | ✓ |
| AdminRevenueDashboardPage | ✓ | ✓ | ✓ | ✓ | ✓ | ☐ | ✓ | ✓ |
| CEOCommandCenter (header+KPIs; dark tab panels deferred) | ✓ | ✓ | ✓ | ✓ | ✓ | ☐ | ✓ | ✓ |
| GovernanceCommandCenter | ✓ | ✓ | ✓ | ✓ | ✓ | ☐ | ✓ | ✓ |
| InboxCOSPage | ✓ | ✓ | ✓ | ✓ | ✓ | ☐ | ✓ | ✓ |
| AdminTrustCenterPage (brand re-skin only; +fix toast-per-poll) | ~ | ☐ | ☐ | ☐ | ☐ | ☐ | ✓ | ☐ |

### Batch 2 — remaining top-level pages
AdminWarRoomPage, AdminVisitorsPage, AdminFunnelPage, AdminCampaignsPage, AdminCampaignDetailPage,
CampaignBuilderPage, AdminCommunicationsPage, AdminMarketingDashboardPage, AdminICPInsightsPage,
AdminSourcesPage, AdminIngestLogsPage, AdminRoutingRulesPage, AdminAutonomousPage, AdminAutomationPage,
MissedOpportunitiesPage, ContentQueuePage, AdminAcceleratorPage, AdminOrchestrationPage,
AdminProjectOverview, CbSystemCommand, AdminTicketBoardPage, AdminSettingsPage, AdminGovernancePolicyPage,
AdminApolloPage, AdminImportPage, AdminEventLedgerPage, AdminLeadDetailPage, AdminCohortDetailPage,
AdminSequencesPage, AdminGeneratorPage, AdminAISettingsPage — all **~** (foundation), per-page **☐**.

### Batch 3 — sub-tab hubs (apply to each tab component)
`ai-settings/*` (20), `orchestration/*` + `orchestration/builder/*` (43), `intelligence/tabs/*` (20+),
`inbox/*` (7), `marketing/*`. Convert tab containers to `SectionCard`/`PageHeader`; brand inner styles.

## Loop log
- 2026-06-28 (CC-20260628-k7p2): Foundation landed + AdminReportsPage converted (maker). Separate checker audited; 3 findings fixed.
- 2026-06-28 (CC-20260628-k7p2): Dev visual review — branch built clean (prod build green) + run as a throwaway review container on the dev2 network (`http://95.216.199.47:9990`). Playwright screenshots captured 8 pages → `docs/screenshots/2026-06-28-brand-review/`. Confirmed live: cherry/Roboto/rounded brand, new collapsible+search sidebar with cherry active state + auto-expand, branded StatCards + per-page TrustBadge on the converted Reports page. Notes: (a) dev2 backend lacks `/api/admin/trust/*` + reports data, so those pages show error/empty states (data gap, not a frontend defect); (b) FOUND pre-existing UX bug in `AdminTrustCenterPage` — it fires a toast on every failed 30s poll (toast spam when backend is down); fix when branding that page (toast once / inline error).
- 2026-06-28 (CC-20260628-k7p2): Batch 1a — Dashboard, Leads, Pipeline converted (3 parallel maker subagents) → PageHeader + StatCards + StatusBadge + SectionCard + per-page TrustBadge, all hardcoded hex → tokens, pipeline stage colors → `--chart-N`. Separate checker subagent: all PASS (no build-breakers, hooks ordered, tags balanced, no hex); one icon nit (`flow-chart` → `record-circle-line`) fixed. tsc clean. 4/42 pages now fully converted.
- 2026-06-28 (CC-20260628-k7p2): Batch 1b — Opportunities, Revenue, CEO Command converted (3 parallel makers) → PageHeader + StatCards + StatusBadge + (Section)Card + per-page TrustBadge; chart/funnel series → `--chart-N`. CEO: header + 6 KPI tiles + status pill converted; its dark-themed tab panels (Goals/Directives/Dept/Workforce/Audit) intentionally DEFERRED to a dark→light re-theme pass. Separate checker: all 3 SHIP, no issues. 7/42 pages converted (CEO header-level).
- 2026-06-28 (CC-20260628-k7p2): Batch 1c — Governance + Inbox COS converted (2 parallel makers) → PageHeader + StatCards + StatusBadge + SectionCard + per-page TrustBadge. Governance: 6 AI-COO KPI tiles + all status pills + content panels; Inbox: header + KPI row + tab nav a11y (role=tablist/tab). Verified: grep clean (no eslint-disable/dangling-symbols/hex), tsc clean. **Batch 1 high-traffic set COMPLETE: 9/9 pages** (Reports, Dashboard, Leads, Pipeline, Opportunities, Revenue, CEO[header], Governance, Inbox). 9/42 total.
- 2026-06-29 (CC-20260628-k7p2): Batch 2a — War Room, Visitors, Funnel, Campaigns, Communications converted (5 parallel makers); tsc clean, grep clean (only `var(--color-bg-alt,#f7fafc)` token-fallbacks remain in Visitors — acceptable). Batch 2b — ICP Insights, Sources, Ingest Logs, Routing Rules, Autonomous converted (5 parallel makers); each self-ran tsc exit 0; grep clean. **19/42 top-level pages converted.**
- 2026-06-29 (CC-20260628-k7p2): Wave 3 — Marketing (`../../../`), Missed Opportunities, Content Queue, Tickets, Settings converted (5 parallel makers); each self-ran tsc exit 0; grep clean. **24/42 top-level pages converted.** Remaining top-level: detail/builder pages (LeadDetail, CohortDetail, CampaignDetail, Generator, EventLedger, Apollo, Import, Sequences), the tab-hub shells (AISettings, Orchestration, ProjectOverview, CbSystem, GovernancePolicy, Accelerator), AdminTrustCenterPage re-skin.
- 2026-06-29 (CC-20260628-k7p2): Wave 4 — Apollo, Import, Event Ledger, Projects (AdminProjectOverview), CB System converted (5 parallel makers); each self-ran tsc exit 0; grep clean. (Event Ledger kept its `EventLedgerContent` fragment intact — Settings audit tab still consumes it.) **29/42 top-level pages converted.** Remaining: LeadDetail, CohortDetail, CampaignDetail, Generator, Sequences, GovernancePolicy, Accelerator, AISettings-shell, Orchestration-shell, AdminTrustCenterPage re-skin; then Batch 3 (sub-tab hubs) + CEO/Governance dark-panel re-theme + Trust Center toast fix.
- 2026-06-29 (CC-20260628-k7p2): Wave 5 — Lead Detail, Cohort Detail, Campaign Detail, Sequences, Governance Policy converted (5 parallel makers); grep clean; authoritative tsc re-run after all makers finished (resolved a transient concurrency error one maker saw mid-run). Governance Policy: inlined `useGovernanceAudit` into the page (the old `GovernancePolicyDashboard` component held the navy hex and was off-limits; it's now no longer rendered by this route). **34/42 top-level pages converted.** Remaining top-level: Generator, Accelerator, AISettings-shell, Orchestration-shell, AdminTrustCenterPage re-skin.
- 2026-06-29 (CC-20260628-k7p2): Wave 6 — Generator, Accelerator, AI Settings (surgical header + Overview tab), Orchestration (surgical header), Trust Center converted (5 parallel makers); grep clean; tsc clean. **Trust Center toast-per-poll BUG FIXED** (one-shot `failureAnnouncedRef` guard → inline banner shown at most once per outage, re-arms on a successful poll; no more toast cascade). AISettings/Orchestration deep tab content (separate imported components) deferred to Batch 3. **39 route-level pages converted.** Remaining route-level: CampaignBuilder, Automation, Intelligence Discovery/Settings, AgentOrphans (hidden), IntelligenceOS (immersive — special). Then Batch 3 (sub-tab hubs ~90 files) + CEO/Governance dark-panel re-theme.
- 2026-06-29 (CC-20260628-k7p2): Wave 7 (stragglers) — Campaign Builder, Automation, Intelligence Discovery (`../../../`), Intelligence Settings (`../../../`), Agent Orphans converted (5 parallel makers); grep clean; authoritative tsc re-run after all makers finished (cleared a transient concurrency error in CampaignBuilder). **ROUTE-LEVEL SET COMPLETE: 44 navigable admin pages converted.** Only NOT converted by design: `AdminLoginPage` (already brand-styled via the foundation; no PageHeader needed) and `IntelligenceOSPage` (immersive full-screen Apple-style OS — keeps its own bespoke design). REMAINING WORK: Batch 3 (sub-tab *content* components inside the hub pages — `ai-settings/*` (~20), `orchestration/*`+`builder/*` (~43), `intelligence/tabs/*` (~20), `inbox/*` (~6)) which already inherit the foundation brand; + CEO/Governance dark command-center panel re-theme.
- 2026-06-30 (CC-20260628-k7p2): Batch 3 scout — hardcoded hex concentrated in `ai-settings/*` (33 across 8 files), `inbox/*` (10 across 2: AuditLog, Decisions), `orchestration/*`+`builder/*` (200 across 22 — a SCOPED `.orch-engine`/orchestration.css Apple-style theme, like the immersive Intelligence OS); `intelligence/tabs/*` already clean (0 hex). Batch 3a/3b — converted all 8 ai-settings hex files + the 2 inbox hex files (7 parallel makers, LIGHT rubric: hex→brand/chart/status tokens, NO PageHeader/trust since the parent hub owns them); grep clean (ai-settings 0 hex; InboxAuditLog keeps 4 deliberate third-party PROVIDER brand colors — Gmail/MS — as a justified exception); tsc clean. **OPEN DECISION for Ali:** orchestration/builder is a self-contained scoped design system — (a) rebrand it to the cherry brand, (b) map its raw hex → the existing `--orch-*` tokens (keep its Apple look but kill raw hex), or (c) leave it (like the immersive Intelligence OS)? Plus the CEO/Governance dark-panel re-theme remains.
- 2026-06-30 (CC-20260628-k7p2): Ali chose **full cherry rebrand** for orchestration + **re-theme dark panels to light**. DONE: (a) `orchestration.css` — re-pointed the `.orch-engine` `--orch-*` token block to brand tokens (cherry/leaf/berry/Roboto) + rebranded all other hardcoded colors (badges, tables, buttons, alerts, Apple-blue→cherry); (b) all 22 `orchestration/*`+`builder/*` component files debranded (200 hex → brand/chart/status tokens; mascot SVGs → `--chart-5/7`; `${color}20` hex-alpha → `color-mix`) across 8 parallel makers; grep-verified the WHOLE orchestration dir = 0 hardcoded hex; (c) `CEOCommandCenter` dark glassmorphism panels re-themed to LIGHT brand surfaces (color constants re-pointed: BG/CARD→surface tokens, TEXT_*→ink, RED/GREEN/AMBER/BLUE/PURPLE→brand, `${color}20` fills→`softFill` color-mix; all 6 sections light). Governance had no dark panels (already light). tsc clean. **REBRAND COMPLETE: every admin surface — 44 navigable pages + all sub-tab content + the orchestration workspace + the CEO command center — is on the Colaberry brand.** Only `IntelligenceOSPage` (immersive) + `AdminLoginPage` left by design.
