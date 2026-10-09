# GHL Calendar Integration Boundary

**Phase 1, task 8.** Session `CC-20261005-r6h2`. Against `origin/main` @ `541305a6`.

§10 says: build a bounded modern adapter for calendar, user and event capabilities, leave the
stable contact sync alone, and **do not rely on memory or the prompt for API syntax** —
confirm it against the official documentation at build time.

So every API fact below was fetched today and carries its source and fetch date. **Where the
documentation does not state something, it is marked `UNVERIFIED` rather than filled in from
recollection.** That distinction is the whole point of this document, and the citation gate
enforces it: an external URL without a fetch date is a failure, not a style preference.

---

## Part 1 — What exists today, and the boundary around it

The existing integration is the **v1 contact API**, with one static key per sub-account:

`backend/src/services/ghlService.ts:54` → "const GHL_BASE = 'https://rest.gohighlevel.com/v1';"
`backend/src/services/ghlService.ts:77` → "      'Authorization': `Bearer ${apiKey}`,"
`backend/src/services/ghlService.ts:80` → "      signal: AbortSignal.timeout(15000),"

Six contact endpoints, a 15-second timeout, and no retry.

**DECISION 1 — the v1 contact sync is not touched.** §10 is explicit, and the risk is concrete:
rewriting contact sync while adding calendars is how both break at once, and contact sync is
the path that currently works. The new adapter is additive and lives beside it.

**No calendar, user-listing, free-slot or appointment code exists today** — `ABSENT` for all
four, and `ABSENT` for the modern host and for any OAuth flow. This is a greenfield adapter
against an existing, untouched neighbour.

---

## Part 2 — Confirmed API facts

All fetched 2026-10-05. Every line carries its source.

### Host and authentication

The base host for the modern API is `https://services.leadconnectorhq.com` [source: https://marketplace.gohighlevel.com/docs/Authorization/PrivateIntegrationsToken/] [fetched 2026-10-05]

Authentication is a bearer token in the form `Authorization: Bearer <token>`, and a **Private
Integration Token** is supported as a server-to-server alternative to the OAuth user-consent
flow [source: https://marketplace.gohighlevel.com/docs/Authorization/PrivateIntegrationsToken/] [fetched 2026-10-05]

Scopes are **selected per token**, and the token is not automatically bound to one sub-account —
calls pass a `locationId` [source: https://marketplace.gohighlevel.com/docs/Authorization/PrivateIntegrationsToken/] [fetched 2026-10-05]

A `Version` header is required. Documented values include `2021-07-28`, `2023-02-21`,
`2021-04-15` and `v3`, and **the value differs per endpoint** [source: https://marketplace.gohighlevel.com/docs/Authorization/PrivateIntegrationsToken/] [fetched 2026-10-05]

### Free slots

`GET /calendars/:calendarId/free-slots`, with required `startDate` and `endDate` as numbers,
optional `timezone`, `userId`, `userIds` and `duration`, and `Version: v3` [source: https://marketplace.gohighlevel.com/docs/ghl/calendars/get-slots/index.html] [fetched 2026-10-05]

**A documented hard limit: the date range cannot exceed 31 days** [source: https://marketplace.gohighlevel.com/docs/ghl/calendars/get-slots/index.html] [fetched 2026-10-05]

That limit is a design input, not a detail — a rep-availability view spanning more than a
month has to page, and the adapter must express that rather than discover it in production.

### Create appointment

`POST /calendars/events/appointments`, with required body fields `calendarId`, `locationId`,
`contactId`, `startTime` and `title`, and `Version: v3` [source: https://marketplace.gohighlevel.com/docs/ghl/calendars/create-appointment/] [fetched 2026-10-05]

`contactId` being required is the important one: **an appointment cannot be created for a
person who is not already a GHL contact.** So appointment creation depends on contact sync
having succeeded — and contact sync is fail-closed, so a lead whose account is unconfigured has
no contact id and therefore cannot be booked. That dependency is correct and must stay visible.

---

## Part 3 — What the documentation did NOT state

Marked `UNVERIFIED` rather than guessed. Each is a question Phase 4 must answer by fetching
again at build time, not by assuming.

- **The exact OAuth scope names for calendar read and write.** `UNVERIFIED` — not stated on
  the free-slots page, the create-appointment page, or the calendars index. Scope selection
  exists per token; the names of the calendar scopes were not on the pages fetched.
- **The `Version` value to use for each endpoint other than the two above.** `UNVERIFIED` —
  four values are documented as existing and `v3` is confirmed for these two endpoints.
- **Whether cancel is supported as a distinct operation**, and under what path. `UNVERIFIED`.
- **The appointment-event read and update paths.** `UNVERIFIED`.
- **The user-listing and calendar-listing paths.** `UNVERIFIED`.
- **The contact-detail UI URL shape.** `UNVERIFIED` and **deliberately so** — §11 says not to
  hardcode an unverified GHL UI path. See Part 5.

**A count rather than an impression: six of the eleven capabilities §10 lists have no
documented path confirmed in this document.** That is the honest state of this task, and it is
why Phase 4 begins with a documentation fetch rather than with code.

---

## Part 4 — The adapter surface

The eleven capabilities §10 names, each with its status after today's fetch.

| # | Capability | Status |
|---|---|---|
| 1 | resolve GHL account/location for rep or brand | **buildable** — routing exists; the rep's location id is new config |
| 2 | resolve/list GHL users for a location | path `UNVERIFIED` |
| 3 | resolve/list calendars | path `UNVERIFIED` |
| 4 | read rep/calendar availability | **buildable** via free-slots, with the 31-day limit |
| 5 | get free slots | **confirmed** |
| 6 | create appointment | **confirmed** |
| 7 | get appointment/event | path `UNVERIFIED` |
| 8 | update/reschedule appointment | path `UNVERIFIED` |
| 9 | cancel appointment where supported | support `UNVERIFIED` |
| 10 | generate/resolve a usable GHL contact link | **not an API call** — see Part 5 |
| 11 | health/status test for a rep's GHL configuration | **buildable** from 1–5 with no new path |

**DECISION 2 — the adapter is bounded to these eleven and nothing more.** No contact
operations, no opportunity or pipeline writes, no replacement of GHL as CRM (§25).

**DECISION 3 — the adapter is a separate module from the v1 service**, with its own host, its
own auth, its own `Version` header per call, and its own timeout and retry policy. Sharing a
module with the v1 service is how the "do not casually rewrite" instruction gets violated by
accident.

**DECISION 4 — every new call gets a documented timeout and a capped retry.** The existing
service has a timeout and no retry, which the repo's own Failure-First rules require at every
external boundary. The new adapter does not inherit that gap.

---

## Part 5 — The contact link, and why it is not an API capability

§11 requires an "Open in GHL" action and says not to hardcode an unverified UI URL shape.

Today the link is a module constant, not a resolution of the routed account:

`frontend/src/pages/admin/AdminLeadDetailPage.tsx:51` → "  `https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/detail/${contactId}`;"

and that pattern is duplicated across **six** frontend files, each with its own copy of the
same location constant. None reads the settings key that holds the same value, and none derives
it from the account the lead was actually routed to.

**DECISION 5 — the link is a configurable template resolved server-side from the lead's routed
account, with the shape verified against one real configured record before it ships.** §11 asks
for exactly this, and it is not a refactor for tidiness: today the link is latently wrong and
will become actually wrong the moment a second sub-account is configured.

**DECISION 6 — the five states §11 names are distinct in the UI**: *open in GHL*, *sync to
GHL*, *GHL not configured*, *contact not yet linked*, *sync failed*. Collapsing them into one
disabled button is what hides a misconfiguration.

---

## Part 6 — Secrets, identifiers, and fail-closed

**DECISION 7 — identifiers are configuration; credentials are not.** Per the standing
constraints: a rep's location id, user id and calendar id may sit in configuration. Tokens stay
in the settings store, and no token reaches the browser. The server resolves links and slots;
the browser receives results.

**DECISION 8 — fail-closed is preserved exactly as it is**, and extended to the new calls:

`backend/src/services/leads/ghlAccountRouting.ts:95` → "return { status: 'unconfigured', accountKey, settingKey };"

A rep whose GHL configuration is incomplete gets a refusal naming what is missing — never a
call against another brand's account. **And the one existing fail-open sub-case is closed
rather than extended:** a corrupt route map currently degrades to the default account, which
contradicts the standing constraint, and the new adapter must not inherit that behaviour.

**DECISION 9 — nothing in Phase 1 or Phase 4's read-only stage creates a production
appointment.** §18 forbids it for Phase 1 and the standing constraints forbid any real
outbound contact. Calendar *reads* can ship before appointment *writes*, behind independent
flags, which §24 requires anyway: the appointment-write flag must be disableable without
taking down contact sync.

---

## Part 7 — What a Phase 4 reviewer should be able to check

1. The v1 contact service is byte-identical to its state before Phase 4, or every change to it
   is separately justified.
2. The new adapter and the old service share no module, no host constant and no auth helper.
3. A rep with an unconfigured account gets a named refusal, and no call is made.
4. A corrupt route map refuses rather than falling back to the default account.
5. No token appears in any browser payload, asserted by a test.
6. The contact link is resolved server-side from the routed account, and the URL shape was
   verified against one real record before shipping.
7. Every `UNVERIFIED` item in Part 3 is either confirmed by a fresh fetch with its date, or
   still marked unverified — never quietly filled in.
8. Calendar reads and appointment writes are independently flagged, and disabling writes leaves
   contact sync working.
9. Free-slot requests never span more than 31 days.

## Part 8 — Known limits

- **The documentation was fetched once, today.** A fetch is a point-in-time read of a
  third-party site; Phase 4 must re-fetch rather than trust this document's API facts, which is
  why each carries a date.
- **Six of eleven capabilities have no confirmed path here.** That is a real limit of this
  document, stated as a number rather than left for a reader to notice.
- **No scope names are asserted.** A plausible-looking scope string would be the exact kind of
  remembered detail §10 forbids.
- **Nothing here is implemented.** Every DECISION is intent for Phase 4.
