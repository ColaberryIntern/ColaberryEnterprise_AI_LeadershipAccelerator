# Handoff — the ADS ladder: ad attribution and ad spend

Six tickets in Ali Personal, bucket `7463955`. Four are closed. ADS-4 is one production credential
write from done, and ADS-6 is one toggle behind it. This page is the forward-looking state; the
evidence for everything closed is in the four session logs listed at the bottom.

| Ticket | Subject | State |
|---|---|---|
| [ADS-1](https://app.basecamp.com/3945211/buckets/7463955/todos/10467338755) | Ad spend ledger + profitability report | **Closed.** Code on `main`, and the ledger is deployed — both tables exist in production. See below. |
| [ADS-2](https://app.basecamp.com/3945211/buckets/7463955/todos/10467338730) | Landing-page signup CTAs same-origin | **Closed.** Live, verified in production. |
| [ADS-3](https://app.basecamp.com/3945211/buckets/7463955/todos/10467338843) | UTM-to-lead attribution hardening | **Closed**, and its closing condition re-verified on live rows 2026-11-09. See below. |
| ADS-4 (`10467338894`) | Meta token / ad-account read access | **Grant landed 2026-11-10.** Now waits on a production credential write. See below. |
| [ADS-5](https://app.basecamp.com/3945211/buckets/7463955/todos/10467338811) | Are the live ads tagged? | **Closed.** Answer: yes, since 2026-10-21. |
| ADS-6 (`10467338921`) | Daily spend sync | **Waits on ADS-4.** One toggle once the credentials prove out. |

## ADS-3 is closed, and its closing condition holds — plus how this page got it wrong twice

**Read this before trusting any status on this page.** ADS-3's row said "Closed", then was
"corrected" to "Open" on 2026-11-09, then corrected back the same day after reading Basecamp. The
ticket is **closed**: `completed = true`, 13 comments, due 2026-11-09, assigned to Ali. The middle
version was wrong because the status was taken from a measurement note of 2026-11-06 instead of
from Basecamp, which is the authority. **Read the ticket. A note about a ticket is not the ticket.**

The closing condition was then re-verified on production rows rather than assumed from the closure.
The ticket's "done when" is one real click on a UTM-tagged URL producing a `leads` row whose
`utm_campaign` holds the campaign id, proven by querying that row. Measured in `accelerator_prod`
2026-11-09, ad clicks identified by `fbclid` (which Meta appends itself, so the population is found
independently of our own tagging):

- **Lead 25656**, created 2026-11-09 12:14Z, entering on `/lp/colaberry-training/ai-learning-platform`
  from a click carrying `fbclid`: lead `utm_campaign = 52708443249234`, matching its session's
  campaign exactly, with `source=fb medium=paid content=52708445138434 term=52708443249434`. Four
  more rows in the same shape from the same day.
- Across the whole ad-click population in 30 days: **604** joined rows, **602** carry a campaign on
  the lead, and **602 of 602 agree** with the session's campaign — **448** distinct leads.

Two things that measurement turned up, which are worth more than the status:

- **Both `utm_source` shapes are still being written to `leads`, today.** In the last 30 days:
  `fb` 308, `ig` 123, **`fb|paid` 29, `ig|paid` 27**, plus `open_house` 17 and a few others. ADS-3's
  "also fix" item was this split, and PR #3622 fixed it **on read** in `adSpend/utmSource.ts` — not
  in the stored column, and not at the writers, which still emit both forms (two of the leads above,
  created 2026-11-09, carry `ig|paid` and `fb|paid`). So the profitability report is correct, and
  **any other consumer that reads `leads.utm_source` without going through `utmSource.ts` will still
  split one campaign into two rows.** That is a live trap, not a historical one.
- **The backfill now has almost nothing left to do.** The figures that justified it have collapsed:
  leads carrying no `utm_content` while a session of the same visitor does went from **388 to 1**,
  and visitors with a tagged click behind an untagged lead from **17 to 1**. The signup payload
  carries the tags itself now. So ADS-3's stated acceptance test passes whether or not the backfill
  runs — if anyone needs to demonstrate the backfill specifically, these two counts are the measure,
  and they are currently ~0. Do not quote 388/17; they were true on 2026-11-03 and are not now.

## Check this before you trust the profitability report

ADS-1's code is on `origin/main` — `backend/src/services/marketing/adSpend/*`,
`backend/src/routes/admin/adSpendRoutes.ts`, `backend/src/services/scheduling/adSpendCrons.ts`,
`frontend/src/pages/admin/marketing/adSpend/*` and `performance/AdProfitabilityCard.tsx`.

**Production was checked on 2026-11-06 and the ledger really is deployed, not merely merged:**
`marketing_spend_facts` and `marketing_spend_syncs` both exist in `accelerator_prod`, the
`MetaAdSpendSync` agent row is present but disabled and has never run, and the ledger holds **0
rows** because no sync has ever been attempted. So the tables are not the thing to go and check.
If you ever do need to confirm what is actually serving, use the running **image's** build time,
not `git HEAD` on the box, which lies about it.

The report will render with zeroes regardless, because **the ledger is empty and stays empty until
ADS-4's credentials are set and ADS-6 is enabled.** An empty report is the expected state right
now, not a bug.

## The finding that reframes the whole ladder

ADS-2 was filed as "the gate on every other ad-reporting ticket." That premise was wrong, and the
correction is the most valuable thing this workstream produced.

Attribution was **already working** before ADS-2 changed anything: 25 of 25 recent tagged sessions
that joined to a lead agreed on campaign `52708443249234`, all entered on
`/lp/colaberry-training/ai-learning-platform`, all `source = free_signup` — and they were attributed
while the CTA was still an absolute `www.refactored.ai` URL. So ADS-2 removed a *latent* dependency
on which hostname an ad points at. Worth doing; not a repair. ADS-5 was filed on a premise the data
likewise contradicts, and both ticket bodies were corrected by read-modify-write before closing so
a false statement was not frozen into a closed record.

If someone tells you ad attribution is broken, the burden is on the claim. Ask which lead, and
check `visitor_sessions` by `fbclid` — Meta appends that itself, so it finds ad traffic
independently of our own tagging.

## What ADS-4 actually needs, precisely

**The Meta-side grant is done.** Sohail assigned ad account `661181097279671` to the system user
`colaberry-ads-read` on 2026-11-10 — with Full access rather than the View performance that was
asked for, which is harmless because the token itself is scoped `ads_read` and can only read. The
grant matches the failure recorded on 2026-11-06 exactly: before it, `GET /act_661181097279671`
and the insights call both returned `403 (#200) Ad account owner has NOT grant ads_management or
ads_read permission`, and `GET /me/adaccounts` returned zero accounts. That is an unassigned
asset, not a bad token and not a wrong scope.

**What remains is a production credential write**, which belongs to Ali or whoever holds prod env
access:

> Set `META_ADS_ACCESS_TOKEN` and `META_AD_ACCOUNT_ID` on the production backend and restart it,
> then press **Sync now** on the admin Ad spend page.

Those two names are exact. The account id must be numeric; the code strips an `act_` prefix either
way. **The ad account must bill in USD** — a non-USD account is refused outright with a
`ContractViolation` rather than converted, and the first sync says so plainly, so there is nothing
to pre-check in Ads Manager. **Sync now** works whether or not the scheduled agent is enabled,
which makes it the cheap credential test; do not wait for the cron, which is `40 11 * * *`, i.e.
**5:40 AM Central** in November and not 6. Setting the two values while the grant was still missing
was deliberately avoided, because it would have made the admin panel report "configured" while
every call still 403'd — a worse state than unconfigured, since it reads as working.

Two identifiers for the same system user will look like a mismatch and are not one: Business
Settings shows `colaberry-ads-read` as `61596490402413`, while `debug_token` reported
`122093983407549680`. Same principal, two ID schemes — do not go chasing it.

**Sohail was deliberately not added to the Commercialization project** (decided 2026-11-10), so he
cannot see this ticket and it stays assigned to Ali. The remaining work is a prod credential write
and an agent toggle, neither of which he could do anyway.

**There is a Meta access token in this workstream's history.** It arrived by email and screenshot,
was never written to production, and every script redacts it in log output. **Rotate it once the
sync is proven.** Until then treat it as live.

## Traps that will bite the next person

- **Basecamp answers `204` with no body** on a completion POST and on a
  `status/trashed.json` PUT. Any helper that JSON-parses the response throws on a write that
  *succeeded*. Confirm by re-reading the record, never by the helper's exit code.
- **`attachArtifactToTicket.js` dedupes by filename, and scans existing comments as well as the
  vault.** A corrected re-upload under the same name silently does nothing and reports "already on
  the ticket." The documented fix is to trash the stale vault upload **and the comment that names
  the file**, then re-upload under the stable name. C0.3 forbids the tempting `_R2`/dated
  workaround — where a superseded copy must coexist, the *superseded* one takes the suffix. This
  rule was broken once here and undone; don't make it twice.
- **`previewArtifactPage` hardcodes A4 while `renderArtifactPdf` emits Letter at 14mm.** The
  preview is ~104px too wide and will call `fits` on a one-pager that renders as two. Cut against
  `renderArtifactPdf`, which counts `/Type /Page` in the emitted bytes and is the real gate. Left
  unfixed on purpose: the preview is shared by dozens of ticket artifacts.
- **Sequelize does not notice a mutated JSONB object.** Reassign the field and mark it with
  `changed('content', true)`, then re-read. This bit both ADS-2 and ADS-3.
- **The public `/lp/` route fails closed.** A published row whose `content` JSONB does not parse
  serves a 404, not a degraded page. Run any rewritten content through `parseLandingPageContent`
  before the write.
- **Headless Chromium regenerates one fixed `cb_visitor_fp`**, so every automated run collapses
  into a single `visitors` row. Per-visitor counts are not per-person counts wherever bots are in
  the population.
- **`scripts/` never enters the backend image** — `backend/Dockerfile` copies `backend/`,
  `frontend/src/pages/` and one CSV. Artifact and generator work never needs a deploy.

## One cheap hardening, not done

`ads1Data.js`, `ads3Data.js` and `ads5Data.js` build `TICKET_URL` from a `TICKET_ID` constant with
the account baked into the template. `ads2Data.js` hardcodes the whole URL as a string — which is
exactly how it came to print the wrong Basecamp account on a PDF that had already been filed.
Making `ads2Data.js` match its siblings closes that drift for good, and the next data module should
copy a sibling rather than ADS-2.

## Where the detail lives

- `docs/sessions/SESSION_CC-20261102-k9r4.md` — ADS-1, including the four hunks dropped from the
  recovered patch and the CI gates that were run
- `docs/sessions/SESSION_CC-20261102-k9r4-ads2.md` — ADS-2, three entries
- `docs/sessions/SESSION_CC-20261102-k9r4-ads3.md` — ADS-3
- `docs/sessions/SESSION_CC-20261102-k9r4-ads5.md` — ADS-5, including why it was measurable without
  Ads Manager access

Artifacts: vault folder "Marketing Ad Attribution - Artifacts" (`10469067334`). Pass `PARENT_VAULT`
and `LIST` explicitly to the attach script or it defaults to the Agent Factory vault and throws.

Merged PRs for ADS-2: #3731 (`18d7f531`), #3754 (`91832aac`), #3756 (`2a8824fc`).

## Also open, not blocking

- A follow-up ticket for **ad-level spend**. The sync pulls `level=campaign`, which makes
  cost-per-creative impossible to compute. Not filed.
- **An audit of everything that reads `leads.utm_source` directly.** The piped `fb|paid` form is
  still written (56 of ~490 tagged leads in the last 30 days) and is only canonicalized on read
  inside `adSpend/utmSource.ts`. Every other consumer — report, export, segment, dashboard — splits
  one campaign in two. Either route them through the same helper or canonicalize at the writers.
  Not filed, and the only item here with a measured blast radius.
