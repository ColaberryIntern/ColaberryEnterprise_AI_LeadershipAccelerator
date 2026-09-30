# Session CC-20260910-3q7x (CB dispatcher: re-mint the CB System token on demand; dead token no longer trips the kill switch)

Per-PR session log (kept separate from PROGRESS.md to avoid union-merge conflicts).

From the 2026-09-21 05:30 AM CDT alarm "[CB Dispatcher] AUTO-TRIPPED OFF - runaway
protection fired", reason `identity_degraded: posting as null, expected CB System
37708014`. Ali: "Fix this and then turn it back on."

Branch: `workstream/cb-system-token-selfheal` (cut from `origin/main`).

---

## Diagnosis (read-only, on the prod host)

- [x] The CB System token expired mid-day; nothing re-mints it until the next 07:00 run
  - Date: 2026-09-21
  - Session: CC-20260910-3q7x
  - What changed: nothing. `/var/log/cb-system-token-refresh.log` shows a green
    `refreshCbSystemToken.sh --commit` at 07:00 UTC every day since 09-15, each writing
    the cache and asserting id 37708014. `/var/log/cb-inbound.log` shows the 10:30 UTC tick
    getting `GET /my/profile.json -> 401`, resolving identity `null`, auto-tripping
    `cb_dispatcher_enabled` OFF, and every tick after that refused by
    `cron-env-wrapper.sh` ("CB System token missing/stale ... fail-closed"). Root cause is
    the one the wrapper already documents for the Ali token: the advisor returns the token
    it already holds whenever it has more than 300 s of life left, so the daily refresh
    can "refresh" a token with hours remaining, and the CB path had no mint-on-dead step.
    A dead token cannot post as anyone, so tripping the persistent switch on it bought no
    safety and cost a hand re-enable.
  - Verification: log excerpts above; `md5sum` of the cache before/after the manual mint
    differed; `curl /my/profile.json` with the new token returned id 37708014 "CB System".

## Immediate recovery (host operations, no code)

- [x] Minted a fresh CB System token and turned the dispatcher back on
  - Date: 2026-09-21
  - Session: CC-20260910-3q7x
  - What changed: `bash scripts/refreshCbSystemToken.sh --commit` (10:43 UTC) wrote a new
    token (probe 200, id 37708014); `UPDATE system_settings SET value='true'::jsonb WHERE
    key='cb_dispatcher_enabled'` (10:44 UTC) plus the local `cb-control.cache` mirror.
    `cb_dispatcher_last_trip` left as the record of the trip.
  - Verification: 10:45 UTC tick in `/var/log/cb-inbound.log` ran as CB System
    ("scanned recordings feed ... 0 new @CB mention(s)"); ticks at 10:48, 10:51, 10:54,
    10:57 the same. No @CB mentions were posted during the 10:30-10:45 gap.

## Durable fix

- [x] `scripts/cron-env-wrapper.sh`: CB path mints on a stale token instead of only refusing
  - Date: 2026-09-21
  - Session: CC-20260910-3q7x
  - What changed: when `CB_USE_SYSTEM_TOKEN=1` and the cached token fails the probe, run
    `refreshCbSystemToken.sh --commit` under `flock` (dedicated lock
    `tmp/ops-engine/cb-system-mint.lock`), re-read the cache, re-probe, and only then
    `exec`. Still fail-closed: the refresh script refuses to write anything that does not
    resolve to 37708014, and the wrapper still only runs on a 200 probe. Never touches
    CCPP or Ali's grant. Mirrors the mint-on-dead step the Ali path got on 2026-09-14.
  - Verification: `bash -n` clean. Exercised on the host with the cache/lock/mint paths
    redirected to a scratch dir: (1) stale cache + mint that restores a real token ->
    "minting a fresh one", "minted ... running", downstream script ran as id 37708014;
    (2) stale cache + mint that leaves it dead -> "mint did not recover it; refusing to
    run", exit 0, downstream never ran; (3) healthy cache -> ran, mint never called.

- [x] `scripts/ops-engine/inbound-dispatcher.js`: `classifyIdentity()`; unknown identity halts without tripping
  - Date: 2026-09-21
  - Session: CC-20260910-3q7x
  - What changed: new exported pure helper `classifyIdentity(id)` -> `'ok' | 'unknown' |
    'wrong'`. The tick now trips the persistent kill switch (`autoTrip`) only on
    `'wrong'` (token resolves to a real person, the 2026-06-22 flood condition). On
    `'unknown'` (profile.json 401/network/5xx) it halts the tick and still sends the
    rate-limited identity alarm, but leaves `cb_dispatcher_enabled` alone so the next
    tick resumes by itself once the wrapper has re-minted. Log line says
    `IDENTITY UNKNOWN` vs `IDENTITY DEGRADED` so the two are distinguishable in
    `/var/log/cb-inbound.log`.
  - Verification: `node --check` clean. `node --test scripts/ops-engine/__tests__/`
    (run on the host against the repo's node_modules): 22 pass / 0 fail, including the
    pre-existing circuit-breaker and automated-card-guard suites. Dry run of the patched
    file through the real wrapper (`--dry`, no posts): identity ok, feed scanned.

- [x] `scripts/ops-engine/__tests__/identity-guard.test.js` (new)
  - Date: 2026-09-21
  - Session: CC-20260910-3q7x
  - What changed: four `node:test` cases: CB System -> ok; null/undefined -> unknown;
    a real person (Ali) and any other id -> wrong; a string form of the CB id -> wrong
    (strict comparison stays loud on a shape change).
  - Verification: 4 pass. Mutation check: reverting `null -> 'unknown'` to `null ->
    'wrong'` makes exactly test #2 ("no identity ... is unknown, never wrong") fail; the
    other three still pass; restored and green again.

## Not changed, on purpose

- `refreshCbSystemToken.sh` and its 07:00 cron line are untouched; the daily run stays as
  a belt, the wrapper's mint-on-stale is the braces.
- The runaway reply-rate auto-trip (`AUTOTRIP_MAX` in 15 min) is untouched; that one still
  flips the switch, because a real flood needs a human to look.

## Deploy

Host-run scripts, not the container: after merge, `git pull` in
`/opt/colaberry-accelerator` on the VPS (the crontab references
`scripts/cron-env-wrapper.sh` and `scripts/ops-engine/inbound-dispatcher.js` from that
checkout directly). No container rebuild.
