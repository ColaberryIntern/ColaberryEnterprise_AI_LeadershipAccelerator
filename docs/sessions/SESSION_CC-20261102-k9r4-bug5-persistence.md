# BUG-5 — a bug report now survives a failed send

**Session:** CC-20261102-k9r4 · 15 November 2026
**Ticket:** [BUG-5](https://app.basecamp.com/3945211/buckets/7463955/todos/10502926132)

## The decision this needed, and who made it

BUG-5 had been sitting open on a question rather than on work. Its own description says:

> Persisting first needs a new table, which is a schema change and therefore yours, not mine.

and offers the honest alternative — accept the loss, close the ticket, on the grounds that
reports are rare and the sender bug is fixed. **Ali chose to persist, 15 November 2026.** This
change is that decision carried out; it was not started before the decision existed.

## What was wrong

The route validated the report, rendered the email, sent it, and returned 201. Nothing was ever
written to the database. The email was simultaneously the transport and the only storage, so any
transport failure was permanent data loss.

That is not theoretical. Sohail filed three reports on 2026-11-11. All three returned 201 and
logged success; Mandrill discarded all three for having no envelope sender. The content is
unrecoverable — we still do not know what two of the three problems were.

BUG-1 fixed the sender and made the route read the relay result, so that *specific* failure can
no longer pass silently. Every other send failure — an outage, a rate limit, a mis-set recipient
list — still destroyed the report.

## What changed

| File | Change |
|---|---|
| `backend/src/db/ensureBugReportSchema.ts` | NEW. One additive table, `marketing_bug_reports`, created lazily and memoized exactly like `ensureColaberryTvSchema`. `IF NOT EXISTS` throughout, no `DROP`/`ALTER`/`TRUNCATE`. |
| `backend/src/services/marketing/bugReportStore.ts` | NEW. `recordBugReport` / `markBugReportDelivered` / `markBugReportFailed`. |
| `backend/src/routes/admin/marketingBugReportRoutes.ts` | Writes the row before sending and settles it after. No behaviour change on any existing path. |
| `backend/src/db/__tests__/ensureBugReportSchema.test.ts` | NEW. 5 tests. |
| `backend/src/services/marketing/__tests__/bugReportStore.test.ts` | NEW. 12 tests. |

## The three decisions worth recording

**Persistence is best-effort and never blocks the send.** If the insert fails, the store logs
loudly and returns `null`, and the route sends anyway. Making the write fatal would mean a
database blip stops bug reporting altogether — which is *worse* than the old behaviour, not
better. The point is to add a safety net under the send, not a second way for it to fail.

**The screenshot is stored only when delivery fails.** On a successful send the bytes are already
in the delivered email, so a second copy duplicates the largest object in the system for no
recovery value. On a failure they are the difference between a report that can be replayed and
one that cannot. `COALESCE` on the update so a later settle without a screenshot cannot erase a
stored one.

**Idempotent inside a five-minute window.** A double submit — an impatient second click, a
retried request — must not create two rows describing one problem. The insert is guarded by
`WHERE NOT EXISTS` on (reporter, summary, body) within five minutes, and the colliding row's id
is returned so the caller still has somewhere to record the outcome. Five minutes is deliberate:
the same person hitting the same bug an hour later is a real second report.

## One trap this code is written around

**This database returns SELECT rows as arrays in some cases and objects in others.** Observed
directly on production earlier the same day while reconciling the ad-spend ledger — a query
whose rows came back as `["agent_attachments"]` rather than `{table_name: ...}`. Reading
`row.id` alone would therefore yield `undefined` some of the time, and the insert would look as
though it had done nothing. `readId` handles both shapes, and a test pins the array case
specifically.

## Verification

**Not run locally.** This session has no local `jest` or `tsc` — the checkout is unusable for git
(OneDrive mmap failures) and sits on a stale branch, so every file here was read from `main` via
the GitHub contents API and committed through the Git Data API. **CI is the only gate**, and the
PR should not be merged until it is green.

What the tests actually pin, beyond the happy path:

- the insert fails → `recordBugReport` returns `null` and does **not** throw, so the send proceeds
- the table cannot be created → same, and no query is attempted
- rows come back as arrays → the id is still read
- a duplicate inside the window → one row, existing id returned, two queries not three
- no recipients, no optional fields → `'[]'` rather than the invalid `ARRAY[]`
- a 5000-character failure reason → clamped to 1000
- no row id → the outcome writers do nothing at all
- an outcome write that fails → swallowed and logged, because the mail already went

**Still unverified after merge:** that the table is actually created in production, and that a
real report writes a row. The first scheduled use of the endpoint proves both; until someone
files a report, the only evidence is the test suite.

## What this does not do

- It does not retry a failed send. The row makes a retry *possible* — nothing performs one.
- It does not expose the stored reports anywhere. Reading them today means querying
  `marketing_bug_reports` directly. A list view is worth having and is not in this change.
- It does not help the three reports already lost. Those are gone.
