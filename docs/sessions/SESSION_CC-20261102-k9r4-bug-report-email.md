# CC-20261102-k9r4 — the bug reports that reported nothing

## What was asked

Sohail was trying to report a problem on the Marketing admin pages, said he was having
trouble sending it through, and Ali had received no email. Audit it and find out why.

## The answer

Three reports were filed, all three were accepted, and none was delivered. The cause was
one missing field.

`backend/src/routes/admin/marketingBugReportRoutes.ts` called `guardedSendMail` without a
`from`. With no sender, nodemailer hands the relay an **empty envelope sender**. Mandrill
answers `250 2.0.0 Ok: queued as ...` — so the send resolves, and looks perfect — and then
discards a message it cannot attribute to a sending domain. The route then logged
`outcome: "success"` and returned `201 {sent: true}`, because it never looked at the
result it was handed.

So Sohail was told "thanks, sent" three times, Ali got nothing, and no error was raised
anywhere. Nothing broke, which is why it ran for a month unnoticed.

## Evidence, in the order it was gathered

Every hypothesis below was killed by a measurement rather than by reading the code.

| Checked | Result |
|---|---|
| `marketing_bug_report_emails` / `admin_notification_emails` | resolves to 2 recipients — **not** the cause |
| `system_kill_switch` | `false`, and 0 kill-switch blocks in 10 days of logs |
| `isDev` / dev email guard | `isDev=false` (`APP_ENV` unset), 0 guard blocks |
| Route present in the running image | yes, both route and template compiled in |
| Mandrill account health | reputation 100, 0 hard/soft bounces today, 12,702 sent |
| Mandrill rejection blacklist for Ali | one DMARC entry from February, **expired** 2026-03-02 |
| Mail to Ali generally | flowing — 50 messages on the day |
| nginx | 3 × `POST /api/admin/marketing/bug-report` → **201**, zero 413s |
| Backend log | 3 × `bug_report_sent`, `outcome: "success"`, `recipients: 2` |
| **Mandrill message log** | **zero** messages with the report subject. Never arrived. |

That last row is the one that mattered: our side logged success and Mandrill had no record
of the message at all, which narrowed it to the gap between `sendMail` resolving and
Mandrill accepting ownership.

### The proof

The same email was then sent twice from production through the real `guardedSendMail`:

| | `envelope.from` | `messageId` | In Mandrill's log? |
|---|---|---|---|
| without `from` | `""` | `…@localhost` | **no** |
| with `from` (control) | `info@colaberry.com` | `…@colaberry.com` | **yes**, `state: sent` |

Both returned `250 ... Ok: queued` and both reported a recipient in `accepted`. The
envelope sender is the only field that told them apart — which is why
`readSendOutcome` checks it and not `accepted.length`.

## It was never just this one button

Five call sites had the same omission:

- `routes/admin/marketingBugReportRoutes.ts` — the Marketing report button
- `services/govStudio/studioBugReport.ts` — the Gov Studio report button
- `services/internship/internshipNudge.ts`
- `services/internship/agentNudgeSend.ts`
- `services/internship/nudgeBrief/send.ts`

The three internship senders are nudges aimed at builders' inboxes, so those have been
dropping silently too. That is what moved the fix from the call site to the chokepoint.

## What changed

1. **`services/emailService.ts`** — `guardedSendMail` now defaults a missing `from` to
   `env.emailFrom` and logs `email.from_missing` when it does, so a defaulted send is
   findable rather than invisible. One place, so all five senders are fixed and a sixth
   written next month inherits the fix instead of the bug. Kill-switch and dev-guard
   behaviour is unchanged, and a caller's own `from` is never overwritten.
2. **`services/emailService.ts`** — new `readSendOutcome()`, which reads a resolved
   `SentMessageInfo` and reports `blocked` / `nothing_accepted` / `no_envelope_sender`.
3. **Both report routes** — pass `from` explicitly, then read the outcome and return
   **502** with "tell Ali directly — nothing was lost on your side" when the mail did not
   leave. A reporter told "sent" for a report that reached nobody is the worst outcome of
   the three: the problem stays broken *and* nobody is looking for it.

### Deliberately not done

`guardedSendMail` was not made to **throw** on a missing `from`. Thirty senders pass
through it; turning a silent drop into a thrown exception would convert this defect into
an outage across all of them. Defaulting repairs the message and the warning surfaces the
caller.

## Sohail's actual bug, which is a separate defect

His three reports carried `failed_requests: 9`, `15`, `15` — the recorder's cap. nginx
shows what they were: **46 × `GET /api/admin/system/safe-mode` → 403** in one 23-minute
session. `SafeModeBanner` is mounted across the whole admin shell and polls that endpoint
every 30 seconds; the endpoint is section-gated, so a section-scoped admin is refused
every single time. 30s × 23min ≈ 46, which matches exactly.

The banner swallows the error (`catch {}`), so nothing is visible — but the bug-report
recorder captures every one, and with a 15-entry cap **the 403 noise evicts the real
error the reporter is trying to send**. Filed separately; not fixed here.

His reports' text is unrecoverable: the route only ever emailed it, and nginx's buffered
request bodies are long gone. He should be asked to refile once this ships.

## Verification

- `readSendOutcome` executed against both verbatim production responses and 7 other
  shapes — 9/9, plus a control asserting the two production shapes land on **opposite**
  verdicts, so an edit that broke the function's only job cannot leave the suite green.
- Logged for honesty: the fix itself is verified by CI (`jest` + typecheck) and by a
  post-deploy report send. Not yet confirmed in production at the time of writing.

## Footnote

The reports were lost by code written in this repo to make problems reportable, and the
only reason anyone found out is that Ali noticed the silence. An endpoint that cannot tell
a delivery from a drop should not be the one carrying bug reports.

## Addendum: `readSendOutcome` moved to its own module

The first push put `readSendOutcome` inside `emailService.ts`. CI failed three tests in
`studioBugReport.test.ts`, which mocks `emailService` **wholesale** —
`jest.mock('../../emailService', () => ({ guardedSendMail: ... }))` — so the new export
simply did not exist there and the calls hit `undefined`.

The fix was not to stub it in that mock. A function with no dependencies does not belong in
a 3,000-line module that constructs an SMTP transport as an import side effect: any suite
mocking `emailService` loses it, and any caller wanting it drags the transport in. It now
lives in `services/email/sendOutcome.ts`, the two routes import it from there, and
`studioBugReport.test.ts` needs no change at all.

Its tests moved with it, into a suite with **no mocks and no imports but the function**,
which is the point.

**Before the second push**, every expectation in that new suite was executed against the
real module — 13/13, plus the control that the two production shapes disagree. That caught a
wrong expectation I had written: a `from: 42` envelope reads as *delivered*, because
`String(42)` is not empty. It is now asserted only not to throw, with a note saying why no
verdict is claimed for a shape nodemailer never produces. Finding that by running it rather
than from a second red CI run is the whole reason the harness exists.

## Addendum 2: the Gov Studio suite was asserting an impossible success

The second push still failed two tests in `studioBugReport.test.ts`. Its mock was
`guardedSendMail: jest.fn().mockResolvedValue({ messageId: 'x' })` — a value with no
`accepted` array and no envelope, which is **indistinguishable from the drop this change
exists to detect**. The route correctly answered 502, and the test correctly objected.

The mock was the thing that was wrong. It had been asserting a success the real transport
could not produce, which is why the original defect could never have been caught here. It
now returns the shape production actually returns, and the suite gains the case for the
path the defect created: accepted, then dropped, so **502** and "tell Ali directly" rather
than a thank-you — with a control that the same report *with* a sender still returns 201.
