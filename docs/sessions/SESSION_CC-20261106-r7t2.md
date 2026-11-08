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

---

## Phase 1 of the Explorer GHL backfill, 2026-11-07

Plan PR #3745 merged at 20:02 UTC with all ten checks green, which was Ali's approval of
`docs/EXPLORER_GHL_BACKFILL_PLAN.md`. Phase 1 is the dry run.

- [x] Explorer GHL backfill, Phase 1: the read-only dry run
  - Date: 2026-11-07
  - Session: CC-20261106-r7t2
  - What changed: `backend/src/scripts/explorerGhlBackfillDryRun.ts` (new, 420 lines) plus
    `backend/src/scripts/__tests__/explorerGhlBackfillDryRun.test.ts` (new, 23 tests), and a
    Phase 1 results section appended to `docs/EXPLORER_GHL_BACKFILL_PLAN.md` which supersedes
    three of that document's own figures. The script resolves the candidate set, asks GHL about
    each person through the existing `findContactByEmail` / `findContactByPhone` path, and
    reports what a live run would do. **It has no write path**: the only two symbols it imports
    from `ghlService` are those two lookups, which the suite asserts against the import
    statement itself.
  - Verification: **ran against production** from inside `accelerator-backend`, read-only,
    correlation id `06a5dfcd-4f9c-44c6-82ff-adc88251c62b`. 261 candidates, 261 rows classified,
    0 lookup errors, 0 withheld, dispositions summing exactly to 261. **Both credentials passed
    a present/absent control pair** before any candidate was read: a lead already holding a
    `ghl_contact_id` was found by email in each account with its stored id matching, and an
    address under `.invalid` was correctly not found in either. Jest **23 passed**. **Mutation
    testing 4 killed, 0 survived**, every restore byte identical. Single-file compile of the
    script against its full import graph: **exit 0, zero errors**. Secret scan OK (8,123 tracked
    files), admin route-auth lint OK (149 route files). The ledger carries no email, name or
    phone: measured 0 occurrences of each, against a control of 261 for `enrollment_id`.
  - Notes: **The dry run overturned the plan's central premise.** 196 of the 261 candidates are
    **already in GoHighLevel** under contacts we never recorded, including 184 of the 195
    callable people. Rose can already call them. What is missing is the `ghl_contact_id` link on
    our side, not the contact in the CRM. Only 65 contacts would be newly created and only 11 of
    those are callable.

    **The plan's exclusion count was wrong by 46, and in the dangerous direction.** It derived
    test fixtures from the sync audit's `reason`, which only knows about the fixtures the guard
    actually refused; 46 more were never attempted, so no audit row names them. By email shape,
    the rule the live sync itself applies, there are 56 fixtures, not 9. Had the live run used
    the plan's figure it would have pushed 46 more test accounts into a customer-facing CRM,
    which is the exact failure of 2026-10-23.

    **Those 194 open-house contacts were typed in by hand, and Rose has been calling them.**
    Asked GoHighLevel directly, reading `attributionSource` on a 24-contact sample and origin
    fields only: 17 `CRM UI / manual`, 2 `CRM UI / csv_import`, 4 `Other`, 1 `Third Party`.
    **19 of 24 arrived through the GHL UI and not one carries an API attribution.** They also
    carry a **`left voicemail`** tag, which is proof the calling already happened. Cora is ruled
    out as the creator (its adapter reads, searches and `PUT`s fields, with no create path), and
    so is this codebase (18 creation call sites, one service, which either never ran or withheld
    for these people). So nothing was integrating: somebody absorbed three months of our
    withheld sync as manual double entry.

    That reframes the value a third time. Not "make 195 people reachable", since they were made
    reachable by hand, but: stop the double entry (already fixed forward on 2026-10-23),
    reconcile the two systems so our surfaces show the contact she is working, and rule out
    duplicates before creating anything. A live run on the plan's original assumptions would
    have created up to 196 duplicates of contacts she is actively calling.

    **The school location id, measured: `ttBtJmxoLwjf18lIvvVD`.** The six frontend files
    hardcode `JFWwp8q7l6T12NWTIOKG`, the Agent Cory account. The wrong-sub-account reports are
    no longer an inference: the ids differ, measured from live data.

    **A dead check caught by its own control.** My first verification of the compiled artifact
    grepped for `createContact(` and friends and found zero of each. That was meaningless:
    `tsc` emits `ghlService_1.findContactByEmail(...)`, so the pattern matches nothing whether
    the call is present or not, and the write names appear in the file's header comment anyway.
    The present-control, which required the two read calls to be found, returned zero too and
    exposed it. The check now ENUMERATES the member accesses on the service and requires the set
    to be exactly the two reads, which cannot pass by accident.

    **`nohup ... &` inside a tool call does not survive it.** A 14-minute typecheck launched that
    way left a zero-byte output file for 25 minutes while appearing to run. Re-run under the
    harness's own background mode it completed normally. Separately, `checkTestTypecheck.js
    --print` prints per-file error COUNTS, not error text, so getting the text meant invoking
    `tsc -p tsconfig.test.json` directly with the same 8GB heap.

    **I misdiagnosed a break as pre-existing, and it was mine.** The Test-file typecheck gate
    reported 413 errors across 142 files: 1 in my new suite and **13 in
    `src/scripts/lib/__tests__/agentRoster.test.ts`**, a file I had not touched and which has
    been on `main` since 2026-10-22. I recorded it as pre-existing debt on main. It was not.
    Because my suite used only `require` and `jest.mock` it had no import or export, so
    TypeScript treated it as a SCRIPT and put `fs`, `path`, `row` and the rest into the GLOBAL
    scope, where they collided with that file's own globals. A redeclaration is reported against
    **both** files, so 13 of the errors landed on a file whose only fault was declaring `fs`
    first.

    Adding `export {}` to my suite returned the whole-program measurement to the frozen baseline
    **exactly, 399 errors across 140 files, matching in both directions**. Both my 1 and its 13
    disappeared together, which is the proof of cause.

    The lesson is the diagnosis, not the fix: a single script-mode test file can make a
    completely unrelated file fail this gate, so "that file is already broken on main" is a
    conclusion that needs testing before it is written down. Checking the file in isolation
    would never have shown it, because in isolation there is nothing to collide with.

- [x] Explorer GHL backfill Phase 3A: build the link repair, with the fan-out guard production forced on it
  - Date: 2026-11-08
  - Session: CC-20261106-r7t2
  - What changed: `backend/src/scripts/explorerGhlLinkRepair.ts` (the driver) and
    `backend/src/scripts/lib/explorerGhlLinkPlan.ts` (the pure rule), plus two suites and the
    plan's Phase 3A appendix. `resolveAccounts` exported from the Phase 1 module so the repair
    routes exactly as the dry run did.
  - Verification: jest 52 passed across 3 suites (29 new); mutation testing 7 killed, 0 survived,
    both files restored byte-identical; backend `tsc --noEmit` clean after a planted control
    error proved the check live; test-file typecheck matched the frozen baseline in both
    directions; secret scan and route-auth lint OK. **Nothing written to production.**
  - Notes: **The count in the merged plan was wrong, and the data said so.** The 196 matches
    resolve to only **192 distinct contact ids**: four contacts are each matched by two lead
    rows, one by phone and one by email, adjacent ids, same source. One person registering twice
    under two email addresses with one phone number, which our `LOWER(email)` unique index turns
    into two rows while GoHighLevel keeps one contact. So 192 links (191 into
    `school_of_data_analytics`, 1 into default, 180 callable) and 4 withheld: lead ids 24128,
    24403, 24993, 24997. **No person is left unlinked** - each withheld row is the duplicate side
    of a pair whose other row is linked, so what is deferred is a decision about four duplicate
    lead rows, not about four learners.

    What makes it worth recording is what the probe found next. Production holds **8,071 linked
    lead rows with 8,071 distinct contact ids** - one contact per lead has been true of every
    link ever written - and **no index on `leads.ghl_contact_id` at all** (11 indexes on the
    table, 3 unique, none of them this column). So the fan-out would have been accepted
    silently, and this backfill would have been the first thing in the system's history to break
    a property nothing enforces. A one-line `UPDATE ... FROM` over the Phase 1 ledger, which is
    what "write the 196 ids" sounds like, does exactly that.

    The lesson is about where the rule lives rather than what it is: the decision logic went into
    a pure module with no imports, so the thing that chooses what gets written to production is
    tested with no mocks, no database and no credential. The driver's job is then only I/O, and
    its tests assert the two properties I/O can break - that the forward `UPDATE` carries
    `AND ghl_contact_id IS NULL` in the statement rather than in a TypeScript condition that a
    refactor can lift, and that the audit row follows the transition rather than the attempt.

    Second thing worth keeping: **setting `ghl_contact_id` changes what the live sync does.**
    `ghlService.ts:348` branches on it, so before the repair a campaign send against one of these
    leads would CREATE a contact and duplicate the one Rose is working; after it, the send tags
    and updates the existing contact. Both additive, and the repair therefore removes a
    duplicate-creation path. But it is a change in live behavior from a change that looks local,
    and it is exactly the kind of thing that reads as a surprise later if it is not written down
    now.

- [x] Maya: stop her sending links the portal cannot render
  - Date: 2026-11-08
  - Session: CC-20261106-r7t2
  - What changed: new `backend/src/services/maya/mayaLinkGuard.ts` (pure, no I/O) and its suite,
    wired into `mayaReplyService` before the two existing link appenders, plus a regression test
    in the existing Maya harness that replays the exact production reply.
  - Verification: jest 36 passed across both suites; mutation testing 6 killed, 0 survived, both
    files restored byte-identical; backend `tsc --noEmit` clean. Reported by Ali from a live
    screenshot, reproduced as a test before the fix.
  - Notes: **The bug was not in the UI, and the first instinct would have made it worse.** Ali
    saw `[Start Campus Tour](/portal/campus/map)` rendered as literal text in a learner's DM. The
    obvious reading is "the chat does not render markdown", and the obvious fix is to make it
    render markdown. That would have been wrong twice over: `DmMessageText` renders only two
    allowlisted paths ON PURPOSE, so that no DM can render an arbitrary URL, script or markup,
    and the path she sent does not exist anyway, so rendering it would only have produced a
    prettier 404.

    What actually happened is that she never called `start_campus_tour`. She wrote a reply
    imitating what the tool returns and invented both the label and the path. The real one,
    `/portal/campus?tour=start`, is already exported as a constant she was supposed to emit
    verbatim.

    The part worth keeping is the third link in the chain. `withTourLink` exists precisely to
    repair this, by appending the real link when she paraphrases it away - but it is gated on
    `offered`, which is only true WHEN THE TOOL WAS CALLED. So the one failure mode it was built
    for is the one that switches it off. A safety net conditioned on the thing it is protecting
    against is not a safety net, and that shape is worth looking for elsewhere: the guard now
    runs unconditionally on every reply, and the gated appenders sit behind it.

    Deliberately not done: making her call the tool. She will still sometimes answer from her
    own words and the guard will quietly repair the link. That is a backstop, not a cure, and
    saying so matters more than the fix, because a silent repair makes the underlying
    non-compliance invisible. Hence the structured log line on every repair, naming the
    fabricated target and whether the tool had been called, so the rate is measurable rather
    than assumed to be rare.
