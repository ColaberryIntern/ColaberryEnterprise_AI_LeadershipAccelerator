# Separating readiness from approval

**Status:** DESIGN, for the DRI's decision. No code written.
**Author session:** CC-20261021-h9v3, 2026-10-22.
**Decision requested:** approve, amend, or reject the split in §3, and answer the two questions in §8.

---

## 1. The problem, from the code rather than from theory

One act does two jobs today. `requestTransition` checks that a stage's prerequisites are
satisfied AND requires the caller to hold `STAGE_PERMISSION[to]`. There is no way to express
"this is ready" without also being the person who authorizes it, and no way for the system to
tell anyone that something is ready.

The measurable consequence, in production on 2026-10-22:

| | |
|---|---|
| Lifecycle rows | 19 — 14 student, 5 delivery |
| Rows past `discovery` | **0** |
| Of the 14 student rows, how many already have a published plan | **10** |
| Student projects with no lifecycle row at all | 62 (54 live, 8 archived) |
| Of those 62, how many already have a published plan | **47** |

So the lifecycle knows about 19 projects and has never moved one. Ten of them have shipped a
plan to a student while their lifecycle record still says `discovery`. The registration hook is
flawless — 14 of 14 projects created since 2026-10-13 have exactly one row — but the stage is
inert, because advancing it has always required a human to go and click, and nothing tells them
there is anything to click.

**The evidence layer is not the blocker.** All four prerequisites for the first hop —
`requirementCount`, `requirementsWithoutProvenance`, `uncitedRequirementSourceBlocks`,
`unresolvedSourceBlocks` — are already in `EVIDENCE_MEASUREMENTS` and assess correctly. Nine of
roughly twenty-nine evidence fields are measured; the first hop happens to need four that are.

## 2. Why "just automate it" is not available

The obvious implementation — give a system identity the permissions and let it walk the chain —
is forbidden, and not by taste. `CLAUDE.md` and the claim register both state that **no approval
may be recorded under an AI identity**, and `approval-and-change-policy.md` requires that an
approval record carry "the actor (a real authorized human identity) and the role that authorized
them". `blueprintApproval.ts` already implements that faithfully: `approved_by`,
`approved_by_role`, and a `content_sha256` fingerprint of what was approved.

A system actor holding `contract.approve` would make all of that a formality. That option is
rejected, permanently, and this document does not revisit it.

## 3. The proposal: read the permission table as it was written

`STAGE_PERMISSION` already distinguishes three kinds of act, and the distinction is the design.
Twelve forward hops carry the chain from `discovery` to `operating`:

| Hop (target stage) | Permission | What the permission MEANS |
|---|---|---|
| `requirements_ready` | `requirement.approve` | **approve** |
| `process_ready` | `architecture.approve` | **approve** |
| `allocation_ready` | `agent.approve` | **approve** |
| `design_ready` | `design.approve` | **approve** |
| `awaiting_blueprint_approval` | `project.write` | *do the work* |
| `blueprint_approved` | `contract.approve` | **approve** |
| `planning` | `story.write` | *do the work* |
| `plan_ready` | `story.review` | **review** |
| `building` | `story.execute` | *do the work* |
| `release_review` | `story.review` | **review** |
| `launch_ready` | `release.approve` | **approve** |
| `operating` | `release.deploy` | *do the work* |

Six are approvals. Two are reviews. **Four describe performing work** — writing a plan, writing
stories, executing them, deploying a release — and the build pipeline is the thing that performs
exactly those acts. The code already says as much where it notes that entering
`awaiting_blueprint_approval` is "submitting FOR approval, not approving — deliberately a write,
not an approve."

**The proposal, in one sentence:** the pipeline may advance a hop whose permission describes work
it actually performed, and may never advance a hop whose permission is an approval or a review.

That yields:

- **4 hops become automatic**, attributed to the pipeline as the *performer* of a recorded act.
- **8 hops stay human** — six approvals, two reviews — unchanged, same CAS, same actor and role.
- **Nothing is ever recorded as an approval by a non-human.** The pipeline writes a different
  kind of record, described next.

## 4. The readiness record

A new table, `lifecycle_stage_readiness`, one row per (project, target stage, measurement):

| Column | Why |
|---|---|
| `target_stage` | the hop this readiness is about |
| `satisfied` | boolean, the result of `satisfied(prerequisiteGaps(...))` |
| `gap_count`, `gaps` | the blocking gaps, so a human sees WHY it is not ready |
| `evidence_sha256` | fingerprint of the evidence the measurement read |
| `measured_at` | when |
| `measured_by` | a labelled system identity — never a person, never a role that can approve |
| `performed_act` | null, or the work permission the pipeline exercised (`story.execute`, …) |

Two properties this shape buys:

**Staleness is detectable.** An approval granted while `evidence_sha256` was X can be compared
against the current fingerprint. That is the same mechanism `blueprintApproval.ts` already uses
via `content_sha256`, and it feeds the `needs_reapproval` condition the stage machine already
defines for exactly this case.

**A human sees a queue, not a form.** "Three projects are ready for your `requirement.approve`;
two are blocked on provenance" is derivable from this table. Today nobody can know either thing.

## 5. The safety property, and how it gets proven

> **Readiness must never be sufficient to advance a stage.**

A bug in readiness computation must be incapable of moving a project. `requestTransition` keeps
its permission check unchanged; readiness is an input to the UI and to the automatic path for
*work* hops only.

The test is a mutation, not an assertion: **force every readiness row to `satisfied = true` and
show that an approval-gated stage still refuses to advance without a human actor.** If that
mutation ever advances a stage, the separation has failed and the feature is not shippable. This
is the control the whole design rests on, and it is the first thing I would write.

Two further controls:

- **A no-op control.** With the feature flag off, zero readiness rows are written and zero stages
  move. Measured by count, not by inspection.
- **Idempotency.** Computing readiness twice for an unchanged project produces one row's worth of
  state, and advancing twice advances once — the `ADVANCE` CAS already gives the second caller
  zero updated rows, and the test should prove that rather than assume it.

## 6. What this does NOT buy

**It does not reduce the number of human acts from eight.** A project still needs six approvals
and two reviews to reach `operating`. What changes is that each one becomes a one-click
confirmation of something already measured, instead of an investigation nobody starts.

If the goal is "projects progress without me", this design is necessary but not sufficient, and
the remaining question is a policy one: **are all six approvals genuinely required, or are some
of them ceremony?** That is a separate decision, it is the DRI's, and it should be taken on
evidence — after this exists, the readiness table will show how long each gate actually sits
waiting, which is the right input to that conversation.

## 7. The payoff for the 62 legacy projects

Once readiness is computable, the backfill stops being a guess. For each of the 62 unregistered
projects, readiness can be measured at every stage *without writing anything*, producing the
honest answer to "where would this project be if someone had been approving all along?" — and
47 of them already have a published plan, so the answer will not be `discovery`.

That turns the backfill from "insert 62 rows at a stage we picked" into "insert 62 rows at the
stage the evidence supports, with the fingerprint that justified it". It also means the gate can
eventually be armed without refusing legitimate work, which is the thing currently blocking it.

## 8. Questions I need answered

**Q1. Is the work/approve/review split in §3 right?** Specifically: should `operating`
(`release.deploy`) really be automatic? It is a work permission by the table, but "the project is
now live" may be a moment you want a human to own regardless. I would default to automatic for
consistency with the table and flag it as the one I am least sure of.

**Q2. Flag or no flag?** I would ship behind `ENABLE_LIFECYCLE_READINESS`, default off, because
it writes to governance state. The cost is that it then needs a second decision from you to turn
on, which is how the SAFE-002 and source-overflow items have ended up parked.

## 9. If approved, the order of work

1. The readiness table and the pure computation, with the §5 mutation control first.
2. Readiness on build events — plan published, intake saved, tasks materialised — idempotent.
3. The four automatic work hops, each refusing to fire without a recorded `performed_act`.
4. Readiness surfaced in the existing workspace, so the eight human gates become one click.
5. The legacy measurement from §7 — read-only, no writes — as its own reviewable artifact.

Each step carries its own acceptance evidence and none of them arms the enforcement gate; that
remains a separate decision.
