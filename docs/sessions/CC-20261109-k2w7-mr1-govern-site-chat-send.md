# CC-20261109-k2w7 — MR1: govern the site-chat document send

**Date:** 2026-11-12
**Branch:** `workstream/mr1-govern-site-chat-send` off `origin/main` @ `22aecfe8d`
**Ticket:** MR1, https://3.basecamp.com/3945211/buckets/7463955/todos/10503714614

## Why

Maya's public site chat could email a real person with no consent check, no idempotency
key, and a body that stated an attachment the code never adds. Verified in production on
2026-11-12: `ENABLE_CHAT=true`, a Mandrill key present, `APP_ENV` not dev, so the dev email
guard is off and the path can send. `system_kill_switch` is false. `consent_enforcement` is
`"enforce"`, so the consent gate is live and this path walked around it.

`document_delivery_logs` held **0 rows**, so the path had never actually fired. This was a
latent exposure rather than an incident, and releasing Maya is exactly what would have
increased traffic on it.

## What changed

**`backend/src/services/emailService.ts`**
- `sendAdmissionsDocument` returns `AdmissionsDocumentOutcome` instead of `void`. It used to
  return early on two different failures with no way for the caller to tell, which is how
  Maya came to report a send on a path where no mail left.
- It now **refuses** when it has neither `documentUrl` nor `documentContent`, because the
  fallback branch rendered a sentence saying the document was enclosed and this function
  adds no attachment. The third branch is deleted, so there is no code path that can make
  that claim.

**`backend/src/services/mayaActionService.ts`** (`handleSendDocument`)
- Resolves the lead from the **recipient address** first, falling back to the visitor's
  lead. The address comes from whatever the visitor typed, so keying consent on the
  visitor's lead checked one person and mailed another. That was the real hole.
- Calls `evaluateSend` (kill switch, scheduler pause, rate limit, lead status, unsubscribe
  events, per-channel suppression) and honors a refusal without telling the visitor why.
- Honors a test-mode redirect rather than mailing the real recipient anyway.
- Wraps the send in `sendOnce`, so the claim is arbitrated by a UNIQUE index before the
  provider is called. Business event is `maya-doc-<document_type>-<visitorId>`.
- Reports honestly on all three outcomes: `sent`, `skipped` (already sent), `failed` (not
  "Successfully sent"). A failure writes a `failed` delivery row so a person can act on it.
- A recipient with **no lead row** proceeds: suppression is recorded against `lead_id`, so
  there is no opt-out to honor, and refusing would break a visitor who just asked for a
  document.

**`backend/src/services/communicationSafetyService.ts`**
- `SendSource` gains `'agent'`. The field is logged and never branched on, so this changes
  no decision; it stops Maya's send being labeled `'manual'` in the audit line.

## Verification

- `npx tsc --noEmit`: **0 errors**, and proven real by planting a control error in
  `mayaActionService.ts` which tsc reported at line 608 before it was reverted. A clean
  typecheck in these worktrees has been a false negative before.
- New suite `backend/src/services/__tests__/mayaSendDocumentGovernance.test.ts`, 22 tests.
- Extended `emailServiceBrandPreflight.test.ts` with 4 tests on the document body.
- Both suites: **47 passed, 0 failed**.
- **Mutation tested**, because a passing test proves nothing until it fails for the right
  reason:
  - ignore the consent refusal → 1 test fails (correctly only one: the leak test asserts on
    a string that stays absent either way)
  - check consent against the visitor instead of the recipient → 2 tests fail
  - reintroduce the attachment sentence as a third branch → 1 test fails, caught by the
    source-level assertion. The render-level checks drive only the two live branches, which
    is exactly why the source check is there.
  - restored → 47 passed
- Full backend suite: see the PR body for the run.

## Not done, deliberately

The SMS and voice half of MR1 is **not** in this change. The site tool belt holds
`send_sms_summary` and `initiate_voice_call` and `admissionsMayaService.ts:203` instructs
"IMMEDIATELY call initiate_voice_call", while the portal Maya refuses both by name at
`mayaPortalPrompt.ts:63`. Measured: `SYNTHFLOW_API_KEY` is present but
`SYNTHFLOW_ASSISTANT_ID` and every GoHighLevel key are absent, and both tools return
`success: false` with a real reason, so neither can complete today. Removing a tool from a
live agent is a product decision, not an implementation detail, so it stays on MR1 for Ali
rather than being done silently here.
