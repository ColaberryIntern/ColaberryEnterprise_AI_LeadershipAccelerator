# Maya governance: one agent, two belts, and nothing that sends without you

**Decision:** Ali, 2026-11-13, answering a four-option question: *on, outbound held for your
approval.* She is switched on and her in-product surfaces are live, and every message she composes
for a real person waits in a queue until he reads that exact message and approves it.

**Companion documents.** [`MAYA_UNIFICATION_DECISION.md`](./MAYA_UNIFICATION_DECISION.md) is why
there were two Mayas and what combining them meant.
[`MAYA_PROMOTION_CHECKLIST.md`](./MAYA_PROMOTION_CHECKLIST.md) is how one capability moves between
states. [`MAYA_RELEASE_GATE.md`](./MAYA_RELEASE_GATE.md) is the cross-layer ladder that turns the
journey engine on. This document is the governance model itself: what she may do, how each effect
is gated, and which clicks are yours.

**Where to look.** `/admin/maya` is the console that answers "is she on and what may she do".
`/admin/outbound-approvals` is where a message is read and decided, one at a time.

---

## 1. Both belts

She has two tool belts and until 2026-11-15 only one of them was governed.

| | Site chat belt | Portal belt |
|---|---|---|
| Entry point | `admissionsMayaService.ts` -> `mayaActionService.ts` | `maya/mayaPortalTools.ts` |
| Tools | 11 | 5 |
| Gated by, before this work | `ENABLE_CHAT` alone | `mayaEnablement.ts` + `mayaPromotion.ts` |
| Gated by, now | the same promotion spine as the portal belt | unchanged |

The frozen map is `backend/src/services/maya/mayaToolGovernance.ts`: 16 tool names, each tied to
the capability that governs it and the class of effect it has. It is pure data with a single
type-only import, so at runtime it has no imports at all, which is why
`agentDomain/registeredTools.ts` can read it without dragging the mailer into the boot graph of
everything that asks "is this a real tool".

Effect classes, because they are what decides whether a tool can reach a person at all:

| Class | Meaning | Examples |
|---|---|---|
| `read` | reads our own data | `retrieve_knowledge`, `read_person_360` |
| `internal` | writes our own records, or changes what the person already in the conversation sees | `capture_lead_details`, `start_campus_tour` |
| `transactional_receipt` | sends, without a per-message approval, under the bounded policy in section 5 | `schedule_strategy_call`'s calendar invite and confirmation |
| `outbound` | puts bytes in front of a person who did not just act | `send_document`, `send_email`, `draft_marketing_email` |

**Registration was the real cause of zero tool grants.** `agent_domain_tool_grants` held zero rows
across all 31 agents, and the reason was not a policy: `registeredToolNames()` had never heard of
`MAYA_TOOLS`, so every attempt to grant her a tool refused `tool_not_registered`. Ten of her site
tools happened to be `TOOL_CAPABILITIES` keys by coincidence;
`list_quotable_marketing_assets` and `draft_marketing_email` were registered nowhere, and neither
were any of the five portal tools. Both belts are registered now.

Nine of her sixteen tools are one human confirmation away from a grant. Three are refused by name
and want none. **Four — `send_document`, `draft_marketing_email`, `start_campus_tour`,
`create_journey_handoff` — are required by no capability record in any of the eleven domain
buckets**, so the gate refuses them `tool_not_required_by_capability` even with a capability
confirmed. That refusal is correct: a grant records which capability a tool serves, and these four
have no written purpose to record. Closing it means authoring four capability records with the
researched evidence the other 47 admissions capabilities carry. That is domain research, and it was
reported rather than invented. `mayaToolGrantReadiness.test.ts` pins all three groups.

---

## 2. The four modes

Every capability resolves to exactly one mode, and the mode is resolved per effect rather than per
tool. The split that makes this work is **compose** from **deliver**.

| Mode | Composes? | Delivers? | What exists afterwards |
|---|---|---|---|
| `off` | no | no | nothing. The handler is not invoked and she refuses by name |
| `shadow` | yes | no | a ledger row nobody is asked to look at |
| `review` | yes | only on your decision | a row in `maya_outbound_approvals` holding the exact bytes and a hash of them |
| `live` | yes | yes | the delivery, still consent-checked and still idempotent |

`resolveMayaMode(cap)` applies these in order, and the order is the governance:

1. **the kill switch**, read STRICTLY. An unreadable switch answers `kill_switch_unreadable` and
   the capability is `off`. It fails closed, because for an agent that can contact a human an
   unreadable stop button must stop her.
2. **the refusal set**, checked before any record is read. See section 3.
3. **`ENABLE_CHAT`**, for `respondToExplorerDm` only.
4. **the promotion record**, `system_settings` -> `maya_capability_promotions`.
5. **the M29 flag axis**, on the `live` path only, for the four portal capabilities that act
   without being asked.

Two columns on the console look alike and are not the same thing. **Doing now** is the resolved
mode. **Set** is what a person stored. They disagree whenever something upstream overrides the
dial, and the reason column says which. A console showing only the stored state would let somebody
set `live`, see `live`, and be wrong.

`review` is a state neither `promote` nor `revert` can reach, which is why there is a third-way
setter at `POST /api/admin/maya/capabilities/:cap/state`. Its authority is computed from the
direction the request actually moves the dial, not from the path, because `shadow -> review`
widens and `live -> review` narrows.

---

## 3. Why `enroll_in_campaign` is `off`, and why that is a refusal rather than a default

Three capabilities are **refused by name**: `sendSmsSummary`, `placeVoiceCall` and
`enrollInCampaign`. That is the absence of a dial, not a dial in the off position. It is enforced
three ways: the refusal is checked before the promotion record is read, `parseRecord` drops any
stored entry for one, and `setMayaCapabilityState` throws. `PromotableCapability =
Exclude<MayaToolCapability, RefusedCapability>` makes giving one a default a type error rather
than a review comment.

SMS and voice are refused because Ali said so, by name, and they were already refused before this
run.

**Campaign enrolment is refused for a structural reason, and it is the one worth writing down.**
Everything else that reaches a person can be held in the queue because its bytes exist at compose
time. Campaign bodies do not: they are written by `generateAIContent()` on a cron, hours later. So
a queued campaign enrolment would be a row Ali approved that said nothing about what would
eventually be sent. There is no honest way to put it in a review queue, so it is refused instead
of queued.

---

## 4. The lead-capture severing, and what it was measured to cost

`enrolLeadInCampaign` is reached from **five** call sites, and two of them are inside
`captureLeadDetails`, which runs on **every lead Maya captures**. So this is the highest-volume
change in the whole run, and it is declared here rather than discovered later: **after this ships,
capturing a lead captures the lead and does not enrol it in a campaign.**

The fifth call site is worth its own sentence. Three cycles of reading the call graph by hand had
settled on four. `mayaSeamContainment.test.ts` found the fifth — `voiceTool.ts:326`, a
`.catch()`-suppressed fire-and-forget — on the first run. Three careful readings missed it and one
structural scan did not.

**Measured read-only against production on 2026-11-13, before accepting the severing:**

| | |
|---|---|
| Live campaign leads | 15,618 |
| Scheduled campaign emails | 46,015 |
| Last campaign email actually sent | 2026-08-21, nothing in 84 days |
| Maya's own two enrolment actions | both `skipped` |

The brand relationship gate has held this path shut since August. So severing it costs nothing
operationally today. The point is that the safety was **somebody else's gate**, and this build
should not depend on a gate it does not own. If the brand gate is ever opened, the severing is what
keeps lead capture from becoming an outbound campaign without a decision.

---

## 5. The transactional receipt policy, and the exactly two effects that claim it

The invariant is worded absolutely — nothing Maya composes for a real person is delivered without
a person deciding that exact message — so the one exception is named and bounded rather than left
implicit.

> **TRANSACTIONAL RECEIPT POLICY.** An effect may be `live` without per-message approval only if
> it is a receipt of an action the person themselves just performed, addressed to that person, and
> its body is a fixed, reviewed template limited to the facts of that transaction (what, when,
> with whom, how to join or cancel), composed before send time, one per transaction. **Outreach
> never qualifies.**

**Exactly two effects claim it:** `createBooking` (the calendar invite) and
`sendStrategyCallConfirmation`. A test pins that list by name, so a future effect cannot inherit
the exemption quietly.

Booking used to have four compose-time effects. The other two are refused: the GoHighLevel SMS
(`sendSmsSummary`) and the campaign enrolment (`enrollInCampaign`). The severing is proven against
the **real** mode resolver with the kill switch off and the promotion record empty — production's
own configuration, not stubs: the invite and the confirmation fire, the SMS and the enrolment do
not. The same test proves the kill switch still stops booking, including when the switch is
unreadable, so the exception is not an exception to the stop button.

---

## 6. The clicks that are Ali's, and the ones that are not

The split is the same everywhere: **widening what she does without a person is Ali's; narrowing it
is any admin's**, because silencing her during an incident must never wait on one person.

| Action | Who | Where |
|---|---|---|
| Approve one outbound message | Ali or a super_admin | `/admin/outbound-approvals` |
| Reject one outbound message | any admin | the same screen |
| Turn her agent row ON | Ali or a super_admin | `/admin/maya` |
| Turn her agent row OFF | any admin | `/admin/maya` |
| Widen a capability (`shadow -> review -> live`) | Ali or a super_admin | `/admin/maya` |
| Narrow a capability | any admin | `/admin/maya` |
| Confirm a capability record so a tool can be granted | Ali | the capability ladder |
| Approve a tool grant | Ali, and never the proposer | `/admin/tool-requests` |
| Throw the kill switch | any admin | the existing War Room control |

Two of those gates require **Ali's own identity** and nothing in this build routes around either:
promotion (`requireCoryAuthorized`) and tool-grant approval, which refuses
`approver_is_the_proposer`. The nine grant requests filed in this run are filed as `claude-code`
for exactly that reason — filing them as Ali would have made his own approval impossible.

### What the approval queue cannot do, and how each clause is defended

| The clause | The defence |
|---|---|
| not by a retry | `approveOutbound` claims the row with a conditional UPDATE, so the second caller sends nothing |
| not by a replay | `enqueueOutbound` is keyed on `idempotency_key` with a UNIQUE index, so composing twice is one row |
| not by a cron | there is **no timer** in the queue module and none may be added. The expiry sweep lives in its own module, can write only `expired`, and is deliberately not boot-wired to any scheduler |
| not by a timeout | `expires_at` has no path to `approved`, and the database rejects any `decided_by` beginning with `system:` |
| not by a second tool call | the same claim as the retry |
| not by a bulk button | there is no bulk approve function, no route shaped like one, and no control on the screen. Tests assert all three |

**The decider is a database constraint, not a convention.**
`chk_moa_decider_is_a_person` rejects any `decided_by` beginning with `system:`, and the status
vocabulary has no `auto_approved`. That shape exists because the repo already had the defect:
`approvalRequestTimeoutJob.ts` auto-approves every expired row in `approval_requests` on an
unguarded fifteen-minute cron, and `reeseOutreachHolds.ts` records what it cost — **851 replayed
DMs to 52 students between 7 Oct and 12 Nov 2026, one student 37 times.** That is why Maya's queue
is a new table rather than a reuse of that one.

**What was shown is what is sent.** The row holds the exact bytes, rendered at compose time, and a
sha256 of them. Approval re-hashes before transmitting and refuses `body_changed_since_review` if
anything moved. This is why `renderAdmissionsDocument` was split out of `sendAdmissionsDocument`:
the HTML used to be assembled inside the sender, so a row holding a summary would have read as
reviewed while the message that actually left was produced afterwards from inputs nobody saw.

**A suppressed recipient is never queued.** Consent is evaluated before anything is written, so a
blocked send leaves no row at all. A queue row for somebody who unsubscribed is how an unsubscribe
gets overridden by a tired reviewer.

**A failed delivery is not retried.** The row records the failure and a person decides what to do.
An automatic retry of an outbound message is the exact mechanism that produced the 851 replays.

---

## What this document does not cover

The journey engine's own rungs — classification, journey programmes, `GROWTH_JOURNEY_*` — are in
[`MAYA_RELEASE_GATE.md`](./MAYA_RELEASE_GATE.md). None of them was turned on by this work, and
`GROWTH_JOURNEY_EXECUTION_ENABLED` remains unset, which is still one of the things standing between
`sendEmail` and a real inbox.
