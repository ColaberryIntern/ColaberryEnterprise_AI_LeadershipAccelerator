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

## 5. Points — corrected after reading the actual economy

An earlier draft of this plan proposed "300 / 600 / 1000 points per tier". **That was wrong in
both the currency and the magnitude.** What the system actually has:

| currency | table | what it drives | ceiling |
|---|---|---|---|
| **Points** | `student_points_events` | the HUD total and leaderboard | ladder is **0 / 150 / 400 / 900**, and points alone can **never** exceed "AI Enabled" |
| **builder_xp** | `XpEvent` stream `builder` | the build side of progression | awarded **only** by the evidence engine |
| **Competency** | `student_competency` | `evidence_count` + `confidence` per domain | what actually promotes someone to **AI Builder / AI Architect** |

So 600 "points" for one capstone would have been two thirds of the entire points ladder, in a
currency that structurally cannot reach a build band. The build bands are **evidence-gated**, and
evidence is the currency this repo already says progression runs on.

### The right integration already exists and is not wired

`evidenceEngine.recordEvidence()` takes `source: 'github_commit'`, a `sourceRef` documented as
"commit sha", is idempotency-keyed, awards `builder_xp` from `points_config`, and contributes
weighted competency signal. Its own header says *"used by GitHub sync too."*

`githubEvidenceService` already exists to feed it — and **nothing calls it.** It also counts
*commit days*, which rewards showing up rather than shipping.

**So: a completed, test-verified story becomes one evidence record**, keyed on the commit that
completed it. That single call awards builder_xp, moves competency, and cannot double-count on a
re-push. No new ledger, no new table.

### Calibration against what exists

Current `builder_xp` per card type: `implementation_task` **80**, `artifact_submission` 60,
`mock_interview` 60, `prompt_challenge` 50, `prompt_lab` 40, `deep_dive` 10.

A capstone story is at least as much work as an `implementation_task`. Add new `points_config`
rows — `capstone_story`, `capstone_release`, `capstone_shipped` — so the numbers live **in the
database and are tunable without a deploy**, exactly like every other card type.

### The fairness control still applies

The same project produced **8 to 15 stories** across repeated runs. That spread is noise, not a
measure of ambition, so per-story XP must not be flat or a chattier plan out-earns a concise one.

Normalise: **a fixed builder_xp budget for the capstone, divided across that plan's stories**,
weighted ×1.5 for the r0 trust-spine story, ×1.25 for stories carrying a `SAFE` requirement, and
×1.25 for the standout. Weights computed once at publish and stored on the task, so a republish
cannot re-price work already done.

### When it is awarded

On **verified** completion only — the progress file and CI agreeing. Not on claiming, not on
pushing.

---

## 5b. Do we still need the three tiers?

Probably not as an **upfront question**. The tier currently sets the interview length (5/7/10) and
the plan targets. But it asks the student to size something they have not thought about yet, and
the interview answers predict size far better than the guess does:

| signal from the interview | what it implies |
|---|---|
| count of distinct systems named | integration surface |
| runs unattended vs. always human-approved | autonomy depth |
| volume, now and at peak | reliability work |
| whether the uncertainty path needs its own escalation route | extra slices |
| breadth of the standout | ambition |

**Proposal: derive the size, then let them confirm it.** Run the interview, compute a suggested
tier from the answers, and show it *after*: "This looks like a full project — about 12–16 tasks.
Scale down to a workflow, or up to autonomous." The system does the sizing; the student keeps the
commitment decision, which is the only part that was ever really theirs.

This also removes the current oddity that a student picks their tier before being asked a single
question about their project.

---

## 6. The business translation problem

The hardest gap is not technical. A student receives requirements, stories and prompts — all
engineering artifacts — and never has to articulate *why any of it is worth building*. They can
finish the capstone and still not be able to explain it to a stakeholder.

Four things, all derived from material the plan already holds:

**a. The one-pager, generated.** Problem, who it is for, the measure and today's number, the
guardrail, what is deliberately out. Every field already comes from the interview. Written into
their repo as `docs/BRIEF.md` and shown in the dashboard. This is the artifact they would hand a
manager, and they did not have to write it — they have to *defend* it, which is the skill.

**b. A decision log — the open ones, in business terms.** The plan implies decisions the student
never consciously made. Surface them:

> You said nothing over $200 is scrapped without review. At 300 returns a day that routes roughly
> 12 items to a person daily. Is $200 the right line, or is it $500?

These are generated from the answers plus the plan, and each one is a real trade with a real cost.
This is the single highest-value piece for the translation problem: it forces the student to make
business calls, not just implement.

**c. Value framing per release.** Every release already carries a `demo`. Add what it is worth,
tied to their own measure: r0 is "proves it works end to end"; the release containing the
prediction story is "this is where 18% → 12% starts moving". They see which work moves the number.

**d. Let their Claude Code draw the system.** Instruct it in their `CLAUDE.md`: after finishing a
release, update `docs/ARCHITECTURE.md` with a Mermaid diagram of what now actually exists. We
render it in the dashboard. It stays current because the thing that changes the code also changes
the diagram, and it is *their* system explaining itself rather than our mockup of it.

(d) is the same pattern as the progress protocol: the mechanism is a paragraph of prompt, not a
subsystem.

---

## 6b. On tests

Staff should not be doing manual verification — that was the wrong suggestion. **Tests are the
gate, full stop.** Two consequences:

- The interview should capture how this project proves itself (one more question, or folded into
  the trigger angle). For most student projects that is `npm test`; for some it is not.
- The story prompt must instruct their Claude Code to write the test **alongside** the code, from
  the acceptance criteria that are already on every story. The acceptance criteria are already
  Given/When/Then — they are tests that have not been written down yet.

No self-attestation, no staff review queue.

---

## 6. Sequencing

Each phase is independently shippable and useful on its own.

| phase | what lands | unblocks |
|---|---|---|
| **A** | Delete the fake `ToolPreview`. Extend the student `CLAUDE.md` with the progress protocol, the ownership boundary, and the verification contract | everything — the protocol has to exist in repos before anything can read it back |
| **B** | Webhook route + `progress.json` reader + reconciliation poll. Bot-authored commits already carry a prefix so the loop cannot feed itself | progress, points, the live diagram |
| **C** | CI workflow written into the student repo; `mark done` gated on checks green | trustworthy completion |
| **D** | Evidence on verified completion: one `recordEvidence` call per story, `points_config` rows for capstone types, weights stored at publish | competency and the band ladder finally move when someone builds |
| **E** | The business layer — generated one-pager, decision log, per-release value framing — plus the architecture diagram their own Claude Code maintains | the translation problem, and the visible payoff |

A before B is not negotiable: repos need the protocol in their CLAUDE.md before there is anything meaningful to read back.

---

## 7. Open decisions

1. **The capstone builder_xp numbers.** The mechanism is settled; the values are not. Benchmark is `implementation_task` at 80. These belong in `points_config` so they are tuned in the database, not in a deploy.
2. **Whether the tier question survives** as an upfront choice, becomes a post-interview confirmation (recommended, §5b), or disappears entirely.
3. **Republish semantics.** Completed stories are already preserved across a republish. Whether evidence for a story that later vanishes from the plan should be revoked — recommend no; the work was really done.
4. **Where the business layer lives** — the PM dashboard, the project interior, or both. §6 assumes the dashboard.
