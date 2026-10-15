# Owner testing guide — Unified AI Project Lifecycle

**Status:** specification (P1-T7), **amended 2026-10-09 by Phase 5**. The tests below are defined now so Phases 4-6 build the surfaces they need. **The navigation paths, screenshots and results are filled in at Phase 8, against production.** Nothing in this document is a claim that the feature works yet.

**Phase 5 changed exactly one thing about this document's status: the review surface now EXISTS in production and is switched OFF.** None of the tests below can be run yet. The one check you can do today is in the next section, and it is a check that the feature is correctly inert.

**Who this is for:** the person who owns a project and has to decide whether to approve it. Not the engineer who built this. You should not need to read code, open a log, or ask anyone what a field means.

---

## Where this stands now — ACTIVATED on 2026-10-14

Phase 5 shipped the review surface to production on 2026-10-09 at release `a11961e3c714`. The
workspace lives at:

```
/admin/project-lifecycle/<the project's id>?kind=student    # a student build
/admin/project-lifecycle/<the project's id>?kind=delivery   # a client engagement
```

**It is switched ON.** `ENABLE_PROJECT_LIFECYCLE=true` was set on 2026-10-14 on release
`afeb04bb`, with the DRI's authorisation. Three things are worth separating, because they are
not the same claim:

**What is proven.** The setting is live inside the running backend (read back from the process
itself, not from a config file). The registration half works on real traffic: ten projects were
created in production on 2026-10-13 and **every one of them got exactly one lifecycle record**,
with no duplicates and no orphans. The database protections are in place and were checked by
name.

**What is NOT proven, and is your first job below.** Nobody has yet SEEN the workspace render.
Every page in it requires a logged-in session with program permission, which the build process
cannot create for itself, so Test 1 is genuinely unverified rather than assumed. If it does not
render, that is a real finding and rollback is one line (see the operator runbook).

**What activation does NOT do, stated plainly so you are not misled.** It does not yet refuse
anything. The gate that would require an approved blueprint before work gets planned is built,
but it is not wired into the live plan generator, so **no build will be blocked today**. That
is deliberate sequencing, not an oversight: no blueprint has ever been approved in production
(the approval screen was itself behind this setting), so switching the requirement on first
would have refused every build in the system. Approve a blueprint through the now-reachable
screen first; wiring the requirement is the next, separate change.

### Start here — the two-minute check

Open the URL above for any project. **You should now see the lifecycle workspace**, not a yellow
box.

If you still see a yellow box reading *"Project lifecycle enforcement is not enabled in this
environment"*, the setting did not reach the running server and nothing else in this guide will
work. That is the single most useful thing you can tell us.

If you see an **empty page**, or a page that looks like a project with nothing in it, that is a
different defect and also worth reporting — a blank screen and a switched-off feature are
indistinguishable to a reader, and a great deal of care went into making sure you never have to
guess which one you are looking at.

Expect the workspace to look EARLY. Every project in the system is at the first stage
(`discovery`) and no blueprint exists yet, so there is nothing approved to show. That is the
correct starting state, not a loading failure.

### What cannot be tested yet, and why — so you are not left wondering

| | |
|---|---|
| Tests 1-8 below | Now runnable. Test 1 first: if the workspace does not render, stop and say so. |
| Screenshots | None were captured. The capture tool was not installable in the working copy where Phase 5 was built without damaging a parallel piece of work. The existing production screenshot process can do it now that the surface is deployed. |
| How it looks on a phone | Checked structurally — nothing fixes a pixel width and every row of controls is allowed to wrap, and three rows that would have overflowed were found that way and fixed. But **nobody has looked at it on a phone.** Those are different claims. |

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

**You should see,** after the material edit: downstream work that is now stale is **blocked**, not
quietly allowed to proceed on the old approval. Approving against a superseded version is refused
outright.

**WHAT IS NOT BUILT, so you do not report it as a bug.** The *selective* half of this is absent.
You will NOT get a list of exactly which requirements, tasks, agents, policies, screens, stories
and tests are affected, and you will not be asked to re-approve only those. That half is recorded
as an open item (LC-11, PARTIAL) and is deferred to a later change. What exists today is the
blocking half, which is the half that protects you from shipping against a stale approval.

**Failure looks like:** a typo forcing full re-approval; or — the serious one — downstream
planning continuing against the superseded version. A material change producing no itemised
impact list is the known gap above, not a new failure.

_Phase 8 fills in: exact navigation path, screenshot of the impact list._

---

## The Phase 8 answers

**The path to the workspace** is `/admin/project-lifecycle/<the project's id>?kind=student` for a
student build, or `?kind=delivery` for a client engagement. **Getting that wrong does not look like
an error in the feature**: the server answers "No lifecycle is registered for that project", which is
correct for the kind you asked about and misleading if you meant the other one. Every project in
production today is a student project. The path is on
the normal application host. The host is deliberately not written into this file, because the
repository is public.

**Is every new-project entry point enforced?** No, and here is the exception named plainly.
REGISTRATION is universal: the hook sits on the project model itself rather than on a list of
call sites, so every path that creates a project gets a lifecycle record, including paths added
after the hook was written. That was a deliberate choice after the original list of call sites
turned out to be wrong within a week. But ENFORCEMENT — refusing to plan work without an
approved blueprint — is not yet wired into the live plan generator. Nothing is refused today.

**How do projects that existed before behave?** They keep working, untouched. 62 projects
predate the hook and have no lifecycle record; they are not retrofitted and nothing blocks them.
The 10 created since all have one.

**Known limitations.**

- The itemised reapproval impact list is not built (LC-11, see Test 6).
- The delivery-project path has never run in production: 4 such projects exist and all predate
  the hook, so that half of registration is live but unexercised.
- One security refusal (an authenticated conflict response) has still not been observed in
  production, because observing it needs an admin token the build process cannot mint.
- No screenshots have been captured, and nobody has viewed the workspace on a phone.

**How to roll back, and who does it.** Rollback is removing one line of configuration and
restarting the backend; it never re-opens an ungoverned path, because registration does not
depend on the setting. Full detail is in `operator-runbook.md` next to this file.

---

## Test 7 — A deliberately manual project

*Added with Phase 3. Use a project where the work is meant to stay human — a legal review, an
admissions decision, anything you would not hand to software.*

1. Open the allocation view.
2. Read every row.

**What you should see:** every task marked as done by a person, and **a reason on each one**. Not
"assigned to a human" — a reason, in words, for why this particular work stays with a person.

**What should worry you:** rows that say something like *"derived from the human performer
assignment"*. That is the system restating its own structure back at you, not a decision anybody
made. If you see it, the project has an allocation but nobody has said why.

3. Find the automation percentage.

**What you should see:** 0%, stated plainly, **with a note recording that you accepted it and
why**. A deliberately manual project is 0% automated and that is the right answer, not a failure.

**What should worry you:** a percentage above 0 on a project you believe is entirely manual, or
a 0% with no accepted reason attached. The first means something was classified as automated that
you did not agree to; the second means the shortfall was never put to anyone.

---

## Test 8 — Ask for the same blueprint twice

*Added with Phase 3. This checks that re-running generation does not look like losing your work.*

1. Note the project's requirement list.
2. Ask for the blueprint to be regenerated, without changing anything.
3. Compare the requirement list.

**What you should see:** the same requirements, unchanged, with no warning about anything being
lost or added.

**What should worry you:** a report that requirements were lost and an equal number invented.
Nothing was lost — it means the system stopped recognising its own earlier work, and a real loss
would be invisible among the false ones.
