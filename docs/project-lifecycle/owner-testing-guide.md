# Owner testing guide — Unified AI Project Lifecycle

**Status:** specification (P1-T7). The six tests below are defined now so Phases 4-6 build the surfaces they need. **The navigation paths, screenshots and results are filled in at Phase 8, against production.** Nothing in this document is a claim that the feature works yet.

**Who this is for:** the person who owns a project and has to decide whether to approve it. Not the engineer who built this. You should not need to read code, open a log, or ask anyone what a field means.

---

## Before you start

You will need: a login with project-owner permission, and a test project you do not mind throwing away. The guide tells you to create one in step 1.

If a step does not behave as described, that is a real result worth reporting — write down which step, what you saw, and roughly when. "Step 4 let me approve it twice" is a complete and useful bug report.

---

## Test 1 — Create an idea and watch it register

**What you are checking:** that a brand-new project enters the lifecycle automatically, and tells you where it stands.

1. Create a new project the way you normally would.
2. Open it.

**You should see** a header naming the current stage (the earliest is "discovery"), what is missing before the next stage, what happens next, and **who** has to do it. If something has gone wrong, you should see a recoverable error rather than a blank panel.

**Failure looks like:** a project with no stage at all, a stage that says it is ready when nothing has been reviewed, or a header that shows a technical error code instead of a next action.

_Phase 8 fills in: exact navigation path, screenshot._

---

## Test 2 — Inspect the AI / software / human split

**What you are checking:** that the system is honest about what AI will actually do.

1. From the project, open the allocation view.
2. Read the percentages, then read what sits next to them.

**You should see** three separate figures — what AI does, what deterministic software does, and what remains human work — and beside every percentage, **how much of the work was actually assessed**. Tasks nobody has measured should say so ("unknown"), not show a zero.

**This is the step most worth being suspicious on.** A single confident "85% automated" with no denominator is exactly the thing this system is built not to produce. If you see a precise number with no coverage figure beside it, that is a defect.

**You should also see** that any task an AI performs has a **named human** who is accountable for it. An agent is never accountable for itself.

**Failure looks like:** one headline percentage with no coverage; a high-stakes human decision reclassified as fully automated; an AI task with no human owner.

_Phase 8 fills in: exact navigation path, screenshot._

---

## Test 3 — Compare the design alternatives

**What you are checking:** that you are choosing between genuinely different options, not three coats of paint.

1. Open the design decisions for the project.
2. For a decision offering alternatives, open each one and click through it.

**You should see** between two and four options that differ in **how you navigate and interact**, not just in colour or label — and each should use your project's real content, not placeholder text. You should be able to walk five situations: the normal success path, an approval, a rejection or revision, a case where the AI result was uncertain or failed, and a human taking over.

**You should be able to tell** which option is recommended and why.

**Failure looks like:** alternatives that are visually different but behave identically; placeholder or lorem-ipsum content; an option you cannot actually click through.

_Phase 8 fills in: exact navigation path, screenshots of each alternative._

---

## Test 4 — Approve the blueprint

**What you are checking:** that approval means something specific and cannot be faked.

1. Review the blueprint.
2. Approve it.
3. Note what the confirmation says.

**You should see** that your approval is recorded against **an exact version** of the blueprint, with your name, your role, the time, and the design option you selected.

Then try these three things, each of which **should be refused**:

| Try this | Expected |
|---|---|
| Approve the same version again | You are told it is already approved, showing the **original** approver and time — not re-stamped with yours |
| Approve a version that has since been superseded | Refused, saying the version moved on |
| Approve something you yourself proposed | Refused — the person who proposes cannot be the person who approves |

**Failure looks like:** approval succeeding twice with your name overwriting the first approver; approving a stale version silently; being allowed to approve your own proposal.

_Phase 8 fills in: exact navigation path, screenshot of the approval record._

---

## Test 5 — Inspect the traced releases and stories

**What you are checking:** that the work that got planned is the work you approved.

1. Open the releases and stories for the project.
2. Pick any story and look at what it links back to.

**You should see** each story carrying the requirement it serves, the business task it implements, the workspace or action where it appears (or a clear note that it runs in the background), and the blueprint version it was derived from. Picking a requirement should show you the stories covering it.

**You should also be able to confirm** that nothing you marked as a must-have is missing, and that no story exists which serves nothing.

**Failure looks like:** a story with no requirement behind it; a must-have requirement with no story; a story referencing a blueprint version other than the one you approved.

_Phase 8 fills in: exact navigation path, screenshot of a traced story._

---

## Test 6 — Make a material edit and watch reapproval trigger

**What you are checking:** that changing something important does not quietly leave approved work behind, and that changing something trivial does not force you to re-approve everything.

1. Make a **cosmetic** edit — fix a typo in a description.
2. Check the approval state.
3. Now make a **material** edit — change a requirement, a design selection, or who is accountable for something.
4. Check the approval state again.

**You should see,** after the typo: nothing invalidated. You are not asked to re-approve.

**You should see,** after the material edit: a list of exactly what is now affected — which requirements, tasks, agents, policies, screens, stories and tests — and a request to re-approve **only those**. Work that did not depend on what you changed should keep its existing approval.

**You should also see** that downstream work which is now stale is **blocked**, not quietly allowed to proceed on the old approval.

**Failure looks like:** a typo forcing full re-approval; a material change invalidating nothing; or — the serious one — downstream planning continuing against the superseded version.

_Phase 8 fills in: exact navigation path, screenshot of the impact list._

---

## What this guide will also tell you at Phase 8

- The production URL and the exact path to the lifecycle workspace.
- Whether **every** new-project entry point is enforced, and any exception named plainly.
- How projects that existed before this feature behave.
- Known limitations.
- Who to call and how to roll back, in the operator runbook.
