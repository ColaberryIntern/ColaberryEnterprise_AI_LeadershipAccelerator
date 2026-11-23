# Growth Journey by brand: what shipped, and how to check it

**For Ali, and whoever picks this up next.** Written 2026-11-23.
Session `CC-20261109-k2w7`.

**The page:** https://enterprise.colaberry.ai/admin/growth-journey

---

## What you asked for, and what is now true

Ali, 2026-11-22: *"I noticed there is a Explorer Growth page and Growth Journey page... I need
these 2 pages merged and be able to be setup by brand... When you are done I should have one
page working how the current Explorer Growth works broken down by brand."*

`/admin/growth-journey` is now that page. Fourteen tabs. `/admin/explorer-growth` forwards to
it. Maya's rules are configurable per brand.

It took three releases:

| PR | What it did |
|---|---|
| [#4351](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4351) | Merged Explorer Growth into the journey page, brand-scoped |
| [#4354](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4354) | Restored the Brain and Settings tabs, which #4351 had removed |
| [#4367](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4367) | Made Maya's brain rules per brand |

Plus two production data writes, both authorised in session: the **membership seed** (54 rows)
and the **brand-context backfill** (939 rows).

---

## How to check it, in about three minutes

### 1. The all-brands view

Open https://enterprise.colaberry.ai/admin/growth-journey with **no brand selected**.

You should see the full population: around **1,221 learners**, labelled as all brands. This is
the view that worked from the first deploy and does not depend on anything else.

### 2. Colaberry Training

Choose **Colaberry Training** in the Brand selector.

You should see **the same figures**, now attributed to that brand. That is correct and not a
bug: Explorer Growth *is* Colaberry Training's learner journey, and every one of the 1,221
profiles now carries a Colaberry Training context.

Until the membership seed ran on 2026-11-23 this selection answered **403** and rendered a
named configuration state. If you ever see that state again, memberships are the first thing
to check.

### 3. Any other brand

Choose **Colaberry Enterprise**, or any other brand.

You should see an **honest empty state naming that brand**, not Colaberry Training's rows.
This is the single most important thing to confirm. If you ever see 1,221 learners under
another brand's name, stop and report it: that is the exact failure this build exists to
prevent.

### 4. The Brain

Open the **Brain** tab with a brand selected.

A notice at the top states which half of the tab follows the brand and which does not. The
**rules** are that brand's. The **inventory** and the **already-given** list are one library
and one population, and the notice says so.

With **no brand** selected the notice instead warns that you are editing the shared rules,
which every brand without its own falls back to.

Saving a brand's rules writes that brand alone. No other brand changes.

### 5. The old page

Open https://enterprise.colaberry.ai/admin/explorer-growth.

It forwards to the merged page. A bookmark carrying `?tab=brain`, `?tab=settings` or
`?tab=journey` lands on the right tab.

---

## What is NOT brand-scoped, deliberately

- **The brain inventory**, meaning what each shelf can choose from, is one library.
- **The already-given list** is Explorer's population, which is Colaberry Training's.
- **Explorer Growth's system controls** on the Settings tab are system-wide.

Each of these says so on the page. They are not oversights; they are facts about the data that
the UI is required to state rather than imply away.

---

## What was never proven, and what would prove it

**Nobody has exercised the signed-in page.** Every `/api/admin` path returns 401 to an
unauthenticated request, including a route that does not exist, because `requireAdmin` runs
ahead of the router. So an HTTP status carries no information about whether a route exists, and
route presence was proven from inside the running container instead.

Minting an admin token on production to get past that was out of bounds for this work.

**What that leaves unproven:** that the tabs render, that the numbers match Explorer's current
figures side by side, and that saving a brand's rules persists. Opening the page while signed
in is the only thing that settles those, which is why step 2 above exists.

---

## Known limitations

- **For about six hours this page worked for two people only.** The membership seed gave each
  of the 15 humans all four tenants, and a tenant resolved only for single-tenant operators, so
  the 13 who are not super-admins were refused every brand. Fixed: a requested `brand_id` now
  resolves that brand's own tenant, gated on the caller already holding a membership in it. If
  a colleague reports a 403 on brand selection, check that the fix is deployed before checking
  anything else.
- **939 of 1,221 profiles carry no attribution beyond the backfill.** They now hold a Colaberry
  Training context, created 2026-11-23, with no first-touch history. The attribution is
  correct; the provenance is "backfilled", not "observed".
- **A drift sentinel ships with the summary read.** Explorer's services take no brand filter, so
  treating the whole population as Colaberry Training is correct only while it stays true. The
  sentinel counts and reports, and distinguishes "could not check" from "checked and fine". It
  does not block.
- **Maya has never had saved brain rules in production.** There is no stored rule set of any
  kind, so she runs on the built-in defaults. The per-brand machinery is live and inert until
  someone saves something.
- **Three journey tabs were replaced, not added to.** `decisions`, `shadow` and `content`
  existed on both pages; Explorer's versions won, because they are the ones with data behind
  them. The journey's originals remain on disk with their tests.
- **Four brands have no journey programme**, so the Brand setup tab can show their role as
  unset but cannot set one. That is a decision nobody has taken, not a missing feature.

---

## If something looks wrong

| Symptom | First thing to check |
|---|---|
| Every brand shows the configuration state | `SELECT count(*) FROM tenant_memberships;` and if 0, the seed was undone |
| One colleague gets 403 on every brand, you do not | They are probably not a super-admin. Confirm the brand-to-tenant resolution fix is deployed, then that they hold a membership in that brand's tenant |
| One brand shows another brand's learners | Stop. This is the failure the build prevents. Capture the URL and report it |
| The Brain tab is missing | `?tab=brain` on the merged page; if absent, the frontend bundle is stale and nginx needs a redeploy |
| A merged change is not live | A merged frontend route is not live until nginx rebuilds |
| Maya's wording changed unexpectedly | Check whether a brand's rules were saved; a brand with none falls back to the shared set |

---

## Rollback

**Flag only**, which undoes the surface and keeps the code: remove
`GROWTH_JOURNEY_ENABLED` from `/opt/colaberry-accelerator/.env`, or restore
`.env.bak-20261123T120127Z`, then redeploy so the container recreates. Every journey route
returns to 404. Explorer Growth is untouched either way.

**Editing `.env` is not a deploy.** The flag was measured as still unset inside the container
after the file was written and before the deploy. It took effect because the container was
replaced.

**The membership seed** is reversible: the migration ramp condition is
`(await TenantMembership.count()) === 0`, so deleting the rows re-opens it.

**The brand-context backfill** is reversible by deleting the 939 rows created on 2026-11-23,
identifiable by `created_at` and by having no first-touch attribution.

**Full code revert** needs `git revert` on main, CI to publish, then a deploy. Only worth it if
the code itself is at fault rather than the surface.

---

## The one rule this build exists to enforce

**A 403 never falls back to data.** Not to all-brands, not to cached, not to anything.

The first draft of the scope component answered a 403 with *"Showing all brands"*. In
production, where memberships were empty, that would have rendered Colaberry Training's 1,191
learners under the Colaberry Enterprise label on day one. Every other test would have passed
against that version.

The same class of mistake was caught twice more: a redirect that always appended Colaberry
Training's id, and a decisions table that looked reusable but opened an unscoped modal on every
"Why?" click.

If you change anything on this page, that is the rule to keep.
