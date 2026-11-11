# CC-20261102-k9r4 — the poll that drowned Sohail's bug reports

## The defect

Sohail's three Marketing bug reports (2026-11-11, 9:11/9:17/9:19 AM CST) each arrived with
`failed_requests` at the recorder's cap of **15**, and every entry was the same line:

```
GET /api/admin/system/safe-mode -> 403
```

nginx counted **46** of them in one 23-minute session. `SafeModeBanner` is mounted in
`AdminLayout`, so it runs on every admin page and polls that endpoint every 30 seconds.
The endpoint is section-gated; Sohail is a section-scoped admin, so he is refused every
time. 30s x 23min ≈ 46, which matches exactly.

Two separate faults compounded:

1. **The banner never stopped asking.** A 403 was swallowed by a bare `catch` and the
   interval carried on, so the forty-sixth ask got the same answer as the first.
2. **The recorder let a repeat evict a distinct failure.** A plain ring buffer with a
   15-entry cap, no dedup. 46 copies of one line pushed out everything else.

Between them they discarded the only thing the report existed to carry. The reporter
cannot be asked to notice that, so neither half is really his problem.

## What changed

**`SafeModeBanner.tsx`** — stops polling on 401/403 and clears the interval. A 403 is an
answer, not a blip. Anything else (500, network failure) keeps polling, because that
genuinely can be transient; giving up there would mean a tab left open through a deploy
never notices safe mode again.

Tracked in a `useRef`, not state: the interval closes over it, and a state update would
re-run the effect and start a fresh interval — the very loop being ended.

**`reportContext.ts`** — identical failures (same method, same path, same status) collapse
into one entry carrying `count`. The latest timestamp is kept, because it answers "is this
still happening" rather than "when did the page first stumble". 15 slots now hold 15
*distinct* failures, and the noise is still reported rather than hidden — one line saying
it happened 46 times is strictly more information in less space.

**`bugReportEmail.ts`** — renders `x46` when a count is above 1. That is the difference
between a page that stumbled once and an endpoint being refused every thirty seconds, and
it is exactly the distinction the reporter cannot make for us.

**Both report routes** accept `count` as optional, so a browser on an older bundle than
the backend still posts a valid report instead of a 400.

## Deliberately NOT done

Widening who may read `/api/admin/system/safe-mode`. The same path also accepts a POST
that toggles safe mode, so loosening its gate is a security decision, not a frontend one.
A scoped admin still never sees the banner — which was already true, just expensively.

If Ali wants marketing staff to see safe-mode state, the clean answer is a separate
read-only endpoint, and that is a governance call rather than something to slip into this
change.

## Verification

Sohail's session was **replayed** through both the old and the new recorder, so the
before/after is measured on his actual data rather than asserted:

| | entries | distinct URLs | his 500 survived | his 409 survived |
|---|---|---|---|---|
| old (what shipped, what he sent) | 15 | 1 | **no** | **no** |
| new | 3 | 3 | yes | yes |

The noise is present in one slot with `count: 46`.

Also executed: 40 distinct failures still cap at 15 and keep the newest; a same-URL
different-status pair stays two entries (403 then 500 is two facts); a different method on
the same path stays two.

Both suites carry the controls that matter. For the recorder: a successful request is
still never recorded, and a token in a query string is still redacted. For the banner: a
**permitted** admin keeps polling and still sees the banner — that is the test that fails
if `refused` were ever set on a success, instead of the banner silently vanishing in
production for everyone.

Not yet verified in production; that needs a deploy and a report filed from a scoped
admin account.

## Footnote

Both fixes together are what make the first one true. Stopping the banner removes today's
noise; counting repeats means the next endpoint to misbehave in a loop cannot do the same
damage to somebody's bug report.

## Addendum: can Sohail's three reports be restored? No, and the reason is the real defect

Ali asked. The honest answer needed checking rather than repeating, so every place the
content could survive was looked at on production:

| Where | Result |
|---|---|
| nginx buffered request bodies (`client_temp`) | **empty** — nginx unlinks the file the moment the request completes |
| deleted-but-still-open file handles | none |
| backend logs | **0** lines contain `whatHappened`; only metadata was ever logged |
| a database table | **no BugReport model exists** — the route emails and persists nothing |
| local mail spool | none; we relay straight to Mandrill SMTP, which never received them |

The content existed in exactly one place: an email body handed to a relay that discarded
it. There is no copy.

**The failure underneath the question is that a bug report has no home but the outbox.**
Everything a reporter types — the summary, the steps, the screenshot — exists only inside
an email that may or may not be delivered, and this is the week that proved it may not be.
Even with the sender fixed, a Mandrill outage, a bad recipient setting or a future
refactor puts the same content back at risk, and the 502 the route now returns tells the
reporter their work was lost rather than keeping it.

Proposed, NOT built here: persist the report before sending, and have the email reference
the stored row. That makes a failed send a delivery problem rather than a data-loss one,
and makes reports searchable instead of scattered across one inbox. It needs a table, so
it is Ali's call rather than something to slip into this change.

### The one copy that may still exist

Sohail's own browser and whatever he screenshotted. The form keeps no draft, so the text
is gone unless he wrote it elsewhere — but he filed three reports twenty minutes apart and
is the live record of what they said. Asking him is more likely to work than anything
technical.
