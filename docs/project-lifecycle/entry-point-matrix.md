# New-project entry-point matrix

**Status:** observed 2026-10-01 at base `004cdff5` · **Session:** CC-20261001-q7m4
The empirical basis for LC-01. Every row was located by ripgrep over `backend/src` and confirmed by reading the cited line.

## Why this document exists

A project in this system can be created from **fourteen** distinct places, across **two** identity tables, and several of them are services or background jobs rather than HTTP routes. There is no single place to enforce governance today. This matrix is what "route every entry point through lifecycle registration" has to mean concretely.

## Two identity tables, kept separate

| Table | Model | Domain |
|---|---|---|
| `projects` | `Project` | student / portal builds |
| `delivery_projects` | `DeliveryProject` | client / delivery engagements |

These are **not** merged. See `architecture.md` §2.

## The matrix

| # | Entry point | File:line | Creation function | Table | Review/hold today |
|---|---|---|---|---|---|
| 1 | SBP build start (HTTP) | `routes/sbpRoutes.ts:226` | `startBuild()` | `projects` | honours `holdForReview` |
| 2 | Portal participant self-serve | `routes/projectRoutes.ts:579`, `:588` | `createProjectForEnrollment()` → `startArchitectBuild()` | `projects` | none |
| 3 | Portal (second path) | `routes/projectRoutes.ts:8880` | `createProjectForEnrollment()` | `projects` | none |
| 4 | Project route (admin/other) | `routes/projectRoutes.ts:108` | `createProjectForEnrollment()` | `projects` | none |
| 5 | Internship application → build | `routes/admin/internshipRoutes.ts:479` | `startInternProjectBuild()` | `projects` | none |
| 6 | Flotation intake → build | `routes/admin/flotationIntakeRoutes.ts:154` | `startBuildFromUnderstanding()` | `projects` | honours `holdForReview` |
| 7 | **Enrollment side effect (×3 call sites)** | `services/enrollmentService.ts:58`, `:87`, `:250` | `createProjectForEnrollment()` | `projects` | none |
| 8 | Delivery project intake | `services/delivery/projectIntake.ts:210` | `startBuildFromUnderstanding()` | `projects` | inherits param |
| 9 | **Repo import** | `services/delivery/repoProjectImport.ts:210` | `startBuild()` | `projects` | none |
| 10 | Internship authoring | `services/internship/internshipProjectAuthoring.ts:88` | `createNewProjectForEnrollment()` | `projects` | none |
| 11 | Lead conversion | `services/delivery/leadConversion.ts:175` | `DeliveryProject.create()` | `delivery_projects` | none |
| 12 | Business-process seed | `services/businessProcessSeedService.ts:135` | `Project.findOrCreate()` | `projects` | none |
| 13 | Enrollment backfill (script) | `scripts/backfillProjectsForEnrollments.ts:33` | `createProjectForEnrollment()` | `projects` | none |
| 14 | Demo/dev seeds (×3 scripts) | `scripts/seedOrdinaryProjectDemo.ts:27`, `scripts/seedFactoryDemoContract.ts:31`, `scripts/seedDevClientReviewer.ts:183` | `DeliveryProject.create()` | `delivery_projects` | labelled demo |

**14 creation paths — 12 live application paths plus 2 script/seed groups, across ~18 call sites.**

## Not an entry point: the gov opportunity guard

`POST /api/admin/factory/opportunities/:uuid/start` (`routes/admin/factoryRoutes.ts:240`) looks like a creation path and is not one. Its header comment (`:228-239`):

> *"PHASE 1 TEMPORARY GUARD. Until the Phase 2 qualification record + approval flow lands, this route MUST NOT create a new government project or its tracks … if the deterministic `gov-<uuid>` project ALREADY exists, return it (`created:false`) … otherwise return `409 { qualificationRequired: true }` and create NOTHING (no project, no backfill)."*

This is **the refusal precedent LC-01 generalizes**, not a hole LC-01 must close. An earlier draft of this matrix listed it as a creation path; an independent plan audit caught the error. Counting a control as a hole would have put a spurious row in the LC-01 enumeration test.

That comment also records the tenancy rule LC-14 must preserve: `slug` is unique only **per tenant**, and a bare `findOne({where:{slug}})` could resolve a project belonging to another tenant. Row-level checks run after the audited tenant guard, never instead of it.

## The three chokepoints

Instrumenting three functions covers all fourteen paths:

| Chokepoint | File:line | Covers |
|---|---|---|
| `createProjectForEnrollment()` / `createNewProjectForEnrollment()` | `services/projectService.ts:96`, `:121` | rows 2, 3, 4, 7 (×3), 10, 13 |
| `sbpOrchestrator.startBuild()` | `services/sbp/sbpOrchestrator.ts:192` | rows 1, 5, 6, 8, 9 — the last four transitively, via `internshipProjectGeneration.ts:152` and `buildFromUnderstanding.ts:149` |
| `DeliveryProject.create()` | 4 direct call sites | rows 11, 14 |

**The third needs a seam that does not exist yet.** `DeliveryProject.create()` is called directly on the model; there is no service-level helper to wrap. An additive `createDeliveryProject()` must be introduced and the 4 call sites routed through it: `services/delivery/leadConversion.ts:175` plus the three seed scripts. Verified by `grep -arn --include=*.ts "DeliveryProject\.create(" src` returning 4, with no `findOrCreate`/`bulkCreate`/`upsert` on that model anywhere.

## How LC-01 must be tested

**Enumerate all fourteen paths, not the three chokepoints.** A test that exercises only the chokepoints proves the chokepoints work — it does not prove nothing bypasses them, and a new call site added later would not fail it.

Rows 13 and 14 (scripts and seeds) get an **explicit, labelled** bypass. A silent bypass is forbidden: the request permits labelled synthetic fixtures and isolated projects, not ungoverned creation paths wearing a script's clothing.

Every count-based check here carries a positive control. Two reasons, both load-bearing in this repo:
- Three `.ts` files under `backend/src` contain deliberate NUL bytes (hash and ID domain separators in `factoryApproval.ts`, `factoryIds.ts`, plus one test fixture). Plain `grep -r` reports them as binary and **skips the matching lines** — including in the most important approval file in this subsystem. Use `grep -a`.
- An over-broad pattern over-counts just as silently. While sweeping these documents for leaked credentials, a naive `sk-[A-Za-z0-9]` pattern matched the literal strings `task-verification` and `loop-task-verifier`.

## Observations that shaped the design

- **`routes/projectRoutes.ts` is 11,692 lines** — far over the 500-line hard ceiling in `CLAUDE.md`. Grandfathered, but the Modular Composition Rule means the next change must split before adding. **No lifecycle code goes in this file**; new routers only.
- **`startBuildFromUnderstanding` already supports `holdForReview` and `requireConfirmed`** (exercised at `services/delivery/__tests__/buildFromUnderstanding.test.ts:78`, `:170`, `:178`). The review-hold vocabulary exists; it is simply not applied uniformly across entry points.
- **`build_intake.hold_for_review` is a persisted column**, written at intake (`sbpOrchestrator.ts:217`). The restart-resume path used to drop the hold and auto-publish to the student — a real incident, now fixed, and the origin of LC-13.
- **The student-side approval gate was deliberately removed** by product decision. `db/ensureProjectApprovalSchema.ts` still exists and is the **owner/admin** approval surface, not a student gate. It is not resurrected as one.

---

## Citation audit, 2026-10-02

Phase 6 routes all 14 entry points from this table, so a drifted line number is a wrong turn
somebody takes months from now. Every `file:line` citation was checked against the tree by
script: does the named function still appear within 3 lines of the cited position.

**14 rows, 19 citations: 18 exact, 1 drifted.** The drift was row 5,
`internshipRoutes.ts:316` for `startInternProjectBuild`, which is now at `:479` (+163) — `:316`
is an on-demand AI review route today. Corrected above.

Two notes on the audit itself, because they affect whether it can be trusted:

- The first pass matched only 11 of 14 rows. Rows 2, 7 and 14 carry **several** citations in one
  cell, which a single-path pattern skips. A second pass covered the remaining 8 citations. A
  count that stops at the first pattern is how three rows go unchecked while the report reads
  complete.
- That second pass reported two false "symbol gone" results for row 2, because the cell names
  **two** functions separated by an arrow and the parser read the whole string as one name.
  Checked by hand: `createProjectForEnrollment` is at `:579` and `startArchitectBuild` at `:588`,
  both exact. The matrix was right and the audit was wrong.

**Re-run this audit before Phase 6 wires anything.** One drift in a day means the table decays
at a measurable rate, and its whole value is being the place you do not have to re-derive.