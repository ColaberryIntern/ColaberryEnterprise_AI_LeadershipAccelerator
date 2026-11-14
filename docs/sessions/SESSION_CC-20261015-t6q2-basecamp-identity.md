# CC-20261015-t6q2 - Basecamp identity rotation: found, repaired, and guarded

**Dates:** found and repaired 2026-11-13, guarded 2026-11-14
**Trigger:** two `/ata-list` passes over Basecamp project 49210714 (Colaberry Live), lists
FC0 (10496600166) and 08 Documentation and Enablement (10392808128). The defect was found
while trying to post, not while looking for it.

## What happened

At `2026-11-13T15:00:02Z` (09:00 Central) a new row, `BasecampAuthInfoID 249`, became the
active row in `CCPP.Basecamp_AuthInfo`. It carried a grant for **CB System
`<ali+999@colaberry.com>` id 37708014**, not Ali Muwwakkil id 17454835. CB System is not a
member of project 49210714, and Basecamp answers **404** rather than 403 for a resource the
caller cannot see, so every read and write against Colaberry Live failed in a way
indistinguishable from a deleted ticket.

Reads in this same session succeeded before 15:00Z and returned 404 for every call after it.
Measured: that identity can see 65 projects, including Ali Personal and Family. Colaberry Live
is not among them.

## Why it was possible

`backend/src/services/ops/basecampToken.ts` resolves the token with:

```sql
SELECT TOP 1 AccessToken FROM Basecamp_AuthInfo WHERE IsActive = 1 ORDER BY BasecampAuthInfoID DESC
```

The query selects on **recency, never on identity**, and the table has no identity column. So
whichever job last wrote an active row decides which person the entire platform acts as.

Two jobs write that table and they do not agree:

- the legacy CCPP refresher **inserts a new active row** roughly every 14 days (rows 245 to 249
  are 14 days apart, at 15:00, 21:00 and 20:45 UTC, so the hour varies), carrying CB System
- `scripts/refreshBasecampTokenFromVault.sh --commit` **updates the active row in place** with
  Ali's grant, on the host cron

`refreshBasecampTokenFromVault.sh`'s probe could not have caught it: it asserted `HTTP 200` on
`/projects.json`, and CB System returns 200 there too. **A 200 is not an identity.**

## Repair, 2026-11-13

1. Minted through the advisor vault for operator `usr-cbdd2c8ffc` and checked **who it is**
   rather than whether it is valid: `id=17454835 Ali Muwwakkil`, and
   `/projects/49210714.json` returned 200. Verified before writing, never printed.
2. Ran `bash scripts/refreshBasecampTokenFromVault.sh --commit` on the prod host.
   `CCPP rows updated: 1 (row 249)`, on-disk cache cleared.
3. Confirmed from inside `accelerator-backend`: identity `Ali Muwwakkil <ali@colaberry.com>
   id=17454835`, and all four previously-404 Colaberry Live paths return 200.

## Guard, 2026-11-14 (this PR)

The probe now requests `/my/profile.json`, asserts HTTP 200 **and** that the person id equals
`17454835`, and refuses to write CCPP on a mismatch. Verified in both directions on the prod
host:

- **positive control:** real grant, dry run. `probe identity: id=17454835
  email=ali@colaberry.com`, `DRY-RUN ok`, exit 0.
- **negative control (mutation):** `EXPECT_PERSON` changed to `99999999` and run **with
  `--commit`**. Output `IDENTITY MISMATCH`, exit 1, and no `CCPP rows updated` line. The guard
  blocks the write, not merely the dry run. A guard proven only in dry-run mode would be worth
  nothing.

Two stale comments in the same file are corrected, because both of them actively misled this
session:

- the `OPERATOR` comment documented bc person **16988292**. No endpoint returns that id for
  this grant. `/my/profile.json` returns 17454835, and `EXPECT_PERSON` now asserts it on every
  run rather than leaving it to a comment.
- the cron comment said `cron (weekly): 0 6 * * 1`, and a sibling branch's copy said
  `every 3d: 0 8 */3`. **Neither matched the installed job.** `crontab -l` on the prod host
  reads `0 8 * * *`, daily at 08:00 UTC, 02:00 Central. The header now carries the real line,
  dated and sourced.

The id extraction is `grep -o | head -1`, not `sed`. The first draft used
`sed 's/.*"id":\([0-9]*\).*/\1/'`, whose `.*` is greedy and therefore returns the **last**
`"id"` in the body, which on this endpoint is a nested object's. That fails closed, so it would
not have written a wrong token, but it would have silently stopped every refresh.

## Residual risk, not closed by this PR

The guard stops **this** job from writing a wrong identity. It cannot stop the other writer from
inserting one. The legacy refresher is expected to insert another active row around
**2026-11-27 15:00Z**, and the daily cron next runs **2026-11-28 08:00Z**, so the platform can
still act as CB System for roughly 17 hours, with the same 404 symptom. Daily cadence bounds
that window at about 23 hours, not at zero.

Raising the cadence shrinks the window proportionally and is a one-line crontab change; it was
not made here because the cadence was already daily rather than every three days, so the change
Ali approved turned out to be a no-op and substituting a different production schedule silently
would have been the wrong call.

The lever that closes it rather than shrinking it is on the **read** path: have
`refreshBcToken()` verify the identity once after pulling from CCPP and surface a structured
mismatch, so the window is loud instead of invisible. That is a change to a module many
services share and was not in scope for this PR.

## Also delivered this pass, 2026-11-13

Seven decision memos posted to Basecamp as comments, with `COLABERRY_LIVE_DECISION_PACK.pdf`
(12 pages) attached to each: FC0.1, FC0.2, FC0.3, L11.6, L11.7, L11.3, plus a list-level
verdict on both todolists. Guarded by the marker `DECISION PACK 13 NOV 2026`, so a re-run skips
rather than duplicates; proven by re-running (8 of 8 SKIP) and by reading three of the posted
comments back.

**Finding on list 08:** it was proposed for an unattended session on the grounds that it was
100 percent session work. It is not. Five of eight are finished and carry
`READY FOR ALI REVIEW - DOCUMENT`, one needs Ram, one needs studio hardware, one needs two
decisions from Ali. There is no session work on it at all.

**A claim of mine that did not survive checking:** I reported DOC 15 as misfiled outside
`docs/colaberry-live/`. It is not. `README.md` names DOC 09 and DOC 15 at their real paths one
level up, links to them relatively, and is generated from `scripts/artifacts/tickets/l118Data.js`
with a check that stats every row against disk. Caught before posting; the corrected text is
what went to Basecamp.

## Verification summary

- Identity before and after the repair, read from `/my/profile.json` inside the prod container
- Four Colaberry Live paths: 404 before, 200 after
- 8 of 8 comments posted, read back, attachment tag and caption present, no em dashes rendered
- Dedup guard re-run: 8 of 8 SKIP
- Hardened script: `bash -n` clean, positive control passes, mutation with `--commit` blocks
- Cron cadence read from `crontab -l`, not from a code comment

No ticket was closed, re-dated, reassigned or dismissed. No credential value was printed,
logged or copied out. Scratch scripts removed from the prod host and the container.
