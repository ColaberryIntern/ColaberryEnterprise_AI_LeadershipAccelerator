# Phase 6 handoff — enforcement at the front door

Session `CC-20261001-q7m4`. Eight task packets, merged in
[PR #3075](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3075)
(merge commit `42a2e22a`), deployed to production **2026-10-12**.

**Everything below is DEPLOYED and NOT ACTIVATED.** Those are two different states and this
document never collapses them. `ENABLE_PROJECT_LIFECYCLE` is absent from the production backend
environment, verified by name after the deploy. Every gate this phase added is in the running
image and refuses nothing.

---

## Boundary report

| | State | Evidence |
|---|---|---|
| Written and tested locally | ✅ | 106 of 106 lifecycle/SBP suites, 1,800 of 1,800 tests |
| Merged to `main` | ✅ | PR #3075, all 8 required checks green |
| Deployed to production | ✅ | `scripts/deploy-prod.sh backend`, image built from `42a2e22a`, backend answering in 10s |
| Migration applied | ✅ | `project_tenant_backfilled` logged `rows: 62, slug: colaberry`; `[DB] project tenant schema ensured` |
| **Activated** | ❌ | `ENABLE_PROJECT_LIFECYCLE` absent. Phase 8 owns the flip, and it is a documented hard stop |
| Independently verified in production | ⚠️ **Partly** | The database state and the boot assertions are measured below. The authenticated refusal is NOT observed — see the obligation at the end |

### What is now true in production that was not before

1. **Every `delivery_projects` row gets exactly one lifecycle record**, written by an
   `afterCreate` hook on the model inside the caller's transaction. The hook is on the MODEL and
   not on a list of call sites, because the chokepoint inventory for this programme was wrong
   within a week: `services/factory/govDeliveryProject.ts` landed three days after the inventory
   was taken and was live in production, so every approved government pursuit created a project
   with no lifecycle.
2. **Every `projects` row can now carry a tenant, and all 62 existing ones do.** Measured after
   the deploy: 62 projects, **0 unattributed**, 1 distinct tenant, slug `colaberry`. The DRI chose
   that on 2026-10-12 after reviewing what the backfill does.
3. **Two published plans for one project is now impossible at the schema.**
   `build_plans_one_published_per_project` is a partial unique index, present in production and
   verified by name. Before it, the state was reachable: two concurrent publishes left two
   published rows, then zero, because each superseded the other's.
4. **`release_review` and `launch_ready` have real predicates and real feeds.** Both were
   `() => []` at the start of this phase. No stage now permits a stub unconditionally except
   `discovery`, which satisfies its one requirement for a measured reason.
5. **Requirements can be refined without generating stories.** Two separately reachable stages,
   with the negative control the acceptance named: a refined-but-unapproved requirement set
   authorizes nothing.

---

## What this phase does NOT do

- **It does not enforce anything.** The flag is off. A project created in production today still
  reaches implementation exactly as it did yesterday.
- **It does not change any user-visible surface.** Zero frontend files in the diff.
- **It does not close LC-10 or LC-11.** Those were withdrawn from Phase 5's acceptance set when
  P5-T1.3 was accepted as blocked at five attempts, and this phase did not re-attempt them. The
  acceptance matrix cannot read 18 of 18 until they are re-attempted or formally re-scoped.

---

## Carried forward to Phase 7, with the reason each one was not fixed here

### 1. The `workspace` prompt instruction is SOFT

`BUILD_PLAN_JSON_SCHEMA` lists `workspace` in the story `required` array under `strict: true`,
so a compliant model cannot omit it. Only the prompt explains what an honest answer is.

**Gutting that paragraph leaves every test green.** A model could satisfy the schema by labelling
every story a workspace, which would make `release_review` pass on exactly the plans it was built
to catch. Phase 7 either adds a check that can detect the all-workspace answer, or records in
writing why it cannot.

### 2. Source overflow ships DETECT-ONLY

`request.md:243` asks for "explicit completeness checks/chunking or a visible blocking overflow".
What shipped is visible: the clip is reported to the caller and the log. It is not chunked and it
does not block.

Ruled acceptable twice, and both rulings rest on an **unmeasured** production distribution of
brief and document sizes. Refusing above a budget would fail builds that succeed today, and
nobody knows how many. Phase 7 measures the real distribution, then decides chunk, block or
accept.

### 3. A second tenant running cohorts WOULD be mis-attributed

New `projects` rows with no explicit tenant default to `colaberry`. That is correct while one
tenant runs cohorts.

The first version of the resolver refused to attribute anything once a second tenant owned a
project, and **running it showed why that is worse**: one deliberate cross-tenant placement
disables attribution for every project created afterwards, leaving them with no lifecycle at all.
A refusal does not prevent the harm it was aimed at — it converts "possibly wrong tenant" into
"no governance". So the state is a loud warning (`student_tenant_multi_tenant_observed`) carrying
both tenants.

**The real fix is deriving the tenant per project from its programme**, and no table on that path
carries a tenant. That is a Phase 7 item, and it cannot be substituted with a refusal.

### 4. A delivery project moved between tenants leaves its lifecycle behind

The hook records the tenant at registration. A direct `UPDATE` to
`delivery_projects.tenant_id` does not move the lifecycle row, so the two drift.

Nothing in the product reassigns a delivery project's tenant today, so the blast radius is zero,
and inventing a trigger for an unobserved operation is how a gate acquires behaviour nobody asked
for. Pinned by a test in `lifecycleRegistration.tenancy.integration.test.ts` so that closing it,
or accepting it, is a deliberate change.

### 5. P4-T7's handoff is still blocked at the cap

Three attempts, stopped under the execution contract. The honest reason is that Phase 4 shipped
dark and a handoff promising a testable surface would have been false. Phase 5's and this one
exist because by then there was something to describe.

### 6. Phase 4 never had a PR of its own

Verified rather than suspected: there is no phase-4 merge commit on `main`, and the Phase 4
commits are ancestors of the PR #3048 merge — the *Phase 5* PR. Two design tables and the whole
allocation model were reviewed as part of a different phase. A review-coverage gap, not a defect.

---

## How Phase 6 was verified, with the commands that produced it

```bash
# the lifecycle and SBP subsystems, after merging origin/main forward
cd backend && npx jest --no-cache --forceExit --runTestsByPath \
  $(ls src/services/lifecycle/__tests__/*.test.ts src/services/sbp/__tests__/*.test.ts \
    | grep -v integration | tr '\n' ' ')
# 106 suites, 1800 tests, all passing

# the five integration suites, each against a throwaway Postgres
docker exec acc-lifecycle-scratch-pg psql -U postgres -c 'CREATE DATABASE t5_publish;'
DATABASE_URL=postgres://postgres:scratchlocal@localhost:55432/t5_publish \
  npx jest --no-cache --forceExit --runTestsByPath \
  src/services/sbp/__tests__/planStore.publishConcurrency.integration.test.ts
# publish concurrency 5/5 · plan reads 8/8 · front door 10/10 · tenancy 13/13 · student 9/9

# typecheck. NOT `npx tsc` -- that resolves a stale 4.9.5 in this tree.
cd backend && node ../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
# 4 errors, all TS2307 'playwright', the pre-existing local-install baseline

# the two scripts behind the required "Secret scan + route-auth lint" check
node scripts/secret-scan.js        # clean, 6504 tracked files
node scripts/lint-route-auth.js    # clean, 133 admin route files
```

**Nine mutations were applied and killed** across T5, T6, T7 and T1b, each file restored
byte-identically and confirmed by sha256. Three of them killed controls I had written myself and
believed were working:

- A compile-time exhaustiveness check that passed with an unaccounted field added, because
  tsconfig excludes test files AND ts-jest transpiles rather than typechecks.
- A tenancy source sweep that passed with the audited guard disabled by an always-false
  condition. A sweep can establish ORDER; only running the code establishes REACHABILITY.
- A prompt-length proxy that broke when unrelated instruction text grew.

### The post-deploy measurement, taken on the box

```sql
SELECT (SELECT count(*) FROM projects) AS projects,
       (SELECT count(*) FROM projects WHERE tenant_id IS NULL) AS unattributed,
       (SELECT count(*) FROM pg_indexes
         WHERE indexname = 'build_plans_one_published_per_project') AS publish_index;
-- 62 | 0 | 1
```

Boot log, same deploy:

```json
{"event":"project_tenant_backfilled","outcome":"success","context":{"rows":62,"slug":"colaberry"}}
```

`[DB] project tenant schema ensured` — the post-condition assertion passed. It checks the DATA as
well as the catalog, because a column that exists while every row is still null would satisfy a
shape-only check and leave every project ungoverned, which is the condition the task existed to
end.

---

## The one measurement that closes PERMANENTLY at activation

**The authenticated 409 `lifecycleDisabled` refusal has never been observed over HTTP**, and the
window shuts the moment `ENABLE_PROJECT_LIFECYCLE` is set, because the pre-enforcement refusal
stops existing.

Measured after this deploy, and it sharpens the obligation rather than discharging it:

```
GET /api/admin/project-lifecycle/status/<id>   ->  401 {"error":"Authentication required"}
```

**The 409 sits behind authentication.** So this is not an observation nobody attempted — it
requires a program-section admin token, which cannot be minted from this session. One
authenticated `curl` against that route, before Phase 8 flips the flag, is all it needs. After
that the evidence is unobtainable forever.

---

## What the owner has to do

| | Action |
|---|---|
| **Now** | Nothing. Phase 6 is deployed, dark, and verified at the database and boot-log level |
| **Before Phase 8** | One authenticated `curl` to capture the 409, using a program-section admin token (see above) |
| **Decide, unhurried** | Whether to accept Phase 4's review coverage or re-review its diff in isolation; whether the two packets dropped in Phase 5 stay dropped; and whether LC-10 and LC-11 are re-attempted or re-scoped |
| **Phase 8 hard stop** | Setting `ENABLE_PROJECT_LIFECYCLE=true` is yours. It is the first change in this programme that alters what the platform refuses |
