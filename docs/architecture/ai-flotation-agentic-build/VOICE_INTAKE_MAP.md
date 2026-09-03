# Voice Intake Map — Gate 0

- Date: 2026-09-03 · Session: CC-20260902-m8q4 · Base: `e99fdb35`

## The plan's assumption is wrong

§7 and §55 say: *"Planning-time repo search found no `syntheflow` symbol. If still absent,
treat Syntheflow as a new provider adapter and read its official current API/webhook
documentation before implementation."*

**The vendor is spelled `Synthflow`.** Searching for that finds a complete, working voice
integration.

## What is already built

| Piece | Location |
|---|---|
| Credentials + three agent ids | `config/env.ts` — `SYNTHFLOW_API_KEY`, `SYNTHFLOW_CALLBACK_AGENT_ID`, `SYNTHFLOW_INTEREST_AGENT_ID`, `SYNTHFLOW_WELCOME_AGENT_ID` |
| Provider call | `services/synthflowService.ts` — `triggerVoiceCall()` |
| "Call me now" orchestration | `services/callbackRequestService.ts` — `requestInstantCallback()` |
| Inbound webhook | `controllers/synthflowWebhookController.ts` |
| Consent capture | `services/consent/captureSignupConsent.ts` — `CALLBACK_CONSENT_TEXT`, `CALLBACK_CONSENT_TTL_DAYS` |
| Send safety | `services/communicationSafetyService.ts` — `evaluateSend()` |
| Audit | `services/communicationLogService.ts` → `CommunicationLog` |

`requestInstantCallback` is documented as: *"resolve an idempotent lead → dedup the call →
run the shared safety checks → trigger the Synthflow outbound agent (whose knowledge base
stays attached server-side) → log the communication for audit + webhook matching."*

## The plan's voice requirements, measured against it

§56 asks for: consent → save intake session → Synthflow call request → AI calls →
transcript/webhook → structured extraction → Blueprint pipeline.

**Steps 1 through 5 exist.** What does not exist is the last part — turning a transcript
into structured project truth for a Build Blueprint. Today the call serves lead capture,
not project discovery.

§57 (consent/safety) — consent text, TTL and capture exist. Legal review for calling and
recording jurisdictions remains outstanding and is not a code question.

§58 (webhook security) — a webhook controller exists; its authenticity verification,
replay protection and session correlation should be **audited against §58's list** rather
than assumed. Recorded as a Gate 3 task, not a Gate 0 claim.

§59 (failure UX) — `CallbackStatus` already models the real states:
`call_initiated | deduplicated | blocked | skipped | failed`, where `skipped` is a
deterministic no-op when the feature or agent id is unconfigured. That is better than the
plan asks for.

## The dedup window is worth copying, not replacing

```
CALLBACK_DEDUP_WINDOW_MS = 5 * 60 * 1000
```

> *"Two callbacks to the same lead inside this window collapse to one call. This is the
> idempotency key for the side effect: a double-click, a client retry, or a duplicate
> webhook must NOT place a second phone call."*

A second phone call to a stranger is a worse defect than a duplicate database row, and
this is already handled. Any AI Flotation voice path must go through this service rather
than calling `synthflowService` directly.

## The open decision

Three agents are configured — callback, interest, welcome — and the existing flow serves
`training.colaberry.com`.

**Does AI Flotation get a fourth agent, or reuse the callback agent?** It decides:

- which knowledge base the AI speaks from (the agent's KB is attached server-side)
- which phone number the prospect sees and calls back
- which consent text and record applies
- whether AI Flotation call volume is separable in reporting

Reusing the training agent would have an AI Flotation prospect spoken to by a bootcamp
agent. Adding a fourth is cheap. But it is a product and brand decision, not an
implementation detail.

→ **ESCALATION-2.**

## Scope correction for Gate 3

Not "integrate a voice provider". The real Gate 3 is:

1. audit the existing webhook against §58's security list
2. decide the agent question above
3. build the missing piece: **transcript → structured intake**, converging with chat on
   one canonical contract (§56's actual requirement)
