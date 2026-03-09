# Workstream Prompts

Copy-paste these into Claude Code for each VS Code window.

---

## WORKSTREAM 1: Marketing Website

### Prompt 1A — Branch Setup (run first time)

```
You are working on Workstream 1: Marketing Website.

First, check which branch we're on with `git branch --show-current`.
- If we're on `workstream/marketing`, great — continue.
- If the branch `workstream/marketing` doesn't exist yet, create it from main: `git checkout -b workstream/marketing`
- If it exists but we're not on it, switch: `git checkout workstream/marketing`

Then sync with main:
```
git fetch origin main
git rebase origin/main
```

Confirm the branch is correct and up to date before proceeding.
```

### Prompt 1B — Work Scope (paste at start of each session)

```
You are working on Workstream 1: Marketing Website. You are on branch `workstream/marketing`.

YOUR FILES (only modify these):
- Frontend routes: frontend/src/routes/publicRoutes.tsx
- Frontend pages: frontend/src/pages/HomePage.tsx, ProgramPage.tsx, PricingPage.tsx, ContactPage.tsx, SponsorshipPage.tsx, AdvisoryPage.tsx, CaseStudiesPage.tsx, EnrollPage.tsx, EnrollSuccessPage.tsx, EnrollCancelPage.tsx, ExecOverviewThankYouPage.tsx, StrategyCallPrepPage.tsx, NotFoundPage.tsx
- Frontend components: Layout/PublicLayout.tsx, Layout/PublicNavbar.tsx, Layout/PublicFooter.tsx, LeadCaptureForm.tsx, ChatWidget.tsx, StrategyCallModal.tsx, SEOHead.tsx
- Backend routes: backend/src/routes/leadRoutes.ts, enrollmentRoutes.ts, calendarRoutes.ts, strategyPrepRoutes.ts, trackingRoutes.ts, webhookRoutes.ts
- Backend services: leadService, enrollmentService, calendarService, strategyPrepService, chatService, emailService, stripeService

DO NOT MODIFY files owned by other workstreams:
- No changes to frontend/src/routes/adminRoutes.tsx or portalRoutes.tsx
- No changes to pages/admin/* or pages/portal/*
- No changes to backend/src/routes/admin/*
- No changes to backend/src/routes/participantRoutes.ts

SHARED FILES (modify only if absolutely necessary, and flag it):
- frontend/src/App.tsx
- backend/src/server.ts
- backend/src/models/*
- backend/src/middlewares/*
- Any package.json or docker files

If you need to modify a shared file, tell me before doing it so I can coordinate with other workstreams.

Verify we're on the correct branch before making any changes.
```

### Prompt 1C — Check In (commit + merge to main)

```
Time to check in Workstream 1: Marketing Website changes.

1. Verify we're on branch `workstream/marketing` with `git branch --show-current`
2. Run `npx tsc --noEmit` in both frontend/ and backend/ to verify builds pass
3. Show me `git status` and `git diff --stat` so I can review what changed
4. Commit with a descriptive message (do NOT push yet)
5. Switch to main, pull latest, merge workstream/marketing into main:
   ```
   git checkout main
   git pull origin main
   git merge workstream/marketing
   ```
6. If there are merge conflicts, show them to me — do NOT resolve automatically
7. If merge is clean, push to main: `git push origin main`
8. Switch back to the workstream branch and rebase:
   ```
   git checkout workstream/marketing
   git rebase origin/main
   ```
9. Confirm final branch state

Do NOT deploy to production — I'll do that separately.
```

### Prompt 1D — Check In + Deploy (commit + merge + deploy to prod)

```
Time to check in AND deploy Workstream 1: Marketing Website changes.

1. Verify we're on branch `workstream/marketing` with `git branch --show-current`
2. Run `npx tsc --noEmit` in both frontend/ and backend/ to verify builds pass
3. Show me `git status` and `git diff --stat` so I can review what changed
4. Commit with a descriptive message
5. Switch to main, pull latest, merge workstream/marketing into main:
   ```
   git checkout main
   git pull origin main
   git merge workstream/marketing
   ```
6. If there are merge conflicts, show them to me — do NOT resolve automatically
7. If merge is clean, push to main: `git push origin main`
8. Deploy to production:
   ```
   ssh root@95.216.199.47 "cd /opt/colaberry-accelerator && git pull origin main && docker compose -f docker-compose.production.yml up -d --build"
   ```
9. Switch back to the workstream branch and rebase:
   ```
   git checkout workstream/marketing
   git rebase origin/main
   ```
10. Confirm deployment is running
```

---

## WORKSTREAM 2: Admin Management Console

### Prompt 2A — Branch Setup (run first time)

```
You are working on Workstream 2: Admin Management Console.

First, check which branch we're on with `git branch --show-current`.
- If we're on `workstream/admin`, great — continue.
- If the branch `workstream/admin` doesn't exist yet, create it from main: `git checkout -b workstream/admin`
- If it exists but we're not on it, switch: `git checkout workstream/admin`

Then sync with main:
```
git fetch origin main
git rebase origin/main
```

Confirm the branch is correct and up to date before proceeding.
```

### Prompt 2B — Work Scope (paste at start of each session)

```
You are working on Workstream 2: Admin Management Console. You are on branch `workstream/admin`.

YOUR FILES (only modify these):
- Frontend routes: frontend/src/routes/adminRoutes.tsx
- Frontend pages: frontend/src/pages/admin/Admin{Dashboard,Leads,LeadDetail,Pipeline,CohortDetail,Campaigns,CampaignDetail,Apollo,Sequences,Import,Revenue,Settings,EventLedger,ICPInsights,Visitors,Opportunities}Page.tsx, CampaignBuilderPage.tsx
- Frontend components: components/admin/*, components/campaign/*, Layout/AdminLayout.tsx, ProtectedRoute.tsx
- Frontend context: contexts/AuthContext.tsx
- Frontend API: utils/api.ts
- Backend routes: backend/src/routes/admin/authRoutes.ts, cohortRoutes.ts, leadRoutes.ts, campaignRoutes.ts, insightRoutes.ts, settingsRoutes.ts
- Backend controllers: adminLeadController, adminCohortController, adminCampaignController, adminInsightController, adminVisitorController, adminOpportunityController, adminSettingsController, adminRevenueController, icpProfileController, adminAuthController, adminActivityController, adminAppointmentController, adminSequenceController, adminImportController

DO NOT MODIFY files owned by other workstreams:
- No changes to frontend/src/routes/publicRoutes.tsx or portalRoutes.tsx
- No changes to pages/portal/* or public pages (HomePage, ProgramPage, etc.)
- No changes to pages/admin/AdminAcceleratorPage.tsx or AdminOrchestrationPage.tsx (Workstream 3)
- No changes to pages/admin/orchestration/* (Workstream 3)
- No changes to backend/src/routes/admin/acceleratorRoutes.ts or orchestrationRoutes.ts (Workstream 3)
- No changes to backend/src/routes/participantRoutes.ts

SHARED FILES (modify only if absolutely necessary, and flag it):
- frontend/src/App.tsx
- backend/src/server.ts
- backend/src/routes/adminRoutes.ts (barrel file — only if adding a new sub-module)
- backend/src/models/*
- backend/src/middlewares/*
- Any package.json or docker files

If you need to modify a shared file, tell me before doing it so I can coordinate with other workstreams.

Verify we're on the correct branch before making any changes.
```

### Prompt 2C — Check In (commit + merge to main)

```
Time to check in Workstream 2: Admin Management Console changes.

1. Verify we're on branch `workstream/admin` with `git branch --show-current`
2. Run `npx tsc --noEmit` in both frontend/ and backend/ to verify builds pass
3. Show me `git status` and `git diff --stat` so I can review what changed
4. Commit with a descriptive message (do NOT push yet)
5. Switch to main, pull latest, merge workstream/admin into main:
   ```
   git checkout main
   git pull origin main
   git merge workstream/admin
   ```
6. If there are merge conflicts, show them to me — do NOT resolve automatically
7. If merge is clean, push to main: `git push origin main`
8. Switch back to the workstream branch and rebase:
   ```
   git checkout workstream/admin
   git rebase origin/main
   ```
9. Confirm final branch state

Do NOT deploy to production — I'll do that separately.
```

### Prompt 2D — Check In + Deploy (commit + merge + deploy to prod)

```
Time to check in AND deploy Workstream 2: Admin Management Console changes.

1. Verify we're on branch `workstream/admin` with `git branch --show-current`
2. Run `npx tsc --noEmit` in both frontend/ and backend/ to verify builds pass
3. Show me `git status` and `git diff --stat` so I can review what changed
4. Commit with a descriptive message
5. Switch to main, pull latest, merge workstream/admin into main:
   ```
   git checkout main
   git pull origin main
   git merge workstream/admin
   ```
6. If there are merge conflicts, show them to me — do NOT resolve automatically
7. If merge is clean, push to main: `git push origin main`
8. Deploy to production:
   ```
   ssh root@95.216.199.47 "cd /opt/colaberry-accelerator && git pull origin main && docker compose -f docker-compose.production.yml up -d --build"
   ```
9. Switch back to the workstream branch and rebase:
   ```
   git checkout workstream/admin
   git rebase origin/main
   ```
10. Confirm deployment is running
```

---

## WORKSTREAM 3: Student Portal + Orchestration Engine

### Prompt 3A — Branch Setup (run first time)

```
You are working on Workstream 3: Student Portal + Orchestration Engine.

First, check which branch we're on with `git branch --show-current`.
- If we're on `workstream/portal-orch`, great — continue.
- If the branch `workstream/portal-orch` doesn't exist yet, create it from main: `git checkout -b workstream/portal-orch`
- If it exists but we're not on it, switch: `git checkout workstream/portal-orch`

Then sync with main:
```
git fetch origin main
git rebase origin/main
```

Confirm the branch is correct and up to date before proceeding.
```

### Prompt 3B — Work Scope (paste at start of each session)

```
You are working on Workstream 3: Student Portal + Orchestration Engine. You are on branch `workstream/portal-orch`.

YOUR FILES (only modify these):
- Frontend routes: frontend/src/routes/portalRoutes.tsx
- Portal pages: frontend/src/pages/portal/* (PortalDashboardPage, PortalCurriculumPage, PortalLessonPage, PortalSessionsPage, PortalSessionDetailPage, PortalAssignmentsPage, PortalProgressPage, PortalLoginPage, PortalVerifyPage)
- Orchestration pages: frontend/src/pages/admin/AdminAcceleratorPage.tsx, AdminOrchestrationPage.tsx, frontend/src/pages/admin/orchestration/* (all tabs and builder files)
- Portal components: components/portal/*, Layout/PortalLayout.tsx, PortalProtectedRoute.tsx
- Portal contexts: contexts/ParticipantAuthContext.tsx, contexts/MentorContext.tsx
- Portal API: utils/portalApi.ts
- Backend routes: backend/src/routes/admin/acceleratorRoutes.ts, orchestrationRoutes.ts, backend/src/routes/participantRoutes.ts
- Backend controllers: acceleratorController, curriculumController, orchestrationController, programBlueprintController, miniSectionController, variableDefinitionController, sessionChecklistController
- Backend services: contentGenerationService, curriculumService, orchestrationService, qualityScoringService, deepReconciliationService, mentorService, skillGenomeService, backfillService, autoRepairService, extensiveCheckService, aiReadinessService, curriculumManagerService, testSimulationService, managementService, analyticsService, suggestionService

DO NOT MODIFY files owned by other workstreams:
- No changes to frontend/src/routes/publicRoutes.tsx or adminRoutes.tsx
- No changes to pages/admin/Admin{Dashboard,Leads,LeadDetail,Pipeline,Campaigns,etc.}Page.tsx
- No changes to public pages (HomePage, ProgramPage, etc.)
- No changes to components/admin/* or components/campaign/*
- No changes to backend/src/routes/admin/{auth,cohort,lead,campaign,insight,settings}Routes.ts

SHARED FILES (modify only if absolutely necessary, and flag it):
- frontend/src/App.tsx
- backend/src/server.ts
- backend/src/routes/adminRoutes.ts (barrel file — only if adding a new sub-module)
- backend/src/models/*
- backend/src/middlewares/*
- Any package.json or docker files

If you need to modify a shared file, tell me before doing it so I can coordinate with other workstreams.

Verify we're on the correct branch before making any changes.
```

### Prompt 3C — Check In (commit + merge to main)

```
Time to check in Workstream 3: Student Portal + Orchestration Engine changes.

1. Verify we're on branch `workstream/portal-orch` with `git branch --show-current`
2. Run `npx tsc --noEmit` in both frontend/ and backend/ to verify builds pass
3. Show me `git status` and `git diff --stat` so I can review what changed
4. Commit with a descriptive message (do NOT push yet)
5. Switch to main, pull latest, merge workstream/portal-orch into main:
   ```
   git checkout main
   git pull origin main
   git merge workstream/portal-orch
   ```
6. If there are merge conflicts, show them to me — do NOT resolve automatically
7. If merge is clean, push to main: `git push origin main`
8. Switch back to the workstream branch and rebase:
   ```
   git checkout workstream/portal-orch
   git rebase origin/main
   ```
9. Confirm final branch state

Do NOT deploy to production — I'll do that separately.
```

### Prompt 3D — Check In + Deploy (commit + merge + deploy to prod)

```
Time to check in AND deploy Workstream 3: Student Portal + Orchestration Engine changes.

1. Verify we're on branch `workstream/portal-orch` with `git branch --show-current`
2. Run `npx tsc --noEmit` in both frontend/ and backend/ to verify builds pass
3. Show me `git status` and `git diff --stat` so I can review what changed
4. Commit with a descriptive message
5. Switch to main, pull latest, merge workstream/portal-orch into main:
   ```
   git checkout main
   git pull origin main
   git merge workstream/portal-orch
   ```
6. If there are merge conflicts, show them to me — do NOT resolve automatically
7. If merge is clean, push to main: `git push origin main`
8. Deploy to production:
   ```
   ssh root@95.216.199.47 "cd /opt/colaberry-accelerator && git pull origin main && docker compose -f docker-compose.production.yml up -d --build"
   ```
9. Switch back to the workstream branch and rebase:
   ```
   git checkout workstream/portal-orch
   git rebase origin/main
   ```
10. Confirm deployment is running
```

---

## CROSS-WORKSTREAM: Shared File Change

### Prompt X — Shared File Modification

```
I need to modify a shared file that affects multiple workstreams.

1. Switch to main branch: `git checkout main && git pull origin main`
2. Make the change (I'll tell you what)
3. Run `npx tsc --noEmit` in both frontend/ and backend/
4. Commit and push to main
5. Then rebase all workstream branches:
   ```
   git checkout workstream/marketing && git rebase origin/main
   git checkout workstream/admin && git rebase origin/main
   git checkout workstream/portal-orch && git rebase origin/main
   ```
6. Switch back to whichever branch I was working on
```
