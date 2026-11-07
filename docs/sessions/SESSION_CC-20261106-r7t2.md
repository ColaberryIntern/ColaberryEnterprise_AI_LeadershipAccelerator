# Session CC-20261106-r7t2

**Date:** 2026-11-06
**Branch:** `workstream/outreach-paging` (cut from `origin/main` at `f5416cc8`)
**Scope:** Paging, a pool total and a page snapshot on the v1 Explorer outreach feed, so Cora
can tell a capped page from the whole queue and so two systems can prove they read the same
rows. Prompted by Kes Delele's first live dry run of the feed on 2026-11-06.

---

- [x] Outreach feed: offset, total and snapshot
  - Date: 2026-11-06
  - Session: CC-20261106-r7t2
  - What changed: 8 files, +353/-24. `GET /api/v1/explorer-growth/outreach` gains an `offset`
    query parameter and two response fields, `total` (the size of the whole ranked pool) and
    `snapshot` (a 16 hex digest of the page's ordered enrollment ids), plus `offset` echoed
    back. `rankOutreachPool` is split out of `rankOutreach`, which now slices it;
    `getOutreach` takes its optional arguments as an options object and returns `total`. The
    admin route shares the same schema and so gains the same paging. Also fixes a latent
    defect in the same handler: `joinable` counted `ghl_url !== null`, so an empty string
    would have counted as a working link and overstated the health of the one number that
    exists to detect broken lead linkage.
  - Verification: **Backend typecheck clean** (`tsc --noEmit`, exit 0, zero errors, empty
    combined output). The empty output was not taken at face value: all five changed source
    files were confirmed present in the resolved 4,347 file program under `strict: true`,
    with a control name proving the check could report absence. Both affected suites green,
    **62 passed, 2 suites** (`v1OutreachController`, `explorerOutreachRanking`).
    **Mutation testing 4/4 killed, 0 survived**, each restore byte identical: reverting
    `joinable` to `!== null` fails 1 test, ignoring `offset` fails 5, removing the snapshot's
    id delimiter fails 1, and making the snapshot order insensitive fails 1. Baseline checked
    independently first, because a harness that cannot run the suite scores every mutation as
    killed. Secret scan OK (8,087 tracked files), admin route-auth lint OK (149 route files),
    Explorer copy lint OK (77 values) plus its 16 case self-test.
  - Notes: **One existing test had to break.** `v1OutreachController.test.ts` used `offset`
    itself as its example of an unknown parameter that must 400, so adding offset support
    necessarily broke it. The example moved to `cursor`, the strictness assertion is intact,
    and a comment records why. This is the contract gate working as designed rather than a
    regression.

    **`getOutreach`'s optional arguments are an options object on purpose.** `offset` and
    `now` are both numbers; positionally adjacent they would let a caller pass a timestamp
    where an offset belongs and get a silently empty page instead of a type error.

    **The ranking is deliberately not stable across time.** The pool is re-derived against
    the clock on every call, so two counts taken hours apart legitimately disagree. That is
    what made `snapshot` necessary: comparing counts across calls proves nothing, comparing
    snapshots proves exactly the thing in question.

    **My own mutation harness left broken source in the tree once.** It restored only on the
    happy path, and a `UnicodeDecodeError` decoding jest's output on cp1252 raised before the
    restore, leaving `joinable` holding the deliberately broken `!== null` while the comment
    directly above it said the opposite. Caught by reading the file rather than by any gate.
    The restore is now in a `finally` with a byte identical assertion. The first run also
    reported exit 0 because the command was piped into `tail`, which swallowed Python's
    non-zero exit: the harness now writes to a file and the exit code is read directly.

---

## Found while verifying, not fixed here

Kes's dry run was the first real traffic on this feed, and it surfaced something larger than
paging. **318 of 875 explorer leads (36%) have no GoHighLevel contact at all**, so Rose cannot
reach them. It is a closed window rather than an ongoing leak:

| source | people | in GHL | |
|---|---|---|---|
| `free_signup` | 524 | 468 | 89% |
| `open_house` | 238 | 32 | **13%**, 206 missing |
| `ccpp_winback` | 86 | 34 | 40% |
| `ccpp_alumni` | 22 | 22 | 100% |

| month | leads | never synced |
|---|---|---|
| July 2026 | 157 | 122 |
| August | 64 | 63 |
| September | 66 | **66** |
| October | 476 | 67 |
| November | 91 | **0** |

Syncing was broken from roughly July through September and has been correct since. Both
breakdowns reconcile independently to 875 and 318, which is why they are trustworthy. The
backfill is a separate piece of work: it writes contacts into the live CRM and needs its own
approval.

---

## Production verification, 2026-11-07

PR #3738 merged as `29d1b38d`. Production was **already carrying it** before any deploy of
mine: another session deployed main's tip `8831278d` (which has `29d1b38d` as an ancestor) at
12:49 UTC from an image CI built at 12:14 UTC, after the merge. `snapshotOf` and
`rankOutreachPool` are both present in the running container's `dist/`, with a control string
confirmed absent so the check could report absence. No deploy was needed, and none was run.

**Verified from Cora's own server** (`204.168.245.238`), over the public internet, with Cora's
own stored `CORA_SERVICE_TOKEN` — the exact path Kes's nightly job takes. The token was read
into a variable and never printed.

| check | result |
|---|---|
| `offset=0`, `offset=50`, `offset=99999` | HTTP 200 |
| unknown parameter `cursor` | HTTP 400, `Unrecognized key: "cursor"` |
| envelope keys | exactly `view, tracked_since, count, total, offset, snapshot, rows`, no extras |
| pages tile | 50 + 50 ids, overlap **0**, 100 distinct |
| `total` agrees across pages | 432 and 432 |
| snapshot back to back | `8d2f180886a5b425` both times, reproducible |
| snapshot across pages | differs, as it must |
| offset past the end | `count=0`, empty page, `total` still 432, not an error |
| PII | `email` and `name` absent from rows; 18 keys, matching the allowlist |

### The number that matters: the pool is 432, not 200

`total=432` on a 200-row cap means **Kes's full page was 46% of the queue**, and 232 people
were invisible to it. This is no longer an inference from `count === limit`; it is the measured
size of the thing he could not see.

## Two things on Cora's side before tagging can switch on

Found by reading Kes's deployment, not by asking. Neither is a defect in this PR; both block
the integration going live.

1. **His scheduled job reads a test fixture, not the live feed.**
   `EXPLORER_QUEUE_FEED_PATH=/app/execution/fixtures/explorer_queue_test_feed.json` is set, and
   `EXPLORER_QUEUE_FEED_URL` is set nowhere in his `.env` or compose. His own
   `settings.py` records the precedence: *"While explorer_queue_feed_path is set it takes
   precedence."* So setting the live URL alone would change nothing — **the fixture path has to
   be cleared in the same edit.** That precedence is the trap worth naming explicitly.

2. **His client cannot consume paging yet, by design.** `explorer_queue_feed.py` carries
   `MAX_LIMIT = 200  # accelerator caps at 200 (default 25), no offset` and documents the old
   contract: *"send ONLY `view` and `limit` (any other parameter is a 400) ... a full page at
   the limit means more rows exist (no paging yet)."* It has 0 references to `total`,
   `snapshot` or `has_more`. He wrote to the contract I gave him on 6 November; that contract
   changed today. Paging on this side is necessary but not sufficient.

## Flagged on Kes's host, not acted on

- `/opt/cora-recap-engine/.env` is mode `0644`, world readable, and holds `CORA_SERVICE_TOKEN`,
  `GHL_API_KEY`, `OPENAI_API_KEY`, `SYNTHFLOW_API_KEY`, `POSTGRES_PASSWORD` and
  `SMTP_PASSWORD`. Should be `0600`. His box, so his change to make.
- `CORA_INBOUND_WEBHOOK_SECRET` is declared **three times** in that same `.env`. Last one wins
  silently, which is how a rotated secret gets shadowed by a stale copy.
