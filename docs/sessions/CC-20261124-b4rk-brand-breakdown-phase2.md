# CC-20261124-b4rk — R25 Phase 2: the whole revenue tab, broken down by brand

Phase 1 record: `CC-20261124-b4rk-brand-breakdown.md` (PR #4396, merged 24 Nov 8:31 PM CST as
`7058bd481`).

Ali, 24 Nov 2026, on the live Revenue Room: *"Everything in the revenue tab. Should be broken
down by brand. We can default to Colaberry training but FDE hiring should be connected to
hire.refactorerd.ai brand (create this brand) Enterprise site sales should be connected to it's
brand etc..."*

Phase 1 gave every stream a brand. Phase 2 is the part a reader can see, and it covers the whole
tab rather than the flow board alone — which is what "everything" required and what made this
phase larger than planned.

---

## What the tab actually contains

Worth recording, because the scope question was decided on it. The Revenue Room is not one board:

| Block | Source | Phase 2 treatment |
|---|---|---|
| 4 hero tiles | `revenue-flow` payload `headline` | Scoped per tile |
| 6 stream cards | `revenue-flow` payload `streams` | Grouped under brand headings |
| Cross-stream timeline | `revenue-flow` payload `events` | Scoped |
| 7 initiative cards | `revenue-room` endpoint | Filtered |
| 10 business-proof cards | `commercialization/board` endpoint | Filtered |
| Channel truth panel | own fetch | Hidden off-brand |
| Hypothesis health panel | own fetch | Hidden off-brand |

Shipping the flow board alone would have left a page whose top half was brand-scoped and whose
bottom half was not, with nothing on screen admitting the difference. That is worse than either
half, so the filter is owned by the page and scopes all seven blocks.

---

## The thing this phase exists to prevent

**Every one of the four tiles across the top is a single stream's figure under a board-level
label.** Read off the assembly in `revenueFlowService`:

| Tile | Figure | Stream | Brand |
|---|---|---|---|
| Booked, annualized | `bookedAnnualized` | `membership` | Colaberry Training |
| Possible proposal winnings | `possibleWinnings` | `gov_pipeline` | Colaberry Enterprise |
| Pipeline per year | `possibleWinningsAnnualized` | `gov_pipeline` | Colaberry Enterprise |
| Won | `wonValue` | `gov_pipeline` | Colaberry Enterprise |

So a brand filter that scoped the cards and left this row alone would have put Colaberry
Training's **$54,900** under the heading **Refactored.ai** — the page asserting a number about a
brand that has booked nothing. It would not have looked broken. It would have looked like an
answer.

A tile out of scope is **removed**, never zeroed: a zero claims the brand earned nothing, which
is a measurement nobody made. When no tile survives, the row says so in words, because an empty
row reads as a page that failed to load. The win-rate sentence travels with the Won tile rather
than outliving it.

### Why the figure-to-stream map is in the payload

The frontend could have hardcoded "the booked tile is membership". It would have been true the
day it was written and silently wrong the day the backend changed the figure's source, leaving a
real number attributed to the wrong brand with nothing failing. `headlineSources.ts` declares it
beside the assembly, and `HeadlineFigureKey` is **derived from `FlowHeadline`**, so adding a
figure to the headline is a compile error until its stream is declared.

The strongest test of that is in `revenueFlowService.test.ts`: the figure keys are read off the
headline the service **actually built**, so an undeclared figure fails even though nothing else
would notice.

---

## A cycle that forced a module out

`commercializationTiles` and `revenueInitiatives` build the seventeen cards and both needed a
brand slug. Neither could import `streamBrands`, which imports `revenueFlowTypes`, which imports
`TileStatus` from `commercializationTiles` — the loop
`commercializationTiles -> streamBrands -> revenueFlowTypes -> commercializationTiles`, which the
composition rule forbids and whose own diagnosis names the fix: "a missing third module C that
both depend on."

`revenueBrandVocabulary.ts` is C, and it **imports nothing**. That is load bearing: it is what
lets the stream map, the card map and the tile map name the same four brands without any two of
them disagreeing about what those four are. It also absorbed `StreamBrand`, which turned out to
be `ResolvedBrand` plus `streamKeys` written out a second time — a duplicate no test could catch,
since both compiled and both rendered.

---

## The brand assignments, and the two that mattered

`brandKey` is **required** on `TileDefinition` and `InitiativeDefinition` and typed to the
vocabulary, so a new card cannot be added without a brand decision and a mistyped slug is a
compile error rather than a card that matches no brand and is hidden under every filter.

- `membership_subscriptions` → Colaberry Training, `gov_bid_pursuit` → Colaberry Enterprise,
  matching their streams. The same money appears twice on this page, once as a stream and once
  as a card; disagreeing would put it under two headings with no way to tell which was right.
- `annualized_revenue` proof tile → Colaberry Training. It is the same `subscriptions` figure
  the membership stream reports.
- The other nine proof tiles → Colaberry Enterprise. Checked against each tile's provenance
  rather than inferred from its key: they read `revenue_opportunities`, `delivery_engagements`,
  `interaction_outcomes` and `delivery_contracts`, which are the enterprise AI business.
- **The five revenue bets → unassigned**, matching the flow board's `hypotheses` stream. Filing
  them under Colaberry Training because it is the default was the tempting mistake; several
  would be new brands if they were set up. A test asserts the bucket holds the five bets **and
  nothing else**, so a sixth member forces the decision instead of defaulting into it.

---

## Two rules worth keeping

**The stream filter is derived against the brand, not reset when it changes.** A reset would be
an effect, and an effect means one render in which the brand is Refactored.ai and the stream
filter still names a government stream — a single frame of one brand's heading over another
brand's card. Derived, that state is unrepresentable, and returning to the earlier brand brings
the reader's stream choice back rather than having silently dropped it.

**A brand group with nothing visible is dropped, not rendered empty.** An empty heading reads as
"this brand earned nothing"; a brand filtered out of view has simply not been asked about.

Both moved out of a `useMemo` into `brandScope.ts` as pure functions. They are the most important
behaviour in this feature and were the least observable: `renderToStaticMarkup` runs no effects
and this repo has no `@testing-library/react`, so a rule reachable only by driving the dashboard's
state would have been asserted by reading the source rather than by running it.

---

## Two files split before the new code shipped

CLAUDE.md requires the split **before** adding to a file past the hard ceiling. Both were
compliant before this change and were pushed over by it:

- `revenueFlowTypes.ts` 476 → 501. Fixed to **485** by moving `StreamBrand` to the vocabulary
  (the duplication above).
- `AdminRevenueRoomPage.tsx` 437 → 609. Split into **328** plus
  `components/admin/revenueRoom/InitiativeCardView.tsx` at **307**. The seam is the obvious one:
  everything moved renders one card and knows nothing of fetching, filtering or layout. Both
  symbols are re-exported from the page, because that is the module their tests and the
  structural `oneDoorIntoRevenue` guard address, and a move is not a reason to break either.

`oneDoorIntoRevenue.test.ts` did break, correctly: it asserted the literal
`'<RevenueFlowDashboard />'` and the dashboard now takes props. Relaxed to an opening-tag match,
which still fails on the deletion it exists to catch.

---

## Verification

| Gate | Result |
|---|---|
| Backend, revenueFlow | **15 suites / 345 tests pass** (16 new) |
| Backend, revenueRoom + commercialization | **18 suites / 308 tests pass** |
| Frontend, revenue area | **8 suites / 160 tests pass** (33 new) |
| Frontend, full suite | **864 suites / 11,229 tests pass** |
| Scoped typecheck | clean across all changed files |
| Mutation check | **17 of 17 killed**, 0 survived, control green first |

### The mutation check earned its keep

Seventeen mutations, each one a change that would make the page tell a lie. The control run
went first, because a suite that is already red reports every mutation as killed without testing
anything.

Backend: booked revenue re-pointed at the gov pipeline; the unknown-stream guard made a no-op;
the board no longer shipping the figure sources; the five bets defaulted into Colaberry Training;
the membership card filed under the wrong brand; the annualized tile filed under Enterprise; a
fallback name presented as the real one; the bucket presented as a brand.

Frontend: out-of-scope hero tiles shown anyway (the $54,900 bug itself); every figure treated as
in scope; an unattributed figure silently dropped; the win-rate sentence outliving its tile; a
stale stream filter surviving a brand change; an empty brand heading rendered; the filter bar
drawn with no brands behind it; the bucket given a brand link; the raw slug printed on a card.

**One survived on the first pass** and is worth recording, because it is the failure mode this
check exists to find. Removing `brand.isBrand &&` from the heading's link left every test
passing: `resolveBrand` sends `url: null` for the unassigned bucket, so the assertion could not
tell whether the guard or the null URL was keeping the link off it. The test now hands the bucket
a URL, making the guard the only thing that can suppress the link, with a real brand carrying the
same URL as the control. Killed on re-run.

### CI round one failed three backend gates, and the root cause was my compiler

Worth the full record, because the lesson is reusable and the first local run was a false clean.

`backend/package.json` declares `typescript: ^5.7.3`. The hoisted local install is **4.9.5**, and
`backend/node_modules` holds no typescript at all. 4.9.5 cannot parse the TS 5 `const` type
parameter in `@types/d3-dispatch`, nor `zod/v4`, so `tsc -p tsconfig.json` aborts inside
`node_modules` and **a planted control error is never reached**. CI installs fresh, gets 5.7, and
found what I could not.

**The fix, which should have been step one:** install the declared compiler into the session
scratchpad — `npm install --no-save typescript@5.7.3` — and run it against the worktree's own
tsconfig. Nothing inside the repo is touched, no `package.json` changes, no shared
`node_modules` is mutated, and it adds no dependency to the project. With it, the planted
control **is** reported, and the whole backend project comes back with 4 errors, every one a
`TS2307` for `maxmind` or `@anthropic-ai/sdk` — packages this worktree is missing and CI has.
The same compiler runs the test-file gate under an 8192 MB heap: zero errors in every file this
branch touches.

What round one caught:

1. **`brandDirectoryService.ts` — a consumer I never opened.** Phase 2 narrowed
   `BRAND_BY_STREAM`'s values to `BrandKey` on purpose, so a mistyped slug would be a compile
   error. That file still narrowed with `.filter((s): s is string => ...)`, which is not
   assignable to a union of literals. Narrowed to `BrandKey` rather than widening the map back
   out, which would have thrown away the guarantee.

   **The real mistake was the scope of the check, not the edit.** My scoped `tsc` listed the
   files I had edited. Tightening a type breaks its READERS, and the readers are by definition
   the files you did not need to touch — so a list built from `git status` is the worst possible
   proxy for the set at risk.

2. **`revenueFlowService.test.ts` — my own test.** The completeness check reads the figure keys
   off the headline at run time, precisely so an undeclared figure is caught, which means they
   cannot be typed as the key union derived from that same headline. Indexed through an explicit
   `Record<string, string>` lookup.

3. **`frontendTypographyLint` — the ratchet working.** Splitting the card view carried an em dash
   into a new file, and a new file is allowed none. The dash was introducing what a deadline date
   means, so it became a colon, which is house style. The ratchet turned DOWN:
   `AdminRevenueRoomPage` 2 → 1, no entry for the new file, recorded total 2088 → 2087. The dash
   had sat in the page's baseline unremarked for weeks; moving the code is what forced the
   question.

**Round two: all 10 gates pass** on `b7cf7bdcd` — Backend typecheck, Backend unit tests, Frontend
build, Frontend typecheck, Frontend unit tests, Test-file typecheck, Integration tier (Postgres),
Scan new commits, Secret scan + route-auth lint, Static security scan. `Sweep full history` skips
by design.

**The 8 failing frontend suites are this worktree's environment, not this change.** Two fail on
`Cannot find module '@dnd-kit/core'` (a dependency missing from the local hoisted install), two
on the known CRLF baseline (`governmentHeaderParity`, `publicNextOpenHouseJs`), and four are
helper modules under `__tests__/testEnv/` that contain no tests. All four named files were
grepped for every module this change touches: **zero references.** CI checks out LF and installs
fresh.

---

## Named and not done

- **The membership campaigns' brand tag.** All four campaigns feeding membership carry
  `brand_id = colaberry-enterprise` while the members they produce are filed under
  `colaberry-training`. Both are rendered as recorded with a note rather than reconciled.
  Correcting the data is a separate ticket, and Ali's call.
- **No brand can take a share of another brand's stream.** That is a consequence of Ali's
  decision on 24 Nov, stated on the page in `BRAND_BASIS` rather than left to be assumed. It
  would need `brand_id` on the revenue tables and a backfill that is guesswork today.
- Dated campaign events, so a campaign or channel could carry its own timeline (named in R24).
