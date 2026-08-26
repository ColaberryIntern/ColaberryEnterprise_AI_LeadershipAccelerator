# Operations Engine (CB System)

The autonomous operations layer. Reference implementation of the Basecamp Operational Accountability Engine described in [`../../OPERATING_DOCTRINE.md`](../../OPERATING_DOCTRINE.md).

This is the part of the platform that actually works a backlog rather than describing one: it reads Basecamp, decides what needs attention, executes bounded recipes, and reports back — without closing a human's todo.

The engine grew in two generations and **both are live**. The digest/reminder layer came first; the autonomous worker and `@CB System` responder were built on top of it later.

---

## Generation 2 — autonomous worker and responder

The processes that make CB System an agent rather than a notifier. All three run as cron on the production VPS.

| Script | Cadence | Behavior |
|---|---|---|
| `worker.js` | every 15 min | Lists every CB-System-assigned open todo across accessible projects, classifies by `#auto-<recipe>` hashtag, executes **one** (FIFO by `created_at`) under a 5-minute hard timeout, posts the result as a comment. **Never auto-closes.** Writes `tmp/ops-engine/worker-state.json`. Posts a digest comment to the meta tracking todo every ~16 ticks (~4h). |
| `inbound-dispatcher.js` | every 3 min | Polls the Basecamp events feed for `@CB System` mentions in comments, classifies the request, dispatches to a safe-recipe handler, replies on the same recording. Recipes: `gmail:<query>` (read-only), `ccpp:<sql>` (read-only), `grep:<pattern>`. |
| `backlog-enforcer.js` | every 4 hr | Scans Ali Personal for open Ali-assigned todos, classifies by urgency, posts a snapshot to the `[Tracking] Ali backlog status` todo. Tags Ali only past a threshold or at the 9am CT tick. Read-only apart from one comment write per tick. |

### Supporting

| Script | Purpose |
|---|---|
| `cb-system-handler.js` | Recipe handler dispatch — the shared brain both the worker and dispatcher call. |
| `cb-control.js` | **The kill switch.** Source of truth is the Postgres `system_settings` table (`cb_dispatcher_enabled`), the same audited store the admin Settings page writes, so the dashboard and the host cron can never disagree. |
| `cb-watchdog.js` | Daily health check. Computes 24h metrics, runs the coverage audit, detects anomalies, emails a GREEN / YELLOW / RED report. `--dry` prints without sending. |
| `cb-coverage-check.js` | Audits whether `@CB` mentions were actually caught. |
| `scan-missed-cb-mentions.js` | Backfill scan for mentions the dispatcher missed. |
| `cb-context-walker.js` | Walks ticket context to assemble what the responder needs. |
| `cb-artifact-tools.js` | Artifact helpers available to recipes. |
| `cb-self-improve.js` | Re-answers past `@CB` mentions with the current engine and reposts **only when the new answer is materially better**. Identical answers are left alone, so improvement never becomes duplicate noise. |
| `cleanup-cb-dup-replies.js` | Removes duplicate replies. |
| `cardtable-sync.js` | Mirrors todo status into Basecamp Card Table columns. One-way: the todo is the source of truth, cards are a visual projection. |
| `reports-runner.js` | Every 5 min. Reads `automated_reports`, dispatches what is due, logs to `automated_report_runs`. Single source of truth for scheduled reporting. |
| `closeout-phases.js` | One-off close-out for Phases 2-6. |

---

## Generation 1 — cache, digest, reminders

Still running. The digest is what Ali actually reads each morning.

| Script | Purpose | Cadence |
|---|---|---|
| `cache.js` | Pulls open todos from CB-System-accessible projects, auto-tiers by activity (Tier A = active in last 90 days), derives status, writes `tmp/ops-engine/cache.json`. | every 30-60 min |
| `digest.js` | Builds the morning or evening digest from cache and emails Ali via Mandrill. One email, no browser. | 2x/day (08:00, 18:00) |
| `reminders.js` | Finds todos hitting due dates and nudges: 24h before due, morning of, then escalation on overdue (P0 SMS, P1 email, P2 in digest, P3 silent). Dedup state in `reminders-state.json`. | 2x/day |
| `intake.js` | **Stub.** Email/SMS/voice to Basecamp tasks at `status=Intake`. Slice A (IMAP on `ali+intake@colaberry.com`) is the staged first step. | event-driven |
| `followups.js` | Polls Gmail over IMAP for replies on watched threads and notifies Ali. **Does not auto-execute** — Ali fires the action. | polled |
| `queue-followup.js` | Pushes a new follow-up onto the watch queue. |  manual |

```bash
node scripts/ops-engine/queue-followup.js \
  --watch-sender someone@example.com \
  --gmail-search 'from:someone subject:"thing"' \
  --action 'What to do when they reply'
```

---

## Running one manually

```bash
export BASECAMP_ACCESS_TOKEN="Bearer <token>"
cd /opt/colaberry-accelerator
node scripts/ops-engine/cache.js
node scripts/ops-engine/digest.js morning      # or evening
node scripts/ops-engine/cb-watchdog.js --dry
```

The Basecamp token rotates roughly every two weeks. Pull it fresh from the CCPP vault (`scripts/refreshBasecampTokenFromVault.sh`) rather than pasting a stale one — and note that a 401 from Basecamp does **not** always mean the token is dead.

## Scheduling

Production scheduling is **host crontab on the VPS**, wrapped by `scripts/cron-env-wrapper.sh` so the environment is loaded consistently. Cron calls the wrapper, never the scripts directly.

Logs: `/var/log/cb-worker.log`, `/var/log/cb-inbound.log`, `/var/log/cb-backlog.log`.

> The `system_settings` kill switch (`cb-control.js`) gates the dispatcher. Turning CB System off is a database setting, not a crontab edit.

## State files

| File | Purpose |
|---|---|
| `tmp/ops-engine/cache.json` | Current cache snapshot |
| `tmp/ops-engine/worker-state.json` | Worker tick state |
| `tmp/ops-engine/reminders-state.json` | Dedup tracking — prevents same-todo-same-milestone double-notify |
| `tmp/ops-engine/list-inventory.json` | Phase 1 output, kept for reference |

On production these are mounted read-only into the backend container at `/app/host-ops-engine` so the CB System Command dashboard can display them.

---

## Tests

`__tests__/` — three guards against the failure modes that matter most for an autonomous agent:

| Test | Guards against |
|---|---|
| `circuit-breaker.test.js` | Runaway loops against a failing upstream |
| `self-reply-guard.test.js` | The bot replying to its own comment and looping |
| `automated-card-guard.test.js` | Automated cards multiplying |

Also `test-playbook/` for recipe fixtures.

---

## Doctrine compliance

The design constraints this engine is held to:

- **API first.** Basecamp REST only, no browser automation.
- **Never auto-close.** The engine comments; a human closes. This is the boundary that keeps it trustworthy.
- **Deduplicated.** Lock plus state file on every process; re-running a tick does not double-notify.
- **Bounded writes.** Read-mostly, with a small explicit write surface per process.
- **Tier-scoped.** Tier A in the morning digest, Tier A+B in the evening.
- **Concise output.** Digests are bullet lists with deep links.
- **No casual list creation.** New Basecamp lists require a deliberate decision.
- **Hashtag controls** for manual status overrides.

## Operator surfaces

`/admin/ops` (AI Ops Command Center) and `/admin/reports`. See [`../README.md`](../README.md) for the wider scripts directory and [`../../docs/DEV_GUIDE.md`](../../docs/DEV_GUIDE.md) for how this engine fits the rest of the system.
