# R22 — `utm_medium` has a home on the lead

Session: CC-20261118 · Branch: `workstream/r22-utm-medium-has-a-home` · Base: `origin/main` @ `3300df5b3`

Follows R18 (`enrollments.lead_id`), R19 (channel-truth panel), R20 (ad coverage banner) and R21
(lead-side backlink). Those built the chain from a visit to a paying member. This one fixes the
field that chain cannot read.

## What was actually wrong

Not what the headline number suggested. The "5.5% UTM coverage" figure that pointed here is a
**denominator artifact**, and saying so is the first finding:

| Population | Leads | With `utm_source` |
|---|---|---|
| All time | 25,596 | 1,465 (5.7%) |
| Last 30 days | 800 | 686 (**85.8%**) |

The all-time rate is dragged down by 20,837 `ccpp_winback` and 2,112 `apollo` rows — bulk-imported
cold lists that never came from a click and correctly carry no UTM. Click traffic captures at 86%.
**There was no general capture failure to fix.**

What there was, measured on production 2026-11-18:

1. **`utm_medium` was never written to a lead by any first-party path.** 25,036 of 25,596 leads
   carry NULL. The 560 that have one arrived through `externalLeadIngestService` (the Meta/partner
   path) or the session backfill.
2. **The signup form packed the medium into the source** as `fb|paid` — 135 leads, 3 distinct
   values, 134 of them since 2026-11-03.
3. **The packed shape splits one channel into two in every group-by.** 385 Facebook leads report
   as `fb` (315) + `fb|paid` (70); 196 Instagram as 132 + 64. The packed value also misses
   `PLACEMENT_FOR_SOURCE`, so its spend resolves to null and its cost-per-signup renders blank —
   which reads as missing data rather than as a bug.

### Why the medium was being packed

Because it had nowhere else to go. The column exists — C10.4 added it, stating the intent plainly
in `db/ensureLeadAttributionColumns.ts`:

> this column is so that NEW rows can carry a medium as a value rather than as half of a string

The column landed. **The writers were never updated.** Every one of them dropped the field:

| Where | What it did |
|---|---|
| `utils/normalizeFields.ts` | `utm_medium` absent from `KNOWN_LEAD_FIELDS`, `NormalizedLead`, defaults and `ALIASES` |
| `services/leadService.ts` | absent from `leadSchema`, and from the explicit `Lead.create` field list |
| `services/leadIngestionService.ts` | not passed to `createLead` |
| `services/freeSignupService.ts` | C94 wrote the two columns it added and skipped this one |
| `services/enrollmentService.ts` | not on the `createExplorerEnrollment` input |
| `controllers/enrollmentController.ts` | not read off the body |
| `schemas/enrollmentSchema.ts` | `portalFreeSignupSchema` is `.strict()`, so the key was **refused** |

Sequelize drops a key that is not a model attribute without a throw or a warning, so each of these
was invisible: a 200 to the caller and a NULL column.

## The change

Give the field a home at every writer, and stop the packing at both sources.

- **`portalFreeSignupSchema`** declares `utm_medium`. Load-bearing: the route is `.strict()`, so
  shipping the frontend half alone would 400 every ad signup.
- **`leadSchema` + the `Lead.create` field list** — the chokepoint. `LeadInput` is
  `z.infer<typeof leadSchema>` and `createLead` writes an explicit list, so both halves were
  required before any caller's value could land.
- **`normalizeFields`** keeps the medium as a column instead of routing it into the metadata bag.
- **`leadIngestionService`, `freeSignupService`, `enrollmentService`, `enrollmentController`,
  `sponsorController`** each pass it through.
- **`frontend/src/services/utmService.ts`** — both `getUTMPayloadFields()` and
  `getSignupAcquisitionFields()` emit `utm_medium` as its own key. A medium with no source now
  reports the medium and claims no source, instead of inventing `direct|paid`.

`adSpend/utmSource.ts` keeps splitting the packed shape **on read** and must: it is what makes the
135 stored rows legible. It is simply no longer compensating for what the frontend emits.

`StrategyCall` has no `utm_medium` column, so `/api/calendar/book` is unchanged — adding one is
DDL and out of this phase's scope.

## Verification

| Check | Result |
|---|---|
| `freeSignupAcquisition` + `normalizeFields` + new chokepoint suite | 65 passed, 3 suites |
| `utmService.signupAcquisition` (frontend) | 15 passed |
| Backend typecheck | see PR checks |
| Frontend typecheck / build | see PR checks |

The new suite's last test names no UTM field. It derives them from `leadSchema`, keeps the ones the
model can store, and fails for any that `createLead` does not write — which is exactly the state
`utm_medium` was in. A fourth UTM field added to the schema alone would be caught without anybody
remembering this file exists.

## Deliberately NOT done

**The 135 stored rows are not repaired here.** Splitting them is provably safe — 129 of the 135
already carry the correct `utm_medium` alongside the packed source, so the pipe was not preserving
anything the row did not already hold, and the remaining 6 would need the medium moved before the
source is trimmed. But `adSpend/utmSource.ts` records a deliberate decision that "the rows already
stored cannot be rewritten" and settles the shape on read instead. Reversing that is Ali's call,
not a silent side effect of this PR.

**The 19 of 26 paying members with no campaign-level attribution are not recoverable.** Measured
with the canonical `PAYING_MEMBERS_CTE`: 26 paying members, all 26 now linked to a lead, 7 with a
`utm_source`, 6 with a `utm_campaign`, 0 with a `utm_medium`. The 19 break down as 9 `open_house`,
5 `ccpp_alumni` and 5 `ccpp_winback` — bulk lists and untagged Open House registrations. There was
no click to tag. No code change recovers it; only tagging future Open House and alumni links will.

## Correction to the record

An earlier measurement in this workstream used an unqualified `email` inside a subquery over
`subscriptions`, which has no `email` column — so it silently resolved to the outer `enrollments`
alias and made the filter trivially true, reporting 1,310 "paying members" instead of 26. The
figures above use `services/marketing/payingMembersSql.ts` verbatim.
