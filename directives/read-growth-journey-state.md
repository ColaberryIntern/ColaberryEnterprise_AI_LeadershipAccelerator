# Read Growth Journey state

**Companion to `directives/growth-journey-operations.md`**, which is the procedure for
CHANGING this system. This one is how you find out what it is doing without changing
anything. Every read here is read-only, prints no email address, and is safe to run
against production at any time.

Four reads, and they answer different questions. Picking the wrong one is the usual reason
someone concludes the system is broken when it is dark, or healthy when it is stuck:

| Read | Answers |
|---|---|
| The probe (§1) | what the next run will actually do, per brand x programme x channel |
| Readiness (§2) | what is left to do before it can be switched on |
| Health (§3) | what has happened in a recent window, as counts and reasons |
| Liveness (§4) | whether the process and its database are up at all |

Extracted from the runbook so each file holds one responsibility, and because the runbook
was over its size budget with this inline.

**Purpose.** Establish what the Growth Journey OS is currently doing — and would do on its
next run — without changing anything, so that an operator diagnosing it never has to
guess, and never has to touch a control to find out.

**Inputs.** An admin token for §2–§4; shell access to the backend container for §1 and the
liveness probe; a `tenant_memberships` row covering the brand if you pass a `brand_id`
(see the runbook §8 — without it a brand-scoped read is a 403, not an empty answer).

**Steps.** The four sections below, in that order. §1 first: it answers the question people
usually mean.

**Outputs.** None. Every read here writes nothing, creates nothing and flips nothing. The
CLIs print to stdout, `--json` emits one document, and no output carries an email address.

**Verification — that these reads are working, not just answering.** A read returning `200`
with an empty body looks identical to a dark system, so check a *pair* rather than a
status: `GET .../status/registry` with an admin token returns `flags.master === false`
*while* `GET .../participations` with the same token returns 404. That combination proves
the status router is mounted above the master-flag gate, which a 200 alone does not. Then
readiness must list 17 items, and the probe must print a mode and a reason for every scope
— dark means every reason is `flag_master_off`. Any of the three answering differently
means the read is wrong, not the system.

**Edge cases.** A `truncated` health read is a floor, not a total. A `403` on a
brand-scoped read usually means no membership row. A `404` under the journey namespace is
ambiguous by design (off, not yours, or absent) — `status/registry` is never gated, so ask
it first. A green `ledger_indexes` does not prove the indexes are *valid* (runbook §14).

**Safety constraints.** Read-only, and safe against production at any time. Nothing here
sends, and nothing here needs `GROWTH_JOURNEY_EXECUTION_ENABLED`. Do not reorder the
status-router mounts (§2–§3) — their position above the master-flag gate is the only
reason they answer while the system is dark.

---
## 1. The probe — what the next run will do

```sh
node dist/scripts/growthJourneyExecutionStatus.js [--json]
```

Read-only, prints no email address, and for every brand × programme × channel reports the
mode and reason from the same resolver the planner uses. It lists every active control
covering each scope **whether or not the flags are on** — the switchboard is readable in
the dark — and counts receipts by status. Run this first when someone asks what the
system is doing.

## 2. Readiness — what is left to do

`GET .../status/readiness`, or `node dist/scripts/growthJourneyLaunchReadiness.js [--json]`.

17 ordered items of `{key, ready, reason, next_move}`. `ready` is **three-state**: `true`,
`false`, or `null` = "cannot be known from here". A `null` counts neither as ready nor in
the denominator, and `score.pct` is `null` — never `0` — when nothing is known.
`tests_green` is a standing `null` by design.

**Order is the product.** `next_move` is the first blocked item in list order; work the
list top down rather than picking off whichever looks easiest.

## 3. Health — what is happening now

`GET .../status/health?window_hours=24` (1–720). Counts and reasons only; never writes,
never decides. Two traps:

- **`receipts[].max_age_hours` is not a threshold.** It is the age of the *oldest* receipt
  in the window for that status. At the row cap both `count` and `max_age_hours`
  **understate**, because the oldest rows are the ones dropped — which is what
  `truncated` is telling you. A truncated read is a floor, not a measurement.
- **`metricFreshness.max_age_hours` IS a threshold**, declared per metric — a different
  thing with the same name. Verdicts are `fresh`, `stale`, `never`; `never` is
  deliberately not `stale`, because "stale" would read as "this used to work".

All three status reads sit **outside** the master-flag gate and stay readable while the
system is dark. That works only because they are mounted above the gated router — do not
reorder those mounts.

## 4. Liveness, and the `/api/health` trap

**The liveness endpoint is `GET /health`** — unauthenticated, `{status:'ok'}` on a
successful `SELECT 1`, **503** with `detail: 'database unreachable'` otherwise.

**`/api/health` is NOT a health endpoint.** It sits behind the admin guard and answers
**401** on a perfectly healthy backend, so a readiness loop pointed at it never sees a 200
and reports an outage that is not happening. A burst of those 401s in production's nginx
log was traced to a hand-run `curl` loop from the host around a restart — not a monitor,
not a cron, not a fault. `directives/rotate-jwt-secret.md` carried this mistake until
2026-10-03.

`GET /health/full` 503s **only** when the overall status is `critical`, and the journey's
entry there is never `critical` whatever it finds. It reports `ok` for a correctly dark
system — *"Dark as configured: all three journey crons are disabled, nothing is scheduled
and nothing has sent"* — and warns only for a receipt stuck in `pending_review` past its
TTL, an **enabled** cron that is late, a ledger that would not answer, receipts in
`failed`, or a read that hit its cap.
