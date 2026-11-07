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
