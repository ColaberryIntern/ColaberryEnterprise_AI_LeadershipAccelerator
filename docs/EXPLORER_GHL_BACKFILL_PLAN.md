# Explorer leads missing from GoHighLevel: the backfill plan

**Status:** plan approved 2026-11-07 (PR #3745). Phase 1 ran the same day and corrected three of
this document's own figures, including its central premise; Phase 3A was built on 2026-11-08 and
corrected a fourth. **Read the two appendices at the end first: sections 2, 4 and 5 above are
superseded, and the "196 links" figure in the Phase 1 appendix is 192.** No write to the live CRM
has happened, and no write of any kind to production has happened.
**Measured:** 2026-11-07 and 2026-11-08, against production, read-only.
**Session:** CC-20261106-r7t2

---

## 1. The decision being asked for

318 Colaberry Explorer learners exist in our Postgres with no GoHighLevel contact. Rose cannot
call the ones with phone numbers, because her call list is GHL.

This document is the plan for fixing that. It asks for one approval and raises one genuine
governance question that is not mine to settle.

## 2. What is actually true, measured today

881 explorer profiles, 563 in GHL, **318 not**. Every one of the 318 **already has a lead row** —
nothing needs creating on our side, only the CRM contact.

Only a subset are callable at all:

| | people |
|---|---|
| Missing from GHL | **318** |
| …with a phone of 10+ digits | **195** |
| …with an email | 318 |
| …with a name | 318 |

The 123 with no phone are email-only reachable. They are worth having in the CRM, but they are
not "people Rose could call today".

### Why each one is missing, from the sync audit rather than inference

The `activities` table records every sync attempt as `metadata->>'status'`. Grouping the 318 by
their most recent outcome:

| last sync outcome | people | callable | consent recorded |
|---|---|---|---|
| **never attempted** | 233 | 127 | 51 |
| **withheld — `unconfigured`** | 74 | 68 | 1 |
| **withheld — `synthetic_email`** | 9 | 0 | 0 |
| **`success`** (but no contact id stored) | 2 | 0 | 1 |
| | **318** | **195** | **53** |

Reconciles to 318 and to 195, which is why these splits are trustworthy.

## 3. Root cause, proven rather than assumed

**This was not a bug. It was the routing layer refusing to guess.**
`backend/src/services/leads/ghlAccountRouting.ts` routes each lead source to a GHL sub-account and
**declines to sync when that account has no API key on file**, rather than falling back to the
default account — because the default is Agent Cory AI, which feeds an outbound dialer. Skipping
leaves a lead visible in `/admin/leads` and absent from GHL. That is the behaviour we observed.

The timing confirms it exactly:

- `ghl_api_key_school_of_data_analytics` was installed **2026-10-23 at 16:21 CST**.
- The **last** `withheld / unconfigured` row in the audit is **2026-10-23 at 16:13 CST**, eight
  minutes earlier. Withholding stopped the moment the key landed.
- `open_house` leads reaching GHL by month: July 0%, August 0%, September 0%, **October 28%**,
  **November 94%**.

**The forward path has been correct for two weeks.** This is a historical catch-up, not a live
leak. Nothing has ever re-run for the people who were skipped while the key was missing.

The `never attempted` 233 are older still: the sync was not wired into the open-house and
training-site paths at all before August 2026 (recorded in that module's own header, from Kes,
2026-08-25).

### A separate bug that probably explains the "wrong sub-account" reports

Six **frontend** files hardcode a single location id,
`const GHL_LOCATION_ID = 'JFWwp8q7l6T12NWTIOKG'` — the Agent Cory account:
`CRMTab.tsx:6`, `LeadsOutreachTab.tsx:6`, `OverviewTab.tsx:7`, `AdminLeadDetailPage.tsx:49`,
`AdminLeadsPage.tsx:46`, `AdminPipelinePage.tsx:23`. Each builds its own GHL deep link from it.

So **every GHL link clicked from those six admin surfaces points at the Agent Cory location**,
regardless of which sub-account the lead actually lives in. For an `open_house` lead now correctly
created in School of Data Analytics, that link opens a location where the contact does not exist,
and GHL answers with an empty record rather than an error. `ghlContactLink.ts:6-11` describes this
exact failure as the reason the routed builder exists — *"a dead end that looks like missing data
rather than a wrong link."* Only the backend-rendered surfaces (Person 360, Explorer Growth) use
the correct builder.

This is a better explanation of "contacts in the wrong sub-account" than anything in the data, it
will get worse as the backfill adds contacts to the school account, and it is a small fix. It is
tracked separately from this plan but should land **before** Phase 3, or the backfill's own
verification will be read through broken links.

## 4. Who should NOT be in the backfill, and the incident that proves it

**A backfill has been run before, and it went wrong.** From
`backend/src/services/leads/syntheticContacts.ts:5-12`, verbatim:

> On 2026-10-23 the GHL backfill pushed one of them into the live School of Data and AI account
> before anybody noticed, and it had to be deleted from a customer-facing CRM by hand. It was
> caught only because that run was deliberately batched five at a time; a single unbatched run
> would have put three in.

That is the precedent this plan is written against, and it is why batching below is a control
rather than a courtesy. The end-to-end suite creates **real `free_signup` leads in production**
with addresses like `e2e-points-…@colaberry-test.local`, so fixtures are a standing hazard on this
path, not a one-off.

- **The 9 `synthetic_email` rows are those test accounts**, and they are still being generated
  today. **The exclusion is already enforced in code**, not something the backfill must remember:
  `isSyntheticContactEmail` is checked at `ghlService.ts:289`, *before* routing, matching the
  prefixes `e2e-`, `e2e_`, `test-fixture-` and the `CAMPAIGN_TEST_EMAIL_DOMAIN`
  (`@colaberry-test.local`). The guard sits on the sync rather than in a script precisely because
  a script-level filter is what failed in October.
- **The 2 `success`-with-no-contact-id rows are a separate defect.** The sync reported success and
  the contact id was never persisted, so we do not know whether a duplicate contact already
  exists for them. They get investigated individually, not batch-written.

**Backfill candidates: 307.** Of those, **195 are callable**, and 194 of the 195 are `open_house`.

## 5. The one question that is not mine to answer

`leads.consent_contact` is `NOT NULL DEFAULT false`, so a `false` cannot be distinguished from
"never asked". Among the 195 callable people, **essentially all are `false`** (open_house unsynced:
1 true out of 206).

The control matters here, in both directions:

- **333 people with `consent_contact = false` are already in GHL and callable today.** So
  backfilling false-consent people would not create a new category of exposure; it would match
  what is already live.
- That is also a pre-existing consent-hygiene problem across the live population, and worth
  looking at on its own rather than treated as permission.

Consent capture is also **getting worse, not better**: open-house consent-true by month runs 61%
(July), 0% (August), 42% (September), 25% (October), **6% (November)**. That is a live defect in
the intake form, independent of this backfill, and it will keep producing uncallable leads.

**I tested whether one regression caused both problems. It did not** — July was 61% consent with
0% sync, November is 6% consent with 94% sync. They move independently. Two separate issues.

## 6. The plan

**Phase 1 — dry run, no writes.** A script under `backend/src/scripts/` that resolves the 307
candidates, calls the existing lookup path for each, and reports what *would* happen per person:
already in GHL by email, already in GHL by phone, or would be created. Output is a table plus
counts. **Default mode, no flag, cannot write.**

This phase answers the one thing the database cannot: whether these people are already in GHL
under a contact we simply never recorded. Query 6 of the scope probe showed **0 of the 318 share
an email with another lead already in GHL on our side** — but that proves nothing about GHL's own
records, and Phase 1 is what checks it.

**Phase 2 — the consent decision.** Ali's call, informed by Phase 1's real numbers. Options, in
increasing scope: the 53 consent-true only; the 123 email-only (no dialer exposure); or all 307.

**Phase 3 — live run, batched and resumable.** Explicit `--commit` flag. **Batches of 5, not 25**,
because five is the batch size that caught the October fixture leak at one contact instead of
three, and this run has no reason to be braver than that one. Pause between batches, retry with
capped backoff in the driver, and an idempotency record per person so a re-run cannot
double-create. Structured logs per CLAUDE.md's observability rules, one correlation id for the run.

**Phase 4 — verify, then close the two side issues.** Re-measure the 318; confirm the count fell
by exactly the number of contacts created; confirm each created contact resolves through
`ghlContactUrl` into **school_of_data_analytics** and not the dialer account. Then: the 2
`success`-no-id rows, and the consent-capture regression.

## 7. Idempotency: already built, not to be reinvented

`backend/src/services/ghlService.ts` `syncLeadToGhl` (line 265) already:

1. short-circuits with `status: 'existing'` when the lead already has a `ghl_contact_id` (line 366)
2. looks up GHL by **email** before creating (`findContactByEmail`, line 392)
3. then by **phone** (`findContactByPhone`)
4. only calls `createContact` when neither finds anything
5. adds the note **only for newly created contacts**, so a re-run cannot pollute an existing one

The dedup keys are **email first (exact match, with GHL v1's fuzzy search result rejected at
`:129-135`), then phone (last 10 digits, `:158-164`)**. Both guards exist because v1 search is
fuzzy and would otherwise return a false match.

**A new driver script is needed, and that is not a contradiction.** `bulkSyncCampaignLeads`
(line 515) cannot be reused as-is: it requires a `Campaign` with an `interest_group`, so it cannot
target "every lead where `ghl_contact_id IS NULL`". What the driver must not do is call the GHL
API itself — it selects candidates and calls `syncLeadToGhl`, because new GHL-calling code would
be a second, untested path to the same CRM.

**Retry and backoff belong in the driver, not in `ghlService`.**
`docs/growth-os-reset/GHL_CALENDAR_BOUNDARY.md` records DECISION 1 and DECISION 2 that the v1
contact sync is deliberately not to be touched, with "byte-identical to its state before Phase 4"
as an explicit acceptance criterion. Adding resilience inside that service would cross a decision
already taken. The driver wraps it instead.

**`ghl_enabled` gates the whole path** (`syncLeadToGhl:271`). On production it is currently set,
but the driver should assert it rather than assume it, because the code default is `false` and a
disabled flag would make the run silently do nothing.

## 8. Failure modes and safety constraints

| concern | handling |
|---|---|
| Wrong sub-account | Routing resolves per source and fails closed; Phase 4 verifies the resulting URL names `school_of_data_analytics`. |
| Double-create on re-run | Email-then-phone lookup already in `syncLeadToGhl`, plus a per-person idempotency record. |
| Rate limiting | **Confirmed gap.** The only resilience primitive on this boundary is a 15s `AbortSignal.timeout`. There is **no retry, no backoff, and no status-code branching at all** — `ghlService.ts:87` is a flat `if (!response.ok)`, so a 429 is handled identically to a 400. No circuit breaker. The driver owns this (see §7). |
| Request volume | **One lead costs up to ~6 sequential requests**: email search, phone search, create, one `POST /tags` per provenance tag (v1 has no bulk tag endpoint, `:378`), and one note. So 307 leads is on the order of **1,800 requests**. No documented GHL per-request or per-day contact limit exists anywhere in the code, `docs/` or `directives/` — the only rate limit implemented in this repo is for **SMS**, not contacts (`schedulerService.ts:761-790`), and it does not gate contact creation. Pacing is therefore a judgement call, not a documented bound, which is another reason to batch. |
| Partial run | Resumable by design: the driver selects candidates fresh each batch, so a killed run resumes by re-running. |
| Test rows | Excluded by email domain, not by a hand-kept id list. |
| Secrets | Keys stay in `system_settings` and are read by the service. Never logged, never printed, never in a PR or an email. |
| Production DB | Everything in Phases 1 and 4 is `SELECT` only. |

## 9. Verification

Not "looks right":

- Phase 1: a per-person table whose row count equals 307, and whose category counts sum to 307.
- Phase 3: `318 − created = ` the re-measured missing count, exactly.
- Phase 4: for a sample of created contacts, `ghlContactUrl(source, id)` returns a URL whose
  location id is the one declared by the school account's own key, and **not** the default key's.
- A control in every check: a name known to be absent, so a query aimed at the wrong place cannot
  read as a pass.

## 10. Deliberately not in this plan

- **The wider lead-level gap.** 318 is the *explorer-profile* subset. At lead level the gap is far
  larger (for example ~16,000 `ccpp_winback` leads from a single July import are not in GHL). That
  is a separate scoping decision and is not assumed here.
- **The 19 November `free_signup` leads** not in GHL that have no explorer profile. I first read
  these as a possible live leak; they are most likely the synthetic-email guard working correctly,
  since the 28 `withheld / synthetic_email` audit rows are all `free_signup` at
  `@colaberry-test.local` and the most recent is from today. Worth confirming, not worth alarm.
- **Kes's 7 "wrong sub-account" ids.** Only **1** explorer-linked `open_house` contact predates the
  school key (enrollment `7b8e43c9-4683-4523-9614-98f1db712287`, lead 25070, created 2026-10-21),
  and that used lead-creation time as a proxy for sync time. The other 6 are unexplained and need
  his actual ids, which have been requested twice.

---

# Phase 1 results, 2026-11-07

Ran against production, read-only, from inside `accelerator-backend`. Script:
`backend/src/scripts/explorerGhlBackfillDryRun.ts`. Correlation id
`06a5dfcd-4f9c-44c6-82ff-adc88251c62b`. 261 candidates classified, 261 rows, no lookup errors
and nothing withheld.

**Both credentials passed their controls before any candidate was looked up**: a lead already
carrying a `ghl_contact_id` was found by email in each account with its stored id matching, and
an address under `.invalid` was correctly not found in either. Without that pair, a
misconfigured key would have reported "would create" for all 261 people and read as a clean run.

## Correction 1: the candidate set is 261, not 307

The plan derived the exclusions from the sync audit's `reason`, which only knows about the test
fixtures the guard actually refused. **46 more fixtures were never attempted at all**, so no row
says `synthetic_email` for them. Tested by email shape, which is the rule the live sync itself
applies at `ghlService.ts:289`, the real figure is 56.

| | people |
|---|---|
| explorer profiles with no GHL contact | 318 |
| test fixtures, excluded | **56** (plan said 9) |
| `success` with no contact id stored | 1 (plan said 2; the other is a fixture) |
| **candidates** | **261** (plan said 307) |

No callable person is removed by the correction: all 195 callable people are candidates.

## Correction 2: 196 of the 261 are already in GoHighLevel

This is the finding that changes the work. The dry run asked GHL about each candidate, and
three quarters of them are **already there** under a contact we never recorded.

| what a live run would do | people | callable |
|---|---|---|
| **already in GHL, found by exact email** | 189 | |
| **already in GHL, found by phone** | 7 | |
| **already in GHL, total** | **196** | **184** |
| would create a new contact | **65** | **11** |
| | **261** | **195** |

**184 of the 195 callable people are already in Rose's CRM and callable today.** The premise
this plan was written on, that 195 people are unreachable, was wrong. What is missing is the
`ghl_contact_id` link on our side, not the contact in theirs.

By source: 194 of the already-present are `open_house` in `school_of_data_analytics`, 1 is
`popup` there, and 1 is `ccpp_winback` in the default account.

### This codebase did not create those contacts

Every GHL contact-creation path in the repo routes through `syncLeadToGhl` / `syncNewLeadToGhl`
(18 call sites, one service), and for these 261 people that service either never ran or withheld.
So the 194 open-house contacts in the school account arrived by **some path outside this
codebase**. The unlinked open-house leads span 2026-07 through 2026-10 (67, 62, 41, 36), which is
the window when our own sync was withheld for the missing key.

**Confirmed, by asking GoHighLevel itself.** Reading `attributionSource` on a 24-contact
sample from the school account, origin-fields only:

| `sessionSource` / `medium` | contacts |
|---|---|
| `CRM UI` / `manual` | 17 |
| `Other` / `other` | 4 |
| `CRM UI` / `csv_import` | 2 |
| `Third Party` | 1 |

**19 of 24 were entered through the GoHighLevel UI**, by hand or by spreadsheet upload. Not one
carries an API attribution. The contacts also carry tags like `ai explorer` and **`left
voicemail`**, and were added 12 to 14 October.

So nothing was integrating. **Somebody on the team, in practice Rose, typed these people into the
CRM by hand and has been calling them**, for the three months our sync was withholding them. The
`left voicemail` tag is the proof that the calling already happened.

That reframes the value of this work a third time. It is not "make 195 people reachable", because
they were made reachable by hand. It is:

1. **Stop the double entry.** The forward path has been correct since 2026-10-23, so this is
   already fixed; the backfill is the catch-up.
2. **Reconcile the two systems**, so our admin surfaces show the contact Rose is already working
   instead of showing nothing, and so Cora's nightly job can tag people out of her call list.
3. **Rule out duplicates before creating anything**, which is exactly what Phase 1 just did: a
   live run on the plan's original assumptions would have created up to 196 duplicates of
   contacts she is actively calling.

Ruled out as the creator: Cora. Its GHL adapter reads, searches and `PUT`s contact fields, and has
no contact-create path. Ruled out: this codebase, whose 18 creation call sites all route through
one service that either never ran or withheld for these people.

### The school account's real location id, measured

Those contacts report `locationId: ttBtJmxoLwjf18lIvvVD`. The six frontend files hardcode
`JFWwp8q7l6T12NWTIOKG`, the Agent Cory account. That is no longer an inference about the
wrong-sub-account reports: the two ids are different, measured from live data, so every GHL link
built on those six admin surfaces does point at a location where these 195 contacts do not
exist.

### The 7 matched by phone, not email

Their email in our `leads` row differs from the one on the GHL contact. The phone match is
verified on the last 10 digits, so it is a real match, but it is weaker evidence than the 189
exact-email matches and those 7 should be eyeballed before their link is written.

## Correction 3: the consent question is now about 11 people, not 195

Of the 65 that would be newly created, **11 are callable**, all `open_house`, and **none has
`consent_contact = true`**. The other 54 have no usable phone, so no dialer exposure exists for
them whatever is decided.

| would create | people | destination | callable |
|---|---|---|---|
| `ccpp_winback` | 50 | default (Agent Cory, the dialer) | 0 |
| `open_house` | 12 | school_of_data_analytics | 11 |
| `contact` | 2 | default | 0 |
| `trustbeforeintelligence` | 1 | default | 0 |

The 53 going to the default account land in Agent Cory AI, which feeds an outbound dialer. That
is the correct routing per Ali's instruction of 2026-10-23, recorded at
`leadSourceGroups.ts:94` ("use the School account for Colaberry training and Agent Cory for
everything else"), and none of them is callable. Whether 50 alumni-winback contacts belong in the
dialer CRM at all is a scope decision, not a defect.

## What this does to Phase 3

Phase 3 splits, because the two halves now have completely different risk:

**Phase 3A, the link repair: 196 rows, our Postgres only.** Write the discovered
`ghl_contact_id` onto those 196 leads. **No write to the customer-facing CRM at all.** It records
a fact that already exists, it is reversible from the ledger, and it is what makes those people
visible as linked on our admin surfaces. This is the high-value, low-risk half, and it is most of
the benefit.

**Phase 3B, the creates: 65 contacts in the live CRM.** This is the half that carries the October
incident's risk, and it now needs a scope decision rather than a consent decision, because the
consent population is 11 people with no recorded consent. Batches of 5 still apply.

The hardcoded frontend `GHL_LOCATION_ID` fix (section 3) matters more after 3A, not less: 195 of
the 196 repaired links point into `school_of_data_analytics`, and the six admin surfaces that
build their own deep links would send every one of them to the Agent Cory location and show an
empty record.

## Still open from the plan

- The 1 remaining `success`-with-no-contact-id lead.
- The consent-capture regression at intake, 61% in July to 6% in November. Unchanged by this.
- Kes's 7 "wrong sub-account" enrollment ids, still not supplied.

---

# Phase 3A built, 2026-11-08

Approved by merging PR #3752. `backend/src/scripts/explorerGhlLinkRepair.ts` plus
`backend/src/scripts/lib/explorerGhlLinkPlan.ts`. **Nothing has been written to production yet:**
the script's default mode is a plan that writes nothing, and `--apply` refuses to run without
being told the row count up front.

## It is 192 links, not the 196 this document says

The 196 matches Phase 1 found resolve to only **192 distinct GoHighLevel contact ids**. Four
contacts are each matched by **two different lead rows**, and the pattern is identical in all
four: one row matched by phone, the other by email, adjacent lead ids, same source
(`open_house`), same account, and all eight rows callable with 11 phone digits.

| contact | lead matched by phone | lead matched by email |
|---|---|---|
| `bJF9fVVMiFv1WqwTPp5O` | 24128 | 24132 |
| `HQ9P7mlmFpcyQ4qCbQdI` | 24403 | 25044 |
| `xt2SjoRLDdbCcCzrkYEa` | 24993 | 24995 |
| `Nv3xGMbeLS4QYsJY7WMA` | 24997 | 24998 |

That is one person who registered twice under two email addresses with one phone number. Our
`leads` table carries a unique index on `LOWER(email)`, so two registrations become two rows,
while GoHighLevel holds them as one contact. Each of the four also has two
`explorer_journey_profiles` rows, so the Explorer cohort counts them twice as well.

**Why it matters rather than being a rounding difference.** Writing one `ghl_contact_id` onto two
lead rows fans a customer-facing record across two of ours, and the next campaign sync then
updates that single contact from two sources.

Measured on production the same day: **8,071 linked lead rows hold 8,071 distinct contact ids**.
One contact per lead row has held across every link in the system's history. It is enforced by
nothing - `leads` carries 11 indexes, 3 of them unique, and **not one mentions
`ghl_contact_id`** - so Postgres would have accepted the fan-out silently and Phase 3A would have
been the first thing ever to break the property.

That argues for a unique partial index on `ghl_contact_id WHERE ghl_contact_id IS NOT NULL`, and
the data says it would apply cleanly today. It is not in this change: a constraint that can start
rejecting writes from the live sync is a schema decision, so it is raised rather than taken.

**The rule, in `lib/explorerGhlLinkPlan.ts`:** one lead matched it, link it; several and exactly
one of them by email, the email match wins and the rest are withheld for a human merge; several
and the tie does not break that way, withhold the whole group; another lead row already carries
the id, withhold. Preferring the email match is not convenience, it is the address GoHighLevel
itself holds for that contact, which beats a phone number two people can share, and it is the
order Phase 1 searched in.

Applying that rule to the Phase 1 ledger, which is how these figures were checked:

| | |
|---|---|
| matched in GoHighLevel | 196 |
| **links written** | **192** |
| distinct contacts among them | 192 (equal to the links, so no fan-out) |
| into `school_of_data_analytics` | 191 |
| into `default` (Agent Cory) | 1 |
| callable among the links | 180 |
| **withheld** | **4** - lead ids 24128, 24403, 24993, 24997 |

**No person is left unlinked.** Each withheld row is the duplicate side of a pair whose other row
IS linked, so all four of those people end up reachable through the lead row that holds the link.
What is deferred is a decision about four duplicate lead rows, not about four learners.

## The one behavioral consequence, stated plainly

Setting `ghl_contact_id` changes which branch `syncLeadToGhl` takes for these leads
(`services/ghlService.ts:348`). Before the repair, a campaign send against one of them tries to
**create** a contact, duplicating the one Rose is working. After the repair it takes the
already-linked branch, which applies provenance tags and, when a campaign supplies an interest
group, one `updateContact` on a custom field.

Both are additive. So the repair **removes a duplicate-creation path** and **adds a labeling
path**. That is a net reduction in CRM risk, but it is a change in live behavior and it should
not be discovered later.

## How it is run, and how it is undone

```
# plan only, writes nothing, prints the withheld collisions by lead id
docker exec accelerator-backend node dist/scripts/explorerGhlLinkRepair.js \
  --json /tmp/phase3a-plan.json

# the write: refuses outright if the plan has moved off the number given
docker exec accelerator-backend node dist/scripts/explorerGhlLinkRepair.js \
  --apply --expect 192 --json /tmp/phase3a-applied.json

# full reversal from the ledger, only where the value is still the one we wrote
docker exec accelerator-backend node dist/scripts/explorerGhlLinkRepair.js \
  --reverse /tmp/phase3a-applied.json
```

Idempotent by construction: every forward `UPDATE` carries `AND ghl_contact_id IS NULL`, so a
second run writes nothing and reports the rows as already linked instead of failing. A concurrent
writer therefore wins rather than being overwritten, which is correct, because the live sync
holds evidence this script does not. Each batch of 5 is one transaction and the ledger is
flushed to disk after it, so a crash names every row written before it.

Every repaired lead also gets an `activities` row with
`metadata->>'action' = 'ghl_link_repair'`, in the same transaction as the link, so Phase 4 can
verify from inside the product rather than from this document.

## Phase 3B and the frontend link bug are unchanged

3B (the 65 creates) still needs a scope decision. The six frontend files hardcoding
`GHL_LOCATION_ID` still point at the Agent Cory location, and after 3A that is 191 of the 192
repaired leads whose admin deep links would open an empty record in the wrong sub-account.

That fix is **not** a find-and-replace of one literal for another: the right location depends on
which account the contact lives in, which depends on the lead's source, so a single hardcoded id
is wrong for a mixed list whichever id is chosen. It needs the location to come from the backend
on the lead payload. That is a contract change across the lead API and six components, so it is
its own phase rather than a rider on this one.
