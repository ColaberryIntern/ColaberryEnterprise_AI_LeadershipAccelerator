# Session CC-20261102-k9r4 (continued) — ADS-5 ad tagging verified in production

**Date:** 2026-11-03
**Branch:** `workstream/ads5-tagging-verified` (cut from `origin/main`)
**Ticket:** ADS-5 https://app.basecamp.com/3945211/buckets/7463955/todos/10467338811
**Scope:** Answer ADS-5 — are the live ads tagged with `utm_campaign`? — without Ads Manager
access, by reading what the ads actually deliver. Separate from ADS-1, which is PR #3593 and
still awaiting review; this branch is cut from `main` rather than stacked on it.

---

- [x] ADS-5 verified: the live ads are already tagged, measured in production
  - Date: 2026-11-03
  - Session: CC-20261102-k9r4
  - What changed: Added `scripts/artifacts/tickets/ads5Data.js`, `ads5Render.js` and
    `buildAds5Artifacts.js`, following the committed per-ticket generator pattern. Both PDFs read
    the one data module, so a figure on the visual cannot drift from the same figure in the
    document. No runtime code changed — this ticket turned out to need a measurement, not a fix.
  - Verification: three read-only scripts run inside `accelerator-backend` against
    `accelerator_prod`, rolling 30-day window. **1,464 of 1,480 ad clicks (98.9%) carry all five
    UTM parameters**; **410 of the 411 signups with a provable ad click carry the campaign id**;
    **0 signups attributed to a campaign with no ad click**. `buildAds5Artifacts.js` renders the
    visual at 1 page (the renderer counts `/Type /Page` and throws over the limit) and the
    document at 5. The visual was screenshotted and looked at — the first render printed a
    redundant "+N" beside the distinct-value count, which read as a second and larger total, so
    it was removed before posting. Both PDFs posted with `preview OK` on each, which re-reads the
    stored comment to confirm Basecamp expanded the attachment.
  - Notes: ADS-5 was filed on a premise the data contradicts, so its title and body were
    corrected by read-modify-write before closing, exactly as ADS-2's were earlier in this
    session — the todo PUT is a full replace, so description, due date and assignee were re-sent
    from the live record and verified preserved, and the original body was kept whole beneath the
    correction rather than rewritten away. Closing threw `Unexpected end of JSON input` as
    expected (204, no body) and was confirmed by re-reading `completed`.

## Why this was measurable without Ads Manager

The ticket said the tagging "can only be read in Ads Manager". That is true of the ad's
*configuration* and false of its *effect*: every click lands on a page this platform tracks, so
the URL the ad actually sends people to is already in `visitor_sessions`.

Ad clicks were identified by `fbclid`, which Meta appends itself. That choice is load-bearing:
it finds ad traffic **independently of our own tagging**, so it still finds the ads in the exact
case the ticket was written for — the one where every UTM tag is missing. Keying off
`utm_source` would have hidden that case by construction, and would have reported "all tagged"
from a population defined as the tagged ones.

## The tags arriving, and why they are not a hardcoded literal

| Parameter | Distinct | Values |
|---|---|---|
| `utm_campaign` | 1 | `52708443249234` ×1464 |
| `utm_term` | 1 | `52708443249434` ×1464 |
| `utm_content` | 3 | `52708445138434` ×1446, `52708443249634` ×16, `52710275348234` ×2 |
| `utm_source` | 2 | `fb` ×930, `ig` ×534 |
| `utm_medium` | 1 | `paid` ×1464 |

One campaign id across 1,464 clicks is consistent with two very different realities — Meta's
`{{campaign.id}}` substitution with one campaign running, or an id typed once into the URL field
as a literal — and they diverge the moment a second campaign goes live, because under the second
its spend lands on `52708443249234` and the report charges one campaign's cost against two
campaigns' signups.

`utm_content` separates them. A literal produces exactly one value forever; three distinct values,
ids that differ by level, and **0 clicks carrying an unexpanded `{{macro}}`** rule it out.
Substitution is live. Tagging starts in the data on 2026-10-21.

## The split that decides whether 40 untagged leads are a bug

410 of 450 landing signups carry `utm_campaign`. The 40 that do not had two incompatible
explanations and the counts alone could not tell them apart: organic arrivals with no tag to
carry, or ad clicks whose tag the backfill lost. Left-joining the leads to sessions carrying
`fbclid`:

| | Count |
|---|---|
| Landing signups in window | 450 |
| …have an ad click on record | 411 |
| …and the lead carries the campaign id | 410 |
| …and the tag was lost | **1** |
| no ad click on record, correctly untagged | 39 |
| attributed to a campaign with no ad click | **0** |

So ADS-3's three named fragilities are costing **0.2%** over 30 days. Real in the code, nearly
free in practice.

## Two gaps the measurement found that were not the ticket

1. **Creative-level attribution is dead at the lead.** 1,464 ad visits carry `utm_content` and
   `utm_term`; **0 of 450 leads** carry either. The identify backfill at
   `trackingController.ts:604-610` copies exactly three columns — `utm_source`, `utm_campaign`,
   `utm_medium` — and C104, which would make the signup send them itself, is merged but not in
   the deployed build. The data says so independently of the commit graph: the newest landing
   signup, 2026-11-03T02:14:22Z, still carries none. Consequence: spend can be judged per
   campaign but never per ad, and three ads are running under the one campaign.

2. **Deploying C104's frontend will split every campaign into two report rows.** The report
   groups by `(utm_source, utm_campaign)`. C104 writes the `fb|paid` convention; all 410 existing
   tagged leads carry bare `fb` or `ig`. **Zero leads carry a piped shape today**, so the split
   has not begun — it begins the day that frontend reaches production. Normalizing `utm_source`
   at the read boundary belongs *before* that deploy, not after the first report is read. Posted
   to ADS-3, whose fourth bullet predicted it; the measurement turns it from a hypothetical into
   a dated one.

## Not established

- **A campaign with no clicks in the window is invisible to this method.** "Every active campaign
  is tagged" is proven only for campaigns that actually delivered traffic. A paused campaign, or
  one spending with zero clicks, can still only be checked in Ads Manager. This is the one part
  of ADS-5's "Done when" that measurement cannot fully close.
- **Which Meta macro sits in which parameter** is inferred from the id hierarchy (one campaign,
  one term, three content), not read from the ad configuration. The hierarchy is consistent with
  `{{campaign.id}}` / `{{adset.id}}` / `{{ad.id}}`; the mapping is not confirmed.
- **The hostname the live ads point at**, which this was partly meant to settle, is *not*
  answerable this way: `visitor_sessions.entry_page` stores a path with no host on all 1,480 ad
  clicks. It is also moot — `www.refactored.ai` and `enterprise.colaberry.ai` were shown earlier
  in this session to be the same deployment, which is why ADS-2's absolute CTA is not currently
  costing attribution.
- **The 16 untagged ad clicks (1.1%)** are unexplained. Most predate 21 Oct, consistent with a
  query string stripped in transit rather than an untagged ad.
- **Nothing here is a profitability number.** The ledger is still empty. This establishes that
  attribution is ready to receive spend, not that the ads pay for themselves — that still needs
  ADS-4 (the Meta token) and ADS-6 (the daily sync).
