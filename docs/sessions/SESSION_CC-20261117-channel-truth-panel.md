# CC-20261117: R19, where the paying members actually came from

Revenue Room ladder. Basecamp 10521033326 (R19) on list 10470892344. Follows R18
(`enrollments.lead_id`, BC 10521033320, PRs #4158 and #4165), which is what makes this a join
rather than a fourth hand-match on lowercased email.

Chosen by Ali on 2026-11-17 over fixing the UTM capture gap first, and placed in the Revenue
Room linking out to the existing ad report rather than absorbing it.

## What Phase A measured (production, read-only, 2026-11-17)

**`leads.source` is the channel signal, and it is the only one that is complete.**

| Signal | Coverage across the 26 paying members |
|---|---|
| `leads.source` | 26 of 26 |
| `enrollments.lead_id` (R18) | 26 of 26, agreeing with the email join on all 26 |
| Any UTM tag | 7 of 26 |
| `utm_campaign` | 6 of 26 |
| `enrollments.referral_channel` | **0 of 26 - NULL for every paying member** |

This killed the design the ticket was written around. A panel keyed on campaign would be blank
for 19 of the 26 people who pay us. `referral_channel`, the free-text VARCHAR(50) that
`enrollments` carried before R18, is not a fallback: it is empty.

Running the service's own SQL read-only afterwards returned exactly:

```
open_house   16 members  $2,984        ccpp_winback  20,688 leads
ccpp_alumni   5 members  $  895        open_house       798 leads
ccpp_winback  5 members  $  945        free_signup      506 leads
```

26 members and $4,824 of MRR, matching the Phase A figures. No `unlinked` row: every paying
member reaches a lead that carries a source. Lead counts are lower than the raw totals (20,837 /
815 / 690 / 591) because the denominator excludes test and staff addresses.

## What already existed, and was nearly rebuilt

`adSpend/adProfitabilityService.ts` already does spend against paying members per campaign, with
payback, coverage and a `no_spend` verdict, and it is already surfaced as `AdProfitabilityCard`
on /admin/marketing/performance. One step from a duplicate.

It cannot be the channel panel. It is scoped to `LANDING_SOURCES`
(`free_signup`, `popup`, `training.colaberry.com`, `training.colaberry.com/thank-you`), and
**none of the 26 paying members has one of those sources**. It is correct for the ad population
and structurally blind to the three channels that produced every member we have. The two are
complements. This panel links to it rather than restating it.

`membershipFlow.ts` (R16) has no channel breakdown either, so there was no overlap there.

## What changed

- **`channelTruth.ts`** (pure, no database): the rules a row must obey. Status vocabulary reused
  from `commercializationTiles`, not reinvented.
- **`channelTruthService.ts`**: the SQL and assembly. Reuses `PAYING_MEMBERS_CTE` (whose own
  header warns that three surfaces already credit marketing with paying members and a fourth
  definition would let one screen show three different payer counts), `allocateSpend` (a plain
  SUM would double count a day covered by both a manual and a Meta row), and `LANDING_SOURCES`
  imported rather than retyped.
- **`GET /api/admin/commercialization/channel-truth`**, a LITERAL segment and deliberately not a
  child of `/revenue-room/`, so the parameterized `:cardKey` drill-down cannot shadow it.
- **`ChannelTruthPanel.tsx`** on /admin/revenue-room, above the hypothesis panel because it is
  about revenue that exists rather than revenue that is bet on. Self-fetching, so a failure costs
  the panel and not the page.

## The three rails, which are the deliverable

1. **Spend never recorded is NULL, never 0.** We hold Meta spend. We hold nothing for the open
   house or the CCPP lists, and "we spent $0 on the open house" is a claim nobody measured. A
   test asserts the rendered panel contains no `$0` in that case.
2. **Cost per paying member exists only where both sides were measured.** Spend with zero members
   is `undefined_rate` - a ratio with an empty denominator, not a big number and not zero.
   `assertNoChannelShowsAnUnmeasuredCost` enforces it at the boundary rather than trusting it.
3. **No blended total.** $3,894.80 over 16 open-house members would be a plausible-looking,
   entirely invented CAC. The total row prints "Not blended on purpose", and a test asserts the
   invented figure never appears.

A fourth, smaller: a channel with leads and no members is `measured_zero` (a finding), while a
channel with no leads is `unmeasurable` (an absence of data). Collapsing them would let "we have
never tried this" read as "this does not work".

## Verification

- Backend `channelTruth.test.ts`: 19 passed, covering each rail and the degraded path where the
  spend ledger throws.
- Frontend `ChannelTruthPanel.test.tsx`: 8 passed, through the exported `ChannelTable` seam,
  because `renderToStaticMarkup` never runs effects. Same seam `AdminRevenueRoomPage` already
  exports for `InitiativeCardView`.
- Backend revenueRoom + controllers + routes: **3,740 passed, 1 failed**. The failure is
  `mountLearnerPortalRoutes.test.ts`, which reads `server.ts` and the learner-portal module -
  neither touched here - and was already failing on clean `origin/main` when checked during R18.
- Frontend `AdminRevenueRoom`: 2 suites, 39 passed.
- Both typechecks clean. A control error was planted earlier in this session and caught at the
  exact line, so the compiler was confirmed to be looking.
- **The service's exact SQL was run read-only against production**, printed from the real
  `PAYING_MEMBERS_CTE` rather than retyped, and returned the numbers above.

## Not verified

- The panel has not been rendered against the live API. The SQL is verified against production
  and the rendering is verified by unit test, but the two together are not, and nobody has
  looked at the page.
- `getChannelTruth` itself has never executed: the tests mock `sequelize.query`, and the SQL was
  proved separately. The assembly between them is unit-tested, not integration-tested.
- A link is still not an attribution. These rows say which CHANNEL a paying member came from.
  Which CAMPAIGN remains unknown for 19 of the 26, because repo-wide UTM coverage is 5.5%.

## Owed

- Fixing UTM capture and the `fb|paid` delimiter bug, which is why coverage is 5.5%. Deliberately
  out of scope here: it changes future data rather than what Ram can read this week.
- The five abandoned ad checkouts ($7,351 of would-be ARR in `pending` subscriptions) and the
  $1,194 of failed charges, both of which belong to the billing tab.
