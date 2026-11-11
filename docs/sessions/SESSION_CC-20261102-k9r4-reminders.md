# Session CC-20261102-k9r4 — Open House reminders (OH-6)

PROGRESS.md is sealed, so this is the session record.

## Why

Eventbrite reminds the people who registered on Eventbrite. Nobody who signs up on
our landing page is one of them, so they are told when and how to attend by nothing.

And there was nothing to attend: on 2026-11-10 `live_sessions` held ZERO upcoming
rows. The Nov 19 event the public endpoint advertises and two people have already
registered for did not exist on our side - no session, no Meet link, no way in.

## What shipped

- Date: 2026-11-10 · Session: CC-20261102-k9r4 · Ticket: OH-6
- `ensureOpenHouseReminderSchema` — `live_sessions.open_house_event_id` plus
  per-registration `reminder_24h_sent_at` / `reminder_1h_sent_at`.
- `openHouseReminderPolicy.ts` — the decisions, with no database import so they can
  be tested without one. `openHouseReminders.ts` — the queries.
- `schedulerService` — Open House sessions are swept from their registrations and
  `continue`, so they can never reach the cohort path.
- `scripts/ensureOpenHouseSession.ts` — create-or-update the session from the same
  service the public endpoint uses. Idempotent, sends nothing.
- 26 test cases; all 37 assertions executed against the real module first.

## Decisions worth keeping

**Registrants only, never the cohort.** Explorer cohort: 957 accounts against 2
registrations. Ali confirmed the scoping on 2026-11-10 against a standing rule never
to bulk-email students. The `continue` in the scheduler is the safety property.

**Arming is per registration.** An Open House roster grows until the doors open, so a
single stamp on the session would either silence late registrants or re-mail everyone
every thirty minutes.

**The window is a property of the session, not the registration.** Inside two hours the
answer is 1h for everybody, so a late registrant can only get the 1-hour note and their
24-hour stamp never fires. No special case needed. Both windows are wider than the
30-minute sweep, because a narrower window is one the sweep can step over.

**A column, not a title convention.** `open_house_event_id` is the discriminator, so a
renamed session cannot silently start or stop mailing people.

## What the database refused, found before running

- `live_sessions` has no `updated_at` column.
- `session_type` is an enum admitting only `core` and `lab`, enforced by
  `ck_live_sessions_session_type`; `open_house` would have been rejected outright.
  This is also why the discriminator is its own column.
- `end_time` is NOT NULL, so an event without an end still needs one (start + 1h).

Checked against information_schema and pg_constraint rather than assumed.

## Remaining

- Run `ensureOpenHouseSession` on prod (dry-run first) to create the Nov 19 row.
- An admin view of the attendee list: `listOpenHouseRegistrations` exists, nothing reads it.
- Nothing schedules the geo enrichment script yet (GEO-1).
