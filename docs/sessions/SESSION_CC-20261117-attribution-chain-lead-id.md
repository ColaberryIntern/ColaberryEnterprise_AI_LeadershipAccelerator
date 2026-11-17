# CC-20261117: close the attribution chain with `enrollments.lead_id`

Revenue Room ladder, next after R17. The Basecamp list (10470892344, "11 - Revenue Room: live
revenue intelligence for Ram") runs R1-R17 with R1-R4 and R14 complete, so this is **R18**; a
ticket does not exist yet and is owed. Follows PR #4130 (the collectible-revenue rule).

Asked by Ali on 2026-11-17. Phase A discovery found that ad spend has produced no paying members
at all, and offered three builds; Ali chose **B, fix the attribution chain first**: "Add `lead_id`
to enrollments and stamp UTM through signup so future members carry their campaign."

## What Phase A measured (production, read-only, 2026-11-17)

All 26 paying members are attributable at CHANNEL level and none came from an ad:

| Channel | Members | MRR |
|---|---|---|
| Open house | 16 | $2,984 |
| CCPP winback | 5 | $945 |
| CCPP alumni | 5 | $895 |
| Paid ads | 0 | $0 |

- `marketing_spend_facts` holds **$3,894.80** of Meta spend (campaign `52708443249234`, 19 Oct to
  17 Nov, 4,430 clicks). 607 distinct lead emails carry that campaign.
- Of those 607, **5 reached checkout and none completed it** - all five are `subscriptions.status
  = 'pending'` with NULL `started_at`: four annual at $1,788 and one monthly at $199. $7,351 of
  would-be ARR parked in abandoned checkouts, invisible on every surface.
- 137 pending subscription rows exist overall; 82 of those emails later paid, so pending -> paid
  is a normal path and the 55 that never paid are a measurable loss, not noise.
- Repo-wide UTM coverage is 5.5%: 24,161 of 25,567 leads carry no UTM at all.
- A delimiter bug writes `utm_source` values like `fb|paid` and `social|marketing`.

## What changed

- **`enrollments.lead_id`**, a nullable bare INTEGER with a partial index, added additively by the
  new `backend/src/db/ensureEnrollmentLeadIdSchema.ts` and wired into boot in `server.ts`. This is
  the one missing edge in `visitor_sessions -> visitors.lead_id -> leads -> HERE -> subscriptions`.
- **No FK, on purpose.** Cross-domain reference (revenue -> marketing), matching
  `PageEvent.ts`'s own `lead_id` and the convention `ensureMarketingTrackingSchema.ts` states.
- **No UTM snapshot columns.** The first draft denormalized the five UTM tags onto `enrollments`
  so revenue attribution would be stable at purchase. Reading `utmBackfill.ts` killed that:
  `utmBackfillUpdates` never overwrites a tag already present on a lead, so the lead's tags are
  write-once and joining through `lead_id` yields the same values forever. One edge, not six
  columns.
- **`enrollmentLeadLink.ts`** (pure) holds the decision: the OLDEST matching lead wins, ties break
  on the lower id. This deliberately does NOT copy `pickAttributionSession`'s newest-wins rule -
  that chooses among repeated visits by one known person; this chooses among duplicate identities,
  where the oldest row is the acquisition event. Newest-wins here would re-attribute a paying
  member to whichever list imported their address most recently.
- **`enrollmentLeadResolver.ts`** does the read and the `beforeCreate` hook, wired on the
  `Enrollment` model as `hooks: { beforeCreate: enrollmentLeadLinkHook }`, the same shape
  `Project.ts` already uses for tenant attribution. One hook rather than seven call-site edits:
  `enrollmentService` has four creation paths, plus `freeAccountRegistration` (where the live Meta
  campaign lands), `openHouseCreditService` and `sponsorController`. Editing seven links the seven
  that exist and misses the eighth.
- **`scripts/backfillEnrollmentLeadId.ts`**, dry-run by default, for the rows that predate the
  hook. Idempotent by construction: only NULL rows are considered and the oldest-lead rule cannot
  move.

## Why email is a sound join here

Normally it is weak. On this data it is not: of 1,436 distinct enrollment emails, 1,336 match
exactly one `leads` row, 100 match none, and **zero match more than one**. `pickLeadForEnrollment`
still handles multiplicity, because `leads` has no unique index on email and a duplicate is a
future data-entry event rather than an impossibility.

## Verification

- DDL proven in `accelerator_dev1` inside `BEGIN ... ROLLBACK`: column and index both created,
  and `information_schema` showed 0 columns after the rollback.
- A control type error was planted in `enrollmentLeadLink.ts` first and tsc caught it at the exact
  line, so the clean run means something. `tsc --noEmit` then reports only four pre-existing
  missing-module errors (`maxmind`, `@anthropic-ai/sdk`) that come from this worktree's junctioned
  `node_modules`, in files this change does not touch.
- Full backend CI suite (`npx jest -c jest.ci.config.ts --ci`): **47,074 passed**, 3 failed in 4
  suites, all four pre-existing on `origin/main` and unrelated (`interviewService` missing a local
  dep, `mountLearnerPortalRoutes`, and the two Reese inventory render-drift suites).
- 26 new tests across the two new suites, all passing.
- The 35 suites that touch enrollment creation and boot schema: 585 tests, all passing. This was
  the real risk of a model-level hook and it is the assertion that matters most.

## Not verified

- The hook has not run against a live database. It is proven against both callers it is written
  for (a Sequelize instance with `set`, and a plain object) and against a failing lookup, but no
  enrollment has been created in production with this code deployed.
- The backfill has not been run anywhere. Its dry run on production is the first thing to do after
  deploy, and it needs Ali's word because it writes.

## Owed

- A Basecamp ticket. This is R18 on list 10470892344 and no ticket exists.
- The channel-truth panel (Phase A option A) is still unbuilt: the numbers above exist and Ram
  cannot read them in the product.
- The $1,194 of failed charges and the 5 abandoned ad checkouts belong to the billing tab.
