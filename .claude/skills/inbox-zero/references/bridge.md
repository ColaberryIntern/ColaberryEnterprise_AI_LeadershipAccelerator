# The bridge

`scripts/inboxZeroBridge.js` is the only way this skill touches the backend. It runs INSIDE the
production backend container, fed over stdin, mints a five-minute admin JWT in-process from the
container's own `JWT_SECRET`, calls `http://localhost:3001`, and prints one JSON line. No
credential is ever read locally, printed, or written to a file. This is the same shape as the
`person-360` skill, and it is the shape the auto-mode classifier allows: nothing exfiltration-shaped.

## Invocation (from the Bash tool, any platform)

```bash
SKILL=".claude/skills/inbox-zero/scripts/inboxZeroBridge.js"
ARGS=$(printf '%s' '{"tab":"CC-20260910-3q7x"}' | base64 -w0)
ssh root@95.216.199.47 "docker exec -i -e IZ_CMD=start -e IZ_ARGS_B64=$ARGS accelerator-backend node -" < "$SKILL"
```

Always pass args as `IZ_ARGS_B64` (base64 of the JSON). Raw `IZ_ARGS` works on a POSIX shell but
breaks under Windows → ssh → docker quoting. Optional env: `IZ_TIMEOUT_MS` (default 30000),
`IZ_ACTOR` (default `ali@colaberry.com`, the audit actor on every write).

`IZ_DRY_RUN=1` prints the request it would make and exits without minting or calling. Use it to
show Ali exactly what a command will do before the first real call in a session.

## Command → endpoint

| IZ_CMD | Args | Backend |
|---|---|---|
| `start` | `{tab}` | `POST /api/admin/inbox/zero/session/start` → `{session, overview}`; 409 = another tab holds the lease (`session.incumbent` names it) |
| `heartbeat` | `{lease_id}` | `POST .../session/heartbeat` → `{heartbeat, expiresAt}`; `heartbeat:false` = lease gone, run `resume` |
| `stop` | `{lease_id}` | `POST .../session/stop` → `{released}` (idempotent) |
| `cursor` | `{lease_id, to, processing_succeeded}` | `POST .../session/cursor`; 409 `LeaseNotActive` = you are not the active tab |
| `health` | `{}` | `GET .../health` → providers + basecamp + `degraded` + reasons |
| `overview` | `{cursor?}` | `GET .../overview` → status, counts, recommended + why, bottom line |
| `delta` | `{since}` | `GET .../delta` → cases updated after `since`, `interrupts` (P0/P1 due now), `next_cursor` |
| `next` | `{focus?}` | `GET .../next` → one focus payload, or `focus:null` |
| `case` | `{case_id}` | `GET .../cases/:id` → focus payload for a specific case (zoom in) |
| `queue` | `{view?}` | `GET .../queue` → groups with cases numbered 1..N |
| `waiting` / `commitments` / `snoozed` | `{}` | the three ledgers |
| `snooze` | `{case_id, snoozed_until, snooze_reason, priority_band?, priority_reason?}` | `PATCH /api/admin/inbox/cases/:id/operator` (audited) |
| `assess` / `plan` | `{case_id}` | existing engine routes; produce PROPOSED actions only |
| `approve` / `reject` | `{case_id, action_id}` | existing approval gate |
| `execute` / `verify` | `{case_id}` | existing execution + live re-fetch verification |

## Result shape

Success: `{"ok":true,"status":200,"cmd":"overview","body":{...}}`.
HTTP failure: `ok:false`, `status` set, `body` carries the API's `{error, message|details}`.
Transport/setup failure: `{"ok":false,"error":"TimeoutError|TransportError|NoSecret|NoJwtLib|BadArgs|UnknownCommand","message":"..."}`.

Any `ok:false` on `start`, `heartbeat`, `delta` or `overview` renders the console **BLOCKED** with
the message. It never renders as empty, and it never advances the cursor.

## Why not the admin UI's own login, or a local token

A local token would have to live on Ali's machine and would be minted by a command that prints a
secret - exactly what the permission classifier blocks, and exactly what CLAUDE.md's secrets rules
forbid. The in-container mint keeps the secret where it already is.
