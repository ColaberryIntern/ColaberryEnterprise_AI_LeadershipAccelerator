# L9.7 — LC-10 and LC-11 are re-scoped, not satisfied

Ticket L9.7 · Basecamp `10396178831` · Decided 2026-11-21 · Session `CC-20261120-k4d9`
Delegated by Ali on 2026-11-20: rule in writing so the acceptance matrix can show a **decision**
rather than a **gap**.

---

## The decision

**LC-10 and LC-11 are withdrawn from the Phase 0 to 8 acceptance set and re-scoped as named
follow-on work.** They are not marked satisfied, they are not left open as silent gaps, and the
closing packet does not claim them.

The distinction matters more than it looks. A withdrawn row and a satisfied row look identical in
a summary count and mean opposite things. Everything below exists so that nobody reading the
matrix later has to work out which one happened.

## What each row actually asked for, and where it stopped

### LC-10 — "approval binds authorized human, project/tenant, exact version/hash, selected design"

`ruling-lc10-coverage.md` named one outstanding item: an integration-tier refusal from the live
approve path, stale CAS or cross-tenant. **That landed** in PR #3595, deterministically, and it
was mutation-proved: the mutation that ESCAPED the pre-existing race test is CAUGHT by the new
one, because the race resolves through the idempotent read-back path whose rejection branch had
never executed.

Phase 7 then recorded a **second** reason the row cannot be written, and it is the one that
re-scopes rather than finishes it: **no role is compared at approval time.** `approved_by_role`
goes into a nullable column, and a `git grep` outside tests finds only the DDL, the model, the
input type and one assignment. The limb is bound by RECORDING, not by ENFORCEMENT.

One of two blockers cleared is not a row. Recording who approved something is not the same as
refusing an approval from somebody not entitled to give it, and only the second is what LC-10
says.

### LC-11 — "material changes invalidate only affected approvals; block stale downstream work"

Dropped when P5-T1.3's evidence failed five successive gradings. The acceptance criterion was
never met and the attempts to meet it did not converge. Carrying it forward as "in progress"
through five failures would have been a status nobody could act on.

## Why re-scoping is the honest ruling rather than a convenience

Three alternatives were available and each is worse:

1. **Mark them satisfied.** False. LC-10's enforcement limb does not exist in code, and saying
   otherwise would put a claim in a release packet that a `git grep` disproves in one command.
2. **Hold the phase open until they pass.** LC-10 needs a role comparison at the approval
   boundary, which is a real design change to an authorization path, not a test to write. LC-11
   needs evidence that failed five gradings. Holding eight phases of completed work hostage to
   two rows whose remaining work is unscoped trades a true statement about 16 rows for an
   indefinite wait on 2.
3. **Leave them silently open.** The failure mode this project has hit repeatedly: a row that is
   neither closed nor refused is read by the next person as "probably fine".

Re-scoping says, in one place, what is true: the work was attempted, this is how far it got, this
is what remains, and nobody should read the closing packet as covering it.

## What would reopen this

Any one of these, and the row returns to the active set rather than the follow-on list:

- **LC-10:** a role comparison reaching the approval path, so `approved_by_role` is READ and an
  approval from an unentitled role is refused. The moment that code exists, the row is writable
  and the only thing left is evidence.
- **LC-10:** or a decision that recording alone satisfies the criterion. That would be a change
  to the criterion and must be written as one, not assumed by whoever next reads the matrix.
- **LC-11:** evidence for P5-T1.3 that passes a grading, at which point the invalidate-only-the-
  affected-approvals behavior can be judged on its merits rather than on an absent proof.
- **Either row** becoming load-bearing for a customer commitment or a compliance claim. A
  withdrawal that was reasonable for internal sequencing is not automatically reasonable once
  somebody outside is relying on it.

## What this decision does NOT say

It does not say the behaviors are unnecessary. LC-10's enforcement limb is the difference between
an audit trail and an access control, and that is worth building. It says only that the Phase 0
to 8 acceptance set closes without them, visibly, with the reason attached.

---

**Cited by:** `acceptance-matrix-l04.md`, LC-10 and LC-11 rows.
**Related:** `ruling-lc10-coverage.md`, `phase5-handoff.md`, `carried-forward-obligations.md`.
