# Session CC-20261123-r9f2 - Phase 2: the demand path behind the membership number

Second of three PRs on Ali's 23 Nov 2026 ask. Phase 1 (the component split that made room for
this) and the full discovery notes are in `CC-20261123-r9f2.md`. A separate file per phase
because both PRs are open at once and one shared file would conflict on the second merge, which
is the whole reason `PROGRESS.md` was sealed.

Ali chose the two-band shape: band one names each campaign with its real reach and is explicitly
not revenue, band two shows the channels that produced payers, and a visible break between them
says where the chain of evidence stops.

---

## What production actually holds, measured before any code

Read-only SELECTs against `accelerator_prod` on 2026-11-23, with both controls behaving
(`leads` = 25,709, so the harness sees data; `enterprise_intakes` = 0, so an empty answer
means empty). This matters because three of the numbers in the existing code comments have
moved, and one of them changes an argument I had already put to Ali.

**There are four campaigns, not three. Two of them are alumni campaigns.**

| Campaign | Identity | State | People asked | Emails sent | Opened | Replied |
|---|---|---|---|---|---|---|
| Colaberry Alumni AI Champion | `type=alumni` | paused, approval live | 10,343 | 8,518 | 1,191 | 3 |
| Colaberry Alumni Re-Engagement | `type=alumni_re_engagement` | active, approval draft | 557 | 1,200 | 201 | 0 |
| Open House Countdown (Maya) | `campaign_key=open_house_countdown` | active, approved | 316 | 300 | 106 | 0 |
| Open House Follow-up (Maya) | `campaign_key=open_house_followup` | active, approved | 233 | **0** | 0 | 0 |

Three findings fall straight out of that table:

1. **The follow-up campaign is active, approved, holds 233 people and has sent nothing.** That
   is the one activity row that earns a colour in this build, because it is a thing to fix
   rather than a thing to scroll past.
2. **Sends are not people.** The re-engagement campaign sent 1,200 emails to 557 people. Two
   bare columns invite a reader to subtract them, so the headline count says "people asked" and
   the sent measure says in words that it counts emails.
3. **`converted` is zero on all four**, which is a property of the writer rather than of the
   campaigns: nothing in the system writes that outcome. It is reported as NOT RECORDED, not as
   zero.

The seed declaration's "922 sends into a 10,343-lead list" is stale; the Champion campaign has
now sent 8,518 and is paused.

**The payer numbers have moved, and the campaign-grain argument got stronger.**

```
                     comment, 2026-11-17      measured, 2026-11-23
open_house                  16                        17
ccpp_alumni                  5                         8
ccpp_winback                 5                         8
                            --                        --
payers                      26                        33

leads.source            26 of 26                  33 of 33   complete
any UTM tag              7 of 26                   7 of 33
utm_campaign             6 of 26                   6 of 33
```

I had told Ali "6 of 26" when putting the grain question to him. It is **6 of 33**: a
campaign-keyed path would be blank for 27 of the 33 people who pay us, not 19. The conclusion he
chose is unchanged and the case for it is stronger than the number I gave him.

Also measured: `open_house_registrations` holds 320 rows (200 `landing_page`, 120
`training_site`) and **every one of the 320 is linked to an enrollment**. That is the strongest
upstream-to-downstream link in the whole chain, and it is still not campaign attribution.

---

## Phase 2

- [x] The demand path: two bands in front of the membership number, with the attribution break drawn
  - Date: 2026-11-23
  - Session: CC-20261123-r9f2
  - What changed: new `demandPath.ts` (pure rules, no database, 280 lines) and
    `demandPathService.ts` (the one query it adds, 120 lines), plus `DemandBand`, `DemandSource`
    and `DemandMeasure` on `revenueFlowTypes.ts` and an optional `demand` on `RevenueStream`.
    `revenueFlowService` builds the path beside the four streams and attaches it to membership
    without mutating the builder's object.
  - Verification: `demandPath` 1 suite / 31 tests passed. Whole revenue area
    `revenueFlow|revenueRoom|channelTruth` **19 suites / 434 tests passed**, up from 429 by the
    five new service-seam tests.
  - Notes: three decisions worth keeping, and one bug in the existing tests that this found.

### No money field anywhere on the contract

`DemandSource` has no field for a figure. It could plausibly carry the MRR of the members
attributable to a channel, because `channelTruth` already computes exactly that. But the stream
this band sits in front of derives its headline differently: per PERSON, annualized, over active
rows carrying a PaySimple payment id. A per-channel monthly sum and a per-person annualized
headline do not reconcile, and two revenue numbers disagreeing by a reconciliation step on one
screen is how a reader stops trusting both. So money stays where it is owned and the bands count
people and messages. The absence is asserted in the tests, in both directions: neither a
campaign source nor a channel source may carry `value`, `cents`, `mrrCents` or `spendCents`,
even though the `ChannelRow` a channel source is built from carries three of them.

### Two bands, not extra funnel stages

A funnel is one population passing through stages and its counts partition. Four campaigns
running at once are parallel, their audiences overlap, and the same person can sit in two of
them. Putting them in `funnel[]` would file them under a column headed Stage, implying a
sequence and a partition that neither holds, and a reader would reasonably subtract one row from
the next.

### A tone, not a classification key

Every other coloured thing on this board carries a `ClassificationKey` and looks its colour up
in the registry shipped alongside. A demand source carries a `FlowTone` instead. The registry
exists so an EVENT can carry nothing but a key and still be readable; a demand source is not an
event and will not become one, because nothing in the schema holds a dated "this campaign asked
this person on this day" row that `events[]` could carry. A classification minted for these
sources would sit in the legend explaining a meaning no timeline pill ever wears, which the
registry's own header forbids. It also avoids touching `revenueClassifications.ts`, which is
652 lines and would have had to be split first.

### The arrived band reads channelTruth rather than re-querying

`getChannelTruth()` already answers "where did the people who pay us come from", is already
tested, and its panel already renders further down the same page. Status and note are passed
through unchanged, so the band and that panel are structurally unable to disagree. A test proves
it by passing a note that exists only in the fixture.

### A test bug this found: the service suite was swallowing the whole feature

`revenueFlowService.test.ts` mocks `membershipFlow` and `govBidFlow` but mocked nothing else. So
`getMembershipDemandPath` ran for real against no database on every test in that file, threw,
and was caught into a caveat no test asserted. **Every test passed, and the feature was never
exercised at the seam.** That is the same failure mode the file documents elsewhere: a check
that passes because there was nothing to check.

Fixed by mocking `demandPathService` with `undefined` as the default, so the existing assertions
keep measuring what they were written to measure, and adding five tests that do exercise it: the
path rides on the membership stream, it is absent rather than empty when nothing can be
measured, it never attaches to a stream whose demand nobody can measure, a throw costs the band
and a caveat rather than the stream or the page, and attaching it does not disturb the stream.

### Not claimed

No local typecheck. Local `tsc` in this worktree is a confirmed false clean, measured again in
Phase 1 with a planted control that was never reported. CI is the type authority. The path has
also not been seen rendered: Phase 3 builds the frontend, and until it merges this payload is
present and unread.
