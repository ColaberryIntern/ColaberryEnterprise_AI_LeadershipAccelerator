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

## Caller-ID usability (who can be the From number on a call we place)

Rule (https://www.twilio.com/docs/api/errors/32204, read 2026-11-24): the From number must be a Twilio number on this account or a verified Outgoing Caller ID. Identified by group or last 4 digits only.

| Number or group | Owner / route today | Voice-capable | Usable as caller ID for our Twilio calls |
|---|---|---|---|
| 54 numbers routed to app.colaberry.com | Colaberry app | yes | yes (owned), but in use: never repointed without an owner |
| 8 numbers on the demo.twilio.com placeholder | nobody (voice idle) | yes | **yes (owned, idle): the M0 Q3 candidates** |
| 1 placeholder number on a SIP trunk | vendor trunk | yes | yes (owned), not recommended (trunk attached) |
| 5 GoHighLevel numbers (incl. ...2754 ROI Architect, ...1028 Cora ColdL) | Kes / GHL | yes | yes (owned), but in use by GHL: do not touch |
| 1 number on twilioid.com | unknown | yes | yes (owned), owner unknown: do not touch |
| Verified outgoing caller ID ...7435 | not a number on this account | n/a | yes (verified), not recommended for an AI line |
| Synthflow ...2568 (Edu: Cory - Outbound) | bought through Synthflow | unknown | **no: not on this account, not verified** (this is the 32204 cause) |
| Synthflow ...3242 | bought through Synthflow | unknown | **no: not on this account, not verified** |
| Synthflow ...0787 (Little Ali) | bought through Synthflow | unknown | **no: not on this account, not verified** |

So the October outage is fully explained for 2568, 3242 and 0787, and the 23 Nov note was right for those three. The ROI Architect number ...2754 is the exception: it IS ours (routed through the GHL trunk), so its Synthflow failures have a different cause, re-checked in VS5.1.

## Calls during this work (proof that nothing was dialed)

Read-only `GET /Calls?StartTime>=2026-11-24` on 2026-11-24 (this task's window is that day, from the session start): **69 calls**, grouped by direction and source:

| Direction | From | Status | Calls |
|---|---|---|---|
| trunking-terminating | owned GHL numbers (SIP trunk) | completed | 60 |
| trunking-terminating | owned GHL numbers (SIP trunk) | failed | 3 |
| trunking-terminating | owned GHL numbers (SIP trunk) | no-answer | 1 |
| trunking-originating | not owned | failed | 3 |
| inbound | not owned | completed | 1 |
| outbound-dial | not owned | no-answer | 1 |

A REST API dial (the only kind this work could create) appears as direction `outbound-api`. **Count of `outbound-api` calls in the window: 0.** The 69 are GoHighLevel trunk traffic, one inbound call and one child leg of an existing dial, none created by this work.

## What this does not establish

- That any of the 9 placeholder numbers is free of SMS use (their SMS webhooks were not inspected); M0 picks one only after its SMS route is checked.
- Carrier reputation or spam labelling of any number (outbound answer rates are measured in live tests, not here).
- Anything about Synthflow's own configuration (VS5.1).
