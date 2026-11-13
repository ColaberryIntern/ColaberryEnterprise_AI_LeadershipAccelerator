# CC-20261109-k2w7 — MR5: the release gate runbook

**Date:** 2026-11-12
**Branch:** `workstream/mr4-maya-welcome-audience-and-delivery` off `origin/main` @ `031db3b5c`
**Ticket:** MR5, https://3.basecamp.com/3945211/buckets/7463955/todos/10503714732
**Run:** `.loop-architect/runs/20261112-maya-release-ladder/` (gitignored)

> **Scope note from the ticket:** *"This ticket writes and verifies the ladder. It does not climb
> it. Flipping `GROWTH_JOURNEY_EXECUTION_ENABLED` and activating a journey programme stay Ali's
> decisions."* Nothing was flipped, activated, promoted or written.

## What was written

**`docs/maya/MAYA_RELEASE_GATE.md`** (371 lines) — the cross-layer ordered ladder, and a
`sendEmail` section appended to the existing **`MAYA_PROMOTION_CHECKLIST.md`** in that document's
own per-capability format.

**It is a new document rather than an extension**, because a good one already existed and covered
a different layer. `MAYA_PROMOTION_CHECKLIST.md` owns how one capability moves shadow → live: the
routes, the authorization rules, the promote → verify → revert → verify cycle. It says nothing
about the journey engine, the agent rows, the env flags or the rollout control, which is the half
MR5 asked for. Duplicating it would have guaranteed drift, so the two now cross-reference each
other and each states what it does **not** cover.

## The shape

**Fifteen rungs**: eleven on the engine, four on Maya herself. Thirteen are actions; **two are
reading what the previous rung produced**, and the document says plainly that those two are the
ones most likely to be skipped. Each rung names its **owner**, the **evidence** it worked, and the
**way back**. Rungs 1-10 are reversible and observable. Rung 11 is marked
`IRREVERSIBLE IN EFFECT` and is last, because the flag unsets cleanly and a message that has
reached somebody does not.

### The correction is the first thing a reader meets

The document leads with it, before any rung: **"the advice 'turn on
`GROWTH_JOURNEY_EXECUTION_ENABLED` and see what happens' is wrong, and it was my advice until
2026-11-12."**

With `growth_journey_classifications` at zero and the decider reading that table rather than
`growth_journey_enrollments`, starting at the execution flag produces **silence that looks like a
broken deploy** — and the reasonable response to that is to turn more things on, which is the
worst available direction. So the order is stated as one line a reader can hold:
**classify, then decide, then permit, then execute.**

Two facts that each save a wasted step are given alongside it: a programme does not need
activating for decisions (the nightly accepts `draft`), and **a rollout control row denies by
default** while a pause allows by default — the asymmetry that means an empty controls table
leaves every scope in shadow regardless of flags.

### Three read-only commands, up front

Before any rung, the document gives the three commands that show the whole state and are safe with
every flag off: the 22-item readiness checklist, the per-scope execution probe, and the Maya
capability route. All three are read-only. It also states the falsifiable expectation that
`next_move` is a classification item today — and that if it ever reports `execution_flag` while
classifications are zero, the checklist is wrong and this document is wrong with it.

## Verification

Each of the plan's nine content requirements checked by grep against the rendered document:

| Requirement | Result |
|---|---|
| Every rung names an owner | 15 occurrences |
| Every rung names its evidence | 12 |
| Every rung names the way back | 15 |
| The irreversible rung is marked as such | 1 |
| The `send_email` grant rung | 1 |
| The brand-scope rung | 1 |
| The corrected order, stated in one line | 1 |
| The rollout/pause asymmetry | 1 |
| Registry mode means revert-forward | 1 |
| A stop condition | 1 |
| Cross-references the promotion checklist | 2 |
| Names `SYNTHFLOW_INTEREST_AGENT_ID`, and names the fiction | both present |
| The `maya_email_ledger` rollback | 1 |
| **No `@` anywhere in the document** | **confirmed: zero** |

**The grep pass found a real inaccuracy.** The introduction said Maya's release is "fourteen"
switches — a number I had not counted. It is fifteen rungs, thirteen of them actions and two of
them reading. Corrected, and stated in a form a reader can verify against the headings.

## What the document deliberately records as absent

So that a gap is never mistaken for a rung somebody forgot:

- **R1** decides whether Maya may contact the ad cohort at all. MR2 was built in shadow
  regardless, because R1 governs promotion rather than construction — but the `sendEmail`
  promotion should wait for it, and the checklist section says so.
- **No Playwright coverage** exists for any surface in the document.
- `GROWTH_JOURNEY_SIGNAL_INGEST_ENABLED` is declared, parsed and **consumed nowhere**. Inert.
- **The SMS tool has no idempotency key**, so N tool calls produce N GoHighLevel workflow fires.
  Flagged as something to build before SMS volume rises, rather than left to be discovered.
- Turning `ENABLE_VOICE_CALLS` on is a product decision and is explicitly **not** on this ladder.
