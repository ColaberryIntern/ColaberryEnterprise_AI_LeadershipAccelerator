# T208 - the lead journey card, written into GoHighLevel

**Session:** CC-20261109-k2w7
**Date:** 2026-11-28
**Branch:** `workstream/ghl-journey-summary`

## What this is

Rose and Taiwo call Explorer leads from a GHL queue. They had no view of what enterprise had
already done with a lead, so they called people we had emailed that morning. Kes created a
contact field for us to fill, and told them on 2026-11-25 that it exists and that Ali would
start filling it in shortly. This is that writer.

**It ships dark.** Two independent gates: the agent seed row is `enabled: false`, and the job
body no-ops unless `EXPLORER_JOURNEY_SUMMARY_ENABLED=true`. Merging writes nothing into
anyone's CRM. Kes told Rose and Taiwo the field stays empty until she says otherwise, and that
timing is hers to choose, not ours to take by merging.

## The field was renamed under us

Kes's first email named `ent_call_activity_summary`. On 2026-11-25 she replaced it:

| | |
|---|---|
| Name | `ent_lead_journey_summary` |
| Key | `contact.ent_lead_journey_summary` |
| Type | LARGE_TEXT, on the contact, Additional Info |
| Old key | **gone**, confirmed absent from both sub-accounts |

The rename is an improvement rather than a nuisance, and the reason matters: we hold almost no
call data of our own, so a field named "call activity" would have read as email history under a
misleading name.

## The token test Kes asked for, run 2026-11-27 on Ali's own contact

She asked us to prove the token could write the field before any real write.

| Check | Result |
|---|---|
| Field visible to `ghl_api_key_school_of_data_analytics` | yes, id `nLbK1UsIeDYIlfyeskWT` |
| Field visible to the DEFAULT `ghl_api_key` | **no** (25 fields, not this one) |
| Write | HTTP 200 |
| **Read back** | exact 160-character match |
| Restore to empty | confirmed by a second read |

**The second row is the one that shaped the code.** The default key cannot see the field, and a
GHL write to a field missing from the destination sub-account returns success and stores
nothing. So a writer that resolved the key carelessly would report a clean run forever while
Rose and Taiwo saw an empty field.

## What the card can honestly say

Measured read-only on production 2026-11-27 across 1,278 Explorer profiles. Each row is why the
code reads what it reads.

| Part | Source | Coverage | Note |
|---|---|---|---|
| Interest | `leads.interest_area` | ~4 in 183 | `affinities` is the designed topical source and is populated on **zero** profiles; `signal_summary` holds numeric tiers, not topics |
| Sent | `scheduled_emails` | 413 leads | |
| **Opened** | `interaction_outcomes` | **236 leads, live the day measured** | |
| Clicked | `interaction_outcomes` | 21 leads | |
| **Replied** | nothing | **0** | 25 rows repo-wide, none since 2026-07-29 |
| Signals | `explorerOutreachRanking.reasonsFor` | 1,097 have history | reused, not reimplemented |
| Next step | `explorer_journey_decisions` | 153 of 1,278 | usually omitted |
| Caution | `leads.status` | 1,074 consent-false, but see below | |

**A correction worth recording.** An earlier pass of this work concluded that opens and replies
were both untracked, and nearly went to Kes as a request to reset what Rose and Taiwo expect.
That was wrong, and wrong because of method: the search looked for COLUMNS named like
`%opened%`, while `interaction_outcomes` stores them as VALUES in an `outcome` column. Opens
are live. Replies genuinely are not. The correction to Kes is one line, not a scope change.

**Why the caution line does not read `consent_contact`.** That flag is false for 1,074 of 1,278,
and it gates branded EMAIL. Rendering it as a phone warning would tell two callers to skip 84%
of their queue on a misreading. The card uses `SUPPRESSED_LEAD_STATUSES`, the strictest list in
the repo, and states the recorded status rather than saying "do not call", which the
phone-consent data cannot support: one phone-keyed consent row exists repo-wide.

## Shape

```
journeySummaryTypes.ts      the contract. Carries no `replied` field, deliberately.
journeySummaryComposer.ts   PURE. input -> text. All the honesty rules live here.
journeySummaryData.ts       reads the five sources, documents what each cannot say.
journeySummaryWriter.ts     resolves key AND field from ONE routing decision.
runJourneySummarySync.ts    the daily pass, and the canary.
```

The composer is pure so the rules are testable without a database. The writer takes the key and
the field from a single `resolveGhlAccountForSource` call rather than two lookups, because the
field is per sub-account and a drift between the two would write a real card into the wrong CRM.

## The canary

A GHL write to a missing field returns HTTP 200. A pass reporting "952 written" on the strength
of 952 such responses is worse than a failed pass, because it looks like the feature works. So
the first successful write of every run is read back, and the run aborts if the value is not
there. One extra API call per run buys the right to believe the other 951. It is per run rather
than per write because the failure it guards against is a property of the run.

## Verification

**Backend typecheck:** clean. Proven by planting `const CONTROL_TYPE_ERROR: number = "..."`
first, which tsc reported, then removing it. That same control run caught 10 real errors in
`journeySummaryData.ts` from a wrong default import, which were fixed. An empty tsc output is
not evidence on its own in this repo, which is why the control is planted every time.

**Tests:** 31 across 3 suites, all passing.

**Mutation tested**, because a green suite proves nothing on its own:

| Mutation | Cells killed |
|---|---|
| empty card returns text instead of null | 2 |
| always render the journey heading | 3 |
| caution says "do not call" | 1 |
| stop truncating long subjects | 1 |
| stop collapsing whitespace in a subject | 1 |
| canary never aborts | 1 |
| verify every lead instead of once | 1 |

Each killed a different minimal set and none killed everything, so the tests discriminate rather
than being coupled. One mutation first reported as SURVIVED and had not been applied at all: the
substitution never matched the line. A mutation that never ran and a mutation the tests missed
look identical, so each one is now confirmed by `git diff` before its result is believed.

**Cron registry ratchet:** initially FAILED, correctly, with "Scheduled with no ai_agents row -
every run is tracked against nothing". Fixed by adding the seed row rather than by adjusting the
test. 33 passing after.

## What this does not do

It does not write for a lead with no `ghl_contact_id`: 958 of 1,276 Explorer profiles carry one,
so roughly 320 are out of reach until the linkage work in T209 lands.

It does not deduplicate against the stored value. The card carries its own "As of" date and so
changes daily; a read-before-write would double the API calls to save nothing.

It does not read GHL's own call, text or email history, which needs the v2 Conversations API we
do not have. So the card is what ENTERPRISE did, not everything that happened to the lead, and
it says so.
