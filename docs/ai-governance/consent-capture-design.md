# Outbound Consent Capture — Design for Sign-off

**Status:** Draft for Ali's sign-off — **no code yet**. Closes the remaining TBI **P0-3** gap (consent half).
**Scope:** affirmative consent + lawful-basis tracking for AI-driven **outbound voice (Synthflow), email (Mandrill), and SMS (GHL)**.
**Author:** Claude Code · **Date:** 2026-06-22

> **Why this exists.** The TBI audit ([governance-audit.md](../trust-audit/governance-audit.md) §6) found: outbound voice/email fire with **no consent gate** — only reactive unsubscribe/suppression after the fact. That's a real TCPA/GDPR exposure on autonomous channels. This document proposes how to capture and enforce consent. It is intentionally a **design for your decision**, because the right answer depends on policy choices only you can make (B2B vs B2C, jurisdictions, double opt-in).

---

## 1. What the law actually requires (plain version)

| Channel | US rule | EU/UK rule | Practical bar |
|---|---|---|---|
| **Voice (Synthflow) — marketing/AI** | **TCPA: prior express *written* consent** for autodialed/prerecorded/AI-voice marketing calls. Penalties $500–$1,500/call. | GDPR consent or legitimate interest + ePrivacy | **Highest bar.** Need recorded opt-in before an AI marketing call. |
| **SMS (GHL) — marketing** | **TCPA: prior express written consent** | GDPR/ePrivacy consent | Same high bar as voice. |
| **Email — cold B2B** | **CAN-SPAM: opt-*out* is sufficient** (no opt-in needed) + valid physical address + honored unsubscribe | **GDPR: lawful basis required** (consent or legitimate interest); cold B2B to EU is restricted | Opt-out OK in US; EU needs a basis. |
| **Email — B2C / EU** | CAN-SPAM opt-out | **GDPR consent (often double opt-in)** | Opt-in for EU/B2C. |

**Key takeaways:**
- **Voice & SMS are the urgent exposure** — they legally require *prior express written consent*, and we currently capture none. **Recommend gating these hardest.**
- **Cold B2B email (US)** is largely fine with the unsubscribe/suppression we already have (`unsubscribeEnforcementService`, `List-Unsubscribe` header). The gap is **EU/B2C contacts** and **proof of basis**.

---

## 2. Current state (the gap)

- ✅ **Suppression / opt-out exists:** `unsubscribeEnforcementService.ts`, `smsOptOutProcessor.ts`, `List-Unsubscribe` header on email.
- ❌ **No affirmative consent capture:** nothing records *that/when/how* a contact opted in, their jurisdiction, or the lawful basis.
- ❌ **No pre-send consent gate:** `synthflowService.triggerVoiceCall` and `emailService` send based only on feature flags + (now, post-audit) the kill switch — not on consent.
- ❌ **No jurisdiction awareness:** EU vs US contacts treated identically.

---

## 3. Proposed data model — `consent_records`

A single append-only table (one row per consent event), plus a fast "current state" lookup. Mirrors the `ai_events` additive pattern (created via an `ensureXxxSchema()`, since prod doesn't run sync).

```jsonc
consent_records {
  id              uuid pk
  subject_type    'lead' | 'contact' | 'email' | 'phone'   // what the consent attaches to
  subject_id      string        // lead_id / contact id / normalized email / E.164 phone
  channel         'voice' | 'sms' | 'email'
  status          'granted' | 'revoked' | 'pending'
  basis           'express_written' | 'prior_relationship' | 'legitimate_interest' | 'opt_in_form' | 'double_opt_in'
  jurisdiction    'US' | 'EU' | 'UK' | 'CA' | 'unknown'
  source          string        // 'web_form:/ai-pilot', 'reply_detected', 'import:apollo', 'voice_recorded', ...
  evidence        jsonb         // { form_url, ip, user_agent, timestamp, recording_url, message_id, ... }
  captured_at     timestamptz
  revoked_at      timestamptz | null
  expires_at      timestamptz | null   // some consent expires (e.g., EU after inactivity)
  created_at      timestamptz
}
```

- **Granted/revoked is event-sourced** (append rows; never mutate) → full audit trail (TBI Transparent).
- A view/helper computes *current* consent per `(subject, channel)` = latest non-expired non-revoked row.
- Integrates with existing suppression: a `revoked` row is written whenever `unsubscribeEnforcementService`/`smsOptOutProcessor` fires.

---

## 4. The send-gate — `assertConsent(channel, contact)`

A single function called **before** every outbound send, alongside the kill-switch guard already added in P0-2:

```
assertConsent(channel, { leadId, email, phone, jurisdiction }) -> { allowed, basis, reason }
```

- Called at the top of `synthflowService.triggerVoiceCall`, the email send path (`guardedSendMail`), and the SMS sender.
- **Allow logic (proposed default):**
  - **voice / sms:** allow only if a `granted` record with basis `express_written` or `double_opt_in` exists. Otherwise **block** (TCPA). 
  - **email:** allow if `granted` exists; OR (US + B2B + has `prior_relationship`/`legitimate_interest`) ; **block** if jurisdiction=EU/UK without `granted`.
  - Always block if a `revoked` record exists (belt-and-suspenders with suppression).
- **Fail-closed for voice/SMS** (no record → block), **fail-open-with-basis for US B2B email** (matches CAN-SPAM reality + current behavior).
- Every decision emits an `ai_events` row (`event_type: 'consent.check'`) for the Trust dashboard.

---

## 5. Consent capture points

1. **Web forms** (lead capture, `/ai-pilot` landing, etc.): explicit, separate, unticked opt-in checkbox per channel → writes `opt_in_form` (email) / `express_written` (if phone+SMS/voice checkbox) with form URL + IP + timestamp in `evidence`.
2. **Double opt-in (email, EU/B2C):** confirmation email; only `granted` after the confirm click.
3. **Voice consent:** Synthflow call recording + a spoken consent prompt → `express_written` equivalent with `recording_url` evidence (consult counsel on recorded-consent sufficiency per state).
4. **Prior relationship / reply detection:** when a contact replies or has an existing relationship, write `prior_relationship` (email legitimate-interest basis; **not** sufficient for voice/SMS).
5. **Import-time basis:** Apollo/CRM imports record `source: import:<x>` with whatever basis the source warrants (usually `legitimate_interest` for B2B email only).

---

## 6. Phased rollout (proposed)

- **Phase 1 — Gate + backfill (highest ROI):** create `consent_records`, build `assertConsent`, wire it into voice/SMS sends **fail-closed** (immediately stops the TCPA exposure), and backfill `prior_relationship`/`revoked` from existing reply history + suppression. Email stays opt-out (US) for now.
- **Phase 2 — Capture:** add opt-in checkboxes to web forms + double opt-in for email; start populating `granted` records.
- **Phase 3 — Jurisdiction:** derive jurisdiction (from country/IP/domain) and apply EU/UK rules to email.

---

## 7. Decisions I need from you (the sign-off)

1. **Voice/SMS posture:** fail-closed (block AI voice/SMS until an express-written consent record exists) — recommended? This will **pause AI outbound voice/SMS** until capture (Phase 2) populates records, unless we backfill.
2. **Cold B2B email:** keep US cold B2B on opt-out (CAN-SPAM) as today, and only gate EU/B2C? (Recommended — avoids killing the pipeline.)
3. **Jurisdiction source:** how do we determine EU/UK? (country field / IP geolocation / email-domain heuristic / Apollo data)
4. **Double opt-in for email:** yes for EU/B2C only, or globally?
5. **Voice recorded-consent:** is a recorded spoken consent acceptable in your target states, or do we require a prior written/web opt-in before any AI call? (likely a counsel question)
6. **Scope now:** do Phase 1 (gate + backfill) first, or design all three phases before building?

---

## 8. Non-goals / notes
- This is **not legal advice** — the thresholds above are engineering's read of TCPA/CAN-SPAM/GDPR; **confirm with counsel** before relying on recorded-voice consent or legitimate-interest email to the EU.
- No code ships until you sign off on §7. Phase 1 is ~the same shape as the P0-2 kill-switch guard + the `ai_events`/`ensureSchema` pattern already in PR #50, so implementation is well-scoped once the policy is set.
