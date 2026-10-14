# Phase 8 handoff — deployed AND activated

**For:** Ali, first thing. Session `CC-20261001-q7m4`, 2026-10-14.

---

## Your morning checklist — about five minutes

### 1. The two-minute check that only you can do

Open this, logged in with program permission:

```
https://enterprise.colaberry.ai/admin/project-lifecycle/831c87ab-243b-52cc-9456-901d504a1db1?kind=student
```

That id is one of the ten pilot projects, so it has a real lifecycle record to show. **`kind=student`
matters**: the ten pilot projects are STUDENT projects. Asking with `kind=delivery` makes the server
look for a delivery lifecycle for that id and correctly answer *"No lifecycle is registered for that
project."* — which is a right answer to the wrong question, and cost one round trip on 2026-10-14. The host was
identified by an independent verifier (it is the accelerator's `default_server` block); note that
`app.colaberry.com` is a DIFFERENT system and 404s every `/api/*` path.

- **Expected:** the lifecycle workspace renders. It will look EARLY — every project sits at stage
  `discovery` and no blueprint exists yet. That is the correct starting state.
- **If you still see a yellow box** saying *"Project lifecycle enforcement is not enabled in this
  environment"*, the setting did not reach the running server. Tell me and I will fix it; rollback
  is one line either way.
- **If you see a blank page**, that is a different defect and also worth telling me.

This is the one claim that still needs a logged-in session. Every route is
`requireSection('program')`, so an unauthenticated request returns 401 either way.

**A correction worth your attention.** I first reported that a global guard answers before routing,
reasoning from `/api/health` also returning 401. An independent verifier disproved it: `/api/health`
is not a route at all, so that was a second nonexistent-path observation rather than evidence, and
the real `/health` answers **200 unauthenticated**.

Activation itself IS independently proven — the feature flag was evaluated from the shipped
compiled module inside the live container and returns `true`, and the review workspace route is
present in the live production JavaScript bundle. What remains unobserved is only the rendered page
with real data in it, which is why item 1 is still yours.

### 2. Two PRs are waiting for your merge

Nothing is blocked on them, and nothing in them changes production behaviour today — but one part
IS production code, so this is not a "docs only" merge. Read the three parts below before clicking.

- **PR #3086** — https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3086

  It grew twice overnight, so what it contains is NOT what its first description said. Three parts:

  1. **These Phase 8 documents** and the PROGRESS entries. Documentation.
  2. **Legacy compatibility mode** for the story gate — one production file,
     `storyAuthorization.ts`. Safe to merge because the gate it modifies is still unreachable
     from every caller, so behaviour is unchanged. It is what makes enforcement switchable at
     all: without it, arming the gate would refuse all 62 legacy student builds.
  3. **The corpus baseline and five positive controls** (P7-T1.2, partial). Tests and fixtures.

  The PR body and a follow-up comment describe each part. Nothing in it changes production
  behaviour today.
- No other lifecycle PR is outstanding. #3085 is already merged and deployed.

### 3. One decision, when you have a moment

**Wiring real enforcement.** Activation made the approval screens reachable but **nothing is
refused today**. The gate that requires an approved blueprint before work gets planned exists and
is armed, but the live plan generator never passes it a project id, so it is unreachable. Making
it real is one line.

It must not be done yet. `operating_blueprint_manifests` holds **zero rows** — no blueprint has
ever been approved, because the approval screen was itself behind this flag. Wiring the
requirement before anyone approves a blueprint would refuse **every** student build.

**The sequence is longer than "approve one blueprint", and the live screen is what corrected me.**
Blueprint approval is stage SIX. A project reaches it by walking `discovery` ->
`requirements_ready` -> `process_ready` -> `allocation_ready` -> `design_ready` ->
`awaiting_blueprint_approval` -> `blueprint_approved`. The pilot projects sit at `discovery` with
four unassessed prerequisites and `requirement.approve` as the next actor, so enforcement is not
one click away - it needs one project driven through the machine. Say when, and I will do the
wiring as its own change with its own rollback once a project actually reaches
`blueprint_approved`.

---

## What is true in production now

| | State | Evidence |
|---|---|---|
| Merged | ✅ | PR #3085, 8 of 8 checks green, head `afeb04bb` |
| Deployed | ✅ | `scripts/deploy-prod.sh backend`, prod HEAD = `afeb04bb`, backend answering in 10s |
| **Activated** | ✅ | `printenv ENABLE_PROJECT_LIFECYCLE` **inside the running container** returns `true` |
| Registration working on real traffic | ✅ | 10 projects created 2026-10-13, **10 of 10** got exactly one lifecycle row, 0 orphans, 0 duplicates |
| Database protections | ✅ | `build_plans_one_published_per_project` present by name; `projects` 72 rows, **0 unattributed** |
| Boot clean | ✅ | 467 log lines, **0 fatal**; **2** structured errors in that window, both pre-existing `intel-card-content` noise (I first said 10 — a loose `grep -ci rror` that also matched "0 errors") |
| Workspace shipped and routed live | ✅ | SPA route and API base present in the live production JS bundle; `GET /admin/project-lifecycle/<id>` returns 200 HTML |
| **Activation proven AT THE SURFACE** | ✅ | **2026-10-14, authenticated session.** The page rendered and the API answered with a domain error (*"No lifecycle is registered for that project"*). With the flag OFF the handler returns `disabled()` and the UI shows the yellow "enforcement is not enabled" box. **That box was absent.** A different, domain-specific answer is only reachable past the flag check, so this is the discrimination no unauthenticated probe could make |
| **Workspace rendered with real data** | ✅ | **2026-10-14, authenticated.** The full 13-stage rail renders and matches `LIFECYCLE_STAGES` exactly; stage `discovery` is current, matching the database; the four `discovery` prerequisites are reported as **"Not assessed — nobody has looked at these yet"** rather than as passes; next actor `requirement.approve`. **P8-T4 surface half CLOSED** |
| Enforcement actually refusing | ❌ | By design today. The gate is unreachable from **all three** `decomposeBuild` call sites, none of which passes `projectId`. **P8-T4 is PARTIAL**, not complete |

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
   blocks them. This is also why enforcement must not be wired yet: arming the gate while 62
   projects hold no lifecycle row would refuse every legacy student build on the next deploy.
6. **P8-T4 is PARTIAL.** Its acceptance is "server behavior confirms all entry points enforced",
   and the story-generation entry point is provably not enforced — zero `sbp_story_authorization_*`
   events of any variant since the restart, not even `_skipped`.
7. **A content fingerprint of this release is impossible in principle.** The whole diff is test
   files that `tsconfig.json` excludes from the build, so the compiled output is byte-identical to
   the rollback SHA's. Release identity rests on checkout, build mode and build timestamp, all of
   which were verified end to end.

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
