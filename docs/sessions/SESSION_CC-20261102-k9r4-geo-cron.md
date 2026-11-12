# Session CC-20261102-k9r4 — schedule the visitor geo enrichment (GEO-1)

- [x] GEO-1: run the backfill and schedule the ongoing fill
  - Date: 2026-11-11
  - Session: CC-20261102-k9r4
  - What changed: a daily cron spawns `enrichVisitorGeo` as a child process, with an
    `ai_agents` seed row to track it.
  - Verification: 19/19 logic assertions against the real module (stubbed deps, 5 of them
    controls); production backfill measured 5,943 → 6,096 cities with a second run adding
    0; the live snack-bar feed returns 6 events where it had always returned none.
  - Notes: the manual backfill alone would have decayed — see below.

## What the backfill actually did, on production

Ran after deploying main tip `15008280`:

| | |
|---|---|
| `visitors.city` before | 5,943 of 6,592 |
| after | **6,096** |
| cities added | 153 |
| country-only | 60 |
| never enrichable (non-public IP) | 433 |
| second run immediately after | **0 added** |

The second run is the idempotency claim tested rather than asserted. The 433 are
re-selected on every run by design, not stuck: the GeoLite2 database is refreshed about
twice a week, so an address that resolves to nothing today may resolve next month.

Then the live feed, through the real hostname:

```
GET /api/v1/lp-activity/colaberry-training/ai-learning-platform
{"events":[{"title":"Someone in Phoenix",…},{"title":"Someone in Newark",…},
           {"title":"Someone in Chicago",…},{"title":"Someone in Chicago",…},
           {"title":"Someone in Newark",…},{"title":"Someone in Los Angeles",…}]}
```

CONTROL: the same route with a page slug that does not exist returns `{"events":[]}`, so
the populated response is a real finding and not a route that answers anything.

## Why a schedule was not optional

The feed only considers leads from the last 72 hours. A one-off backfill therefore buys
about three days, after which those six events age out and the bar returns to the empty
state it had been in since it was built — and every visitor arriving after the backfill
keeps a NULL city for ever. A feature that works once and then quietly stops is worse
than one that never shipped, because by then nobody is looking at it.

## Two corrections to GEO-1's own ticket

**The opt-in was never the blocker.** The ticket reasons that the bar was dark because
`leads.social_proof_opt_in` is false everywhere. It is — true for 0 of 25,429 rows, and
nothing writes it — but in `snackbarFeedService` that gate applies only to
`name_format: 'opted_in_only'`. A `city_only` row renders as `Someone in <city>` with no
opt-in at all. The missing cities were the blocker. The unwritten opt-in column is a real
but separate gap.

**The ticket's baseline was stale.** It recorded city filled for 0 of 6,408 rows; 5,943
were already filled when this session looked. Someone ran the enrichment between the 10th
and the 11th. This run finished the remainder.

## Why a child process

`enrichVisitorGeo`'s own header explains it: the GeoLite2 City database is ~50MB and the
maxmind reader holds it open, while the production host's kernel journal counts hundreds
of OOM kills and it runs five Postgres instances. Importing the enrichment into the
long-running backend to save a process would defeat the design the script documents, so
the cron spawns it and the kernel reclaims the 50MB on exit.

This keeps one implementation: the backfill, a manual re-run and the nightly pass are the
same code path on different days.

## The two lists that had to change together

The cron registry guard (`cronRegistryReconciliation.test.ts`) treats a cron site with no
`ai_agents` seed row as a violation, and a seed row whose schedule contradicts the timer
as another. So `schedulerService.ts` and `agentRegistrySeed.ts` are one change:

- `scheduling/visitorGeoCrons.ts` — `instrumentCronJob('VisitorGeoEnrichment', …)`, a
  literal because the guard reads names from source.
- `agentRegistrySeed.ts` — `VisitorGeoEnrichment`, `trigger_type: 'cron'`,
  `schedule: '35 9 * * *'`, the same string as `VISITOR_GEO_SCHEDULE`.

Ships **enabled**, unlike `MetaAdSpendSync`: it needs no token and no configuration, the
database is baked into the image, and the behaviour was verified on production before
this was written. There is nothing for an operator to turn on, so shipping it disabled
would only mean the bar goes dark while a row waits for someone to notice it.

## Failure path

1. **If it fails** the run throws, `instrumentCronJob` records a failed run, and the
   missed-run detector can see it. No city is written; none is corrupted.
2. **Retries:** none, deliberately. A retry against a local mmdb buys nothing — a failure
   means the database or the process is wrong, and both outlast a backoff. The schedule is
   the retry, daily, comfortably inside the 72-hour window.
3. **Recovery:** runnable by hand, and the bar degrades to empty rather than to wrong.
   "No feed, no bar" means a sustained failure shows up as an absent bar, never as a
   fabricated city.
4. **Not handled:** a GeoLite2 file that is present but corrupt. maxmind throws and this
   reports a failed run — the right outcome, but not a repair.

Also bounded: a 5-minute child timeout (a full pass measured 170ms), and an in-flight
guard so two ticks cannot hold 100MB at once. The guard releases in a `finally`, because
one leaked error would wedge the job permanently and look exactly like a cron that stopped
firing.

## Verification detail

No jest or tsc binary is available in this environment, so the logic was executed against
the real module with stubbed `node-cron` and `cronInstrumentation`, resolved through a
local `node_modules` and an extensionless-import hook so **the file under test is
byte-identical to the one committed**. 19 assertions, 5 of them controls, 0 failures.

One incidental result was worth more than the assertions: the registration test invoked
the real tick with default dependencies, which genuinely spawned
`node.exe /app/dist/scripts/enrichVisitorGeo.js`. That confirmed the compiled path
resolution (`dist/services/scheduling` → `dist/scripts`), that the child's stderr is
attached to the error as intended, and that the failure is caught and logged rather than
thrown unhandled.

`tsc --noEmit` and jest run in CI, which are the real gates.
