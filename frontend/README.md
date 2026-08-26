# Frontend

React 18 + Create React App + TypeScript. **760 tracked files** serving three distinct audiences from one bundle: the public marketing site, the participant portal, and the staff admin console.

Local conventions are in [CLAUDE.md](CLAUDE.md), layered on [../CLAUDE.md](../CLAUDE.md). This README explains what exists.

---

## Stack

| Concern | Choice |
|---|---|
| Framework | React 18.3, TypeScript strict |
| Build | `react-scripts` 5.0.1 (CRA) |
| Routing | react-router-dom v6, `BrowserRouter`, **no basename** |
| Styling | Bootstrap 5.3 + CSS custom properties in `src/styles/tokens.css` |
| HTTP | axios |
| Charts | Recharts |
| Graphs | `reactflow`, `react-force-graph-2d`, `d3-force` |
| Markdown | `react-markdown` + `remark-gfm` |
| Icons | Remix Icon — **not** Bootstrap Icons |

```bash
npm start            # dev server
npm run build        # production build
npx tsc --noEmit     # the local gate
```

**The frontend is not a running service in production.** The CRA build is baked into the nginx multi-stage image. Deploying a frontend change means `docker compose ... up -d --build nginx`, not rebuilding the backend.

---

## Directory map

| Path | Files | Purpose |
|---|---|---|
| `src/components/` | 274 | Reusable UI, foldered by feature. |
| `src/pages/` | 179 | Route components. One file per route. |
| `src/hooks/` | 177 | Custom hooks, one per file. |
| `src/utils/` | 26 | Pure functions, no React. |
| `src/services/` | 17 | axios API clients. |
| `src/features/` | 16 | Vertical-slice modules (newer pattern). Currently `visualWorkspace/`. |
| `src/config/` | 9 | Static demo scenarios and program schedule data. |
| `src/__tests__/` | 9 | Tests. |
| `src/styles/` | 5 | `tokens.css`, `global.css`, `responsive.css`, `orchestration.css`, `workspacePresence.css`. |
| `src/contexts/` | 5 | `AuthContext`, `ParticipantAuthContext`, `AlumniAuthContext`, `IntelligenceContext`, `MentorContext`. |
| `src/routes/` | 4 | `publicRoutes`, `adminRoutes`, `portalRoutes`, `referralRoutes`. |
| `public/` | — | Static assets, plus `public/v1/track.js`, the cross-site visitor tracker. |

Entry: `src/index.tsx` → `src/App.tsx`.

---

## The three surfaces

### Public marketing site — `src/pages/` (27 files)

Conversion surfaces, many of them vertical-specific landing pages:

`HomePage`, `ProgramPage`, `PricingPage`, `EnrollPage` (+ `EnrollSuccessPage`, `EnrollCancelPage`), `ContactPage`, `CaseStudiesPage`, `InstructorPage`, `AdvisoryPage`, `SponsorshipPage`, `StrategyCallPrepPage`, `ExecutiveROICalculatorPage`, `AlumniChampionPage`, `AgencyPartnerPage`

Vertical landing pages: `FreightBrokerageLandingPage`, `UtilityCoopLandingPage`, `UtilityIOULandingPage`, `AIXceleratorLandingPage`, `AIArchitectLandingPage`, `AIWorkforceDesignerPage`

Pilot offers: `PilotAITeamPage`, `PilotExclusivePage`, `PilotZeroRiskPage`

Their demo content is data-driven from `src/config/` (`freightScenarios.ts`, `utilityScenarios.ts`, `aixceleratorScenarios.ts`, `industryDemos.ts`, `demoScenarios.json`), so a new vertical is mostly a config addition.

### Participant portal — `src/pages/portal/` (14 files)

`PortalDashboardPage`, `PortalCurriculumPage`, `PortalLessonPage`, `PortalAssignmentsPage`, `PortalProgressPage`, `PortalSessionsPage`, `PortalSessionDetailPage`, `PortalLoginPage`, `PortalVerifyPage`, `CoryHome` (+ `CoryHomeParts`), `ProjectDnaWizard`, `WalkCapsPage`, `WalkSummaryPage`

Auth flows through `ParticipantAuthContext`. `CoryHome` is the AI-mentor surface.

### Student project workspace — `src/pages/project/` (13 files)

Where a student's capstone build actually lives:

`ProjectDashboard`, `ProjectArtifacts`, `ProjectPortfolio`, `RequirementsBuilder`, `SystemBlueprint`, `SystemView` (+ `SystemViewV2`), `SystemBuildDemo`, `ExecutionLane`, `ExecutiveDeliverable`, `VisualReviewWorkspace`, `CoryFullscreen`, `PhantomCapsTriage`

`SystemView` / `SystemViewV2` render the System State Engine's output — the graph views are the student-facing projection of `backend/src/intelligence/systemStateEngine/`.

### Admin console — `src/pages/admin/` (123 files)

The largest surface, and the only one with meaningful sub-structure:

| Path | Files | Contents |
|---|---|---|
| `admin/orchestration/` | 50 | Orchestration workspace |
| `admin/` (flat) | 42 | Top-level admin pages |
| `admin/ai-settings/` | 20 | AI governance tabs |
| `admin/inbox/` | 7 | Inbox COS |
| `admin/intelligence/` | 3 | Intelligence surfaces |
| `admin/marketing/` | 1 | Marketing |

Command centers, CRUD screens, and embedded tabs/modals:

*Command centers* — `AiOpsCommandCenter`, `CEOCommandCenter`, `GovernanceCommandCenter`, `WarRoomPage`, `AdminDashboardPage`

*Funnel and revenue* — `AdminLeadsPage`, `AdminLeadDetailPage`, `AdminPipelinePage`, `AdminFunnelPage`, `AdminOpportunitiesPage`, `MissedOpportunitiesPage`, `AdminRevenueDashboardPage`, `AdminICPInsightsPage`, `AdminSourcesPage`, `AdminApolloPage`, `AdminImportPage`

*Campaigns* — `AdminCampaignsPage`, `AdminCampaignDetailPage`, `CampaignBuilderPage`, `AdminSequencesPage`, `ContentQueuePage`, `AdminCommunicationsPage`

*Program* — `AdminAcceleratorPage`, `AdminCohortDetailPage`, `AdminCurriculumTab`, `CurriculumGenerationTab`, `AdminGeneratorPage`

*AI governance* — `AdminGovernancePage`, `AdminGovernancePolicyPage`, `AdminAutonomousPage`, `AgentOrphansPage`, `AdminOrchestrationPage`, plus the `admin/ai-settings/` tabs: `GovernanceAutonomyTab`, `GovernanceCOOTab`, `CoryCOOTab`, `AgentRegistryTab`, `DepartmentAgentsTab`, `SelfHealingTab`, `RuntimeIntelligenceTab`

*Platform* — `AdminSettingsPage`, `AdminAISettingsPage`, `AdminAutomationPage`, `AdminRoutingRulesPage`, `AdminReportsPage`, `AdminTicketBoardPage`, `AdminVisitorsPage`, `AdminEventLedgerPage`, `AdminIngestLogsPage`, `AdminLoginPage`

Components for these live under `src/components/admin/` (91 files) and `src/components/project/` (58).

---

## Required patterns

### Design system
**Invoke a design skill before writing UI.** The design system lives in Claude Code skills, not in this README, so it cannot drift:

| Skill | When |
|---|---|
| `/baseline-ui` | The full reference: palette, tokens, component patterns |
| `/frontend-design` | Any new page, component, or layout |
| `/fixing-accessibility` | WCAG 2.1 AA audit or fix |
| `/fixing-motion-performance` | Animation jank, slow renders, bundle bloat |
| `/ui-ux-design` | Research, wireframes, design review |

Audience is enterprise executives, 35-60. Clean, calm, authoritative — Bloomberg meets Salesforce, not consumer SaaS.

### Non-negotiables
- **All props typed.** `interface Props { ... }` above every component. No `any`.
- **No hardcoded hex values.** Use `var(--color-*)` from `src/styles/tokens.css`. Bootstrap utilities first, then a tokenized custom class, never inline hex.
- **Accessibility is not optional.** Focus indicators, 44x44px touch targets, reduced-motion support, screen-reader text on icon-only buttons.
- **No `dangerouslySetInnerHTML`** without written justification. It triggers a security review.
- **Call the backend through `src/services/`**, never `fetch` from a component.
- **No `process.env.*` outside `src/services/`.** Env values reach components through the api client.
- **Never import from `backend/`.** The frontend stands alone.
- Auth gating belongs in route guards, not inside components.

---

## Gotchas that have broken production builds

**1. Never write `// eslint-disable-line react-hooks/exhaustive-deps`.** The production eslint config does not load the `react-hooks` plugin, so the disable comment *itself* fails the build. Local `tsc --noEmit` will not catch it. Fix the dependency array instead — usually by deriving a stable key string.

**2. The production build is stricter than local type-checking.** `react-scripts build` applies eslint rules `tsc --noEmit` never sees. Passing locally is necessary, not sufficient.

**3. The local CRA production build is unreliable on this repo's Windows/OneDrive checkout.** Build through the nginx Docker image instead of trusting a local `npm run build`.

**4. Icons are Remix Icon.** Reaching for a Bootstrap Icons class name renders nothing, silently.

**5. SPA routing.** `BrowserRouter` with no basename. Route trees in `src/routes/` are JSX fragments. Standalone routes that must sit outside `PublicLayout` go directly in `App.tsx`, not inside the fragment.

---

## Testing

`npx tsc --noEmit` is the gate. Component unit tests exist (9 files in `src/__tests__/`) but are not gated. Playwright E2E coverage is a stated target rather than a current reality — see [../tests/README.md](../tests/README.md).
