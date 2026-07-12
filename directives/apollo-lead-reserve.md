# Apollo Lead Reserve — Reuse Before You Buy

**Owner:** Ali Muwwakkil · **Created:** 2026-07-10 · **Status:** ACTIVE POLICY

## Why this exists
Scheduled agents pulled **2,102 leads** from Apollo.io between 2026-03-13 and 2026-07-09,
burning paid credits on every search + enrich + phone-reveal. Those leads are permanent,
deduplicated, fully-enriched records in Postgres — **already paid for**. This directive turns
them into a reusable **reserve** so we spend the inventory we own before buying more.

## The rule (non-negotiable)
1. **No new Apollo pulls without Ali's explicit, per-request permission.** Apollo is disabled by
   default via the `APOLLO_ENABLED` kill switch (`backend/src/services/apolloService.ts`) and both
   scheduled agents (`ApolloLeadIntelligenceAgent`, `ApolloWeeklyEnrollmentAgent`) are disabled in
   the governance DB. Do not re-enable either without Ali saying so in writing.
2. **Check the reserve first.** When anyone needs cold leads, draw from the tiers below before
   proposing any Apollo (or People Data Labs) spend.

## The reserve (as of 2026-07-10)
Defined by `SELECT ... FROM leads WHERE source='apollo'`. Tiers:

| Tier | Definition | Count | Use |
|---|---|---|---|
| **A — fresh, never contacted** | `pipeline_stage='new_lead'` | **213** (180 execs) | Highest value. Net-new to any outreach. Hand to sales first. |
| **B — worked cold** | contacted in a past campaign, not converted | **1,876** | Reusable with a fresh angle / new sender. |
| **SUPPRESS — do not contact** | `status='unsubscribed'` | **13** | Never contact again. Keep suppressed. |

- **Unused (never in any campaign):** 217 (~10%), all contactable.
- **Already in GoHighLevel CRM:** 1,981 (94%).
- **Segments:** ~92% execs (CxO/VP). Top industries: IT services (597), financial services (157),
  higher ed (117), healthcare (96), management consulting (69), government (67).

## How to regenerate / hand off the list
```
# inside the accelerator-backend container (reads DATABASE_URL):
node src/scripts/exportApolloLeadReserve.js --out apollo-lead-reserve-<date>.csv
```
Read-only, idempotent. Produces a Sheets-importable CSV tiered by reuse-readiness + seniority.
For sales handoff: import the CSV to Google Sheets and share, or point sales at GHL (94% already there).

## If the reserve runs low
Escalate to Ali with: how many of tier A/B remain, what segment is needed, and the estimated Apollo
credit cost — then wait for explicit approval before enabling `APOLLO_ENABLED` for a bounded pull.
