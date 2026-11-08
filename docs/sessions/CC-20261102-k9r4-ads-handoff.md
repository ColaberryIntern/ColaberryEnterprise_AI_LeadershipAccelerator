# Handoff — the ADS ladder: ad attribution and ad spend

Six tickets in Ali Personal, bucket `7463955`. Four are closed, two are blocked on a permission
that is not ours to grant. This page is the forward-looking state; the evidence for everything
closed is in the four session logs listed at the bottom.

| Ticket | Subject | State |
|---|---|---|
| [ADS-1](https://app.basecamp.com/3945211/buckets/7463955/todos/10467338755) | Ad spend ledger + profitability report | **Closed.** Code on `main`. **Deploy not verified — see below.** |
| [ADS-2](https://app.basecamp.com/3945211/buckets/7463955/todos/10467338730) | Landing-page signup CTAs same-origin | **Closed.** Live, verified in production. |
| [ADS-3](https://app.basecamp.com/3945211/buckets/7463955/todos/10467338843) | UTM-to-lead attribution hardening | **Closed.** |
| ADS-4 (`10467338894`) | Meta token / ad-account read access | **Blocked on Sohail.** |
| [ADS-5](https://app.basecamp.com/3945211/buckets/7463955/todos/10467338811) | Are the live ads tagged? | **Closed.** Answer: yes, since 2026-10-21. |
| ADS-6 (`10467338921`) | Daily spend sync | **Blocked — depends on ADS-4.** |

## Check this before you trust the profitability report

ADS-1's code is on `origin/main` — `backend/src/services/marketing/adSpend/*`,
`backend/src/routes/admin/adSpendRoutes.ts`, `backend/src/services/scheduling/adSpendCrons.ts`,
`frontend/src/pages/admin/marketing/adSpend/*` and `performance/AdProfitabilityCard.tsx`. That is
a merge, not a deploy.

**Nobody in this session verified that production is running it, or that the two new tables exist
there.** The change adds `marketing_spend_facts` and `marketing_spend_syncs` plus a cron. Before
reporting any figure off that page, confirm in `accelerator_prod` that both tables exist and that
the running image postdates the merge — and use the running **image's** build time, not
`git HEAD` on the box, which lies about what is actually serving.

The report will render with zeroes regardless, because **the ledger is empty and stays empty until
ADS-4 and ADS-6 land.** An empty report is the expected state right now, not a bug.

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

One click, in Business Settings, by someone with admin on the Meta business account — Sohail:

> Business Settings → Users → System Users → `colaberry-ads-read` → Add Assets → Ad Accounts →
> `661181097279671` → **View performance** → Save

Two emails have gone out. No reply as of 2026-11-08. A third was deliberately not sent; this needs
a different channel or Ali, not more email. ADS-4 is also not assigned, because Sohail is not a
member of the Commercialization project — adding him is an open, unanswered question.

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
- Whether to add **Sohail to the Commercialization project** so ADS-4 can be assigned to him.
