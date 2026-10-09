# Phase 5 handoff — the operator review surface

**Who this is for:** whoever picks up Phase 6, and the owner deciding whether to merge and
deploy. Every command below was run before it was pasted; Phase 4's equivalent document failed
three gradings on pasted commands that had never been executed.

**Session:** `CC-20261001-q7m4` · **Branch:** `workstream/project-lifecycle-phase5`

---

## Boundary report

Everything is labelled **local**, **PR**, **deployed** or **activated**. Those are four different
states and collapsing them is the failure this format exists to prevent.

- **DEPLOYED** — amended 2026-10-09. Merged as PR #3048 and deployed via `scripts/deploy-prod.sh`
  at release `a11961e3c7142eb2e8ad66757571fbcbba3b04f4`. Both containers were genuinely recreated
  (created and started 01:27Z, 0 restarts), not pulled over. Pre-deploy SHA
  `19ac5db489c2cd9a9eb94326a96eb6379927c650` is the rollback target — and the rollback command
  needs `SKIP_PULL=1 ALLOW_DETACHED_HEAD=1`, because the script refuses a `HEAD` that is not
  `origin/main`, which is exactly the state a rollback creates. See `deployment-log.md`.
- **PRODUCTION-VERIFIED.** `loop-production-verifier` ran ten checks against the live system and
  returned PASS. The schema check reproduced independently and unpiped: `7/7` tables, `10/10`
  indexes, `6/6` constraints, exit 0. The frontend bundle served over HTTPS through the real
  hostname contains `lifecycle-page`, `compare-panel` and `linked-panel`, so the surface shipped
  rather than merely merged.
- **STILL NOT ACTIVATED, and that is the whole posture.** `ENABLE_PROJECT_LIFECYCLE` is unset,
  confirmed four ways: `printenv` exits 1 (unset, not empty-but-set), absent from PID 1's own
  environment, absent from every stack config file, and the running image evaluates
  `flag_lifecycleEnforcement: false`. In the SHIPPED JavaScript the flag check is the first
  statement in all seven handler bodies, before any service import, so no 200, empty-success or
  500 path is reachable. Activation is Phase 8 and the contract treats it as a hard stop.
- **Two acceptance IDs, and only two.** Phase 5 **strengthens LC-08** and evidences **LC-14 in
  part**. It does not claim LC-10, LC-11, LC-12 or LC-15. The first two were dropped mid-phase
  and that is recorded below rather than left for this document to discover.
- **The feature is additive.** No role was renamed, no permission row edited, no existing route
  changed in behaviour — and the production verifier spot-checked the public site, the login pages,
  the asset manifest and `/health/full` (12 checks, 0 non-ok) to confirm it. With the flag off,
  rollback cannot re-open an ungoverned path because no path is governed yet. **The rollback
  procedure is in `deployment-log.md`, not here, because the obvious form of it is refused by the
  deploy script.**
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
| 1 | The live end-to-end review journey | **Phase 8, after activation** | P5-T10 has now run and passed, so this is no longer waiting on a deploy — it is blocked by the FLAG. With `ENABLE_PROJECT_LIFECYCLE` unset every route refuses, so there is no journey to run in production. The plan defers it to Phase 8 for exactly this reason. |
| 2 | The live stale-revision approval refusal | **Phase 8, after activation** | Proven locally against a real Postgres (`blueprintApproval.concurrency.integration.test.ts`). The code is now deployed, but the approval route refuses at the flag check before reaching the CAS, so the refusal cannot be provoked until activation. |
| 3 | The live `error_class` log evidence | **Phase 8, after activation** | The code is deployed, and the verifier confirmed `grep -c project_lifecycle` over 960 post-deploy log lines returns **0** — correct, because no route can be reached. An `error_class` from this path cannot appear until the flag is on. |
| 4 | **LC-14's worker-bypass clause** | **P6-T1** | **There is no worker path in this repo to bypass.** `approveLifecycleBlueprint` has exactly one caller, the HTTP route, and it already runs the audited write guard. A test asserting that a nonexistent job cannot reach approval is a test that cannot fail. An absence tripwire stands in its place and is proven to trip. |
| 5 | Screenshots of the review surface | **Whoever runs the production capture pipeline** | NOW POSSIBLE: the surface is deployed, and `scripts/captureProductionScreenshots.js` already works against production. It was not possible during Phase 5 because `playwright` is declared in the root `package.json` but unresolvable in that worktree, and installing it would have mutated another session's live worktree through the `node_modules` junction. Note the only page reachable today is the switched-off notice. |
| 6 | A **visual** narrow-width check | **Phase 8, with the capture pipeline** | jsdom performs no layout, so every element reports a zero bounding box and the Phase 5 evidence is structural — no fixed pixel widths, every flex row wraps, and three real overflow defects were found and fixed that way. A real narrow-width look needs the flag on, because the only page available now is the refusal notice. Nobody has looked at it on a phone. |
| 7 | LC-10 and LC-11 | A later phase, on top of T1.3's shipped code | See above. |
| 8 | **The authenticated 409 over HTTP** | **Whoever holds a program-section admin token** | `requireSection('program')` runs BEFORE the flag check, so an unauthenticated probe stops at 401 and never reaches the handler — the verifier proved that 401 is byte-identical to a nonexistent route's. The refusal is evidenced from the shipped artefact's behaviour in the live container instead. One `curl` with a token closes it. **DO IT BEFORE PHASE 8:** once the flag is on, the refusal cannot be observed at all. |

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

## What the owner has to do — updated 2026-10-09

PR #3048 is merged and Phase 5 is deployed and verified. Two things remain:

1. **Merge PR #3049.** It is the P5-T8 remediation — tests and documentation only, no production
   source — which landed on the branch after #3048 had already merged and so never reached `main`.
   It changes nothing about what is running.
2. **Nothing else, until Phase 8.** The feature is inert by design. The one check available today
   is in `owner-testing-guide.md`: open the workspace URL and confirm you get the yellow
   "not enabled" box rather than an empty page.

### The one measurement that closes at activation

The `409` refusal has never been observed over an authenticated HTTP round trip, because
`requireSection('program')` runs before the flag check and an unauthenticated probe stops at 401.
It needs one `curl` with a program-section admin token. **Do it before Phase 8 flips the flag** —
once the feature is on, the refusal cannot be observed at all and that window closes permanently.
