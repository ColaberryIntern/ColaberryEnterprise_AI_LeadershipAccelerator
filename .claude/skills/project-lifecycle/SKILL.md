---
name: project-lifecycle
description: The front door for creating a governed project. One lifecycle per project, registered at creation and impossible to bypass, with stage prerequisites that refuse rather than warn. Invoke before creating any delivery project, when a project needs to advance a stage, when a blueprint needs approval, when a transition is being refused and nobody can see why, or when asked "why is this project stuck". Hands off to story-build for Basecamp project structure and to build-student-project for student capstones. Code lives in backend/src/services/lifecycle/.
user-invocable: true
---

# project-lifecycle — the governed front door

Every project the platform creates should have exactly one lifecycle record, created with it,
and should not be able to reach implementation without passing the stages in between. This
skill is the entry point for that, and the place to look when a project is refused.

**Nothing here is active yet.** Everything below is behind `ENABLE_PROJECT_LIFECYCLE`, which
defaults to off. Read the status section before assuming a gate is enforcing anything.

---

## Status — what is true right now

| Thing | State |
|---|---|
| Lifecycle schema, stage machine, 13 stages with predicates | Merged, in production |
| Blueprint approval, immutable and with separation of duty | Merged, in production |
| Delivery-project registration (`afterCreate` on the model) | Merged on the Phase 6 branch, **not yet in production** |
| **Student-project registration** | **NOT GOVERNED.** See the blocker below |
| Operator review surface | Deployed to production, **dark** |
| Enforcement (`ENABLE_PROJECT_LIFECYCLE`) | **Off.** Nothing refuses anything yet |

**Merged is not deployed, and deployed is not activated.** Those are three different states and
this table keeps them apart deliberately.

---

## THE BLOCKER YOU HAVE TO KNOW ABOUT

**Student `projects` rows are not governed.** The registration hook lives on the
`DeliveryProject` model, so it covers every delivery-project creation path. There is no
equivalent for student capstone projects, because `projects` has no tenant column and **no table
on its join path has one either** — not `enrollments`, not `programs`, not `cohorts`, not
`users`. 60 tables in this database carry `tenant_id` and `projects` is not among them, so the
hook has nothing to key on.

That work is **P6-T1b**, and it is blocked on one decision: which tenant owns the student build
path. Production has four tenants defined and exactly one in use on delivery projects, and all
62 existing `projects` rows have both an enrollment and a program, so the backfill is a single
constant rather than a join. It needs a human to name the constant.

**Two consequences, and the second one is sharp:**

1. A student project created today has no lifecycle row. Do not describe its output as
   lifecycle-governed, and do not cite a lifecycle stage for it.
2. **Turning on `ENABLE_PROJECT_LIFECYCLE` before P6-T1b lands would refuse every student
   build**, not merely under-enforce the gate. The story-authorization check treats a missing
   lifecycle row as the absence of evidence rather than as approval, which is the only honest
   reading of LC-01 and also means the student pipeline would stop. P6-T1b is a precondition of
   activation, not a desirable precursor.

---

## Creating a governed project

```bash
node .claude/skills/project-lifecycle/scripts/registerGovernedProject.js \
  --kind delivery --tenant <uuid> --engagement <uuid> --name "Acme Intake Automation"
```

`scripts/registerGovernedProject.js` does three things, and the second is the one that matters:

1. Creates **through the `DeliveryProject` model**, never with SQL. Registration is an
   `afterCreate` hook on that model, so the model is the governed path and a raw `INSERT` is a
   bypass.
2. **Verifies the lifecycle row landed**, and exits non-zero if it did not. A hook that was
   removed or never wired would let the creation succeed and register nothing, which is silent
   without this read. The script also refuses if the row carries a different tenant than the one
   requested.
3. **Refuses `--kind student`** by name, citing the blocker above, rather than quietly creating
   an ungoverned project.

The script is proven, not asserted: `backend/src/services/lifecycle/__tests__/projectLifecycleSkill.integration.test.ts`
drives it against a real Postgres, shows the lifecycle row appears, and then **performs an actual
bypass** — injecting a creator that writes raw SQL — and shows the script refuses it. That suite
is the acceptance evidence for this skill. The checks over this document are a separate,
explicitly labelled documentation check and prove nothing about behaviour.

---

## Where this skill ends and others begin

This skill owns **governance**: whether a project exists legitimately, which stage it is in, what
is blocking it, and who acts next. It does not own project structure or student delivery.

| If you want to | Use | Why not this skill |
|---|---|---|
| Turn a requirements doc into a Basecamp build plan with stories, gates and Docs & Files | **`story-build`** | Basecamp structure is its job and its Basecamp integration is unchanged by any of this |
| Stand up one student's capstone through the Student Build Pipeline | **`build-student-project`** | That pipeline is the student path, and until P6-T1b lands it is also the only path for students |
| Turn a question into an evidence ladder of artifacts and approvals | **`evidence-workstream`** | Different output: a document somebody decides from, not a running project |
| Build the whole feature end to end, plan through production verify | **`loop-architect`** | That is the build loop; this is one subsystem inside it |

`story-build` and `build-student-project` keep their current meaning. This skill does not replace
either of them and does not change what they produce.

---

## When a transition is refused

A refusal names a rule and a subject. Read the rule, not the HTTP status.

| Gap kind | Means | What to do |
|---|---|---|
| `unmet` | Somebody looked and found a real problem | Fix the named subject |
| `not_assessed` | **Nobody has looked.** The evidence for this field was not measurable on this read | Find out why it could not be measured. This is NOT a pass |

`not_assessed` blocking is the single most important behaviour in this subsystem. An unmeasured
prerequisite is not a satisfied one, and an earlier draft that made unassessed gaps non-blocking
would have turned every refused transition into an allowed one — caught by an independent plan
audit before any code was written.

Two rules are **advisory**: they surface to a reviewer without refusing the stage.
`release_without_user_visible_workflow` is advisory because a blocking release-shape rule would
retroactively refuse students whose published plans predate the `workspace` field. Everything
else blocks.

---

## Reference

- `references/entry-points.md` — every project creation path, how it is covered, and how that
  list is kept honest.
- Code: `backend/src/services/lifecycle/`. The stage predicates are in
  `lifecyclePrerequisites.ts`; what a predicate is allowed to believe is in
  `lifecycleEvidence.ts` and `lifecycleEvidenceContract.ts`.
- Specification and run record: `.loop-architect/runs/20261001-unified-project-lifecycle/`.
