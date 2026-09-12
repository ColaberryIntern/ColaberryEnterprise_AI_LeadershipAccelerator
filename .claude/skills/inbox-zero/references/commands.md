# Command grammar

`/inbox-zero [command] [argument]`. Parsing is prose, as in `brief-me`: the first word after the
skill name is matched against the table; anything else is a focus hint.

| Input | Resolves to | Bridge calls, in order |
|---|---|---|
| (nothing) · `start` | start | `start` → `reconcile` (bounded liveness sweep) → `overview` → render → arm `/loop 5m /inbox-zero refresh` |
| `resume` | resume | `start` (a released/expired lease for this tab is re-acquirable) → overview; cursor unchanged |
| `status` | status | `overview` (no lease change; works even if another tab holds the lease) |
| `next` | next | `next` → if unassessed: `assess`, `plan` → `next` again → render focus |
| `zoom out` · `zoom-out` · `zoom out <view>` | zoom-out | `queue {view}` (default `urgency`) → render; remember the focused item |
| `zoom in <n>` | zoom-in | `case {case_id of item n}` → render focus with the remembered draft |
| `focus urgent` / `vip` / `waiting` / `basecamp` / `email` | focused next | `next {focus}` |
| `snoozed` | snoozed list | `snoozed` |
| `waiting` | waiting ledger | `waiting` (stale first) |
| `commitments` · `what do I owe` | commitment ledger | `commitments` (overdue first) |
| `refresh` | refresh tick | `heartbeat` → `delta {since: cursor}` → render one line (or interrupt) → `cursor {processing_succeeded}` (the backend's own 5-minute sweep keeps liveness current; `refresh` does not call `reconcile`) |
| `stop` · `done` · `close` | stop | `stop` → closeout |
| anything else | focus hint | `queue {view: person}` and pick the group whose label matches; else `next` |

## Decision replies inside a focus view

| Reply | Meaning | Bridge calls |
|---|---|---|
| `A` | approve and execute the proposed action(s) | `approve` per action → `execute` → `verify` → report receipts + verification |
| `A 2` / `A <action id>` | approve only that one | same, for that action |
| `B: <changes>` | edit first | restate the edited draft; on Ali's explicit "send" → A. Edits go through `override` semantics (the engine's action-override route) if the preview must change; otherwise the send is rejected and re-planned |
| `C: <person>` | delegate | if a MARK_DELEGATED action is proposed, approve + execute it; otherwise re-plan after setting the owner via `snooze`'s sibling fields is NOT possible - tell Ali the assessment did not name an owner and ask for one, then `assess {force}` |
| `D: <date> — <reason>` | snooze | `snooze {case_id, snoozed_until, snooze_reason}`; a snooze without a reason is refused (400) - ask for one |
| `D waiting` | mark waiting | approve the MARK_WAITING action if proposed |
| `E` | no response | `reject` each send/comment action with reason "Ali: no response needed"; report the disposition |
| `F` / free text | other | do what Ali said within the hard rules; if it implies an external write, confirm the exact action first |

After any decision: `next`. The overview is re-rendered after every third decision or on request.

## Refresh contract (the loop calls `refresh`)

1. `heartbeat {lease_id}`. `heartbeat:false` → say the lease expired, run `resume`, continue.
2. `delta {since: cursor_at}`.
3. If `interrupts` is non-empty → the interrupt line, naming the top P0/P1 and its why. Do not
   replace the focus view Ali is working in.
4. Else → the quiet line: `+<count> new · <closed> cleared · overview updated · next refresh <HH:MM CDT|CST>` (Central time, always; omit `<closed> cleared` when zero — `closed` counts cases resolved since the cursor, including mail the liveness sweep found had left your inbox, and is never folded into "new").
5. `cursor {lease_id, to: next_cursor, processing_succeeded: true}` only if steps 2-4 succeeded.
   On any failure: the failed line, cursor untouched.
6. Never re-render the overview or the focus view on a refresh unless Ali asks.

## Tab identity

Use the session's `CC-<date>-<id>` as the tab identity. It becomes `lease_owner` on the lease
and `advanced_by` on the cursor, so the audit trail says which tab did what.
