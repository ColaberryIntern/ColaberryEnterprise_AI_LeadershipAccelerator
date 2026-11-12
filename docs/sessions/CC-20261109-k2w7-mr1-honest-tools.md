# CC-20261109-k2w7 — MR1 defect 4: Maya's outbound tools stop reporting what did not happen

**Date:** 2026-11-12
**Branch:** `workstream/mr4-maya-welcome-audience-and-delivery` off `origin/main` @ `031db3b5c`
**Ticket:** MR1, https://3.basecamp.com/3945211/buckets/7463955/todos/10503714614
**Run:** `.loop-architect/runs/20261112-maya-release-ladder/` (gitignored)

## What the ticket got wrong, and what was actually there

MR1 filed defect 4 as *"SMS and voice are exposed and the prompt pushes them"* — a posture
mismatch between the site Maya and the portal Maya, with the note that *"both tools return
success:false with a real reason, so neither can currently complete"*.

**That last part was wrong, and it was the whole defect.** Neither tool returns `success:false`.
Both report success when nothing happened.

The ticket also named `SYNTHFLOW_ASSISTANT_ID` as the missing variable. **It does not exist
anywhere in the codebase** — the only occurrence in the repo is my own earlier session note. The
load-bearing names are `ENABLE_VOICE_CALLS` (`config/env.ts:90`, strict `=== 'true'`) and
`SYNTHFLOW_INTEREST_AGENT_ID` (`config/env.ts:186`).

## It already reached two real people

Measured in production 2026-11-12, read-only:

| Check | Result |
|---|---|
| `admissions_action_logs` where `action_type='voice_call_initiated'` | **2 rows, both `status='completed'`**, 2026-10-24 and 2026-11-06 |
| `call_contact_logs` | **2 `pending` rows, both with `synthflow_call_id IS NULL`** |
| `communication_logs` where `channel='voice'` | 1540 rows, 1493 with a provider id — none of them Maya's |
| `ENABLE_VOICE_CALLS` in the prod container | **`false`** |
| `SYNTHFLOW_API_KEY` / `SYNTHFLOW_INTEREST_AGENT_ID` | PRESENT (len 43) / PRESENT (len 36) |

A null provider id means the request never reached Synthflow. The voice path is fully configured
and switched off, so **every** attempt takes the `feature_disabled` branch. Two visitors were told
"you should receive a call shortly" and no call was ever placed.

## The mechanism

`triggerVoiceCall` returns `{ success: true, data: { skipped: true, reason } }` for six reasons it
did not dial: `kill_switch_active`, `feature_disabled`, `no_phone`, `no_api_key`, `no_agent_id`,
`no_prompt` (`synthflowService.ts:148-196`). It is a 200-shaped success; nothing throws and no
error class is constructed. `initiateVoiceCall` read `result.success` alone, so on all six paths it
wrote a `CallContactLog` row with `call_status: 'pending'` and a null id, tagged the lead, enrolled
it in the Voice Call Requested campaign, logged `voice_call_initiated: completed`, and returned
"should receive a call shortly".

Two consequences worth naming separately:

1. **`kill_switch_active` is one of the six.** The platform-wide emergency stop halted the dial and
   left Maya still promising calls — the opposite of what that switch exists to do.
2. **The phantom row broke the retry.** The 24h dedup matches any `CallContactLog` row for the
   visitor *regardless of `call_status`*, so a skipped attempt blocked the next genuine one for a
   day.

## T001 — what changed

`backend/src/services/mayaToolsService.ts`:

- Added `logOutboundOutcome()` — one structured JSON line per outbound outcome, with `event`,
  `outcome`, `error_class` and `context`, to CLAUDE.md's log contract. Before this the file emitted
  only prefixed plain strings, so the failure that mattered most had no alertable event name.
  `context` deliberately carries the visitor and the reason, never the phone number.
- Added `VOICE_SKIP_SUMMARY` — a reason-to-summary map. Every entry obeys two rules: it never
  implies a call is coming, and it names the alternative that actually works (`schedule_callback`
  writes a real `callback_requests` row). `kill_switch_active` is the exception that offers no
  outbound route at all, only the booking calendar.
- `initiateVoiceCall` now distinguishes **three** outcomes instead of two:
  - **not dialled** (`skipped`, or `success: false`) → failure, **no `CallContactLog` row**, no
    tag, no campaign enrolment, `logAction('failed')`.
  - **accepted but no `call_id`** → the one genuinely *unknown* case. A call may be ringing and
    cannot be tracked, because the completion webhook matches on `provider_message_id`. Reported as
    a failure ("could not be confirmed") but the row **is** written, because a duplicate call to a
    stranger is worse than a duplicate row.
  - **placed** (`call_id` present) → unchanged behavior.
- The `catch` no longer puts the provider's error text into the summary the model relays; it could
  carry a URL, an id or an upstream payload.

## Verification

- **32 new tests pass** — `backend/src/services/__tests__/mayaVoiceToolHonesty.test.ts`. All six
  skip reasons are table-driven across three assertions each (reports failure, writes no row,
  does not tag or enrol), plus the kill-switch case, the provider rejection, the unconfirmed case,
  four tests that the working path is untouched, and two that the failure is observable and carries
  no phone number.
- **Mutation tested:** reverting the guard to `const providerAccepted = result.success` — the
  original bug — fails **8 tests**. Restored: 32 pass.
- **`tsc --noEmit`: 0 errors, and proven real.** A planted control error was reported at
  `mayaToolsService.ts(1049,7)` before being reverted, so the clean result is a measurement rather
  than an assumption.
- **Playwright:** no coverage exists for this surface. Stated as a gap, not claimed.

## T001 follow-up: what the independent verifier found, and what changed because of it

T001 was graded **11/12, PASS** by `loop-task-verifier`, which reproduced every executable claim
on its own runs (32/32 tests, the mutation at 8 failures, `tsc` clean, and its own planted control
error landing at `mayaToolsService.ts(1049,7)` — the same coordinates the first commit claimed).
Three findings were worth acting on rather than noting.

### 1. The single deduction: the file broke CLAUDE.md's size ceilings

`mayaToolsService.ts` went **875 to 1,047 lines** against a 500-line hard ceiling, and
`initiateVoiceCall` went **169 to 272** against a 100-line ceiling, with no extraction. The
Modular Composition Rule grandfathers an oversize file only *"until touched"*, and says the next
change to it **must split it before adding new code**. T001 touched it and split nothing, so the
deduction was correct.

Split, with the public surface unchanged:

| New module | Lines | Holds |
|---|---|---|
| `services/mayaTools/toolContext.ts` | 88 | `resolveLeadForVisitor`, `logAction`, `logOutboundOutcome` |
| `services/mayaTools/voiceSummaries.ts` | 74 | the skip-reason table and `voiceSkipSummary()` |
| `services/mayaTools/voiceTool.ts` | ~306 | `initiateVoiceCall` |
| `services/mayaTools/smsTool.ts` | 105 | `sendSmsSummary` |

`mayaToolsService.ts` re-exports all three public names, so **no caller and no test mock changed**
— including `mayaSendDocumentGovernance.test.ts`, which mocks `'../mayaToolsService'` by name.
`toolContext` is a deliberate leaf (models only), so `mayaToolsService -> voiceTool ->
toolContext` stays acyclic.

**The split is partial, and that is stated in the code rather than hidden.** The file is now
**628 lines**, not under 500. Finishing it means moving the remaining six tools, which is a far
larger change than MR1 asked for and would put the whole site chat at regression risk in one
commit. The two tools this work actually modifies now live in compliant modules, and the file
header records that the next tool to be touched is the next one to move.

### 2. There are SEVEN skip reasons, not six

The verifier found `invalid_phone` (`synthflowService.ts:222`), raised after the number is
normalised. My comments, the test table and the commit message all said six.

No behavioral gap existed, because the guard is keyed on `data.skipped === true` rather than on a
list of names — so `invalid_phone` always refused correctly. But **nothing pinned that**, and it
fell through to the generic fallback, which tells the model to offer a callback when *"ask for a
number that works"* is the right answer. Now: the reason is in the table with its own guidance,
it is in the test's table-driven cases, and it is excluded from the "offers a callback" assertion
because a bad number does not need a callback to the same bad number. The code comment now
records that correctness must not depend on the list being complete, since the list has already
grown once under this code.

### 3. The unconfirmed row was indistinguishable from the phantom rows

The verifier noted that the accepted-but-untrackable row is written as `call_status: 'pending'`
with `synthflow_call_id: null` — **byte-identical in shape to the two phantom production rows the
fix exists to prevent**. Since the webhook matches on `provider_message_id`, that row can never
resolve, so a future forensic query on "pending with a null id" could no longer separate a
legitimately unconfirmed attempt from the old bug's output. It now carries a distinct
`reason_for_call`, which makes that query possible without touching a `call_status` value other
code may switch on.

### Not charged, and worth recording

`logAction(..., 'completed', { lead_id, phone, ... })` still writes the phone number into the
`admissions_action_logs` row on the **success** path. Pre-existing, unchanged by this work, and
the new tests only assert the *refusal* row is clean. The new structured log lines also omit
`correlation_id` and `duration_ms`: no correlation id is plumbed into the site-chat tool entry
point at all, so emitting the field would mean emitting null. Both are recorded in
`toolContext.ts`'s header as known gaps rather than left to be rediscovered.

### Verification after the split

- **88 tests pass** across five suites: `mayaVoiceToolHonesty` (35, now including
  `invalid_phone`), `mayaAgentRegistration`, `mayaSendDocumentGovernance`,
  `admissionsKnowledgeGateCoverage`, `calendarTarget`. The last four are the neighbours that
  would break if the re-export shim were wrong.
- `tsc --noEmit`: 0 errors.

