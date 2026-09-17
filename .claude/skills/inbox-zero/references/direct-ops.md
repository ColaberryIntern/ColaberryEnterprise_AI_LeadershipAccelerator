# Direct operations: how Ali runs the inbox day to day

The bridge and the case engine are the machinery. In practice Ali drives the session with short
instructions ("address Kes's emails", "refresh", "next", "put that back in my inbox", "leave me a
note"), and most of the work is done directly against the three mailboxes and Basecamp with the
scripts in `scripts/`. This file is the operating manual for that mode, written from the 15 to 17
September 2026 sessions. Every rule in quotes is Ali's, verbatim.

## The rules, in Ali's words

- "everything should be in cst time. This process should only be looking in my current inboxes. If
  I delete something from my inbox, then it should not show up on this report." (2026-09-11)
- "When the email is addressed, can we move it out the inbox" (2026-09-12)
- "It should be emails only, but if you get a basecamp email, it needs to be handled in basecamp.
  Then what's every handled should be removed from the inbox, but make no mistake, it is all about
  the inbox. That is it!" (2026-09-12)
- "If they are just acknowledgements, let's clear them out as well. I only want things that need to
  be tackled" (2026-09-15)
- "Make sure you aren't sending out emails with this messed up signature. I have a valid signature -
  use that and don't duplicate." (2026-09-15)
- "you should be checking hotmail and alimuwwakkil@gmail.com as well" (2026-09-16)
- "add the email from slack - i need to see those - they shouldn't be hidden" (2026-09-16)
- "When emailing as me, make my tone a little less formal - says ram." (2026-09-17)
- "did you not bcc me on the email - always bcc me on everything you send out on my behalf"
  (2026-09-17, after the BCC copy of the Jul 2026 commission email had been archived out of his
  inbox as a "copy of mail sent as him")

## What they mean in practice

**Three inboxes, one standard.** `ali@colaberry.com` (Gmail, `scripts/gmailInbox.js`),
`ali_muwwakkil@hotmail.com` (Graph, `scripts/hotmail.js`) and `alimuwwakkil@gmail.com` (Gmail via
`getPersonalGmailClient`, READ ONLY; never send from it). A Hotmail item is handled the way Ali says
(for instance filed to a named folder after its content is captured in Basecamp) and then it, too,
leaves the inbox. If a mailbox cannot be read (dead token), say it is unreadable; never report it as
checked. The personal Gmail token is re-authorized with `scripts/inbox-auth-helper.js` from an
off-OneDrive checkout with the prod OAuth client; the recipe is in memory
(`feedback_inbox_zero_central_time_and_live_inbox_only`).

**Only what needs tackling stays.** After every item is handled, the inbox holds exactly the things
Ali still has to act on. Cleared on sight, with verification: acknowledgements and FYIs
("thanks, received", "done and live" with nothing asked), automated reports Ali has already read,
GitHub notices of his own approvals and digests. NOT the BCC copy of an email sent as him: every
send carries `bcc: ali@colaberry.com`, Gmail files that copy in his inbox, and it stays there. It
is how he sees what went out under his name; archiving it hides the send from him (the Jul 2026
commission copy was archived and restored the same hour). He clears it himself.

**Addressed means gone.** A reply sent, a Basecamp comment posted, a decision recorded, a task
handed to its owner with a due date: then the email leaves the inbox, and only then. Archive the
whole thread and re-fetch; report "out of your inbox" only when `still_in_inbox` is 0.

**Basecamp mail is handled in Basecamp.** Read the notification with `gmailRead.js` (it resolves the
recording link through Mandrill's tracking wrapper), read the recording and its comments through
the API, answer with `bcComment.js` as Ali (identity check on person 17454835, mention by sgid,
idempotency `MARK`), complete the to-do when the decision closes it, then archive the email. Never
answer a Basecamp thread by email.

**Slack is never hidden.** Gate 1 (Inbox COS hard rule `slack_0f`) routes every `@slack.com`
sender to the inbox. If a Slack email is found archived, restore it and treat it as a gate-1 bug.

**A note when Ali wants a list; stand-alone emails otherwise.** When Ali asks for "a message in my
inbox of everything I need to do", send ONE email to him titled `Your outstanding items as of <Day
D Mon YYYY, H:MM AM/PM CDT>`, lettered sections (decisions and conversations first, one-click admin,
queued for me), each item with its link and no item that already sits in his inbox as its own email.
Re-send the whole note when it changes and archive the previous one after the new one lands
(verify by subject). When he says "put this as a separate email" or "document it well", that item
becomes its own email to him with the file attached, and drops out of the note. When the note is
down to nothing, archive it; the stand-alone emails are the outstanding list.

**Restore on request.** "Put it back in my inbox" is `gmailRestore.js` on the message id, verified.

**Report only what this tab did.** Other tabs archive, reply and deploy too. Never claim a change
this session did not make; when the inbox count moves for no reason of yours, say so.

**Central time, written out.** Every time shown to Ali is `America/Chicago` with CDT or CST. The
prod host clock is the reference (`TZ=America/Chicago date`); the local Git Bash has no zone data
and will print GMT.

## Sending as Ali

Every outbound email goes through `scripts/send.sh` on the prod host, which stages the signature
kit and runs `scripts/sendAsAli.js` inside the backend container. The guards are not advisory:
no em or en dash in the body, no trailing sign-off or name (the signature carries both), the real
Outlook signature exactly once with its inline logo, Ali always BCC'd, threading by Message-ID when
`inReplyToMsgId` is given. A body that mentions Ali's title ("Managing Director") trips the
signature-count guard by design; rephrase rather than weaken the guard.

Voice: a little less formal (Ram, 2026-09-17). Short sentences, contractions, first names, one idea
per paragraph, say the thing and stop, thanks in one plain sentence, numbered lists only when the
reader acts on each item. Internal notes looser than notes to clients or vendors.

Recipients: `alimuwwakkil@gmail.com` is DO-NOT-SEND. Money, legal, HR, refunds, contracts and any
ambiguous recipient always get Ali's word first. Vendors pitching by cold email are archived, not
answered, unless Ali says otherwise.

## Invocation pattern

All scripts run inside the production backend container so credentials never leave it:

```
ssh root@95.216.199.47 "docker exec -i -e KEY=value accelerator-backend node -" < .claude/skills/inbox-zero/scripts/<script>.js
```

Pass structured input as env (`THREADS_JSON`, `IDS`, `HTML_B64`), never on the command line where
Git Bash rewrites paths and quotes. Files for attachments are `scp`'d to the host and `docker cp`'d
into the container; the container's `/tmp` is wiped on every rebuild, so stage right before use.
Write any script longer than a few lines to a file with the Write tool and stream it over stdin; a
shell heredoc will mangle backslashes and apostrophes.

Idempotency: every Basecamp write carries a `MARK` token (`[decision-YYYY-MM-DD-slug]`) and the
script checks for it before posting; every archive and restore re-fetches and reports the live
label state; every send returns the SMTP receipt and the recipients as sent.

## Things that looked like inbox work and were not

- A "Decisions Report" or "Task Worker" email that lists everything with Ali's name on it is a
  report, not an inbox item; the items it names are verified in Basecamp before any are acted on.
- A daily email from a laptop scheduled task or a dev instance is a sender to disable, not a report
  to triage (both happened on 2026-09-16 and 2026-09-17).
- An email whose only content is a Zoom or Otter link is a recording to review on Ali's word, and
  Otter and Zoom both need his browser; ask for an export rather than promising a transcript.
