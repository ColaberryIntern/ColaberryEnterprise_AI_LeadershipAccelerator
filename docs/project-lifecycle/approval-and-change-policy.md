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
| **Cosmetic** — metadata, wording that does not alter meaning | Follows a documented narrower rule; does not cascade. |

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
