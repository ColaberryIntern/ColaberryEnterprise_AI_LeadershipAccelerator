# Explorer leads missing from GoHighLevel: the backfill plan

**Status:** awaiting Ali's approval. **No write to the live CRM happens until that approval lands.**
**Measured:** 2026-11-07, against production, read-only.
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
