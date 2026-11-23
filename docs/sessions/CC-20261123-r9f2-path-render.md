# Session CC-20261123-r9f2 — R24 Phase 3: rendering the path, and the per-source drill-in

Separate file per phase, so two open PRs from one session never conflict on one log.
Phase 1 is in `CC-20261123-r9f2.md`, Phase 2 in `CC-20261123-r9f2-demand-path.md`.

## The ask

Ali, 2026-11-23:

> Currently there is an alumni campaign and 2 Maya campaigns and marketing (Lnading page -
> open house) currently going towards this revenue source. Can we show that so we can see the
> path before they reach the final revenue number. Also when i drill into a source, I want to
> see a timeline of all color coordinated events

Phase 2 measured and shipped the path as a payload. Nothing rendered it. This phase renders it,
builds the drill-in, and fixes a silent truncation found on the way.

## What changed

- [x] R24 Phase 3: render the demand path in front of the number, and drill into a source
  - Date: 2026-11-23
  - Session: CC-20261123-r9f2
  - What changed: the stream card now reads campaigns, then the drawn attribution break, then
    channels, then the funnel, and only then its revenue figure; each card drills into its own
    events with the legend scoped to them; `FlowTimeline` says when it is cut off.
  - Verification: 5 revenueFlow suites / 96 tests pass; 3 tree-wide copy ratchets / 55 tests
    pass; full frontend suite 857 suites / 11,164 tests pass with 2 pre-existing CRLF failures
    outside this diff (below). CI is the type authority; no local typecheck is claimed (below).
  - Notes: the headline moved for EVERY stream, not only the one with a demand path. A layout
    that moved its own number depending on the data would read as a bug and would be two
    layouts to keep right.

### Files

| File | Change |
|---|---|
| `frontend/src/components/admin/revenueFlow/DemandPath.tsx` | NEW. The two bands, the source tiles, the drawn break. |
| `frontend/src/components/admin/revenueFlow/DemandSourceDetail.tsx` | NEW. One source's measures, and why it has no timeline of its own. |
| `frontend/src/components/admin/revenueFlow/StreamTimelinePanel.tsx` | NEW. The per-source timeline, legend scoped to the events present. |
| `frontend/src/components/admin/revenueFlow/StreamCard.tsx` | Composition, three pieces of expansion state, headline moved last. |
| `frontend/src/components/admin/revenueFlow/FlowTimeline.tsx` | The cut-off notice. |
| `frontend/src/components/admin/revenueFlow/flowBoardTypes.ts` | `DemandBand`, `DemandSource`, `DemandMeasure`, `Stream.demand`. |
| `frontend/src/components/admin/revenueFlow/RevenueFlowDashboard.tsx` | Passes `windowDays`; records why the board-level timeline is kept. |
| `frontend/src/components/admin/revenueFlow/__tests__/demandPathRender.test.tsx` | NEW. 25 tests. |

## Decisions worth recording

**The number moved for every stream.** This card printed its headline in the header, above the
funnel, so the page read conclusion-then-working. The ask was the reverse. Asserted by index
comparison in the markup, because moving it back would break no other test and no screenshot
anyone compares.

**A demand source gets a drill-in, but not a timeline, and says which.** The stream-level
drill-in renders real events. A source cannot, and the reason is structural rather than a gap
to fill later:

- A CAMPAIGN has no dated row tying it to a person. `campaigns` holds running counters and
  `interaction_outcomes` holds vocabulary nothing writes. There is no "this campaign asked this
  person on this day" record for `events[]` to carry.
- A CHANNEL does reach paying members and `channelTruth` ties it to them, but no event records
  which channel its person arrived through: `subscriptions` carries only `enrollment_id` and the
  channel is two joins away on `leads.source`.

An empty timeline rendered under a source would read as "this source produced nothing", which
is a claim about the business when the absence is a fact about the schema. Both cases are stated
in the panel, and they are stated differently, which is asserted.

**The board-level timeline is kept.** Per-stream timelines do not replace it: it is the only
cross-stream view, and the only place the table view lives, which the palette's contrast WARN
obliges this page to ship.

**No `@testing-library/react`.** It is not a dependency of this frontend and adding one is
escalation-tier, so no click is simulated. Every panel is a pure function of its props and the
expansion state lives on the card, which is the only way `renderToStaticMarkup` can assert both
states of a drill-in.

## The silent truncation, now fixed

`FlowTimeline` has dropped every day past `maxDays = 40` since R16 and rendered no notice. On a
surface whose stated doctrine is that an empty stretch must explain itself, a timeline that ends
without saying it ended is the same defect in a worse place: the reader sees the oldest drawn day
and reads the window as having started there. The foot of the timeline now names how many active
days are not drawn, and three tests cover the plural, the singular, and silence when nothing is
hidden.

## A dead prop, finally wired

`FlowTimeline.onPickEntity` has existed since R16 and was passed by no caller, so every pill
rendered unclickable. `StreamTimelinePanel` is the first caller. Clicking a pill focuses the
timeline on that one record, with a control to go back.

## Verification, stated precisely

**Local frontend `tsc` is a false clean, and the root cause is now identified.** Fifth
measurement, and the first with a diagnosis: this tree runs **TypeScript 4.9.5** against an
`@types/d3-dispatch` whose line 91 reads `const EventNames extends keyof any = keyof EventMap`.
A `const` type parameter is TypeScript 5.0 syntax, so the 4.9 parser fails on it and aborts
before reaching repo source. `--skipLibCheck` does not help, because these are parse errors
rather than type errors, and restricting `--types` does not either.

Proved rather than assumed: a control error (`const __control: number = "definitely not a
number"`) was planted in `DemandPath.tsx`, grep-confirmed present, and **never reported** by
either invocation. It was removed and its absence verified alongside a positive control.

The fix is a dependency pin, which is escalation-tier and not part of this phase. CI's
**Frontend typecheck** gate is the type authority for this PR.

**Two pre-existing test failures, outside this diff.** The full frontend run reports 2 failed
tests, both line-ending artifacts of this Windows worktree:

- `governmentHeaderParity.test.ts` matches an exact `\n`-joined string against
  `frontend/public/government/index.html`, which holds **1,760 CR bytes** here.
- `publicNextOpenHouseJs.test.ts`'s own positive control matches a two-line comment fragment in
  `frontend/public/v1/next-open-house.js`.

Not mine, and the argument is structural rather than a guess: this diff touches 8 files, all
under `frontend/src/components/admin/revenueFlow/`; neither failing suite imports anything from
`revenueFlow` (grep count 0 in both); both read only public asset files; and every file in this
diff holds 0 CR bytes. Both failures reproduce on pristine `origin/main` in this worktree, and
CI is green on main, so CI's checkout does not have them.

Six further suites report "Your test suite must contain at least one test". They are helper
modules under `__tests__/testEnv/` and two empty smoke files, all pre-existing and all outside
this diff.

## What this phase did NOT do

Dated campaign events. Making a campaign's reach drawable on a timeline, or splitting the
timeline by channel, both need the backend to carry something it does not carry today. That is a
schema and payload change, so it is its own phase rather than something faked at the render
layer.
