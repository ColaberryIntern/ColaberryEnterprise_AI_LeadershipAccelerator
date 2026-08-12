# Closing the build loop: idea → plan → repo → progress → points

**Date:** 2026-08-12 · **Session:** CC-20260809-b7k2 · **Status:** plan, not built

Four things currently exist as separate pieces. This is how they become one loop.

---

## 1. Where we actually are

| piece | state |
|---|---|
| Idea → ten dynamic questions | **built today.** Generated per idea, priority-ordered angles, tier-scaled 5/7/10 |
| Questions → requirements → releases → stories → prompts | **built.** Gate-enforced, 10/12 gate pass measured |
| Plan → student's GitHub repo | **built.** `repoWriter` writes docs + `CLAUDE.md` + `.colaberry/{plan,manifest,progress}.json` in one content-hash-idempotent commit |
| Student's repo → back to the platform | **not built.** No webhook, no reconciliation. `.colaberry/progress.json` is written and never read again |
| Build work → points | **not built.** SBP touches no points code at all. Students earn points for curriculum cards and nothing for building |
| "Here's your AI system" diagram | **built, but fake.** Client-side mad-lib with two hardcoded tools and two hardcoded guardrails |

The loop is open in exactly one place: **nothing comes back from the student's repo.** Everything downstream of that — progress, points, the diagram staying true — is blocked on the same missing return path.

---

## 2. The return path: `.colaberry/progress.json` is the contract

We already write this file. Making it the two-way contract is the smallest change that closes the loop.

```
platform ──(publish)──> repo: docs/, CLAUDE.md, .colaberry/plan.json, progress.json
                          │
student + Claude Code ────┤ builds a story, updates progress.json, pushes
                          │
platform <──(webhook)─────┘ reads progress.json, verifies, marks done, awards points
```

**Why this file and not commit parsing or CI output:** it is explicit, it is already ours, it is diffable, and the student's own Claude Code can be *instructed* to maintain it — which makes the prompt wording the sync mechanism rather than a scraper we have to keep repairing.

### Three signals, in order of trust

| signal | what it proves | failure mode it covers |
|---|---|---|
| **1. `progress.json` on push** | the student *claims* a story is done | primary path; instant |
| **2. CI checks green** | the story's tests actually pass | a claim with no working code |
| **3. Reconciliation poll** | the repo's real state | a missed or misdelivered webhook |

A story is **complete** only when signal 1 and signal 2 agree. Signal 3 runs on a schedule for any repo whose last webhook is older than its last commit.

This is also the answer to gating "mark done" on GitHub checks — the same mechanism.

---

## 3. The student's CLAUDE.md is where the protocol lives

We already generate it (`renderDocs.renderClaudeMd`) and it already carries the doctrine that matters — walking skeleton first, explicit timeouts, idempotent side effects. It is a scaled-down descendant of this repo's own `CLAUDE.md`, which is the right lineage.

**What it is missing is the loop.** Three additions:

1. **The progress protocol.** When a story's acceptance criteria pass, update `.colaberry/progress.json`: set the story's `status` to `complete`, stamp `completed_at`, and list the commit that did it. Never edit another story's entry. Never mark complete without the acceptance criteria actually passing.
2. **The boundary.** `docs/**` and `.colaberry/plan.json` are platform-owned and regenerated on republish — do not hand-edit them; if a requirement is wrong, say so in the story's notes and it will be fixed upstream. `.colaberry/progress.json` is the one file the student's side owns.
3. **The verification contract.** Each story names the command that proves it (`npm test -- STORY-004` or equivalent). CI runs exactly that.

This is the highest-leverage single change in the whole plan: **the sync mechanism is a paragraph of prompt, not a subsystem.**

---

## 4. The diagram: a projection of the plan, in the project interior

Decision taken: it belongs **after the plan exists**, not in the wizard. Before the build there is nothing real to draw, which is exactly how the current fake came to exist.

Everything it needs is already in the plan:

| diagram element | comes from |
|---|---|
| input systems | `CONSTRAINT` requirements (the real named systems) |
| the decision node | the judgement angle (q6 of the interview) |
| guardrail badges | `SAFE` requirements, verbatim |
| the human-approval gate | the guardrail angle — already gate-enforced via `r0_no_trust_spine` |
| the uncertainty branch | the "when it is not sure" angle |
| what an operator sees | the "earning autonomy" angle |
| release bands | `plan.releases`, with completed stories shaded from `progress.json` |

Because it is rendered *from* the plan, "build this structure" is automatically true — the structure is the thing they are building. And as stories complete, the diagram fills in. It becomes a progress view, not a poster.

**Interim:** the current `ToolPreview` should be removed from `ProjectsPage` before more students see it. It is the same class of artifact the intake rebuild just deleted from step 3.

---

## 5. Points

### The fairness problem to avoid

Points must not scale with how verbose a plan happened to be. Two students building comparable systems, whose plans came out at 8 and 15 stories, must be able to earn the same amount. Otherwise the incentive is to generate more tasks, not to build better.

**So: a fixed points budget per tier, divided across that plan's stories.**

| tier | build-points budget | typical stories | ≈ per story |
|---|---|---|---|
| workflow | 300 | 6–9 | 40 |
| project | 600 | 10–14 | 50 |
| autonomous | 1000 | 14–20 | 60 |

Budget is set by the tier the student chose — a real decision with a real reward attached — and division is by story weight, so a hard story is worth more than a trivial one within the same plan.

### Weighting inside the budget

| weight factor | why |
|---|---|
| base share | every story earns something |
| ×1.5 if it is the r0 trust-spine story | it is the hardest and the most valuable thing they build |
| ×1.25 if it carries a `SAFE` requirement | the guardrail work is what makes the system trustworthy |
| ×1.25 if it is the standout story | rewards the ambition the interview asked for |

Weights are computed once at publish and stored on the task, so a republish cannot silently re-price work already done.

### When points are awarded

**On verified completion only** — signals 1 and 2 agreeing. Not on claiming, not on pushing. This is the difference between a points system that measures building and one that measures typing.

Awarded through the existing ledger (`StudentPointsEvent` via `pointsService`), keyed on `(enrollment, story_id)` so a re-push cannot double-award — the idempotency rule this repo already enforces everywhere else.

Build work should also feed **`builder_xp`** through `evidenceEngine`, which is what the band ladder reads. Right now a student can complete an entire capstone and their build competency band does not move.

---

## 6. Sequencing

Each phase is independently shippable and useful on its own.

| phase | what lands | unblocks |
|---|---|---|
| **A** | Delete the fake `ToolPreview`. Extend the student `CLAUDE.md` with the progress protocol, the ownership boundary, and the verification contract | everything — the protocol has to exist in repos before anything can read it back |
| **B** | Webhook route + `progress.json` reader + reconciliation poll. Bot-authored commits already carry a prefix so the loop cannot feed itself | progress, points, the live diagram |
| **C** | CI workflow written into the student repo; `mark done` gated on checks green | trustworthy completion |
| **D** | Points: weights at publish, award on verified completion, `builder_xp` to the band ladder | the incentive actually connects to building |
| **E** | The diagram in the project interior, rendered from plan + progress | the visible payoff |

A before B is not negotiable: repos need the protocol in their CLAUDE.md before there is anything meaningful to read back.

---

## 7. Open decisions

1. **Points budgets.** 300 / 600 / 1000 above are placeholders chosen to sit sensibly against curriculum card points. They should be set against the real curriculum totals so a capstone is worth what you intend relative to coursework.
2. **What CI runs** for a student project whose stack we do not control. Options: a generic "does `npm test` pass" workflow, or ask for the test command in the interview. The second is more reliable and costs one more question.
3. **Whether a student can mark a story done without CI**, for projects where tests are impractical. Recommend yes, with an explicit "self-attested" flag that earns reduced points and is visible to staff.
4. **Republish semantics.** When a plan is regenerated after work has started, completed stories are already preserved. Whether *points* for a story that later disappears from the plan should be clawed back — recommend no.
