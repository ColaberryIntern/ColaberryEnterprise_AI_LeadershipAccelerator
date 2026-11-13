# Maya promotion checklist: shadow to live, one capability at a time

**Ticket:** M37 (`Design Explorer Growth - Maya`, todo 10411539768) | **Owner of every promotion:** Ali
**Code:** `backend/src/services/maya/mayaPromotion.ts` | **Routes:** `backend/src/routes/admin/mayaCapabilityRoutes.ts`
**The cross-layer ladder** (the journey engine, the agent rows, the env flags, the rollout
control): [`MAYA_RELEASE_GATE.md`](./MAYA_RELEASE_GATE.md). This document owns the per-capability
promotion layer only.

NOTHING SENDS is the standing rule of this workstream. Leaving shadow is the moment it stops applying, so leaving
shadow is a recorded human decision, never a deploy and never a default.

---

## How Maya's mode is decided, in order

1. **Kill switch** (`system_kill_switch` in system_settings, platform-wide). On, or unreadable: every capability is
   **off**.
2. **Portal chat** (`ENABLE_CHAT`). Off: her DM reply is **off**.
3. **The promotion record** (`maya_capability_promotions` in system_settings). Unreadable: **off**. Not promoted:
   **shadow**.
4. **The M29 gate**, for capabilities that act without being asked (welcome, handoff, Person 360). Promoted but the
   M29 flags are off: still **shadow**. Those flags (`GROWTH_JOURNEY_*`, `EXPLORER_IN_APP_NUDGE_ENABLED`) are Ali's.

What each mode means:

| Mode | What Maya does |
|---|---|
| off | Nothing. No record, no message, no model call. |
| shadow | Records what she would have done. Delivers nothing to a person. |
| live | Acts for real, through the existing surface for that capability. |

**Starting state (Ali, 2026-11-09, "Q2: A"):** `respondToExplorerDm` starts **live**, because she has answered
portal DMs since C121 and starting in shadow would silence her on deploy. Every other capability starts in **shadow**.

---

## Who may do what

| Action | Who | Route |
|---|---|---|
| See every capability's mode and the history | any admin | `GET /api/admin/maya/capabilities` |
| Promote a capability to live | Ali or a super_admin only | `POST /api/admin/maya/capabilities/<capability>/promote` |
| Revert a capability to shadow | any admin | `POST /api/admin/maya/capabilities/<capability>/revert` |

Both writes need a body of `{"review_note": "<3 to 500 characters>"}`. The reviewer recorded is the signed-in
identity, never a field someone types. Every change is appended to the history with who, when and why.

---

## Per capability

### respondToExplorerDm (M31): Maya answers a portal DM

- **Before promoting (or, today, before keeping it live):**
  - The refusal tests pass. A seat, deadline or consent question becomes a handoff, never a generated number.
  - Price answers come from the price of record (`membershipPrice.ts`), checked by `scripts/checkPriceAgreement.js`.
  - Her first message in a conversation says she is an AI.
- **Promote:** `POST /api/admin/maya/capabilities/respondToExplorerDm/promote` with `{"review_note": "<what you reviewed>"}` (Ali or a super_admin only).
- **Verify:** DM Maya from a test Explorer and ask "how many seats are left?". The reply hands off and contains no
  number.
- **Revert:** `POST /api/admin/maya/capabilities/respondToExplorerDm/revert` with `{"review_note": "<why>"}` (any admin). She stops replying (shadow logs what she would have
  said).

### sendInAppWelcome (M32): Maya welcomes a new Explorer, unprompted

- **Before promoting:**
  - At least a week of shadow rows in `maya_welcome_ledger` reviewed by Ali. The body is right, and nobody received
    one: every `delivered_at` is empty.
  - Ali decides the M29 flags (`GROWTH_JOURNEY_EXECUTION_ENABLED` and `EXPLORER_IN_APP_NUDGE_ENABLED`). Without them,
    a promotion stays shadow.
- **Promote:** `POST /api/admin/maya/capabilities/sendInAppWelcome/promote` with `{"review_note": "<what you reviewed>"}` (Ali or a super_admin only).
- **Verify:** sign up a test Explorer. One ledger row appears with `mode = live` and `delivered_at` set, and one DM
  from Maya appears in their inbox.
- **Revert:** `POST /api/admin/maya/capabilities/sendInAppWelcome/revert` with `{"review_note": "<why>"}` (any admin). New sign-ups get a shadow row only.

### createJourneyHandoff (M33): Maya hands a person to admissions on her own initiative

- **Before promoting:** handoffs created by the tour and by DM questions have been worked from the admissions queue
  (M35) without problems. `GROWTH_JOURNEY_HANDOFFS_ENABLED` is Ali's.
- **Promote:** `POST /api/admin/maya/capabilities/createJourneyHandoff/promote` with `{"review_note": "<what you reviewed>"}` (Ali or a super_admin only).
- **Verify:** a handoff appears once in the admissions queue, ordered by readiness.
- **Revert:** `POST /api/admin/maya/capabilities/createJourneyHandoff/revert` with `{"review_note": "<why>"}` (any admin).
- **Note:** a person asking for a human (the tour opt-in, or a question Maya must not answer) is not proactive. It is
  governed by `GROWTH_JOURNEY_HANDOFFS_ENABLED` alone. When that flag is off, Maya offers the book-a-call link
  instead, and never claims someone will reach out.

### readPerson360 (M34): Maya reads the person's record before she answers

- **Before promoting:** Ali is comfortable with Person 360 context (stage, readiness, history) being sent to the
  model. The M29 flag `GROWTH_JOURNEY_DECISIONS_ENABLED` is Ali's.
- **Promote:** `POST /api/admin/maya/capabilities/readPerson360/promote` with `{"review_note": "<what you reviewed>"}` (Ali or a super_admin only).
- **Verify:** her answer to a returning Explorer refers to where they are in the program.
- **Revert:** `POST /api/admin/maya/capabilities/readPerson360/revert` with `{"review_note": "<why>"}` (any admin). She answers from the conversation alone.

---

### sendEmail (MR2): Maya emails a person, unprompted

**The first capability whose action leaves the platform.** The others deliver in-app or file a
row; this one reaches an inbox and cannot be withdrawn.

- **Before promoting:**
  - At least a week of shadow rows in `maya_email_ledger` reviewed by Ali. Each row holds the
    exact subject and body she would have sent, with `delivered_at` empty: the body is right, and
    nobody received one.
  - **R1 (todo 10455593417) has decided** whether Maya may contact the ad cohort at all, and on
    which channels. MR2 was built in shadow regardless, because R1 governs promotion rather than
    construction — but a promotion before R1 is a decision taken out of order.
  - Ali decides `GROWTH_JOURNEY_EXECUTION_ENABLED`. Without it, a promotion stays **shadow**.
  - The release-gate ladder's Maya rungs are done: her `ai_agents` row is enabled, `send_email` is
    in `tools_granted`, and she has a brand scope. Without the grant `readAgentGate` answers
    `tool_not_granted`; without the brand scope the send short-circuits to `no_brand_scope` and
    **drafts instead of sending**, which is correct behaviour and not a bug.
- **Promote:** `POST /api/admin/maya/capabilities/sendEmail/promote` with
  `{"review_note": "<what you reviewed>"}` (Ali or a super_admin only).
- **Verify:** sign up a test Explorer whose address is routable. One `maya_email_ledger` row
  appears with `mode = live`, `delivered_at` set and a `provider_message_id`, and the matching
  `email_send_ledger` row reads `sent`. If `delivered_at` is set while the send ledger is not
  `sent`, **stop** — that is the stop condition in the release gate.
- **Revert:** `POST /api/admin/maya/capabilities/sendEmail/revert` with `{"review_note": "<why>"}`
  (any admin). New attempts record a shadow row only.
- **Four things that are true of this capability and of no other, worth knowing before you
  promote it:**
  - **A suppressed recipient leaves no row at all.** Every other refusal records; a consent
    refusal deliberately does not, so there is never a draft of a message to somebody who
    unsubscribed sitting in a queue for a reviewer to approve later.
  - **A recipient with no `leads` row is refused.** Consent lives on the lead, and an unverifiable
    consent is not a licence to send.
  - **The copy is a closed set**, not generated per send. One purpose exists today,
    `explorer_welcome`. Adding another is a deliberate edit to a frozen object in
    `mayaEmailService.ts`, which is the point.
  - **It is keyed per person per purpose.** A second identical attempt writes no second row,
    arbitrated by a unique index rather than a read-then-write, so two concurrent calls cannot
    both proceed.
- **Rollback for the capability itself:** `DROP TABLE IF EXISTS maya_email_ledger;`. Nothing else
  reads that table. It holds a recipient, a subject and a full body, so dropping it is also the
  retention action once a promotion decision has been made.

## The cycle every promotion must prove

1. **Promote:** call the promote route with a note.
2. **Verify:** `GET /api/admin/maya/capabilities` shows `mode: live` for that capability, and the verify step above
   works.
3. **Revert:** call the revert route with a note.
4. **Verify again:** the GET shows `mode: shadow`, and the verify step now records without delivering.

The same cycle is proved in code by `services/maya/__tests__/mayaPromotion.test.ts` ("promote, verify, revert, verify
again").

## Turning Maya off

**Maya only (the normal way):** revert the capability. `POST /api/admin/maya/capabilities/respondToExplorerDm/revert`
with a note silences her DM replies on the very next message; revert the others the same way. Any admin may do this.

**Everything (an incident):** the system kill switch, `POST /api/admin/system/kill-switch` with
`{"activate": true, "reason": "<why>"}` (status: `GET` on the same path; it also shows on the Admin Trust Center).
Every Maya capability reads **off** on the next message, and so does every other outbound agent and campaign on the
platform: this is the platform-wide stop, not a Maya switch. `{"activate": false}` restores exactly the promoted
states. No deploy is needed and nothing is lost.
