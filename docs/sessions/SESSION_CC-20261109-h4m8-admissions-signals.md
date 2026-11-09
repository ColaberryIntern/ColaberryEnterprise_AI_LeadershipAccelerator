# Session CC-20261109-h4m8 — admissions visitor signals read route

Unblocks Kalkidan Bezabeh's first capability story,
`admissions.CAP.page_event_admissions_enrichment`. Basecamp: Maya, the
admissions agent — todo 10424318268.

---

## feat(agent-domains): domain-scoped, anonymised admissions visitor signals

- **Date:** 2026-11-09
- **Session:** CC-20261109-h4m8
- **What changed:**
  - `backend/src/utils/hmac.ts` — new `pseudonymousId(context, value, secret)`.
  - `backend/src/config/env.ts` — new `pseudonymSecret`, same env-var-or-JWT-secret
    fallback the unsubscribe and journey-link secrets already use.
  - `backend/src/services/agentDomain/admissionsSignalsReader.ts` — new reader.
  - `backend/src/routes/admin/agentDomainRoutes.ts` — new
    `GET /api/admin/agent-domains-mine/:domainKey/admissions-signals`.
  - `backend/src/routes/admin/__tests__/agentDomainAdmissionsSignals.test.ts` — new.
- **Verification:** see the test results recorded in the PR.
- **Notes:** below.

### The request, and why the narrow route was the right answer

Kalkidan, 9 Nov 2026, 04:47 UTC. Her criterion is *"20 sampled visitor
summaries match the underlying page events with zero fabricated page titles"*,
and she could not reach the data. She asked for a scoped read route rather than
a wider grant, and checked the alternative herself first:

- the interest tags live in `admissions_memory.interests`, and **no admin route
  returned that column for any role**;
- the visitor routes in `insightRoutes.ts` are `requireAdmin` and map to the
  `campaigns` section, so her `lead_intake` token 403s;
- granting `campaigns` would still not have returned the tags, and
  `/visitors/:id` would additionally have exposed IP address, user agent and
  lead details.

All three check out. `getVisitorProfile` has no `attributes` whitelist anywhere
— it serialises every column of the Visitor, its `Lead` include, 50 sessions and
100 page events. So the choice really was between this route and handing a
builder a named-person surface.

### What it returns, and what it refuses to

Per visitor: `anon_id`, `interests`, `visitor_type`, `page_events`
(`event_type`, `page_path`, `page_title`, `timestamp`) and `page_event_count`.

Every field is named explicitly; nothing is spread from a model row. Excluded:
`ip_address`, `user_agent`, `fingerprint`, `lead_id` (on all three tables),
`page_url`, `event_data`, `questions_asked`, `conversation_summaries`,
`personality_notes`.

`page_path` and `page_title` stand in for `page_url`, which carries the query
string the tracker writes `?email=` into.

### Three decisions worth recording

**The anon id is keyed, not hashed.** `utils/hmac.ts` already exported
`sha256Hex`, and using it here would have looked right and been wrong: an
unkeyed SHA-256 of a visitor UUID is reversible by anyone who can enumerate
UUIDs, so it is a pseudonym in name only. `pseudonymousId` follows the shape
`journeyLinkService`, `unsubscribeTokenService` and `recordingTicket` already
use — an env secret plus a literal context prefix for domain separation. There
was no shared helper for this; there is now.

**`page_title` stays `null`, never `''`.** The capability is measured on
fabricating no titles, and an empty string is a fabricated title that reads
like a real one.

**Two queries, not one `include`.** A joined `include` would apply the row cap
to the joined product rather than to visitors, so a "20 visitors" sample would
silently become "however many visitors fit inside 20 event rows" — wrong in a
way that still returns plausible data.

### Route placement

The path sits under `/api/admin/agent-domains-mine/`, so `pathToSection`
resolves it to `dashboard` by prefix and **no new `PATH_SECTION` row is needed**.
This matters: the gate is deny-by-default for scoped roles, and an unmapped new
top-level prefix would 403 with nothing in the code explaining why.
`mgmtSectionGate.guardedPathsAreClassified.test.ts` enforces the pairing.

`domainKey` is `z.literal('admissions')` rather than the shared `DomainParam`:
this is an admissions-shaped payload, so another domain key is a malformed
request (400), not a permission problem. Ownership is still checked separately,
so holding `dashboard` is not enough — the caller must own admissions.

### What the test asserts, and the one that matters

The ownership tests use a **scoped, non-admin** token throughout. The route is
gated on `dashboard`, which every mgmt role except `support` holds, so the
section is not what protects it — the ownership check is. An admin token would
pass whether or not the scoping worked.

The load-bearing test is the non-disclosure one. It seeds the mocked model rows
with every sensitive column the real tables carry — `lead_id`, `page_url` with
an `?email=` in it, `questions_asked`, `personality_notes` — and asserts none of
them, and neither raw visitor UUID, appears anywhere in the serialised response.
A test that only checked the fields the route *does* return would pass happily
while it emitted an IP address beside them.

### Failure-first notes

1. **If it fails:** `guarded()` catches, logs `agent_domain_read_surface_failed`
   with an `error_class`, and returns 500 without a body from the error. Read-only,
   so a failure cannot corrupt anything.
2. **Retry:** none. A failed read is re-requested by the caller; there is no
   side effect to make idempotent.
3. **Recovery:** the route is additive. Removing it restores the previous state
   exactly; nothing else references the reader.
4. **Handled vs not handled:** handled — no memory rows (empty page, not an
   error), visitors with no events, non-string entries in the `interests` JSONB,
   a missing `page_title`, malformed `limit`. Not handled — `admissions_memory`
   growing large enough that `count()` becomes slow; it is a single unfiltered
   count and would want an estimate at a scale this table is nowhere near.
