# Session CC-20261102-k9r4 — the Nov 19 Open House row (OH-7, OH-8)

PROGRESS.md is sealed, so this is the session record.

## Why there are two more tickets after OH-6

OH-6 shipped the reminder machinery and the script that creates the session row.
Creating the row took two further fixes, both found by running the thing rather
than reading it.

## OH-7 — the wall clock was empty

- Date: 2026-11-10 · Session: CC-20261102-k9r4 · Ticket: OH-7 · PR #3845

`ensureOpenHouseSession.js --dry-run` on production returned:

```
"date":"2026-11-19T18:30:00","start_time":"","end_time":""
```

`instantToWallClock` returns `YYYY-MM-DDTHH:mm:ss` with a literal `T`.
`centralParts` split on a **space**, so the split never matched: `date` took the
whole timestamp and `time` took nothing.

`start_time` is NOT NULL, so the insert would have failed outright. The danger was
the **update** path, which has no such protection and would have quietly written an
empty clock over a real one — the version of this bug found by someone missing an
Open House.

Fixed by splitting on `'T'` and asserting the shape of both halves, so a future
change to that helper's format throws here instead of writing a blank time.
Verified 6/6 against the real Nov 19, Dec 3 and Dec 17 instants, plus midnight
Central and a late evening that would roll the date backwards under UTC.

**Why 37 assertions missed it:** `centralParts` was the one piece never executed.
It was also the only piece whose correctness depended on another module's output
format.

## OH-8 — the insert omitted the primary key

- Date: 2026-11-10 · Session: CC-20261102-k9r4 · Ticket: OH-8 · PR #3850

With OH-7 deployed, the dry run was correct (`2026-11-19`, `18:30`, `19:30`) and the
real run failed:

```
null value in column "id" of relation "live_sessions" violates not-null constraint
```

`live_sessions.id` is `uuid NOT NULL` with **no column default**. The UUID comes from
the Sequelize model's `UUIDV4`, which is application-side and therefore absent from
every raw-SQL insert into this table. The statement named ten columns and the one it
omitted was the primary key.

Nothing was written — confirmed by counting rows with `open_house_event_id IS NOT
NULL` (0), not inferred from the error text.

Minted with `crypto.randomUUID()`, not `gen_random_uuid()`. Production has pgcrypto
— checked, along with `uuid-ossp` — and then deliberately not relied on, because a
preview or local database is not obliged to have it and a script that works on one
database and not another fails at the worst moment.

## What now catches this class

A check that parses the INSERT and asserts:

- column count against value count
- every `:placeholder` against the replacements actually passed
- the presence of each NOT NULL column that has no database default (`id`,
  `cohort_id`, `session_number`, read from `information_schema` on production)

14/14 with four controls: dropping the `id` column, dropping its replacement, adding
a stray value, and a positive control proving the pgcrypto check reads code rather
than the comment that names it. That last control exists because the first version of
the check failed by matching its own comment — the same aim error as grepping prose
for a forbidden API name.

Neither the type checker nor the dry run could have caught this. The dry run returns
before the write; the SQL is a string.

## Lesson worth keeping

Both of these were in the one function per feature that was never executed, and both
were about an **interface between two modules** — a date helper's separator, a model's
application-side default. Tests written against a module's own logic do not see those.
What found them was running the real thing against the real database, in dry-run mode
first.

## The row exists

Created 2026-11-10, session id `8c92ba87-4766-4a83-9da4-ad529f68b2dc`.

```json
{ "session_date": "2026-11-19", "start_time": "18:30", "end_time": "19:30",
  "status": "scheduled", "session_number": 0, "session_type": "core",
  "open_house_event_id": "2004289439668", "meeting_link": null,
  "reminder_24h_sent_at": null, "reminder_1h_sent_at": null }
```

`upcoming_scheduled_sessions: 1` — before today that count was zero, which is the
whole reason this work existed. The scheduler can now see something.

`meeting_link` is null by design; the scheduler's sweep creates it, and the Open
House branch sits after `ensureSessionMeetLink` precisely so the link exists before
the reminder goes out.

**Registrations for Nov 19: 4**, none stamped, so both reminders are armed. There
were 2 this morning. Two more people signed up while this was being built, which is
a reasonable argument for why the row needed to exist today rather than next week.

## Verification

- OH-7: 6/6 wall-clock cases; prod dry run returned `2026-11-19` / `18:30` / `19:30`.
- OH-8: 14/14 statement checks including 4 controls.
- Backend deployed and both fixes confirmed inside the running container by content,
  not from the deploy command's exit code.
- **Idempotency proven, not asserted.** The script was run twice. The second run
  reported `existing: 8c92ba87...`, took the update path, and returned the same id.
  One row.
- End state read back out of the database afterwards rather than taken from the
  script's own success log.

### One more aim error, this time in the checking

The first verification script queried `open_house_registrations.open_house_event_id`
and failed: that column is called `event_id`. The shipped reminder queries in
`openHouseReminders.ts` use `event_id` correctly — checked before concluding
anything, because a failing verification script looks exactly like a broken feature
until you read which one is wrong. The defect was in the check.

## Remaining

- OH-5 through OH-8 have no Basecamp ticket. The work is recorded here; the tickets
  are owed.
- An admin view of the attendee list: `listOpenHouseRegistrations` exists, nothing
  reads it.
- Nothing schedules the geo enrichment script yet (GEO-1).
- `cleanCity` still rejects a comma, so the snackbar says "Someone in Plano" rather
  than "Plano, TX". Left for Ali to decide.
