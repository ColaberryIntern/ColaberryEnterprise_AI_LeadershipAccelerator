# Extraction Boundaries

**Session:** CC-20260821-m6t4 · **Base:** `bb152ded`

The test this document exists to answer: *could a future team lift one application out of this
repository without rewriting the platform?*

---

## Current state

Root `package.json` declares `workspaces: ["frontend", "backend"]`. There is no `apps/` and no
`packages/`. Every public experience today is either inside `frontend/` or is an external site
that talks to the platform over `/api/ingest` and `/api/t/*`.

That second category is important: **`trustbeforeintelligence.ai` and `worldoftaxonomy.com`
already prove the extraction model works.** They are separate builds that integrate purely
through the tracker script and the lead-ingest API. The skeleton apps follow the same contract
with a tighter workspace story.

## Target boundary

```
apps/cpn-public/            ─┐
apps/ai-flotation-public/    ├── independently buildable, independently deployable
apps/refactored-public/     ─┘

packages/platform-contracts/    shared types only — no runtime, no secrets
packages/tracking-sdk/          the v2 tracker, bundled to a standalone asset
packages/brand-system/          brand config contract
packages/ui-core/               primitives, no brand identity
packages/platform-api-client/   typed client for the public platform API
```

## Allowed and forbidden edges

| From | To | Verdict |
|---|---|---|
| `apps/*` | `packages/*` | **allowed** |
| `apps/*` | public platform HTTP API | **allowed** |
| `apps/*` | another `apps/*` | **forbidden** |
| `apps/*` | `frontend/src/*` | **forbidden** |
| `apps/*` | `backend/src/*` | **forbidden** |
| `packages/*` | `apps/*` | **forbidden** |
| `packages/ui-core` | one brand's theme | **forbidden** |

Enforced by `scripts/validate-app-boundaries.js`, which walks every import/require in
`apps/` and `packages/` and exits non-zero on a forbidden edge. It is a script, not a
convention, because conventions do not survive contact with a deadline.

## What must move with an application

Each app maintains `apps/<app>/EXTRACTION.md` recording:

- app-owned source files,
- workspace dependencies (which `packages/*`),
- backend API contracts consumed (exact route paths),
- required environment variables,
- **brand seed records** — tenant slug, brand slug,
- **lead source record** — `lead_sources.slug` and its HMAC posture,
- **entry point records** — slug + `entry_type` per form,
- **brand domain records** — hostname + purpose,
- **sender profile** — from address, sending domain, tracking domain,
- deployment assumptions,
- tests that must pass after extraction.

The database rows are the part teams forget. An app's source code is portable; an app whose
`lead_sources.slug` is undocumented becomes un-extractable the moment nobody remembers which
row it was.

## Backend modularity

New platform functionality lives in feature modules, never brand folders:

```
backend/src/modules/tenancy/
backend/src/modules/identity/
backend/src/modules/attribution/
backend/src/modules/communications/
```

The rule from plan §69: core infrastructure is **data-driven**, never
`if (tenant === 'cpn')`. Brand-specific *policy* may branch; brand-specific *plumbing* may not.
A sixth tenant next year must require zero schema changes and zero core-code changes.

## Page taxonomy (plan §20)

`visitorTrackingService` currently holds Enterprise-centric path categorization in one
function. Adding `if CPN path… else if Flotation path…` to it would make that function the
single least extractable thing in the repo.

Target: `backend/src/modules/tracking/siteTaxonomy/` with one module per brand exporting the
same interface, selected by resolved brand slug, with the existing Enterprise logic moved
verbatim into `enterprise.ts` as the default.

## Deployment

Path-filtered independent builds:

```
apps/cpn-public/**            → CPN app
apps/ai-flotation-public/**   → AI Flotation app
apps/refactored-public/**     → Refactored public app
frontend/**                   → existing enterprise/platform deploy
backend/**                    → shared platform backend (ONE deployment, not one per brand)
```

The backend is deployed once. Duplicating it per brand would recreate the exact silo problem
this architecture exists to avoid.
