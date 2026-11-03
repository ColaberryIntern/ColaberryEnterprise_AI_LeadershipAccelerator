# Rulings on three blocked tickets: L4.7, L5.3, L5.8

Approver: Ali · 2026-11-03, session `CC-20261021-h9v3`

The DRI asked for these to be decided rather than returned to him. All three were recorded
**blocked** or **dropped** weeks ago, and in all three cases **the condition that blocked them has
changed** — two because of work that landed overnight, one because a ticket's stated rationale
turns out to contradict the ledger.

None of these is confirmed as-is. That is the finding.

---

## L4.7 — Phase 4 handoff: the blocking condition is now FALSE

**Recorded state:** blocked at the three-attempt cap. The ticket's stated reason:

> The honest reason it could not be written is that **there was nothing to click**: Phase 4 shipped
> dark, so a handoff promising a testable surface would have been false.

**That reason has expired.** Measured 2026-11-03 on the production stack
(`project=colaberry-accelerator`):

```
accelerator-backend  ENABLE_PROJECT_LIFECYCLE = true   (durably, in the stack .env)
```

Phase 5 shipped the operator review surface, Phase 7 is complete with its release live and
independently verified, and the flag that gates the four admin routes is **on**. There is something
to click.

**RULING: L4.7 is no longer blocked. It is unwritten work.**

The distinction matters for how it gets picked up. "Blocked at the cap" tells the next reader not
to try. "Writable, nobody has written it" tells them to. Its success metric —

> The report describes what a human can actually do today, and says plainly where the answer is
> "nothing yet"

— is now satisfiable, and parts of it will still honestly read "nothing yet": the story
authorization gate is unarmed, so a student build is not governed end to end.

**Not written here**, because a handoff describing what a human can do should be written by someone
who has driven the surface, and nobody has driven it tonight.

---

## L5.3 — the stale-approval scenario was re-attempted, and landed

**Recorded state:** stopped after five attempts, `blocked_accepted`. LC-10 and LC-11 formally
withdrawn. The ticket's own account of the failure is worth keeping:

> The attempt that broke it **documented the system as safer than it was and then used that
> document as the justification.** Withdrawing the acceptance rows was the only honest outcome.

**Its success metric offered two routes:**

> Re-attempted in Phase 7 with a real stale-approval scenario, **or** re-scoped in writing. Not
> marked done on a document.

**The first route was taken on 2026-11-02** (PR #3595, merged). A deterministic stale-CAS refusal
now runs at the integration tier against a real Postgres:

```
√ a STALE expectedRevision is refused with ApprovalConflictError, and writes nothing
√ a CROSS-TENANT approval finds nothing to approve, and writes nothing
√ POSITIVE CONTROL: the same call with the CURRENT revision and tenant SUCCEEDS
```

Asserted **by error class**, not by message, and both refusals additionally assert
`approvedRowCount == 0`, because a refusal that still persisted a row is the worse half of the bug.

**And the measurement on the way there matters more than the tests.** The pre-existing race
assertion, which the ruling had flagged as weak, turned out to be *dead code*: mutating the product
to throw a bare `Error` left it **green**, because that race resolves through the idempotent
read-back path and its rejection branch never executes. It did not permit a bare `Error` — it never
ran. The new deterministic test catches the same mutation.

**RULING: LC-10's integration leg is MET. LC-10 itself is still not writable, and LC-11 is
untouched.**

Phase 7 recorded a **second** blocker on LC-10 that tonight did not address: **no role is compared
at approval time.** `approved_by_role` goes into a nullable column, and `git grep` outside tests
finds only the DDL, the model, the input type and one assignment. The "authorized human" limb is
bound by recording, not enforcement. **One of two blockers cleared is not an acceptance row.**

So L5.3 moves from `blocked_accepted` to **partially discharged**, with the remaining work named:
compare a role at approval time, and address LC-11 separately.

---

## L5.8 — the drop does NOT stand as described

**This is the one that would have been confirmed on a false rationale.**

The ticket says:

> Two packets recorded dropped with zero attempts, rather than silently omitted.
> Why. **They were subsumed by the way T3 and T4 were built.**

The state ledger says something different:

```
P5-T5  status=dropped  attempts=0  note: "LC-10 withdrawn 2026-10-08: depends on the blocked P5-T1.3"
P5-T6  status=dropped  attempts=0  note: "LC-11 withdrawn 2026-10-08: depends on the dropped P5-T5"
```

**That is a dependency cascade from a blocked task, not subsumption.** The two readings lead to
opposite decisions:

| If the reason is… | Then the drop is… |
|---|---|
| **subsumed** by T3/T4 — the work exists elsewhere | permanent and correct; confirm it |
| **cascaded** from a blocked dependency | provisional; it returns when the dependency clears |

The ledger supports the second, and for P5-T6 it says so twice over — it depends on P5-T5, which
depends on P5-T1.3, which is L5.3 above. P5-T3 and P5-T4 are both recorded `passed attempts=1` with
notes about comparing revisions and linked views; neither note claims to have absorbed an approval
or change-invalidation packet.

**RULING: the drop is NOT confirmed.**

- **P5-T5 (LC-10) should come back as a ticket.** Its blocking dependency is now partially
  cleared — the stale-approval scenario landed tonight — and "dropped because its dependency was
  blocked" stops being true the moment the dependency moves.
- **P5-T6 (LC-11) stays dropped for now**, because it depends on P5-T5 rather than on P5-T1.3
  directly. It returns after P5-T5, not alongside it.
- **The ticket's stated rationale should be corrected** in the ticket, not just here. A reviewer
  asked to "confirm the drop" would have been confirming a reason the ledger does not support, and
  L5.8 exists precisely so the drop is "a decision rather than an omission". A decision taken on
  the wrong reason is the failure that ticket was written to prevent.

---

## What these three have in common, and it is worth naming

All three were blocked on conditions, and **nobody re-checked the conditions**. L4.7 waited on a
surface that now exists. L5.3 waited on a scenario that has now been written. L5.8 waited on a
confirmation whose premise was wrong from the start.

This programme already has a memory of the same shape, one board over: *parked tickets gate on a
CONDITION, not a date, so the calendar passing does not release them* — and the converse is just as
true. **A ticket blocked on a condition needs the condition re-measured, not the date re-read.**

## Disposition

| Ticket | Recorded | Ruling |
|---|---|---|
| **L4.7** | blocked at the cap | **unblocked** — writable work; the "nothing to click" reason has expired |
| **L5.3** | blocked_accepted | **partially discharged** — the integration leg landed; role comparison still missing |
| **L5.8** | awaiting confirmation of a drop | **drop NOT confirmed** — P5-T5 returns, P5-T6 waits on it, rationale needs correcting |
