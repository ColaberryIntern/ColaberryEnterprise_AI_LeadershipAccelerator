# IMPLEMENTATION STATUS — enterprise.colaberry.ai V2 (Phase 1)

**Session:** CC-20260807-h2r6 · **Branch:** `workstream/enterprise-site-v2`
**Base:** `origin/main` @ `304a8831` (2026-08-07) · **Worktree:** `C:/Users/ali_m/acc-wt/enterprise-site-v2`
**Gate:** B (build). **NOT deployed.** Gate C requires `DEPLOY WEBSITE V2 TO PRODUCTION`.

---

## Approval and decisions carried in

| Item | Decision |
|---|---|
| Gate B approval | Given 2026-08-07 (typed with a one-character typo; intent confirmed across three messages) |
| Four-view Readiness console | **Option A — build-then-show.** Does NOT ship in Phase 1. |
| Pricing | Use the figures **live on the site today** (verified by probe, not from repo) |
| Consulting/services pricing | **No public price** — "scoped on a call" |

---

## Why a worktree, not a branch checkout

The primary working tree carries **824 dirty entries (67 modified tracked files)** belonging to
other concurrent sessions. Checking out a new branch there would have dragged or clobbered
that work. This worktree is isolated and started clean (`dirty: 0`), so other sessions are
untouched. Matches the repo's existing pattern (`git worktree list` shows several in use).

**Note for typecheck/test:** dependencies live at the repo root. Per repo convention a
`node_modules` junction is needed in the worktree before `tsc`/`jest` will run here.

---

## TASK 1.0 — production baseline · **BLOCKED, does not block Phase 1 build**

Three confirmed divergences between production and `origin/main`:

1. **Routes:** `/platform`, `/maturity`, `/framework`, `/network`, `/capability-index`,
   `/outcomes` all exist in `origin/main` and **404 in production**.
2. **IA:** production nav is `Home · The Program · Contact`; footer copy differs from
   `PublicNavbar`/`PublicFooter` in `origin/main`.
3. **Pricing:** `origin/main` says `$1,788/seat/yr`; **production does not show that figure at all.**

Production bundle: `main.27a907e4.js`. `/api/version` requires auth.
**Still needed before Gate C:**
`ssh root@95.216.199.47 "cd /opt/colaberry-accelerator && git rev-parse HEAD && git branch --show-current"`

---

## TASK 1.1 — capability inventory · **DONE**

Every surface the new site could depict, verified in this worktree against `origin/main`.

| Surface | Status | Evidence | May the site depict it? |
|---|---|---|---|
| Org readiness rollup (`OrgOverview`) | **live** | `frontend/src/services/orgApi.ts` | Yes |
| `/portal/company` | **live** | `pages/portal/company/CompanyPage.tsx` | Yes |
| Member drilldown | **live** | `CompanyMemberDrilldown.tsx` | Yes |
| `CompanyMomentumDashboard` | **live** | `components/capability/` | Yes |
| `/try` free workspace | **live** | `pages/ManagementPreviewPage.tsx` | Yes |
| Experience Studio | **live, admin-only** | `admin/orchestration/ExperienceStudioTab.tsx` | Depict only as a described capability; never expose the admin surface publicly |
| Pipeline / OpportunityScore | **live, admin-only** | `backend/src/models/OpportunityScore.ts` | Internal only |
| **Four-view Readiness console** | **UNBUILT** | no match for `Executive View` in `frontend/src` | **NO — decision A** |
| **Opportunity Lab backend** | **UNBUILT** | no match in `backend/src` | **NO** — front-end-only demo may not imply a live service |
| ROI calculator persistence | **UNBUILT** | `ExecutiveROICalculatorPage.tsx` makes **0** `/api/` calls | **NO** |
| **Proof / evidence taxonomy** | **UNBUILT** | no `evidence_class` in `backend/src` | **NO** |
| **Deal Workspace** | **UNBUILT** | no `DealWorkspace` in `frontend/src` | **NO** |

### Binding rule for Phase 1 copy
A page may not render a surface marked **UNBUILT** in present tense. The claims registry
(Task 1.2) carries a `capabilityStatus` field (`live | partial | unbuilt`) and public
components read it, so this is enforced in code rather than by reviewer discipline.

### Consequence for the approved prototype
The prototype's **"Four roles, one system" console section is removed from Phase 1 scope.**
The Platform Showroom ships only `live` surfaces. This is a deliberate reduction against the
approved design, per decision A, and is the single largest scope change from prototype to build.

---

## Pricing to carry (verified live 2026-08-07, not from repo)

`$0` free · `$149`/mo billed annually · `$199`/mo month-to-month ·
`$1,200` Team · `$950` Department · Enterprise custom.
Consulting/services: **no public price.**
`$1,788`, `$2,500`, `$4,500`, `$15,000` must not appear.

---

## Task log

| # | Task | Status | Verification |
|---|---|---|---|
| 1.0 | Production baseline | **blocked** | needs server access; not blocking the build |
| 1.1 | Capability inventory | **done** | table above, verified in-worktree |
| 1.2 | Claims + capability registry | next | — |
| 1.3 | Shared public shell | pending | — |
| 1.4 | Homepage V2 | pending | — |
| 1.5 | Services (5 routes) | pending | — |
| 1.6 | Platform Showroom (live surfaces only) | pending | — |
| 1.7 | Proof Room (governed) | pending | — |
| 1.8 | Opportunity Lab | pending | — |
| 1.9 | `/try` reposition | pending | — |
| 1.10 | SEO / analytics / consent | pending | — |

## Guardrails in force

- No deploy. Gate C requires the exact phrase.
- Do not break: auth, portal, classroom, admin, enrollment, community, timeline,
  Experience Studio, sales pipeline, GoHighLevel, existing APIs or data.
- No secrets in source. No unverified claim rendered publicly.
- `PROGRESS.md` entry required per CLAUDE.md before any task counts as done.
