# Approval and change policy

**Status:** proposed (Phase 1 deliverable) · **Date:** 2026-10-01 · **Session:** CC-20261001-q7m4
Companion to `architecture.md` and `blueprint-contract.md`. Covers request §4.6.

## 1. Decision: assemble from four existing ladders, add no fifth

This repo already contains **four** approval/acceptance implementations, each of which solved a different part of this problem well. The blueprint approval is assembled from their proven properties rather than written fresh.

| Source | Property being reused | Evidence |
|---|---|---|
| `factoryApproval.ts` | CAS on a client-supplied `expected_version`; fork-on-edit snapshot; a write-time validation gate (`assertApprovable` → `factoryErrors`); a legal-transition table; `ApprovalConflictError`→409 / `ApprovalGateError`→422 | `:45-57`, `:31-41`, `:78-93`, `:147` |
| `govQualification.ts` | **Separation of duty** (`SelfApprovalError`); re-resolving a server-side source snapshot at approval time; `ChangedSourceError`; evidence-sufficiency gating; a DB unique index backstopping the CAS | `:23`, `:311-315`, `:317-326`, `ensureGovQualificationSchema.ts:65-66` |
| `deliveryContractService.ts` | **Idempotent approval** — a retried approval returns the original with its original approver and timestamp; refusal to approve a superseded version; **supersede-first ordering** | `:178-182`, `:184-186`, `:188-190` |
| `clientAcceptanceService.ts` | Approval is **not terminal** — it can be superseded by a later decision; a full acceptance state machine | `:22`, `:31-36` |

Two of these carry their own reasoning worth preserving verbatim:

> *"a retried approval returns the original, with its original approver and timestamp. Re-freezing would quietly change who approved what, and when."* — `deliveryContractService.ts:178-179`

> *"Mark older approved versions superseded first. If this fails, nothing has been approved yet — better to leave the previous contract governing than to end up with two approved versions and no way to tell which one is current."* — `deliveryContractService.ts:188-190`

## 2. What an approval binds

An approval record binds **all** of:

- the **actor** (a real authorized human identity) and the **role** that authorized them
- **tenant** and **project**
- the **subject** (which manifest, which component)
- the **immutable revision + content hash**
- **scope** of the approval (`documented` vs `full`)
- **timestamp** and **rationale**

**Refused server-side:** a stale approval (revision moved), an unauthorized cross-project or cross-tenant approval, a wrong-role approval, and a spoofed actor. The approver is read from the authenticated session, **never from the request body** — the pattern `factoryRoutes.ts:164` already follows.

### The proposer cannot approve their own work

Separation of duty is **absent from process-document approval today** — verified by reading `factoryApproval.ts` and `factoryReview.ts` directly (plain `grep -r` skips `factoryApproval.ts` because it contains a deliberate NUL byte, so this had to be checked with `grep -a`). Anyone holding `requireSection('program')` can approve any document regardless of who produced it.

**Decision:** port the existing pattern rather than invent one:

```ts
// govQualification.ts:311-315 — the shape to reuse
if (input.approverIdentityId && current.reviewer_identity_id
    && input.approverIdentityId === current.reviewer_identity_id) {
  throw new SelfApprovalError();
}
```

**No ceremonial self-approval loophole.** `buildAuthorization.ts` goes further with a third distinct actor (named approver + scope + resource limit, "expected to be a different person from the qualification reviewer"); that pattern is available where a build authorization needs it.

### An AI identity never populates a product approval

This is the hard line between the three authorities. A feature-build instruction authorizes *building* the approval mechanism. It never authorizes *using* it on a customer's behalf. Test fixtures use clearly labelled synthetic identities; no approval is ever recorded under an AI identity or on the strength of a blanket build instruction.

## 3. Concurrency

CAS on `expected_version`, **reinforced by a database unique constraint** on `(tenant, project, revision)`.

The reinforcement is not belt-and-braces — it is the actual guarantee. `factoryApproval.approveProcessDocument` performs a read-then-compare **outside a transaction and without a row lock**, so two concurrent approvers can both pass the application-level check. `uq_contract_proc_doc_version` exists and would reject the second insert at the same version, but **whether that fully closes the race must be proven by a concurrent test, not reasoned about** — this is LC-13, and LC-13 was a real production incident, not a hypothetical. Phase 2 owns that proof.

Stage commands are idempotent. A duplicate request or a worker retry must never duplicate projects, approvals, stories, or external writes.

**A model or tool failure may preserve a draft but must never advance an approved stage.**

## 4. Change semantics and the impact set

A change produces an **impact set** across requirements, tasks, agents, policies, screens, stories, tests and approvals.

| Change kind | Effect |
|---|---|
| **Material** — source, design, or authority changes | Invalidates the affected dependent approvals. Blocks stale downstream work. |
| **Cosmetic** — a change no gate can see | Does not cascade. Defined in §4.1, which is the "documented narrower rule" this row used to promise. |

### 4.1 The narrower rule for cosmetic changes

**Written 2026-10-06 (P4-T7).** Until then this document said only *"Follows a documented
narrower rule"* — a rule it never stated. That is worse than having no rule, because it reads
as though the question had been settled.

#### The rule

> A change is **COSMETIC** if and only if **every gate returns an identical verdict on the old
> and new revision**. Otherwise it is **MATERIAL**.

That is the whole definition. It is deliberately not a list of safe fields and not a judgement
about whether wording "alters meaning".

#### "Gate" needs a referent, and the honest status is that it does not have a derivable one

The rule turns on the word. A **gate** is an exported function in the lifecycle generation or
delivery-design modules that returns refusals or a verdict. The CANDIDATE set is derivable —
every export in those locations, and the command is exact:

```
# from backend/. 50 exports.
grep -rh "^export function " src/services/lifecycle/generation/*.ts \
  src/services/delivery/deliveryDesignLoop.ts \
  | sed "s/.*export function \([A-Za-z0-9_]*\).*/\1/" | sort -u | wc -l
```

**Which of those 50 is a gate is HAND-CLASSIFIED, and this section previously claimed
otherwise.** It pasted a regex matching `validate|select|consolidation|unbound|render|
controlSurfaceExists` and called it a derivation, with the sentence "if a later phase adds a
gate, it joins the set by being written, and the comparison widens automatically". A verifier
ran it. It returns 14 names and **omits `checkApprovalEligibility` and `assessDesignLoop` from
`deliveryDesignLoop.ts` — the very file the command greps** — along with `checkOwnership`,
`checkConsolidation`, `checkCapabilityClaims`, `checkTargetDisclosure`, `shapeIssue`,
`refIssues`, `audienceIssues`, `processErrors`, `allocationErrors` and
`alternativesDifferMeaningfully`. Twelve verdict-returning exports outside the set, one of
them the approval-eligibility gate, which is the gate this document is most about.

**A verb prefix is a naming convention, and a naming convention is not a contract.** The
sentence about the set widening automatically was the load-bearing false claim: it is exactly
backwards, because a gate named `check*` or `*Errors` joins nothing and is silently outside
the comparison. That is the same shape as a field list going stale, which is the failure this
section rejected a field list for.

**Consequence, stated rather than implied: the iff-rule is not mechanically checkable today.**
"Every gate" quantifies over a set no command returns. The rule is still the right rule and
still constrains a human reviewer, but a classification run against it would use a
hand-maintained list, and this run’s standing rule says a claim quantified over an input space
ships with the enumeration that produced it or is rewritten as a scoped list. This is the
scoped-list case. Closing it means the classification lives in CODE with a test that fails
when a refusal-code-bearing export is added without being classified — recorded in
`carried-forward-obligations.md` with an owner, because that is step 3 below and it is not
written yet.

**An earlier version of this section did not define "gate" at all, and the omission immediately
produced a false worked example** — see the `workspaceTitle` case below. Defining it badly then
produced a second one. Both are kept rather than erased.

#### Why it is defined by re-running the gates rather than by a field list

Three reasons, in order of how much they matter:

1. **A field list goes stale silently.** The moment a new gate reads a field someone had
   listed as cosmetic, the list is wrong and nothing says so. This run has already paid for
   exactly that failure in several forms — a count in prose, a keyspace derived from a
   hand-listed set of filenames, a summary table of design tokens that carried the wrong brand
   colours for months.
2. **"Does not alter meaning" is unfalsifiable, and it is the judgement a motivated author
   will always make in their own favour.** A reviewer under time pressure reclassifying a
   material change as a wording tweak is the failure mode this policy exists to prevent, and a
   rule phrased as a judgement invites it.
3. **It is mechanically checkable, which means it can be a test rather than a habit.** The
   Phase 4 validators are pure functions over a manifest with no I/O, which was a deliberate
   design choice and is what makes this definition implementable: evaluate the gate set twice
   and compare the two verdict sets.

#### What this implies in practice

- **Default MATERIAL.** A change whose gate verdicts have not been compared is material. The
  unsafe direction must be the one someone has to argue for, not the one you fall into by not
  checking.
- **A gate that merely requires a field to be non-empty does not, BY ITSELF, make that field
  material.** Emptying such a field is material; editing it between two non-empty values
  cannot change *that* gate’s verdict. But "that gate" is not "every gate", and the rule is an
  iff over all of them.
- **The cautionary case, which an earlier version of this section got WRONG.** It said editing
  `workspaceTitle` from one non-empty string to another "cannot change `SURFACE_FIELD_EMPTY`’s
  verdict, **so it is cosmetic**". The first clause is true and the conclusion does not follow:
  `unboundProposedSurfaces` compares `workspaceTitle`, lowercased and trimmed, by **set
  membership** against the understanding’s `proposed_surfaces`. Rename a workspace and a
  previously-covered proposed surface becomes unbound — a changed verdict, so the rename is
  **MATERIAL**. A verifier falsified this by building the input; the next bullet of this very
  section ("a field any gate COMPARES is material… a set membership") already said so four
  lines below the example that contradicted it.
- **A genuinely cosmetic example, measured:** a design decision’s `title`.
  `grep -n "\.title" backend/src/services/delivery/deliveryDesignLoop.ts` returns nothing — no
  gate reads it — so editing it cannot change any verdict. That is what cosmetic looks like,
  and note how much weaker a claim it is than "this field is only used for display".
- **A field any gate COMPARES is material.** An id, a set membership, a hash input, a
  threshold, an enum member. Renaming `workspaceId` is material even though it looks like a
  label, because bindings and journey steps are matched on it — which is precisely why P4-T4’s
  structural fingerprint deliberately excludes workspace ids and reads task ids instead.
- **`rationale` is MATERIAL**, which surprises people. `validateDesignDecision` warns on an
  approved decision with no rationale, so emptying it changes a verdict. Rewriting a non-empty
  rationale does not.

#### The content hash is not the test

A cosmetic edit still changes `manifestContentHash` if the hash is taken over the whole
manifest, because the bytes moved. **A hash change alone therefore does not invalidate an
approval** — the test is the gate-verdict comparison, and the hash is how you detect that
*something* changed and that the comparison is owed.

Stated explicitly because the opposite reading is the obvious one, and it would make every
typo correction invalidate every downstream approval. A policy that punishes fixing a typo is
a policy people route around.

#### What enforces this today: NOTHING

This section is a stated rule, not a shipped mechanism, and the distinction matters more than
the rule does. The three parts needed to implement it are named in
`carried-forward-obligations.md`:

1. **Write `refs_json`** on the production manifest path. Nothing does today, and the root
   cause is one level deeper than it looks: **production never CREATES a manifest row at
   all.** `blueprintApproval.ts` only `findOne`s one (`:166`) and `update`s it (`:217`); the
   only `INSERT`s into `operating_blueprint_manifests` anywhere are in two integration tests.
   So there is no stored revision content to compare against, and there will not be until
   something writes the row.
2. **This section**, now written.
3. **Implement the comparison**: evaluate the gate set against both revisions and classify on
   identical-verdicts. No classifier exists anywhere in `backend/src` today.

Phase 4 contributes the part it could: `blueprint_design_decisions.manifest_content_hash`
records which revision each design decision was taken against, so the comparison can be
implemented later without a backfill. **Recording the hash is not the same as acting on it**,
and nothing in Phase 4 claims invalidation works.

**Existing work is preserved.** Unchanged components retain valid evidence while their dependency fingerprints remain current. This is what makes reapproval *selective* rather than a full re-approval every time — and it is also what stops a changed component from slipping through on stale evidence.

**Regenerating a draft does not alter the currently approved version and does not erase a pending human review.** That second clause is the LC-13 lesson in policy form: `sbpOrchestrator.ts:216` carries the comment *"hold the next restart quietly dropped - and the build published itself to the student"*, describing exactly this failure before it was fixed.

## 5. Time-of-check / time-of-use

The approved revision and the actor's current authority are **re-checked at four moments**, not once:

1. plan authorization
2. build handoff
3. release approval
4. runtime business-action execution

Checking once and caching the answer is the bug this prevents: authority can be revoked, and a revision can move, between the check and the use.

## 6. Tests this policy requires

Each must have a deliberately-violating fixture that fails, so the check is demonstrably live:

1. Stale approval (revision advanced between read and approve) → refused
2. Cross-tenant approval attempt → refused
3. Wrong-role approval → refused
4. Spoofed actor (approver supplied in the request body) → ignored; session identity wins
5. **Self-approval** (proposer = approver) → refused
6. **Duplicate approval** → returns the original approver and timestamp, unchanged
7. **Concurrent approval** of the same revision → exactly one wins, and the loser gets a conflict
8. Approving a superseded revision → refused
9. Material edit → affected approvals invalidated; **unchanged ones preserved**
10. Cosmetic edit → no cascade
11. Draft regeneration → approved version untouched, pending review intact
12. Authority revoked after approval but before build handoff → handoff refused
