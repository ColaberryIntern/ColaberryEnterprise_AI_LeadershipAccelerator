# Phase 8 handoff — deployed AND activated

**For:** Ali, first thing. Session `CC-20261001-q7m4`, 2026-10-14.

---

## Your morning checklist — about five minutes

### 1. The two-minute check that only you can do

Open `/admin/project-lifecycle/<any project id>?kind=delivery` on the normal application host,
logged in with program permission.

- **Expected:** the lifecycle workspace renders. It will look EARLY — every project sits at stage
  `discovery` and no blueprint exists yet. That is the correct starting state.
- **If you still see a yellow box** saying *"Project lifecycle enforcement is not enabled in this
  environment"*, the setting did not reach the running server. Tell me and I will fix it; rollback
  is one line either way.
- **If you see a blank page**, that is a different defect and also worth telling me.

This is the one claim I could not verify myself. Every route is `requireSection('program')` and
the "not enabled" response sits behind that middleware, so an unauthenticated request returns 401
whether the feature is on or off. I tried an unauthenticated probe and **its own control proved it
uninformative** — a deliberately nonexistent route and `/api/health` returned the same 401, so a
global guard answers before routing.

### 2. Two PRs are waiting for your merge

Nothing is blocked on them; they are records and tests, not production code.

- Whatever I open tonight for the Phase 8 documents (link in chat).
- No other lifecycle PR is outstanding. #3085 is already merged and deployed.

### 3. One decision, when you have a moment

**Wiring real enforcement.** Activation made the approval screens reachable but **nothing is
refused today**. The gate that requires an approved blueprint before work gets planned exists and
is armed, but the live plan generator never passes it a project id, so it is unreachable. Making
it real is one line.

It must not be done yet. `operating_blueprint_manifests` holds **zero rows** — no blueprint has
ever been approved, because the approval screen was itself behind this flag. Wiring the
requirement before anyone approves a blueprint would refuse **every** student build.

The sequence is: approve one blueprint through the now-reachable screen, confirm the flow works,
then wire the gate. Say when and I will do it as its own change with its own rollback.

---

## What is true in production now

| | State | Evidence |
|---|---|---|
| Merged | ✅ | PR #3085, 8 of 8 checks green, head `afeb04bb` |
| Deployed | ✅ | `scripts/deploy-prod.sh backend`, prod HEAD = `afeb04bb`, backend answering in 10s |
| **Activated** | ✅ | `printenv ENABLE_PROJECT_LIFECYCLE` **inside the running container** returns `true` |
| Registration working on real traffic | ✅ | 10 projects created 2026-10-13, **10 of 10** got exactly one lifecycle row, 0 orphans, 0 duplicates |
| Database protections | ✅ | `build_plans_one_published_per_project` present by name; `projects` 72 rows, **0 unattributed** |
| Boot clean | ✅ | 467 log lines, **0 fatal**; 10 errors all pre-existing `intel-card-content` / `aiNews` noise |
| **Review surface seen rendering** | ❌ | Needs an authenticated session. **Your checklist item 1.** |
| Enforcement actually refusing | ❌ | By design today — the gate is unreachable from the live generator |

## Limitations, stated plainly

1. **No itemised reapproval impact** (LC-11 partial). A material change blocks stale downstream
   work but does not list what is affected. The owner guide's Test 6 has been corrected so you do
   not report it as a bug.
2. **The delivery-project path has never run in production.** Four such projects exist, all
   predating the hook. Registration is live on that path but unexercised.
3. **The authenticated 409 refusal is still unobserved**, for the same token reason as item 1 of
   the checklist. Carried since Phase 6.
4. **Phase 7's assurance packets are deferred** by your decision on 2026-10-13 to prioritise
   activation: T1.2, T1.3, T2 through T6 and T8. The live gates carry Phase 6's verification, not
   Phase 7's. T7 stays held until it rehearses its own rollback.
5. **62 pre-hook projects have no lifecycle record.** Expected; they are untouched and nothing
   blocks them.

## Rollback

One line, and it never re-opens an ungoverned creation path because registration does not depend
on the flag. Full procedure, both levers, in `operator-runbook.md` beside this file. A
pre-activation backup of the host environment file already exists.

## Where the evidence lives

- `operator-runbook.md` — health checks, rollback, log patterns, metrics to watch for a week.
- `owner-testing-guide.md` — Tests 1 to 8, now in their activated form.
- `.loop-architect/runs/20261001-unified-project-lifecycle/deployment-log.md` — every command and
  measurement from tonight, including the one mistake and how it was caught.
- `verification-log.md` in the same directory — the independent gradings, including the two P7-T1.1
  failures and what they taught.
