# CC-20261109-k2w7 — MR2: Maya gets an email capability, and it starts in shadow

**Date:** 2026-11-12
**Branch:** `workstream/mr4-maya-welcome-audience-and-delivery` off `origin/main` @ `031db3b5c`
**Ticket:** MR2, https://3.basecamp.com/3945211/buckets/7463955/todos/10503714629
**Run:** `.loop-architect/runs/20261112-maya-release-ladder/` (gitignored)

## The thing the ticket exists to say

"Release Maya on email" reads like a flag flip and is not one. **There was no Maya email capability
to flip.** Her governed capability set was exactly four — `respondToExplorerDm`,
`sendInAppWelcome`, `createJourneyHandoff`, `readPerson360` — and none of them is email. A test at
`mayaCapabilityRoutes.access.test.ts:68` even asserted `sendEmail` was an *unknown* capability and
must be rejected with a 400. That rejection was the proof it did not exist.

## T005 — declaring the capability

A Maya capability is four edits keyed on one string literal, and `mayaEnablement.ts:29-30` states
the design rule explicitly: adding one adds **no new flag**. The resolver composes gates that
already exist, so there is no second flag registry and no second kill switch.

| Edit | File |
|---|---|
| Union member | `backend/src/services/mayaEnablement.ts` `MayaCapability` |
| Gate mapping | `backend/src/services/mayaEnablement.ts` `MAYA_CAPABILITY_GATES` |
| Promotion default | `backend/src/services/maya/mayaPromotion.ts` `DEFAULT_STATES` |
| Proactive set | `backend/src/services/maya/mayaPromotion.ts` `NEEDS_M29_FOR_LIVE` |

### The gate decision, which is the reviewable part

`sendEmail: { growth: 'journeyExecution' }` — **no Explorer gate.**

Every other outbound capability pairs `journeyExecution` with the Explorer flag for its channel,
because `inAppNudge` gates the in-product surface. Email has no such flag. The Explorer feature
union is `signalIngest`, `journeyIntelligence`, `journeyGovernor`, `draftRender`, `commercial`,
`aliOutreach`, `sms`, `autoDial`, `inAppNudge`, `aiRanking` — and none of them is an email channel.
`draftRender` gates *rendering* a draft, not sending one; borrowing it would make the gate read as
something it is not.

Fewer gates is the uncomfortable direction, so it is worth being explicit about what still stands
between this capability and a real inbox. Six independent things, all of them off or absent in
production today:

1. the promotion record (`system_settings` key `maya_capability_promotions` — **no Maya promotion
   records exist**),
2. `GROWTH_JOURNEY_EXECUTION_ENABLED` (**unset**),
3. Maya's `ai_agents` row (**`enabled=false`**),
4. her `send_email` grant (`agentRegistrySeed.ts:3326` records it as deliberately absent),
5. a brand scope (`agentEmailTool.ts` drafts rather than sends without a campaign),
6. `evaluateSend`, the consent chokepoint.

This flag is one of six, not the only one.

### `DEFAULT_STATES.sendEmail = 'shadow'`

There is no argument for a different default. `respondToExplorerDm` is `live` only because she had
been answering portal DMs since C121 and starting it in shadow would have silenced her on deploy.
**Nothing has ever sent an email as Maya**, so there is no existing behavior for a shadow default
to interrupt.

### The test that had to be inverted

`mayaCapabilityRoutes.access.test.ts` asserted `sendEmail` → 400. It now returns 200, and that flip
is the proof the registry picked the capability up. The unknown-capability probe moved to
`notACapability`, a name nothing will ever register — otherwise the next capability to ship would
silently turn that assertion into a test of its own existence rather than of the rejection. Two
cases were added alongside it: `sendEmail` promote is **200 for Ali** and **403 for any other
admin**, because the capability that can reach a stranger's inbox must not be promotable by
whoever happens to be signed in.

## Verification

- **66 tests pass** across `mayaEnablement.test.ts`, `mayaPromotion.test.ts` and
  `mayaCapabilityRoutes.access.test.ts`. The first two suites are enumeration-driven over
  `MAYA_CAPABILITIES`, so the new capability is automatically carried through every default-off,
  kill-switch and flag case; the added blocks pin only what is true of `sendEmail` and nothing
  else.
- The load-bearing new assertion: **a promotion alone does not make it live.** Promoting with M29
  off resolves `shadow` with reason `m29:growth_flag_off:journeyExecution`. If that ever resolves
  `live`, one signature has become enough to mail a stranger.
- **Mutation tested, both directions:**
  - dropping `sendEmail` from `NEEDS_M29_FOR_LIVE` → the promotion-alone test fails (1 test).
  - borrowing `inAppNudge` as its Explorer gate → the no-explorer-gate test fails (1 test).
  - restored: 55 pass.
- `tsc --noEmit`: 0 errors. Proven real earlier in this run by a planted control error reported at
  `mayaToolsService.ts(1049,7)`.
- `growthJourneyFlags.test.ts` and `explorerGrowthFlags.test.ts` still pass — these are raw text
  scans that fail the build on any dotted sub-flag read outside the flags module, **including
  inside a comment**, and the new docblock names flags in prose without dotted reads.

## Not done here, deliberately

Granting `send_email` in `agentRegistrySeed.ts` and giving Maya a brand scope are listed under
MR2's "what to do", but they are promotion-ladder rungs: they are what makes a send *possible* once
the capability exists. Both are documented as rungs in the MR5 release-gate runbook. No capability
was promoted. No flag was flipped.

## T006 — `mayaEmailService`: compose, check consent, claim, record

`backend/src/services/maya/mayaEmailService.ts` (new). The capability layer, built on the patterns
that already existed rather than new mechanism.

### Why a new file when `agentEmailTool` already exists

`agents/tools/agentEmailTool.ts` is the shared outbound tool: it reads an agent's grant and
autonomy, asks `evaluateSend`, and drafts whenever anything is uncertain. It is the right thing,
and it is **not a capability** — it has no promotion gate, no shadow mode and no per-person ledger,
which are the three things MR2 asked for and the three things `sendInAppWelcome` has. The two are
complementary. The new service owns the capability gate, the shadow record and the idempotency
claim; the authorization question it delegates.

### The order of operations is the design

1. **mode** — `off` returns before anything else happens, including the lead lookup.
2. **non-routable address** — refused **before** the ledger claim, so a fixture leaves no row at
   all rather than a row that looks like a suppressed email. This is the rule MR4 established
   after Maya composed a welcome for a smoke-test account every day for thirteen days.
3. **lead resolution** — by `lower(email)`, because `leads` carries a UNIQUE index on
   `LOWER(email)`. **No lead means refuse.** Consent lives on the lead, and an unverifiable
   consent is not a licence to send; it is the reason not to.
4. **`evaluateSend`** — a refusal writes **no ledger row at all**. `agentEmailTool` states the rule
   this follows: a message to somebody who unsubscribed must not sit in a queue for a tired
   reviewer to approve later.
5. **claim** — `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`, **before** any
   send, so the claim is arbitrated by the index rather than by a read-then-write. A
   read-then-write is a race, and this is the race that mails somebody twice.
6. **shadow records / live sends** — and a failed send is never marked delivered, with no retry,
   because a retry after a claim is how one message becomes two.

### The ledger is its own table, and that was forced

`maya_welcome_ledger` cannot be reused: its unique key is `enrollment_id` alone with **no
capability discriminator**, so a second capability writing there would silently collide with the
welcome row for the same person and be refused by `ON CONFLICT DO NOTHING`. Its columns are
welcome-shaped too (`room_id`, `message_id` are in-app DM identifiers; there is no recipient or
subject). So `maya_email_ledger` is new, created by `CREATE TABLE IF NOT EXISTS` on first use and
memoized, exactly as the welcome table is — which keeps `server.ts` untouched.

**Data at rest.** The row holds a recipient address, a subject and a full composed body, so it is
the most sensitive thing this capability creates. Three constraints, each asserted by a test rather
than written as a comment: nothing else in the codebase reads the table; **no log line carries the
body or the recipient** (logs carry the purpose, the lead id and the idempotency key, which is a
hash); and `DROP TABLE IF EXISTS maya_email_ledger` is both the rollback and the retention action
once a promotion decision is made, recorded in the release-gate runbook.

### The copy is a closed set, not a model call

One purpose, `explorer_welcome`, with reviewed copy. `mayaWelcomeService` makes the same choice for
the same reason: an email leaves the platform and cannot be withdrawn, so the copy is reviewed once
here rather than generated per send and reviewed never. Tests assert the AI disclosure is present
and that the body carries no price, no date, no deadline, no seat count, never the word "free"
(40 TAC 807.172(d)), and no promise that a person will be in touch.

### The transport, and the trap it had to avoid

`backend/src/services/email/mayaEmailTransport.ts` (new). It rides on `guardedSendMail`, the one
chokepoint all thirty senders in `emailService.ts` already pass through and where the kill switch
is enforced. A separate file because `emailService.ts` is **3,043 lines** and CLAUDE.md requires a
split before adding to a file past the ceiling — splitting a thirty-sender module is a refactor
nobody asked for here.

**`guardedSendMail` does not throw when it refuses.** It returns a `SentMessageInfo`-shaped stub
with `response: 'blocked_by_kill_switch'` or `'blocked_by_dev_email_guard'`, `messageId: ''` and
`accepted: []`. **That is the same trap as the voice path in T001**, where `triggerVoiceCall`
returned a success envelope carrying `skipped: true`. Reading the stub as a send would put the same
lie in writing, and would mark an `email_send_ledger` row `sent` for mail that never left —
permanently blocking the retry that would have delivered it. So three signals are checked
separately, because they mean different things: a `blocked_by_` response, an empty `accepted`, and
an empty `messageId`.

### A logging fix found while writing the tests

The log helper was copied from the welcome service, which routes on whether an exception is in
hand. That sends a refusal with no exception — a suppressed recipient, an unverifiable one — to
`console.log` at `info`. Those are exactly the lines somebody needs to find later, so this one
routes on the **outcome**: a failure is a warning whether or not anything threw.

## T007 — proving the shipped default cannot send

`mayaEmailShippedDefaultCannotSend.test.ts` mocks nothing that decides the mode. It drives the
**real** `resolveMayaMode` and the **real** `resolveMayaCapability` against production's measured
state, with flag fixtures built by the **real** resolvers from an empty environment — not
hand-written literals, which would keep passing if the opt-in rule loosened from the exact string
`'true'`.

The property: **it takes two independent changes, with two different owners.**

| Change | Result |
|---|---|
| Nothing (today) | `shadow` / `not_promoted`, transport never called |
| A recorded promotion alone | `shadow` / `m29:growth_flag_off:journeyExecution` |
| The environment flag alone | `shadow` / `not_promoted` |
| Both together | `live` / `promoted` |
| Kill switch on, over both | `off` / `kill_switch` |
| Kill switch unreadable | `off` / `kill_switch_unreadable` |

If either of the two middle rows ever reports `live`, one signature has become enough to mail a
stranger. The `both together` row is in the suite deliberately: a gate that can never open is not
a gate, it is a disabled feature pretending to be one, and the file would pass trivially without
it.

## Verification

- **208 tests pass** across 13 suites: `mayaEmailService` (30), `mayaEmailShippedDefaultCannotSend`
  (10), `mayaEmailTransport` (9) and the ten pre-existing maya suites.
- **Mutation tested in three directions**, because each failure costs something different:
  - shadow calls the transport → **5 fail**
  - the unique index is absent, so the claim stops being atomic → **2 fail**
  - the transport reads a `blocked_by_` stub as a send → **2 fail**
- `tsc --noEmit`: 0 errors, proven real earlier in this run by a planted control error.
- **No Playwright coverage exists for this surface.** Stated as a gap, not claimed.

## Not done here, deliberately

Granting `send_email` in `agentRegistrySeed.ts` and giving Maya a brand scope are listed under
MR2's "what to do", but they are promotion-ladder rungs — what makes a send *possible* once the
capability exists. Both are documented as rungs in the release-gate runbook. No capability was
promoted, no flag was flipped, and no row was written to any database.
