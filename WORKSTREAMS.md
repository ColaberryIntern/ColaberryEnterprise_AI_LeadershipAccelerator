# Workstream Separation Guide

This repository supports three independent development workstreams that can operate in parallel without merge conflicts.

## Architecture

The codebase is a monorepo with:
- **Frontend**: Single React SPA (`frontend/`) with route files split by domain
- **Backend**: Single Express API (`backend/`) with admin routes split into 8 sub-modules

### Route Split Structure

```
frontend/src/
├── App.tsx                    # Thin orchestrator (~25 lines)
└── routes/
    ├── publicRoutes.tsx       # Workstream 1
    ├── adminRoutes.tsx        # Workstream 2
    └── portalRoutes.tsx       # Workstream 3

backend/src/routes/
├── adminRoutes.ts             # Barrel file importing sub-modules
└── admin/
    ├── authRoutes.ts          # Workstream 2
    ├── cohortRoutes.ts        # Workstream 2
    ├── leadRoutes.ts          # Workstream 2
    ├── campaignRoutes.ts      # Workstream 2
    ├── insightRoutes.ts       # Workstream 2
    ├── settingsRoutes.ts      # Workstream 2
    ├── acceleratorRoutes.ts   # Workstream 3
    └── orchestrationRoutes.ts # Workstream 3
```

## Workstream 1: Marketing Website

**Purpose**: Public-facing pages, enrollment flows, lead capture, SEO.

| Layer | Key Files |
|-------|-----------|
| Routes (FE) | `routes/publicRoutes.tsx` |
| Pages | `pages/HomePage`, `ProgramPage`, `PricingPage`, `ContactPage`, `SponsorshipPage`, `AdvisoryPage`, `CaseStudiesPage`, `EnrollPage`, `EnrollSuccessPage`, `EnrollCancelPage`, `ExecOverviewThankYouPage`, `StrategyCallPrepPage`, `NotFoundPage` |
| Components | `Layout/PublicLayout`, `PublicNavbar`, `PublicFooter`, `LeadCaptureForm`, `ChatWidget`, `StrategyCallModal`, `SEOHead` |
| Routes (BE) | `leadRoutes.ts`, `enrollmentRoutes.ts`, `calendarRoutes.ts`, `strategyPrepRoutes.ts`, `trackingRoutes.ts`, `webhookRoutes.ts` |

## Workstream 2: Admin Management Console

**Purpose**: CRM, campaigns, sales pipeline, analytics, visitor intelligence.

| Layer | Key Files |
|-------|-----------|
| Routes (FE) | `routes/adminRoutes.tsx` |
| Pages | `pages/admin/Admin{Dashboard,Leads,LeadDetail,Pipeline,CohortDetail,Campaigns,CampaignDetail,Apollo,Sequences,Import,Revenue,Settings,EventLedger,ICPInsights,Visitors,Opportunities}Page`, `CampaignBuilderPage` |
| Components | `components/admin/*`, `components/campaign/*`, `Layout/AdminLayout`, `ProtectedRoute` |
| Routes (BE) | `admin/{auth,cohort,lead,campaign,insight,settings}Routes.ts` |

## Workstream 3: Student Portal + Orchestration Engine

**Purpose**: Learning portal, curriculum builder, session orchestration, mentor AI.

| Layer | Key Files |
|-------|-----------|
| Routes (FE) | `routes/portalRoutes.tsx` |
| Portal Pages | `pages/portal/*` (9 files) |
| Orchestration Pages | `pages/admin/Admin{Accelerator,Orchestration}Page`, `pages/admin/orchestration/*` (35+ files) |
| Components | `components/portal/*`, `Layout/PortalLayout`, `PortalProtectedRoute` |
| Routes (BE) | `admin/{accelerator,orchestration}Routes.ts`, `participantRoutes.ts` |
| Contexts | `ParticipantAuthContext`, `MentorContext` |

## Shared Files (Coordinate Changes)

These files are used by multiple workstreams. Changes require coordination:

- `frontend/src/App.tsx` — route orchestrator (rarely changes after split)
- `backend/src/server.ts` — Express entry point
- `backend/src/routes/adminRoutes.ts` — barrel file (add `router.use()` lines only)
- `backend/src/models/*` — database models
- `backend/src/middlewares/*` — auth, audit, error handling
- `frontend/src/components/ui/*` — shared UI primitives
- `docker-compose*.yml`, `Dockerfile`s, `nginx/*`
- `package.json` (root, frontend, backend)

## Branch Strategy

```
main (production)
  ├── workstream/marketing        (Developer/Claude 1)
  ├── workstream/admin            (Developer/Claude 2)
  └── workstream/portal-orch      (Developer/Claude 3)
```

**Rules**:
1. Each branch only modifies files in its ownership map
2. Shared file changes require coordination (PR reviewed by all)
3. Merge to main frequently (daily or per-feature) to prevent drift
4. Sub-feature branches: `workstream/admin/campaign-v2`

## Development

No changes to dev workflow:

```bash
npm run dev:frontend   # Vite dev server on :5173
npm run dev:backend    # Express on :3001
```

## Adding New Routes

**Frontend**: Add `<Route>` elements to the appropriate `routes/*.tsx` file.

**Backend**: Add routes to the appropriate `routes/admin/*.ts` sub-module. If creating a new domain, create a new sub-module and add `router.use(newRoutes)` to the barrel file `adminRoutes.ts`.
