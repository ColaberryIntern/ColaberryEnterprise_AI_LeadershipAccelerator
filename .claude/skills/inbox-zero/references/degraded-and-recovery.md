# Degraded, blocked, zero - and how to recover

The console has four honest states and one it must never fake.

| State | Meaning | What to render |
|---|---|---|
| **ACTIVE** | Lease held, every configured source healthy, work remains | The overview, recommended item first |
| **DEGRADED** | Lease held, but a configured mailbox has consecutive sync failures (`health.degraded`) | The overview with the degraded source named and its `next_attempt_at`; counts still shown; the word ZERO never appears |
| **BLOCKED** | The bridge failed (timeout, transport, no lease) - the view cannot be trusted | The last known overview, marked stale, plus the exact error; cursor not advanced |
| **ZERO** | Lease held, all sources healthy, nothing actionable | The closeout's first line; waiting / snoozed / commitments still listed |

A source that is `not_configured` is NOT degraded - it is simply absent, and the console says so
under Mailboxes. Only a configured source that is failing degrades the view.

## Known live condition (as of 2026-09-11)

`gmail_personal` (alimuwwakkil@gmail.com) has been failing OAuth with `invalid_grant` since at
least 2026-09-08 and sits in backoff. That mailbox is invisible to gate 1 AND to the case auto-sync
until it is re-authorised. The console will show DEGRADED for it. Recovery is operational, not
code: `scripts/inbox-auth-helper.js` on the prod host, run by Ali. Until then, never claim
Actionable Zero; the overview's bottom line explains why.

## Liveness (only what is in the inbox right now)

`overview.liveness` and `focus.liveness` say how much of what you see has been confirmed against the
mailboxes. Three states, and the console names each one:
- **confirmed** — the provider said the message still carries `INBOX` (Gmail) / sits in the Inbox
  folder (Hotmail) / the to-do is active (Basecamp mirror). Rendered as "In your inbox: confirmed".
- **unverified** — the provider could not be asked (timeout, 5xx, auth, backoff). The item is SHOWN
  with the reason; it is never hidden and never marked gone on a guess. (A mailbox whose SYNC is
  failing already shows DEGRADED through the health probe; a liveness check that fails on its own
  is reported per item, not as a mailbox outage.)
- **gone** — the provider gave a definitive answer (archived, trashed, spam, 404, completed). The
  item is dispositioned NO_ACTION with that reason, its PROPOSED actions are withdrawn, and the case
  closes through the real closure guard. It never appears again; the event log carries
  `item_removed_at_source{reason}` for the audit.

Sweeps: the backend runs a bounded pass every five minutes (`InboxLivenessReconcile`, 150 items,
never-checked first) and after every hourly auto-sync; `start` forces one. A large stalled backlog
is therefore verified within about half an hour of deploy. Until it is, the overview's
"not yet checked" count is the honest number.

## Lease conflicts

`start` returning 409 means another tab holds the operator lease. The response names the owner
(`<actor>#<tab>`) and its expiry. Do NOT take it. Offer:
- **A.** Use that tab.
- **B.** Wait - the lease expires five minutes after its last heartbeat, then `resume` here.
- **C.** Ali confirms the other tab is dead → `resume` (the lazy expiry reaps a stale lease on
  the next acquire only once it has actually expired; there is no force-take, by design).

`heartbeat` returning `heartbeat:false` means this tab's lease expired (the loop stopped, the
laptop slept). Say so, run `resume`, and continue from the stored cursor.

## Cursor rules

- Advance only after a delta was fully rendered (`processing_succeeded:true`).
- On any error in a refresh, hold the cursor and say the refresh failed.
- Never move backwards; the backend refuses a stale `to`.
- `stop` keeps the cursor. `resume` reads it back. A fresh `start` after a `stop` shows
  `new_since_cursor` relative to where the last session ended.

## Refresh loop

`start` arms `/loop 5m /inbox-zero refresh`. If Ali ends the loop, or a refresh line has not
appeared in over ten minutes, the overview's "Next refresh" reads `(loop NOT running)` and the
skill offers to re-arm. It never claims a refresh happened that did not.

## Recovery playbook

| Symptom | Cause | Action |
|---|---|---|
| Every bridge call `NoSecret` | ran outside the container | check the `docker exec ... accelerator-backend node -` invocation in `bridge.md` |
| `TransportError` / `TimeoutError` | backend restarting (60-90s after a deploy) or down | wait one refresh, then `status`; if persistent, BLOCKED and tell Ali |
| `LeaseNotActive` on cursor | another tab, or this lease expired | `resume` |
| Overview counts look impossible (negative, or more due-now than open) | a model bug, never a display fix | stop and report; do not "correct" the number in the rendering |
| A verify comes back PENDING three times | provider unreachable for that action | the engine hands the item to Ali as NEEDS_ALI; confirm delivery by hand |
| Snoozed item never resurfaces | snoozed_until in the future by mistake | `snoozed` lists it; `snooze` with `snoozed_until: null` clears it (audited) |
