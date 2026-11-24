# Voice AI Studio: Twilio voice readiness (read-only)

VS1.2, measured 2026-11-24 against the Colaberry Twilio account used by production (credentials from the prod backend env; GET requests only; **no call placed, no number bought, changed or released**). Numbers are never written here; counts and webhook hosts only.

Source of truth: [MASTER_BUILD_PROMPT.md](MASTER_BUILD_PROMPT.md).

## Account

| Fact | Value |
|---|---|
| Account status | active, type Full (upgraded, not trial) |
| Auth used | API key (TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET) |
| Env var names present | TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_NUMBER |
| Verified outgoing caller IDs | 1 |
| Last 20 calls on the account | 15 completed, 4 failed, 1 no-answer (newest 2026-11-24) |

## Owned numbers (69, all voice-capable and SMS-capable)

| Voice webhook host | Numbers | What it means |
|---|---|---|
| app.colaberry.com | 54 | Routed to a Colaberry app. Treat as IN USE; never repoint without an owner. |
| demo.twilio.com | 8 | Twilio's placeholder URL: inbound voice is effectively unused. |
| demo.twilio.com + SIP trunk | 1 | Placeholder URL, but attached to a SIP trunk (outbound via a vendor). |
| services.leadconnectorhq.com | 2 | GoHighLevel (Kes / Cora). Do not touch. |
| services.leadconnectorhq.com + SIP trunk | 3 | GoHighLevel plus a vendor trunk. Do not touch. |
| twilioid.com | 1 | Unknown owner. Do not touch. |

## SIP trunks (13)

9 named `synthflow-trunk...`, plus "Synthflow - Inbound Agent Cora", "Cora Outbound 1", "School Agent", "AVA Voice AI SIP Trunk", "logistics-demo-livekit-trunk".

## What this establishes

1. **We can dial from a Colaberry-owned Twilio number today.** The account is Full and active, and 69 numbers we own are voice-capable. Calls placed by OUR Twilio REST API from a number on THIS account cannot hit error 32204 (Invalid Caller ID), which is the error that has failed the Synthflow-purchased numbers since about 8 Oct.
2. **No purchase is required for testing.** Nine numbers have no real inbound voice route (placeholder webhook). Pointing one of them at the Voice Studio test webhook is a change to a production Twilio resource, so it waits for Ali at M0.
3. **Correction to the 23 Nov note.** The ROI Architect number ending 2754 IS a Twilio number on this account (attached to a SIP trunk). Its Synthflow failures are therefore not explained by "not a Twilio number on our account" alone; VS5.1 re-checks each Synthflow number against this list instead of assuming.

## What this does not establish

- That any of the 9 placeholder numbers is free of SMS use (their SMS webhooks were not inspected); M0 picks one only after its SMS route is checked.
- Carrier reputation or spam labelling of any number (outbound answer rates are measured in live tests, not here).
- Anything about Synthflow's own configuration (VS5.1).
