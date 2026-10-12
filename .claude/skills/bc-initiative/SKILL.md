# bc-initiative — stand up a trackable Basecamp initiative

Creates a Basecamp project whose tickets a Claude Code session can execute **from Basecamp
alone**, and which a human can **track rather than trust**.

Use it when a new multi-week initiative starts and you want the plan, the ownership, the
evidence and the review gates to live outside this chat.

> Sibling skills: `story-build` generates a story plan with the AI Project Architect pipeline
> and publishes it into an **existing** project. This skill **creates** the project and writes
> full-contract tickets by hand. `loop-architect` then executes individual tickets.

---

## The one rule that makes it trackable

**Every ticket ends in a REVIEW STATE and stops. Claude never closes a ticket. Ali closes it
after validating the artifact.**

```
BLOCKED - ALI DECISION REQUIRED
READY FOR ALI REVIEW - DOCUMENT
READY FOR ALI REVIEW - PR OPEN
READY FOR ALI REVIEW - PROD VERIFIED
NOT STARTED
```

If a session finishes early it sets the state and **stops** rather than silently starting the
next ticket. Without this the human has no checkpoint and is reduced to trusting that the work
happened at the rate claimed. With it, every ticket is a visible handoff.

This is the whole point of the skill. Everything below serves it.

---

## The ticket contract

Every ticket body carries all of this. Target **4,000-6,000 characters**; below ~3,000 it is
not executable without asking questions, which defeats the purpose.

**Header block** (one line each)

```
Source of truth: <INITIATIVE> MASTER INDEX — read this before working the ticket.
Canonical folder for this ticket's artifact: <folder> — upload once here, then link.
Initiative: X · Task ID: L1.3 · Priority: P0 · Due: YYYY-MM-DD · Human approver: Ali · Execution mode: Code|Document|Design|Config|Research|Physical|Test
Required skill: /loop-architect (required) | if multi-step | none — human task
Dependencies: L1.2 · Blocks: L5.3
Launch blocker: YES — <date> slips if this slips | no
```

**Sections, in order**

| Section | Rule |
|---|---|
| `OBJECTIVE` | One sentence. The outcome, not the activity. |
| `CONTEXT QUESTIONS` | The 15 questions below, each answered **specifically**. Generic answers are the failure mode. |
| `REQUIRED OUTSIDE RESEARCH` | Only when real. Always paired with the sourcing discipline paragraph. |
| `CLAUDE CODE EXECUTION PROMPT` | A paragraph a session can act on without asking anything. Names what NOT to rebuild. |
| `ACCEPTANCE CRITERIA` | Observable pass/fail bullets. The last one is always the review state. |
| `ARTIFACT` | The durable thing. Named **before** work starts. |
| `ARTIFACT LOCATION` | The canonical folder. |
| `REVIEW STATE` | The four states plus "Never auto-close this ticket." |

### The 15 context questions

1. Why does this task exist now?
2. What launch objective does it serve?
3. Who is affected if it is wrong?
4. What decision or capability should this unlock?
5. What existing capability must be reused rather than rebuilt?
6. What evidence already exists?
7. What evidence is missing?
8. What outside research is required?
9. What is explicitly out of scope?
10. What is the exact artifact that must exist when this task is done?
11. Where will the artifact live?
12. If the artifact is a platform surface, what route and production URL should exist?
13. What signal tells us this task actually worked?
14. **What could make the work misleading or untrustworthy?**
15. What does the approver need to personally review or decide?

**Question 14 earns its place.** It is where the trap goes — the thing that would make the
output look finished while being wrong. "Testing with one viewer, when reconnect only appears
with several." "Quoting a price from memory." "Rendering 0 when collection failed." A ticket
without a real answer here will be completed plausibly and uselessly.

---

## Dates stagger by dependency, never by deadline

**Parking every ticket on the launch date tells a human nothing about what is late.** Walk the
dependency graph backwards from the deadline and give each ticket the date it must finish to
keep its dependents viable.

Two scheduling rules learned the hard way:

- **Physical and procurement tasks go FIRST**, regardless of whether they are the spine.
  Hardware has shipping lead time that no later sprint can compress.
- **The integration spine is the critical path** for everything software. Date it early and
  treat slippage there as slippage of the whole initiative.

---

## Artifact folders

Create one Docs & Files folder per work area, numbered to match the ticket groups. Every ticket
names its folder, and the rule is **upload once, then link** — never re-upload the same
artifact into a second folder, or the next session cannot tell which copy is canonical.

---

## Running it

```bash
# 1. Orient: identity guard, duplicate check, resolve every person id LIVE
DRY=1 node bootstrap.js --orient

# 2. Dry run the whole thing — writes nothing
DRY=1 node bootstrap.js

# 3. Live
node bootstrap.js
```

### Non-negotiables

- **Identity guard.** Fetch `/my/profile.json` and refuse to write unless the token is the
  expected person. A degraded token must halt, never write as someone else.
- **Refuse duplicates.** Scan projects for the name first. A second project of the same name is
  worse than none, because nobody can tell which is authoritative.
- **Resolve every person id live** from `/people.json` (~1,800 people, paginate). Then verify
  each by direct `GET /people/<id>.json`. A substring search is not enough: searching "aleem"
  matched *Abdulhaleem*, a different person.
- **Dry-run, then hand over the live command.** The auto-mode classifier denies bulk Basecamp
  writes as an External System Write. Paste the dry-run plan, then run live on approval. Do
  **not** split the batch to slip under the classifier.
- **Token comes from the CCPP vault**, not the container env — the env copy rotates out every
  ~14 days. Use `refreshBcToken()`; it reads the vault row and writes nothing.
- **No em-dashes** in generated Basecamp content.
- **Comments and documents strip `style=`**, so structure must come from real tags, not CSS.

---

## Migrating work that is already done

A new project must represent the **whole** initiative, not only what remains. For work already
complete:

1. Create the ticket anyway.
2. Add a `MIGRATED COMPLETION EVIDENCE` block citing files, test counts, commit SHAs or a
   production fact.
3. Close it.

**A tick in an older plan is never evidence.** Status is what the repository and production can
prove. Use the evidence-based vocabulary: `VERIFIED_DONE`, `DONE_NEEDS_DEPLOY`, `IN_PROGRESS`,
`NOT_STARTED`, `BLOCKED_EXTERNAL`, `BLOCKED_DECISION`, `DEFERRED`, `SUPERSEDED`.

---

## Required documents

At minimum, authored as **real documents**, never placeholder shells:

- **MASTER INDEX** — the entry point. Mission, repository, the review-state rule, document list,
  artifact folders, task-id scheme, how to choose the next ticket, and the current state stated
  plainly including what is **not** built.
- **READ FIRST operating brief** — session start, source-of-truth hierarchy, governance,
  production safety, external prerequisites, known traps.
- **Architecture / contract document** — what is built and which contracts must not be broken.
- **Migration ledger** — evidence-based status of everything that existed before the project.

Anything you cannot author properly becomes a **ticket to write it**. An empty document is
worse than a ticket, because it looks like coverage.

---

## Verify by reading back

Never report success from the write log. Re-read the project and assert:

- one active todolist, the old one trashed
- group counts and open/done split
- **body character counts** — a ticket under ~3,000 chars is not executable
- document and folder counts
- one full ticket body, eyeballed

---

## Files

- `scripts/bootstrap.js` — orient, dry-run and create. Takes a ticket definition module.
- `references/ticket-template.md` — the contract above as a fill-in template.
