# Communication Map — Gate 0

- Date: 2026-09-03 · Session: CC-20260902-m8q4 · Base: `e99fdb35`

## What exists

| Concern | Location |
|---|---|
| Sending | `services/emailService.ts` |
| Sender identity per brand | `models/SenderProfile.ts` |
| Recipient preferences | `models/CommunicationPreference.ts` |
| Send safety | `services/communicationSafetyService.ts` — `evaluateSend()` |
| Audit | `services/communicationLogService.ts` → `CommunicationLog` |
| Consent | `services/consent/captureSignupConsent.ts` |
| Executive routing | `models/ExecutiveNotificationPolicy.ts` |
| Community/portal | `models/CommunityNotification.ts`, `InboxSurfacePreference.ts` |

The safety and audit path is already shared by the voice flow (see `VOICE_INTAKE_MAP.md`):
`requestInstantCallback` runs `evaluateSend()` before triggering a call and logs to
`CommunicationLog` for audit and webhook matching. **Any AI Flotation notification should
take the same route** rather than calling a sender directly — that is how unsubscribe,
rate limits, test-mode gaps and pauses stay enforced in one place.

## Brand-safe sending (§63)

`SenderProfile` exists precisely so a brand's mail comes from that brand. §63 requires AI
Flotation client email to use the approved AI Flotation sender identity and forbids
hardcoded Colaberry assumptions.

The public app already declares `supportEmail: 'build@aiflotation.com'`. Whether a
`SenderProfile` row and verified domain exist for `aiflotation.com` is **not verified in
this Gate 0** and must be confirmed before any client-facing send — a message that
silently falls back to a Colaberry sender would be a brand failure the code would report
as success.

## The missing piece is not the sender

V1 channels are **portal + email** (§60); Slack is V2, and §60 explicitly forbids showing a
Slack checkbox before the integration works.

What does not exist:

1. **The lead-ingest notification.** `leadIngestionController` tells nobody. This is the
   live defect in `CURRENT_STATE.md` §3 and the cheapest item in the plan.
2. **Delivery event types on preferences.** §61's priority list — `decision_needed`,
   `design_ready`, `preview_ready`, `build_blocked`, `pm_message`, `release_ready`,
   `billing_issue`, `trust_security_issue` — has no representation in
   `CommunicationPreference` today. That model needs extending, not replacing.
3. **Quiet hours, timezone, reminder cadence, backup approver** (§62). Present in the plan;
   not verified as present in the model.

## Notification philosophy, as a constraint on the build

§61: a notification means *"we need you."* Routine execution belongs in activity history,
not in push.

This has a concrete implication for the Project Room (§38–§41): most of what happens there
is *activity*, and turning every AI message into an email would make the product feel like
noise within a day. Only the eight priority types above should leave the portal.

§117's proof obligations are the right acceptance test: one decision produces **one**
notification, a retry does not duplicate it, quiet hours and timezone are honoured, and
unrelated work continues while a decision waits.

The dedup discipline to copy is already in the codebase — `CALLBACK_DEDUP_WINDOW_MS`
collapses two callbacks into one call because *a second phone call to a stranger is worse
than a duplicate row*. A decision notification deserves the same treatment keyed on the
decision, not the send attempt.

## Logging (§102)

Every workflow log line carries `correlation_id`, tenant, brand, visitor/lead/identity/
project where known, workflow, provider/model, latency, cost, outcome, `error_class` —
and must **not** carry payment secrets, access tokens, voice transcripts, full private
chat or repo secrets.

`callbackRequestService` already emits structured JSON in this shape and is the local
example to follow.
