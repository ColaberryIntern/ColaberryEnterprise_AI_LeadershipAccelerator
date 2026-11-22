# L9.7: LC-10 and LC-11 are re-scoped, not satisfied

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

### LC-10: approval binds authorized human, project/tenant, exact version/hash, selected design

**Corrected 2026-11-22.** The first version of this record said *"no role is compared at approval
time"* and offered a `git grep` as proof. **That claim was false when this record was written,**
and the grep it invited disproves the record rather than the row:

```
$ git grep -n "approved_by_role\|assertApproverRole" -- backend/src | grep -v __tests__
backend/src/services/lifecycle/approverRolePolicy.ts:84: export function assertApproverRole(...)
backend/src/services/lifecycle/lifecycleStatus.ts:344:  assertApproverRole(input.admin.role);
```

The role limb was closed on `main` in commit `d70d72ee3`, *"LC-10: the approving session's role is
now compared, not just recorded"*, on 2026-11-03. `assertApproverRole` throws `ApproverRoleError`
unconditionally, with no flag, against an allowlist of `['super_admin']` chosen by the DRI over
`admin + super_admin` when shown the counts. It is evidenced through the approve path in
`lifecycleApprovalIdentity.test.ts`, which names the real excluded population (`admin`, `ai_staff`
and `sales`, 48 of 50 admins) rather than a hypothetical one, and asserts the attempt is audited
before it is refused.

**How the wrong claim got written is worth more than the claim.** It was true when Phase 7 recorded
it, and this record quoted Phase 7 rather than the code. That is precisely the failure the rest of
this change spent its effort preventing: a document holding a second copy of a fact about code,
going stale underneath itself while reading as current. The record was the only artifact in this
change without a test binding its code claim to the code. It has one now.

#### What LC-10 still lacks, verified rather than quoted

**The approval RECORDS the selected design. It does not BIND it.** Three facts, each a one-line
check:

1. `blueprintApproval.ts:240` writes `selected_design_ref: input.selectedDesignRef ?? null`. The
   value is **caller-supplied and nullable**. `lifecycleApprovalIdentity.test.ts` documents this
   deliberately, in a negative control titled *"body-sourced fields DO travel"*, which exists to
   prove the approver pin is discriminating: the approver cannot come from the caller, and the
   design ref can.
2. `blueprint_design_decisions` has a model and a table and **no non-test reader**. There is no
   stored decision for the approval to be compared against.
3. `blueprint_approved`'s predicate does not spread `design_ready`'s. Prerequisites in
   `lifecyclePrerequisites.ts` are not cumulative except where a stage spreads another explicitly,
   and only `planning` does. So `design_variant_not_selected` is checked when the target stage is
   `design_ready` and is **not re-checked at the approval boundary**.

Taken together: an approval can record a design ref that no design decision ever selected, or
record none at all, and the limb is satisfied by bookkeeping. That is the same defect shape the
role limb had, located on the limb that still has it.

**One of four limbs bookkept is not a row.** Recording which design was chosen is not the same as
refusing an approval that names a design nobody chose, and only the second is what LC-10 says.

The other two limbs are in better shape and are not what withholds the row. The version limb landed
in PR #3595, deterministically and mutation-proved: the mutation that ESCAPED the pre-existing race
test is CAUGHT by the new one, because the race resolves through the idempotent read-back path whose
rejection branch had never executed. The tenant limb takes the tenant from the ROW rather than from
the caller, with an audited guard, though the matrix separately records that guard sitting on a
self-closing migration ramp.

### LC-11: material changes invalidate only affected approvals, block stale downstream work

Dropped when P5-T1.3's evidence failed five successive gradings. The acceptance criterion was
never met and the attempts to meet it did not converge. Carrying it forward as "in progress"
through five failures would have been a status nobody could act on.

## Why re-scoping is the honest ruling rather than a convenience

Three alternatives were available and each is worse:

1. **Mark them satisfied.** False. LC-10's selected-design limb is recorded rather than bound,
   and saying otherwise would put a claim in a release packet that reading
   `blueprintApproval.ts:240` disproves. The first version of this record made the mirror-image
   mistake about the role limb, so the lesson is read in both directions: a claim about code
   belongs beside a check that reads that code.
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

- **LC-10:** the approval boundary comparing its `selected_design_ref` against a recorded design
  decision, so an approval naming a design nobody chose is refused. The moment that comparison
  exists, the row is writable and the only thing left is evidence. A test binds this record to the
  code, so the comparison landing will fail that test and name this file.
- **LC-10:** or a decision that recording the chosen design alone satisfies the criterion. That
  would be a change to the criterion and must be written as one, not assumed by whoever next reads
  the matrix. The same ruling was available for the role limb and was not taken.
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
