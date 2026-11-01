# Explorer ad-funnel audit

The queries behind the October 2026 audit of where ad-sourced Explorers stall on the campus, and behind the
C91 "Explorer first win" fix ([ticket](https://app.basecamp.com/3945211/buckets/7463955/todos/10457116167),
PRs #3491 and #3500). Re-run them to measure C91, or any later first-session change, with the same definitions.

## Run

On the production host, from `/opt/colaberry-accelerator`:

```bash
bash scripts/audits/explorer-ad-funnel/run.sh funnel                    # who signed up, from where, how far
bash scripts/audits/explorer-ad-funnel/run.sh behavior                  # what ad Explorers did after signup
bash scripts/audits/explorer-ad-funnel/run.sh cutover                   # before vs after C91 (2026-10-29 23:30 UTC)
bash scripts/audits/explorer-ad-funnel/run.sh funnel since=2026-11-01   # a different window
bash scripts/audits/explorer-ad-funnel/run.sh cutover "cutover='2026-11-15 00:00:00+00'"
```

Read-only: one transaction, always rolled back, 60 s statement timeout, stops at the first error.

## Definitions (`base.sql`)

| Term | Meaning |
|---|---|
| Explorer | an `enrollments` row with `explorer_entered_at` on or after `since` (default 2026-10-19) |
| Channel | from the Explorer's **first** `visitor_sessions` row, joined by lowercased email through `leads` |
| ad | a paid click id (`fbclid`, `gclid`, `msclkid`, `ttclid`) or a paid `utm_source` / `utm_medium` |
| untracked | no visitor session joined (tracking blocked, or the account was made off the site) |
| First win | a learning row in `student_points_events`; the same types as `FIRST_WIN_EVENT_TYPES` in `backend/src/services/explorerFirstWin.ts` |
| Excluded | `@colaberry-test.local`, the daily `pointsEarnSmoke.js` guests that complete a card at 13:30 UTC |

## Limits

- **Channel is reconstructed, not recorded.** `/portal/signup` does not send the ad's UTM tags, so `leads.utm_source`
  is empty for those signups. A visitor who blocks tracking lands in `untracked` even if they came from an ad.
- **No room-visit history.** `campus_presence` keeps one row per person, overwritten on every move: it shows where
  someone was **last**, not the path they took.
- **Tour and admissions-call tables start on 2026-10-26.** Earlier signups show no tour activity by construction.
- **Return visits** count visitor sessions started after signup; a returning visitor who blocks tracking is missed.
- `cutover.sql` compares windows of different lengths. Compare the rates.
