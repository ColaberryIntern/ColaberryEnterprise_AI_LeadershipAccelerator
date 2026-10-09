# Phase 5 handoff — the operator review surface

**Who this is for:** whoever picks up Phase 6, and the owner deciding whether to merge and
deploy. Every command below was run before it was pasted; Phase 4's equivalent document failed
three gradings on pasted commands that had never been executed.

**Session:** `CC-20261001-q7m4` · **Branch:** `workstream/project-lifecycle-phase5`

---

## Boundary report

Everything is labelled **local**, **PR**, **deployed** or **activated**. Those are four different
states and collapsing them is the failure this format exists to prevent.

- **LOCAL + PR.** All of Phase 5's code and tests exist on the branch and pass locally. Nothing is
  deployed. Nothing is activated.
- **NOT DEPLOYED, and blocked on a human.** `main` requires 1 approving review and five checks
  (`Backend typecheck`, `Backend unit tests`, `Secret scan + route-auth lint`, `Frontend build`,
  `Frontend typecheck`), and only `main` deploys to production. The merge is the owner's click.
  P5-T9 (deploy) and P5-T10 (production verification) cannot start before it.
- **NOT ACTIVATED, by design.** `ENABLE_PROJECT_LIFECYCLE` stays unset. Every route answers
  `409 { lifecycleDisabled: true }` with the remedy in the body. Activation is Phase 8 and the
  execution contract lists flipping this flag as a hard stop — no task in Phase 5 turns it on.
- **Two acceptance IDs, and only two.** Phase 5 **strengthens LC-08** and evidences **LC-14 in
  part**. It does not claim LC-10, LC-11, LC-12 or LC-15. The first two were dropped mid-phase
  and that is recorded below rather than left for this document to discover.
- **The feature is additive.** No role was renamed, no permission row edited, no existing route
  changed in behaviour. Rollback is redeploying the pre-deploy SHA with the same script; with the
  flag off, rollback cannot re-open an ungoverned path because no path is governed yet.
- **One task is blocked, not failed.** P5-T1.3's code ships; its evidence did not reach the bar
  after five gradings and the owner accepted the block. What that costs is listed below.

---

## Acceptance IDs: derived, with the unmatched set printed

Not described — enumerated. The command and its real output:

```
$ R=.loop-architect/runs/20261001-unified-project-lifecycle/request.md
$ grep -oE "LC-[0-9]{2}" "$R" | sort -u | tr '\n' ' '
LC-01 LC-02 LC-03 LC-04 LC-05 LC-06 LC-07 LC-08 LC-09 LC-10 LC-11 LC-12 LC-13 LC-14 LC-15 LC-16 LC-17 LC-18
$ grep -oE 'LC-[0-9]{2}' "$R" | sort -u | wc -l
18

$ comm -23 <(grep -oE "LC-[0-9]{2}" "$R" | sort -u) <(printf "LC-08\nLC-14\n" | sort) | tr '\n' ' '
LC-01 LC-02 LC-03 LC-04 LC-05 LC-06 LC-07 LC-09 LC-10 LC-11 LC-12 LC-13 LC-15 LC-16 LC-17 LC-18
```

**Sixteen of the eighteen are not evidenced by Phase 5.** That is the honest number. Some were
evidenced by earlier phases, some are owed to later ones, and `acceptance-evidence.md` already
records which — it says plainly that those rows "are not written here" rather than filling them
in from a plan.

---

## What was dropped mid-phase, and what it costs

**LC-10 and LC-11 were withdrawn on 2026-10-08.** P5-T5 (approval binding an authorized human to
an exact revision and content hash) depended on P5-T1.3, whose evidence failed five gradings —
8/12, 9/12, 7/12, 7/12, 8/12, with a criterion-6 zero in four of them. The owner accepted the
block. P5-T6 (selective reapproval, invalidating only the affected approvals and blocking stale
downstream work) depends on T5 and fell with it.

**What still ships from T1.3 despite the block:** the manifest writer, its refs-hash idempotency
key, the two partial unique indexes, the additive DDL and its paired schema assert. Production can
create an `operating_blueprint_manifests` row for the first time. **The code was never what
failed — the evidence was** — so a later phase can pick T5 up on top of it rather than starting
over.

---

## Deferral index — every item with an owner and a reason

| # | Deferred | Owner | Why it could not be shown in Phase 5 |
|---|---|---|---|
| 1 | The live end-to-end review journey | P5-T10, after merge | The journeys run against a throwaway Postgres. CLAUDE.md forbids integration tests touching production, and the flag is off there, so a production run would assert nothing while still writing to the production database to find that out. |
| 2 | The live stale-revision approval refusal | P5-T10, after merge | The CAS refusal is proven locally against a real Postgres (`blueprintApproval.concurrency.integration.test.ts`), but "it refuses in production" is a different claim and nothing is deployed. |
| 3 | The live `error_class` log evidence | P5-T10, after merge | The structured log lines are asserted locally by the route suite. Reading them out of the production container needs the code to be there. |
| 4 | **LC-14's worker-bypass clause** | **P6-T1** | **There is no worker path in this repo to bypass.** `approveLifecycleBlueprint` has exactly one caller, the HTTP route, and it already runs the audited write guard. A test asserting that a nonexistent job cannot reach approval is a test that cannot fail. An absence tripwire stands in its place and is proven to trip. |
| 5 | Screenshots of the review surface | P5-T9/T10, after deploy | `playwright` is declared in the root `package.json` but is not resolvable in this worktree — `require('playwright')` throws, which is also the true cause of the four baseline `TS2307` errors in the backend typecheck. Installing it would mutate another session's live worktree through the `node_modules` junction. |
| 6 | A **visual** narrow-width check | P5-T9/T10, after deploy | jsdom performs no layout, so every element reports a zero bounding box. The narrow-width evidence here is structural — no fixed pixel widths, every flex row wraps — and three real overflow defects were found and fixed that way. Nobody has looked at it on a phone. |
| 7 | LC-10 and LC-11 | A later phase, on top of T1.3's shipped code | See above. |

---

## How Phase 5 was verified, with the commands that produced it

Every line below was run; none is reconstructed.

```
# backend, six suites, against a throwaway Postgres
$ DATABASE_URL=postgres://postgres:***@localhost:55432/lifecycle_journeys \
  npx jest --no-cache --runTestsByPath \
    src/services/lifecycle/__tests__/lifecycleJourneys.integration.test.ts \
    src/services/lifecycle/__tests__/lifecyclePersonas.test.ts \
    src/routes/admin/__tests__/projectLifecycleRoutes.test.ts \
    src/services/lifecycle/__tests__/linkedViews.test.ts \
    src/services/lifecycle/__tests__/blueprintRevisionDiff.test.ts \
    src/services/lifecycle/__tests__/blueprintChangeRequest.test.ts
Test Suites: 6 passed, 6 total    Tests: 208 passed, 208 total

# frontend, four suites
$ CI=true npx react-scripts test --watchAll=false --runTestsByPath \
    src/components/lifecycle/__tests__/narrowWidth.test.tsx \
    src/components/lifecycle/__tests__/BlueprintReview.test.tsx \
    src/components/lifecycle/__tests__/LinkedRecords.test.tsx \
    src/components/lifecycle/__tests__/ProjectLifecycle.test.tsx
Test Suites: 4 passed, 4 total    Tests: 75 passed, 75 total

# typechecks
$ node ../node_modules/typescript/bin/tsc --noEmit        # backend
4 errors, all TS2307 Cannot find module 'playwright' — the documented baseline, zero new
$ npx tsc --noEmit -p tsconfig.json                        # frontend
exit 0, 0 errors

$ node scripts/lint-route-auth.js
[route-auth-lint] OK — all 132 admin route files are auth-guarded.
```

**Mutation evidence.** The diff predicate (12 mutations), the linked-views traversal (15) and the
approval absence tripwire were each run to zero survivors with the target restored byte-identical.
**Every harness runs `--no-cache`**, because ts-jest was measured serving a mutant's compiled
output for pristine bytes after a mutation cycle — a cached run can fake a survivor as easily as
a kill, and T3's and T4's evidence was re-run under the flag rather than assumed unaffected.

---

## Before deploying (P5-T9), two preconditions that fail SILENTLY if skipped

1. **The post-deploy schema check.** `ensureProjectLifecycleSchema` logs a warning and carries on
   rather than throwing, so a failed migration leaves a deploy looking completely normal. Run
   `verifyProjectLifecycleSchema.ts` and paste its JSON line verbatim. What it catches is a
   missing unique index — precisely the backstop the manifest write depends on.
2. **The image-published check.** `gh run list --workflow "Build images" --branch main` before
   deploying; the deploy script exits 1 silently without it. That workflow exists and is active.

Deploy **only** via `scripts/deploy-prod.sh`. Record the pre-deploy SHA first — rollback is
redeploying that SHA with the same script. Both backend and frontend are in scope: a frontend-only
deploy breaks `.strict()` Zod routes with a 400, and `--build nginx` for a backend-only change
bounces the backend. Never two concurrent deploys.

---

## What the owner has to do

1. Review and approve the PR (1 approving review is required; the five checks run themselves).
2. Merge it — `gh pr merge` is refused in this environment even when approved, so the merge is a
   click in the browser.
3. After the merge, P5-T9 and P5-T10 can run: deploy, the two preconditions above, then production
   verification. The flag stays off throughout.
