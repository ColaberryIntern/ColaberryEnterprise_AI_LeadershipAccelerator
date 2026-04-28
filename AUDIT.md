# Portal System Audit — 2026-04-27

## Why This Exists

You said: *"It's never worked the way we want it to."* This document is the honest answer to *why*.

Across ~6 hours of patching the portal today, every fix exposed another disagreement between layers. This audit traces the disagreements to their source so we can decide whether to keep patching or do a focused redesign. The work below is research-only — no code was changed in producing it.

---

## TL;DR

The portal has **eight different "is this done?" definitions** that don't agree, and **seven different "what's next?" surfaces** that read different inputs. There is no canonical record of a BP's state — every signal is re-derived at request time from heuristics over the requirements doc and the repo file tree. When the heuristics drift (silent GitHub-sync failure, 700+ orphan requirements, mode-aware filters that subtract reqs differently than the UI counts them), the system gets stuck and the user has no manual override to break out.

The system was built as a *state-inference engine*. The user's mental model is *state-assertion* ("I shipped it. It's done."). The two never meet.

---

## The Eight Completion Authorities

| # | Signal | Where computed | What it actually measures | Authority |
|---|---|---|---|---|
| 1 | `RequirementsMap.status` | DB column | Per-requirement: `unmatched` / `matched` / `verified` / `auto_verified` | Ground truth — but rarely written |
| 2 | `Capability.last_execution.completed_steps` | DB JSONB field | Step keys the user *clicked through* | Stale — only updated when user copies a prompt |
| 3 | `enrichCapability.completion_pct` | `projectRoutes.ts:1485` | matched / total reqs | Derived |
| 4 | `enrichCapability.metrics.system_readiness` | `projectRoutes.ts:1487` | `layerScore × 0.4 + coverage × 0.6` | Derived from file tree + coverage |
| 5 | `enrichCapability.maturity.level` | `projectRoutes.ts:1500-1507` | 0–5 maturity ladder | Derived from layers + coverage + quality |
| 6 | `enrichCapability.is_complete` | `projectRoutes.ts:1603` | `(meetsMaturity AND isProcessComplete)` OR `isPageBPComplete` | Derived — strictest |
| 7 | `nextBestActionEngine.isProcessComplete` | `nextBestActionEngine.ts:189` | coverage ≥ threshold AND all required layers exist | Derived — used inside #6 |
| 8 | `transformBPs.completion` (frontend) | `SystemViewV2.tsx:94`, `SystemBlueprint.tsx:338` | `Math.max(coverage, readiness)` | **Different formula from backend** |

### The Bug You Saw

The "100% complete + No backend + No frontend" badge happens because of layers #4 and #8:

1. `system_readiness = layerScore × 0.4 + coverage × 0.6` — a BP with all layers present at the *project* level scores layerScore = 100, so readiness = 40 even when its own coverage is 0%.
2. `transformBPs.completion = Math.max(coverage, readiness)` — uses **MAX**, so a 0%-coverage BP shows as 40% (or higher when readiness inflates).
3. The `status` decision uses **OR** (`is_complete === true || (coverage ≥ 90 && readiness ≥ 90)`), which is broader than the backend's **AND** in `is_complete`. So a BP can register as `status: 'complete'` on the frontend while `is_complete: false` on the backend.

The two formulas were written months apart by different concerns and never reconciled.

---

## The Seven "What's Next?" Surfaces

| Surface | File | Reads | Consults DB ground truth? |
|---|---|---|---|
| Blueprint Cory panel | `SystemBlueprint.tsx` → `/cory-tasks` → `getProjectTopTasks` | execution_plan, quality, autonomy_gaps, last_execution | **No** |
| System View — Overview tab | `SystemViewV2.tsx:1283` → `cory_tasks` per BP → `getTopTasks` | same as above | **No** |
| System View — Build tab | `SystemViewV2.tsx:1411` | execution_plan only | **No** |
| System View — Health tab | `SystemViewV2.tsx:1801` | quality scores derived locally + autonomy_gaps | **No** |
| System View — Improve tab | `SystemViewV2.tsx:1905` | autonomy_gaps + layer states derived locally | **No** |
| System View — UI tab | `SystemViewV2.tsx:1994` | hardcoded 3 actions | n/a |
| Enhancement Prompt Builder (Section 8) | `PortalBusinessProcessDetail.tsx:944` | execution_plan + autonomy_gaps + enhancement_plan | **No** |

**None of the seven surfaces read `RequirementsMap.status` directly.** They all consult `last_execution.completed_steps` (#2 above), which is the most stale signal of the eight. That is why "tasks I already finished keep coming back" — the recommendation pipeline is reading the wrong source.

### Producer-Function Disagreement

`getBuildTasks`, `getHealthTasks`, `getImproveTasks`, `getUITasks` (all in `coryOrchestrator.ts`) plus `buildEnhancementPlan` (in `projectRoutes.ts`) and `generateStepsFromRequirements` (in `requirementToStepService.ts`) each have their own filter rules and priority formulas. A single BP can produce 4 different "primary next step" answers depending on which surface you look at.

---

## The Data Lifecycle (and where it breaks)

```
requirements doc
   ↓ activateProject()
parseRequirements() → RequirementsMap rows (status='unmatched')
   ↓
clusterRequirements() [LLM]
   ↓ orphans → "Uncategorized Requirements" bucket (NO size limit)
persistHierarchy() → Capability + Feature rows
   ↓
fullSync() [GitHub API]                      ← silent fail point #1
   ↓
matchRequirementsToRepo() [keyword match]    ← silent fail point #2
   ↓
RequirementsMap.status updated                ← stops here for ShipCES
   ↓ (only on manual validation report)
applyReportToBP() → marks ALL reqs in BP as 'verified'
```

### Failure modes (all silently swallowed)

1. **GitHub sync 404** — `getConnection()` returns null, file tree stays empty, matching becomes a no-op. `RequirementsMap` rows never advance from `unmatched`. Logged as a console.warn; user sees nothing. **This is what happened to ShipCES** — the activation log we ran today showed `GitHub sync failed (non-critical): GitHub API error: 404`, and it explains why all 5 Operations Dashboard reqs are still unmatched.
2. **LLM produces orphans** — the clustering prompt requires every req to land in a feature, but when it can't, all leftovers go to `Uncategorized Requirements`. ShipCES has 731 reqs in this bucket. There is no size limit and no re-clustering path.
3. **No validation report submitted** — the user has to know to click "Submit Validation Report" for the system to flip reqs to `verified`. Otherwise they sit at `unmatched` forever even when the code exists.

### What user-facing escape hatches exist today

- ✅ Submit a validation report → marks ALL reqs in one BP as `verified`
- ✅ Toggle a requirement `is_active=false` (hides it, doesn't change status)
- ✅ Reclassify endpoint exists at `/business-processes/reclassify` (rare to use)
- ❌ No "this BP is done, trust me" button
- ❌ No "this requirement is satisfied by these files" manual matcher
- ❌ No re-clustering trigger

The user can only advance state by either (a) submitting a validation report (per BP, all-or-nothing), or (b) hoping GitHub sync + keyword matching figures it out. There is no third path.

---

## Why It's Never Worked

The portal was designed as a *deterministic state-inference engine over a probabilistic requirements doc*. That works when the inputs are clean — a fresh project with a tight requirements doc, a healthy GitHub sync, and an LLM that clusters everything. The moment any input degrades (a 404 on sync, a clustering miss, a requirement worded too generically to keyword-match), the system has no fallback path to reach "done." It just keeps recommending the next inference.

Every fix today — the regex hole, the union of completed_steps, the synthetic-bucket exclusion, the headless-architecture rule — has been a patch over an inference. The patches help but they don't address the core: **the user has no way to assert state**, only the system inferring it for them.

---

## Three Redesign Options

### Option A: This Audit (DONE)

You're reading it. Nothing else changes. Use the map above to decide where to invest.

**Status:** complete.

---

### Option B: Single Source of Truth + User Override (~half a day)

Collapse the eight authorities into two:

1. `Capability.user_status: 'in_progress' | 'verified' | 'archived'` — new column, user-set via a button on the BP detail.
2. `Capability.derived_status` — single computed field, replaces `is_complete`/`completion_pct`/`maturity`/`mode_completion`. Computed from `RequirementsMap.status` ratio only (the ground truth), NOT the file-tree heuristics.

Rules:
- If `user_status === 'verified'` → BP is done everywhere. All seven recommendation surfaces respect it.
- Else `derived_status` rules: `complete` if coverage ≥ 90, `in_progress` if > 0, `not_started` if = 0.
- Drop the `Math.max(coverage, readiness)` formula on the frontend. Show `coverage` directly.
- Drop the OR-vs-AND inconsistency. Both frontend and backend use the same boolean.

Wire one canonical "next action" producer:
- One function: `getNextAction(capability) → { kind, item }`. Replaces the seven surfaces' bespoke logic.
- Reads from: `user_status`, `RequirementsMap.status` ratio, `autonomy_gaps`, `quality scores` (in that priority).
- Returns `kind: 'verify' | 'build' | 'improve' | 'done'`.
- All seven UI surfaces call this one function and render the result identically.

Add the missing escape hatch:
- "Mark BP as Verified" button on the BP detail panel — sets `user_status = 'verified'`.

**Scope:**
- 1 migration (add `user_status` column)
- ~3 backend functions consolidated into 1
- ~7 frontend surfaces refactored to call the consolidated function
- 1 new button + endpoint
- Type-check, deploy, one-shot data fix to set `user_status='verified'` for ShipCES BPs the user confirms are done

**What this fixes:**
- The "100% complete + no backend" contradiction (one formula, both sides)
- "Tasks I already did keep coming back" (single canonical state)
- "I have no way to tell the system it's done" (Mark Verified button)

**What this doesn't fix:**
- 700+ orphan reqs in "Uncategorized" (those still exist; user can ignore them via Verified status)
- LLM clustering quality
- GitHub sync failures (still silent)

---

### Option C: Full Revamp (~1–2 days)

Everything in B, plus:

3. **Re-clustering on demand** — endpoint `/business-processes/recluster` that re-runs the LLM clustering on the current Uncategorized bucket. UI button: "Reclassify orphan requirements." Splits 731-item buckets into real BPs.
4. **Bulk validation report** — paste one combined report; backend matches the listed files to the right BPs and marks them all verified at once. (Today the report has to be per-BP.)
5. **Manual matching UI** — for a single requirement, the user can pick the file(s) that satisfy it. Sets `status='verified'`, `verified_by='manual'`. Closes the gap when LLM/keyword match fails.
6. **Visible failure surfaces** — when GitHub sync fails, the project setup shows a yellow "Sync incomplete — your requirements are not being matched. Retry?" banner. No more silent 404s.
7. **Drop heuristic completion entirely** — `system_readiness`, `maturity.level`, file-tree quality scores all become *advisory* metrics shown on a separate "System Health" tab, not used for BP completion. Coverage % and `user_status` are the only things that drive whether a BP is "done."

**Scope:**
- 1 migration
- ~6 new endpoints
- ~3 new UI flows (reclassify button, bulk report textarea, manual match modal)
- ~10 frontend surfaces refactored to read only the canonical state
- Heuristic computations deleted from the completion path (kept as advisory)

**What this fixes (additional to B):**
- Stuck Uncategorized buckets
- Multi-BP validations in one shot
- Silent GitHub failures
- The conceptual confusion between "system maturity" and "BP completion" — they become two separate concepts with their own UI

---

## My Recommendation

**Do Option B today.** The data backfill we already ran (59 capabilities updated) plus a `user_status` column gets you out of the immediate stuck loop, gives you a manual override for any future drift, and collapses the disagreement between authorities #4, #6, #7, and #8 into one. It's a focused half-day refactor that pays back permanently.

**Don't start Option C until B is in place.** C's reclustering and matching UIs only make sense once the canonical state model is clean. Otherwise you're adding more inputs to an already-fragmented system.

If at any point during B you want to reach into C (e.g., the reclassify button is a 30-minute add) it's easy to scope-creep one item at a time after we have the foundation.

---

## Open Questions for You

Before I start B (if you want me to), two things would shape the work:

1. **What does "verified" mean to you?** Is it "the code exists and works in prod" (your standard for ShipCES), or "I've reviewed the BP definition and I'm satisfied with it" (lighter), or "tests pass" (stricter)? The answer determines what the Mark Verified button promises and what undoing it should do.
2. **For Uncategorized buckets** — when reclassification produces a new set of BPs, should the previous Uncategorized bucket be deleted, or kept as an archive of "things we couldn't classify"? (B doesn't touch this; it's a C question, but worth deciding now if we're pointing toward C eventually.)

Tell me which option to proceed with, and I'll start.
