# CC-20261119: the channel panel made readable, and a correction to the record

Revenue Room ladder. Basecamp 10527137216 on Marketing (9946469014). PR
[#4230](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4230),
merged `94f902382` and deployed to production the same day.

Follows R18 (`enrollments.lead_id`), R19 (the channel panel itself) and R22 (`utm_medium`).

## The correction that produced this ticket

This work exists because of a wrong claim I made, and the record should carry it.

I told Ali the Revenue Room read `utm_source` and was therefore hiding his best channel. **It does
not.** R19 chose `leads.source` deliberately and its own session record states why: across the
paying members, `leads.source` resolved for 26 of 26 and any UTM tag for 7 of 26. The panel has
been reporting the open house correctly since the day it shipped.

What happened is that I ran my own ad-hoc SQL keyed on `utm_source`, saw the sparse result, and
inferred the product's behavior from my query's framing without reading the product's code. The
instruction to "fix the revenue room to read `leads.source`" followed from that error.

`channelTruthService.ts` groups on `l.source` in both `membersByChannel()` and
`leadsByChannel()`, and `channelTruth.ts` carries a header explaining the choice. Nothing needed
fixing. **Readability was the real gap**, and that is all this change addresses.

## The real problem

The panel listed 17 rows. Three of them produce every paying member we have; one more is the row
the panel exists to show. The remaining thirteen were sources with a handful of lead rows each and
nobody paying from any of them, and they pushed the rows that matter below a fold.

The obvious rule — drop any row with no paying members — **cannot be used**. It would delete the
paid-ads row, which has 0 paying members against $3,895 of recorded spend. That row is the single
most useful fact on the page. A fold that silently removed it would defeat the panel's purpose.

## The rule that was used

`foldLongTail` in `channelTruth.ts`. A row survives the fold if **any** of these holds:

| Survives when | Why |
|---|---|
| `payingMembers > 0` | It produced revenue |
| `spendCents !== null` | Money was measured against it, however little it returned |
| `key === 'unlinked'` | A payer whose enrollment reaches no lead is its own row by R19's rule |
| `leads >= TAIL_LEAD_CEILING` (50) | Big enough to argue about |

`TAIL_LEAD_CEILING = 50` sits above the largest row meant to fold (`contact`, 16 leads) and below
the smallest worth arguing about (`ai-pilot-cold`, 99). The constant carries that reasoning in its
doc comment so the number is not mistaken for a round guess.

The spend clause is the load-bearing one. It is what keeps the measured zero on the page, and the
first test in the new block is the guard for it:

> `it('NEVER folds a channel with recorded spend, however few leads it has')`

## Nothing leaves the payload

Three deliberate choices, because a fold is the easiest place to lose a number:

1. **The folded rows travel with the synthetic row** in a new `collapsed?: ChannelRow[]` field.
   They are not dropped from the response; the reader chooses whether to look.
2. **The folded sources are named in the row's own note**, so a reader who never expands still
   learns which sources are in there and that none of them produced a member.
3. **Totals are summed over every row before the fold.** A presentation choice can never move the
   book. `channelTruthService.ts` sums `rows` (unfolded) while the page draws `sorted` (folded).

The synthetic row's `spendCents` is `null`, never `0`. No spend was recorded against any of the
folded sources, and `0` would claim we measured it — R19's first rail, applied to the one row this
code invents.

`assertNoChannelShowsAnUnmeasuredCost` runs **again** on the folded set. Asserting only before the
fold would have exempted that invented row from the rail every other row obeys.

## Verification

- 27 backend tests on `channelTruth` (7 new), 13 on the panel (5 new).
- Wider sweep: 69 backend suites / 882 tests; full frontend suite 794 suites / 10,440 tests.
- Both typecheckers clean — **after** a control error was planted and caught at the planted line
  in each (`channelTruth.ts:283`, `ChannelTruthPanel.tsx:224`). A clean run was not trusted until
  the checker had been shown able to fail.
- Mutation tested both directions: removing the spend clause failed exactly the one test that
  protects the paid-ads row; dropping `collapsed` failed two. Restored, 27 of 27 green.
- CI on #4230: 10 checks green, 1 skipped (`Sweep full history`), 0 failures.

Four frontend suites fail on this branch and **fail identically on untouched `main` at
`ec8c222a4`** — confirmed by detaching and re-running them there rather than assuming. One is the
known Windows CRLF case; two need the uninstalled dnd-kit packages. None touches `revenueRoom`.

### What the tests cannot prove

`renderToStaticMarkup` never runs effects and cannot click, so the panel tests reach the **closed**
state only. That the sub-rows appear on expand is covered by the backend carrying them in
`collapsed` and by the markup wiring the button to the state, not by a test. The test file says so
in a comment rather than implying coverage it does not have.

## Deploy

Merged as `94f902382` at 13:42Z. Deployed and verified 2026-11-19.

**A merge that touches both stacks needs both services deployed.** The backend was deployed at
13:50Z with `services=backend` alone, so the React bundle stayed on the 13:02Z image for three
hours while every surface reported success. The panel's rules were live and its UI was not. Nginx
was deployed at 16:54Z to finish it.

Proof of the shipped artifact, not of the exit code:

| Check | Result |
|---|---|
| nginx image | `849c5a3b` -> `e08010da` |
| nginx `StartedAt` | `13:02:03Z` -> `16:54:28Z`, with `Recreated` in the compose output |
| `:main` digest | matches `sha-94f902382ab51dc1a26e5695a18160ae7d63e29b` |
| backend `dist` | `foldLongTail` present in `channelTruth.js` **and** in `channelTruthService.js`, so it is wired and not merely compiled |
| served bundle | `static/js/8074.b0d8ca68.chunk.js` carries `channel-other-toggle`, `channel-subrow-`, `Hide them` |
| over HTTPS | that chunk returns 200 / 54,402 bytes on both `enterprise.colaberry.ai` and `www.refactored.ai`, with all three markers in the response body |

### Two things the deploy guard did not prove

Recorded because both would have let a stale deploy pass:

1. **`EXPECT_MARKER` on nginx can be satisfied by a source map.** The first match for
   `channel-other-toggle` was `8074.b0d8ca68.chunk.js.map`. A source map ships with a new build but
   is not the executable the browser runs. The marker check should exclude `*.map`.
2. **Busybox `grep` in the nginx container has no `--include`.** A first attempt to re-check the
   bundle with `--include="*.js"` reported zero matches for everything — including the
   pre-existing `channel-row-` control that is certainly live. Only the control exposed it as a
   tooling artifact rather than a real absence. `find ... ! -name "*.map" | xargs grep -l` is the
   working form.

A third non-check: `GET /api/admin/commercialization/channel-truth` returns 401 without a token,
and so does any path that does not exist. HTTP status cannot prove an admin route is present on
this app, so it was not used as evidence.

## Also shipped by this deploy

`94f902382` is a merge on top of `02e3c2c9e`, which carried `services/spark/*` from another
workstream. That change went to production with this deploy. Its own `Build images` run was
cancelled at `02e3c2c9e`; the run at `94f902382` succeeded and contains both.
