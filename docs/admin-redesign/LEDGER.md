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
| AdminReportsPage (Automated Reports) | ✓ | ✓ | ✓ | ✓ | ✓ | ☐ | ✓ | ☐ |
| AdminDashboardPage | ~ | ☐ | ☐ | ☐ | ☐ | ☐ | ✓ | ☐ |
| AdminLeadsPage | ~ | ☐ | ☐ | ☐ | ☐ | ☐ | ✓ | ☐ |
| AdminPipelinePage | ~ | ☐ | ☐ | ☐ | ☐ | ☐ | ✓ | ☐ |
| AdminOpportunitiesPage | ~ | ☐ | ☐ | ☐ | ☐ | ☐ | ✓ | ☐ |
| AdminRevenueDashboardPage | ~ | ☐ | ☐ | ☐ | ☐ | ☐ | ✓ | ☐ |
| CEOCommandCenter | ~ | ☐ | ☐ | ☐ | ☐ | ☐ | ✓ | ☐ |
| GovernanceCommandCenter | ~ | ☐ | ☐ | ☐ | ☐ | ☐ | ✓ | ☐ |
| InboxCOSPage | ~ | ☐ | ☐ | ☐ | ☐ | ☐ | ✓ | ☐ |
| AdminTrustCenterPage | ~ | ☐ | ☐ | ☐ | ☐ | ☐ | ✓ | ☐ |

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
- 2026-06-28 (CC-20260628-k7p2): Foundation landed + AdminReportsPage converted (maker). Checker pass pending.
