# Acceptance evidence: LC-01 … LC-18

**Created:** 2026-10-06 by Phase 4 (P4-T6) · **Session:** CC-20261001-q7m4
**Phase 8 owns the completed table. Each phase appends its own rows as it finishes.**

## Why this file exists now rather than in Phase 8

`execution-contract.md:103` requires all eighteen LC acceptance IDs to be evidenced here, and no
task owned the file. `architecture.md` recorded it as *"NOT YET CREATED; Phase 8 owns it"* — a
committed decision, not an oversight, and creating the file silently would have contradicted it.

The reconciliation, rather than overriding one source with the other: **Phase 8 still owns the
completed table; each phase appends its own rows as it finishes.** Phase 8 assembling eight
phases of evidence at the end would mean reconstructing it from memory, which is precisely the
stale-record failure that has cost this run verifier points more than once. So Phase 4 creates
the file, writes only its own two rows, and `architecture.md` is updated to say so.

**The rows owed by Phases 1–3 are a known gap, recorded in `carried-forward-obligations.md`
rather than backfilled here.** Writing them now would mean inventing evidence from a plan that
did not measure them, which is the opposite of what this table is for.

## What counts as evidence in this table

A command that was run, with its result, or a file:line that can be opened. Not a claim that
something was done. Where a row is partial, it says which half is missing — an honest partial row
is useful and a confident whole one that is half true is not.

---

## Rows written by Phase 4

### LC-08 — Every task maps to a justified human surface/action or explicit background operation

| | |
|---|---|
| **Status** | **Met, with a stated limit** |
| **Implementation** | `backend/src/services/lifecycle/generation/workspaceMapping.ts` (`validateTaskSurfaces`), vocabulary in `workspaceBindingTypes.ts`, checks in `workspaceBindingChecks.ts` |
| **Mechanism** | A business task resolves to EXACTLY ONE of `{ kind: 'workspace', ref }` or `{ kind: 'headless', reason }`. No default and no third state: a default would mean an unconsidered task acquires a position nobody chose. `headless` takes one of five enumerated reasons, never free text. |
| **"Justified" is enforced, not asked for** | A proposed screen carries a primary human job, intended roles, records, supported decisions, `whyNotExisting`, requirement/task links, audience, permission views, a deep link, and `preservesNavigationState`. Each is a named refusal. |
| **Evidence** | `__tests__/workspaceMapping.test.ts`, run with `node ../node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/services/lifecycle/generation/__tests__/workspaceMapping.test.ts` from `backend/`. Every refusal code is paired with a passing counterpart, and a seeded generator over a keyspace **derived from the source files** asserts no `JSON.parse`-producible value throws in any claimed position, with a **per-position** reach control that NAMES any position it cannot reach. |
| **Mutation-proven** | Each refusal code was deleted individually and the named failing test recorded; source restored from a byte-compared backup each time. |
| **Honest limit** | A workspace binding proves a human *interacts* somewhere. It does **not** prove the task produces user-visible output chained to the rest of the workflow — an ingestion task bound to an "Imports" admin screen satisfies it. Stronger than the regex this replaced, weaker than "proves a workflow". The stronger guarantee needs Phase 6's release-level view and is in the register as such. |
| **Not established** | That the running surface enforces the permission views it declares. That is a route-authorisation question for the phase that builds the routes. |

### LC-09 — Interactive design and human controls exist before authorized implementation planning

| | |
|---|---|
| **Status** | **Partially met — the gate is real; "interactive" is DECLARED, not rendered** |
| **Design alternatives** | `designAlternatives.ts` projects the process graph and LC-08's bindings onto the three patterns §4.5 names, with **no model call**. The comparator is structural: the fingerprint reads task ids and navigation depth and deliberately not workspace ids, slot ids or titles, so renaming every label does not make two options "genuinely different". |
| **Selection** | `designSelection.ts` records the chosen variant and the visual-contract revision as `<alternativeId>@vc<revision>`, because §4.5 requires the approval to reference both and a ref carrying only the variant would let the contract move underneath an approval. |
| **The gate** | `selectedDesignRef` is what clears `design_variant_not_selected` in `lifecyclePrerequisites.ts`, which **blocks** (it is not in `ADVISORY_RULES`). `selectDesign` returns `selected: null` whenever any issue is raised, so a caller cannot read a ref out of a refused selection. |
| **Human controls** | `controlSpecification.ts` makes "we have a policy" and "the policy is enforced" two separately checkable claims. An `enforced` claim with no named call site is refused; a control with no enforcement point is `unavailable` and cannot be shown as working. |
| **Surface states** | `workspaceStateChecks.ts` requires an empty, a loading and an error state per workspace, each with a non-blank label from a contrast allow-list measured at WCAG AA, plus keyboard reachability of every declared action checked in both directions. |
| **Persistence** | `blueprint_design_decisions` and `blueprint_visual_contracts`, with Sequelize models, bound to the blueprint revision. Round-tripped through the models against a real Postgres 16; the partial `WHERE status = 'approved'` index and both CHECK constraints proven by writes that were refused, each assertion naming the constraint that fired. |
| **Evidence** | `__tests__/designAlternatives.test.ts`, `designSelection.test.ts`, `controlSpecification.test.ts`, `workspaceStateChecks.test.ts` — 15 suites, 635 tests, serially. `designPersistence.test.ts` with `DATABASE_URL` set against a throwaway Postgres; it **skips visibly** without one. `node scripts/checkTokenContrast.js` for the contrast figures. |
| **Honest limit — the load-bearing one** | **A journey here is a DECLARED path over a structure, not a rendered interaction.** Nothing clicks anything, and there is no surface until Phase 5. §4.5 says itself that "a screenshot or matching domain vocabulary alone does not establish usability"; a declared journey does not either. What it does is make the claim checkable and name the gap instead of leaving "can be demonstrated" as an untested sentence. |
| **Not established** | That a human can actually operate any of it. Screenshots, real responsive behaviour and verified interactions need the surface Phase 5 builds, and are deferred with reasons in the register. |
| **Also not established** | That selecting or revising a design invalidates the right approvals. Deferred with its three parts named in the register, because nothing in production writes `manifest.refs_json` and no material-vs-cosmetic classifier exists — the dependency does not exist to build on. |

---

## Rows owed by other phases

LC-01 … LC-07, LC-10 … LC-18 are not written here. **LC-01 to LC-07, LC-13 and LC-14 are owed
retroactively by Phases 1–3** and recorded as a gap in `carried-forward-obligations.md`; the rest
belong to the phases that have not run yet. An empty row is the correct state for work that has
not happened, and filling one in from a plan rather than a measurement is how this table would
become the thing it exists to prevent.
