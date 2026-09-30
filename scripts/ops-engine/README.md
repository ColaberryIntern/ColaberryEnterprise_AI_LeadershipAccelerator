# Operations Engine (CB System)

The autonomous operations layer. Cron processes that read the Basecamp backlog, decide what needs attention, execute bounded recipes, and report back — without ever closing a human's todo.

This is the part of the platform that actually works a backlog rather than describing one.

---

## The three cron processes

All run on the production VPS.

| Script | Cadence | Behavior |
|---|---|---|
| `worker.js` | every 15 min | Lists every CB-System-assigned open todo across accessible projects, classifies by `#auto-<recipe>` hashtag, executes **one** (FIFO by `created_at`) under a 5-minute hard timeout, posts the result as a comment. **Never auto-closes.** Writes `tmp/ops-engine/worker-state.json`. Posts a digest to the meta tracking todo every ~16 ticks. |
| `inbound-dispatcher.js` | every 3 min | Polls the Basecamp events feed for `@CB System` mentions, classifies the request, runs a safe recipe, replies on the same recording. |
| `backlog-enforcer.js` | every 4 hr | Scans Ali Personal for open Ali-assigned todos, classifies by urgency, posts a snapshot to the `[Tracking] Ali backlog status` todo. Tags Ali only past a threshold or at the 9am CT tick. Read-only apart from one comment write per tick. |

## Handler and reply pipeline

The dispatcher's output quality is guarded by a dedicated layer, because each guard exists to kill a bug that reached a live client-facing comment.

| Script | Purpose |
|---|---|
| `cb-system-handler.js` | Recipe handler dispatch — the shared brain the worker and dispatcher both call. |
| `cb-reply-sanitizer.js` | Kills the **raw tool-call leak**: gpt-4o sometimes emits a tool call as plain text in `message.content` instead of a real `tool_call`, and the no-tool-call fallback used to dump that scaffolding verbatim into Basecamp. |
| `cb-reply-body.js` | Builds the reply body. |
| `cb-people.js` | Resolves a Basecamp person's @-mention **SGID** so CB tags the actual requester. Before this module the dispatcher hardcoded one SGID (Ali's), so every @-tag CB ever produced resolved to Ali — a reply addressed to someone else still pinged him. |
| `cb-context-walker.js` | Walks ticket context to assemble what the responder needs. |
| `cb-artifact-tools.js` | Artifact helpers available to recipes. |

## Control, observability, and self-improvement

| Script | Purpose |
|---|---|
| `cb-control.js` | **The kill switch.** Source of truth is the Postgres `system_settings` table (`cb_dispatcher_enabled`), the same audited store the admin Settings page writes, so the dashboard and host cron can never disagree. |
| `cb-watchdog.js` | Watches dispatcher **infrastructure** health — ticks, coverage, gaps. Emails a GREEN / YELLOW / RED report. `--dry` prints without sending. |
| `cb-quality-audit.js` | Watches **response quality** — did CB post clean, correctly-addressed replies, or leak scaffolding, get lost, or fail to reply? The complement to the watchdog. |
| `cb-replay.js` | Dry-runs the fixed handler against a real Basecamp thread with `bcPost` **stubbed**, printing the exact HTML that *would* have been posted. Verify a fix before it goes live. |
| `cb-self-improve.js` | Re-answers past `@CB` mentions with the current engine and reposts **only when the new answer is materially better**. Identical answers are left alone, so improvement never becomes duplicate noise. |
| `cb-coverage-check.js` | Audits whether mentions were actually caught. |
| `scan-missed-cb-mentions.js` | Backfill scan for missed mentions. |
| `cleanup-cb-dup-replies.js` | Removes duplicate replies. |
| `cb-lessons.md` | **Accumulated behavioral rules**, dated, each traceable to a live incident. Read it before changing handler prompts. |

## Sync and reporting

| Script | Purpose |
|---|---|
| `cardtable-sync.js` | Mirrors todo status into Basecamp Card Table columns. One-way: the todo is the source of truth, cards are a visual projection. |
| `reports-runner.js` | Every 5 min. Reads `automated_reports`, dispatches what is due, logs to `automated_report_runs`. Single source of truth for scheduled reporting. |

---

## `cb-lessons.md` is the interesting artifact

It is a dated list of behavioral rules, each written after a specific failure reached production. A representative entry:

> **2026-06-10:** NEVER write a tool call as prose. Emitting `functions.basecamp_reply({...})` as text posted raw scaffolding into a live client-facing Basecamp comment. Call tools through the real function-calling mechanism only.

Three of the four current lessons trace to the same class of bug — an LLM emitting structure as prose — which is why `cb-reply-sanitizer.js` exists as code rather than as a prompt instruction. **The prompt asks; the sanitizer enforces.** That split is the design principle worth carrying to other agent surfaces.

---

## Running one manually

```bash
export BASECAMP_ACCESS_TOKEN="Bearer <token>"
cd /opt/colaberry-accelerator
node scripts/ops-engine/cb-watchdog.js --dry
node scripts/ops-engine/cb-replay.js <recording-id>
```

The Basecamp token rotates roughly every two weeks. Pull it fresh via `scripts/refreshBasecampTokenFromVault.sh` rather than pasting a stale one — and note that a 401 from Basecamp does **not** always mean the token is dead.

## Scheduling

Production scheduling is **host crontab on the VPS**, wrapped by `scripts/cron-env-wrapper.sh` so the environment loads consistently. Cron calls the wrapper, never the scripts directly.

Logs: `/var/log/cb-worker.log`, `/var/log/cb-inbound.log`, `/var/log/cb-backlog.log`.

> Turning CB System off is a database setting via `cb-control.js`, not a crontab edit.

## State files

| File | Purpose |
|---|---|
| `tmp/ops-engine/worker-state.json` | Worker tick state |
| `tmp/ops-engine/cache.json` | Cache snapshot |

On production these are mounted read-only into the backend container at `/app/host-ops-engine` so the CB System Command dashboard can display them.

---

## Tests — `__tests__/`

Six suites, each guarding a failure mode specific to an autonomous agent:

| Test | Guards against |
|---|---|
| `circuit-breaker.test.js` | Runaway loops against a failing upstream |
| `self-reply-guard.test.js` | The bot replying to its own comment and looping |
| `automated-card-guard.test.js` | Automated cards multiplying |
| `cb-reply-sanitizer.test.js` | Tool-call scaffolding leaking into a reply |
| `cb-reply-body.test.js` | Malformed reply bodies |
| `cb-people.test.js` | Mis-resolved @-mentions |

---

## Design constraints

- **API first.** Basecamp REST only, no browser automation.
- **Never auto-close.** The engine comments; a human closes. This boundary is what keeps it trustworthy.
- **Deduplicated.** Lock plus state file on every process; re-running a tick does not double-notify.
- **Bounded writes.** Read-mostly, with a small explicit write surface per process.
- **Verify before live.** `cb-replay.js` exists so a handler fix is proven against a real thread with writes stubbed.

## Operator surfaces

`/admin/ops` (AI Ops Command Center) and `/admin/reports`. See [`../README.md`](../README.md) for the wider scripts directory and [`../../docs/DEV_GUIDE.md`](../../docs/DEV_GUIDE.md) for how this engine fits the rest of the system.
