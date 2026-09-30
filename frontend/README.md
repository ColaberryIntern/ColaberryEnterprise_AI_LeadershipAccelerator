# Frontend

React 18 + Create React App + TypeScript. **~1,790 tracked files** serving three distinct audiences from one bundle: the public marketing site, the participant portal, and the staff admin console.

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
| `src/pages/` | 474 | Reusable UI, foldered by feature. |
| `src/components/` | 408 | Reusable UI, foldered by feature. |
| `src/hooks/` | 176 | Custom hooks, one per file. |
| `src/utils/` | 57 | Pure functions, no React. |
| `src/services/` | 62 | axios API clients. |
| `src/colaberry/` | 92 | Brand layer: `tokens/`, `components/`, `assets/`, `styles.css`. |
| `src/config/` | 26 | Static demo scenarios and program schedule data. |
| `src/__tests__/` | 11 | Tests. |
| `src/styles/` | 6 | `tokens.css`, `global.css`, `responsive.css`, `orchestration.css`, `admin-shell.css`, `brand-bridge.css`. |
| `src/contexts/` | 5 | `AuthContext`, `ParticipantAuthContext`, `AlumniAuthContext`, `IntelligenceContext`, `MentorContext`. |
| `src/routes/` | 4 | `publicRoutes`, `adminRoutes`, `portalRoutes`, `referralRoutes`. |
| `public/` | — | Static assets, plus `public/v1/track.js`, the cross-site visitor tracker. |

Entry: `src/index.tsx` → `src/App.tsx`.

---

## The three surfaces

### Public marketing site — `src/pages/` (root level)

Conversion surfaces, many of them vertical-specific landing pages:

`HomePage`, `ProgramPage`, `PricingPage`, `EnrollPage` (+ `EnrollSuccessPage`, `EnrollCancelPage`), `ContactPage`, `InstructorPage`, `AdvisoryPage`, `ConsultingPage`, `SponsorshipPage`, `StrategyCallPrepPage`, `ExecutiveROICalculatorPage`, `AlumniChampionPage`, `AgencyPartnerPage`, `DemoDayPage`, `LeaderboardPage`

Public proof surfaces: `PublicPortfolioPage`, `CapstoneRecordPage`

Sponsor surfaces: `SponsorDashboardPage`, `SponsorChallengePage`

Vertical landing pages: `FreightBrokerageLandingPage`, `UtilityCoopLandingPage`, `UtilityIOULandingPage`, `AIXceleratorLandingPage`, `AIArchitectLandingPage`, `AIWorkforceDesignerPage`

Pilot offers: `PilotAITeamPage`, `PilotExclusivePage`, `PilotZeroRiskPage`, `AIPilotLandingPage`, `AIPilotVerticalPage`

Their demo content is data-driven from `src/config/` (`freightScenarios.ts`, `utilityScenarios.ts`, `aixceleratorScenarios.ts`, `industryDemos.ts`, `demoScenarios.json`), so a new vertical is mostly a config addition.

### Participant portal — `src/pages/portal/`

The largest student-facing surface, organised into feature folders:

| Path | Files | What's there |
|---|---|---|
| `portal/projects/` | 51 | The capstone workspace: acceptance checklists, archive dialogs, build views |
| `portal/today/` | 37 | The Today feed — the student's default landing surface |
| `portal/community/` | 13 | Community feed and posts |
| `portal/portfolio/` | 7 | Career portfolio: `PortfolioPage`, `BuildsSection`, `CapabilityList`, `PublishingPanel`, `StudioOverview`, `BaselineBanner` |
| `portal/rooms/` | 6 | Community rooms |
| `portal/settings/`, `portal/runtime/`, `portal/points/`, `portal/feed/`, `portal/company/`, `portal/schedule/`, `portal/path/`, `portal/library/` | 26 | Settings, runtime surfaces, points HUD, feed, company view, schedule, path, library |

Top-level portal pages: `PortalDashboardPage`, `PortalCurriculumPage`, `PortalLessonPage`, `PortalAssignmentsPage`, `PortalProgressPage`, `PortalSessionsPage`, `PortalLoginPage`, `PortalVerifyPage`, `PortalFreeSignupPage`, `PortalHandoffPage`, `PortalViewAsPage`, `PortalMgmtEnterPage`, `SkillMeter`.

Classroom surfaces: `ClassroomPage`, `ClassroomWeekPage`, `ClassCheckinPage`, with `classroomNextStep.ts` (and its test) deciding what the student sees next.

Auth flows through `ParticipantAuthContext`. `PortalViewAsPage` is the staff impersonation view.

### Admin console — `src/pages/admin/`

The largest surface, and the only one with meaningful sub-structure:

| Path | Files | Contents |
|---|---|---|
| `admin/orchestration/` | 66 | Orchestration workspace |
| `admin/` (flat) | 67 | Top-level admin pages |
| `admin/ai-settings/` | 20 | AI governance tabs |
| `admin/workforce/` | 11 | AI workforce org chart and live agents |
| `admin/governance/` | 8 | Governance surfaces |
| `admin/inbox/` | 8 | Inbox COS |
| `admin/intelligence/` | 4 | Intelligence surfaces |
| `admin/ops/`, `admin/components/`, `admin/utils/` | 6 | Ops, shared components, helpers |

Command centers, CRUD screens, and embedded tabs/modals:

*Command centers* — `CEOCommandCenter`, `GovernanceCommandCenter`, `CbSystemCommand`, `WarRoomPage`, `AdminDashboardPage`, `AdminKnowledgeOpsPage`, `AdminTrustCenterPage`

*Funnel and revenue* — `AdminLeadsPage`, `AdminLeadDetailPage`, `AdminPipelinePage`, `AdminFunnelPage`, `AdminOpportunitiesPage`, `MissedOpportunitiesPage`, `AdminRevenueDashboardPage`, `AdminICPInsightsPage`, `AdminSourcesPage`, `AdminApolloPage`, `AdminImportPage`

*Campaigns* — `AdminCampaignsPage`, `AdminCampaignDetailPage`, `CampaignBuilderPage`, `AdminSequencesPage`, `ContentQueuePage`, `AdminCommunicationsPage`

*Program* — `AdminAcceleratorPage`, `AdminAcceleratorSessionTimelinePage`, `AdminCohortDetailPage`, `AdminCurriculumTab`, `AdminGeneratorPage`, `AdminCapeSettingsPage`, `AdminCaseStudiesPage`, `AdminCaseStudyDetailPage`, `AdminCommunityRolesPage`, `AdminFeedControlGovernancePage`

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

`npx tsc --noEmit` is the gate. Frontend test files number in the low hundreds, concentrated under `src/pages/` and `src/components/`, run by `react-scripts test`. Browser E2E lives in [../tests/](../tests/README.md) and runs by hand, outside CI.
