# Open House weekly funnel report (C123)

One HTML report a week that follows every person who comes in through the ads. The path is Facebook and Instagram ad → landing page → Open House sign-up → account → welcome video → Quick check. At every point where people choose, it shows what share went each way. It is read-only and counts people, never names.

```
# 1. On the prod host, from /opt/colaberry-accelerator (last 7 days, compared with the 7 days before)
bash scripts/reports/open-house-weekly/run.sh
bash scripts/reports/open-house-weekly/run.sh 'since=2026-11-16 06:00:00+00' 'until=2026-11-23 06:00:00+00'

# 2. Locally: pull the snapshot, add the phone screenshots, render, open
scp root@95.216.199.47:/tmp/open-house-weekly/snapshot.json docs/reports/open-house-weekly/snapshots/<YYYY-MM-DD>.json
ARTIFACT_CHROMIUM="C:/Program Files/Google/Chrome/Application/chrome.exe" node scripts/reports/open-house-weekly/captureShots.js <shots dir>
node scripts/reports/open-house-weekly/render.js docs/reports/open-house-weekly/snapshots/<YYYY-MM-DD>.json \
     docs/reports/open-house-weekly/OPEN_HOUSE_WEEKLY_REPORT.html --shots <shots dir>
```

`run.sh` also renders a copy on the host, without screenshots, at `/tmp/open-house-weekly/report.html`.

`docs/reports/` is gitignored, so the reports and weekly snapshots stay on the machine that renders them. Data never goes into git.

## What is in it

| Section | What it shows | Source |
|---|---|---|
| KPI tiles | Visitors, sign-ups, sign-up rate, entered, finished the video, aced the Quick check. Each has a change vs last week and a color against its target | all of the below |
| What the data says | Findings built from the numbers, biggest problem first | `lib/insights.js` |
| Every person | One figure per person, colored by the furthest point reached | `lib/model.js` `people()` |
| The funnel | 10 steps; % of the step before and % of visitors; conditional formatting against `targets.js` | `funnel()` |
| How everyone flowed | Mermaid Sankey from ad source to Quick check | `sankey()` |
| The decision tree | Mermaid flowchart of every fork, with people and % | `lib/page.js` |
| Left or right | Each fork as a split bar, with counts and shares | `forks()` |
| Where they come from | Ad source and device, each with its sign-up rate | `visitor_sessions` utm / fbclid / device |
| On the landing page | How far down the page they read; what they did: Save my seat, Start for $0, read, skimmed or bounced | `page_events` scroll + `cta_click` |
| Inside the account | Button vs email link; where quitters left the video; median timings | `timeline_card_progress`, `sign_in_link_uses` |
| Day by day | Clustered columns | |
| Welcome email | Delivered, opened and clicked, from Mandrill (a floor) | `../../audits/open-house-funnel/mandrillFunnel.js` |
| What we cannot see yet | Each blind spot, with the next build that would close it | |

## Rules it follows

- **Same definitions as the C120 audit** (`scripts/audits/open-house-funnel`): the same test-address exclusions, the same rule for "entered", and the same welcome-email window. On 11 Nov 2026 at 12:25 PM CT, both reports, run back to back, gave 53 visitors, 14 sign-ups, 13 new accounts and 4 entered.
- **The window never starts before launch** (3:10 PM CT on 10 Nov 2026), so two different landing pages are never mixed. In launch week, there is no comparison week.
- **Small numbers stay grey.** A rate whose denominator is under `minSample` (5) people is shown as "Too few to judge", never green or red.
- **Targets are assumptions.** They are set in `targets.js` on day one; reset them after four weeks of data.
- **Our own visits are not counted.** `captureShots.js` blocks every tracking call and pixel; only the read-only `GET /api/v1/open-house/event` is allowed, for the session date.
- **Failure modes:**
  - If Mandrill fails, the report renders without the email panel and with a warning.
  - If the SQL times out (60 s), nothing is written.
  - Page events have no visitor index, so the collector reads them in one pass per window. Never look them up per visitor.

## Tests

```
node --test scripts/reports/open-house-weekly/__tests__
```

There are 16 tests. They cover:

- grading: thresholds, the boundary value, small samples, and lower-is-better;
- funnel math: what each step is measured against;
- fork shares, which add up to 100%;
- people counted once each;
- Sankey flow conservation;
- exit bins;
- which finding ranks first;
- week-over-week change;
- an empty week;
- escaping;
- determinism;
- banned words.

Each of 4 deliberate code breaks fails at least one test.

## Next builds (in order of decision value)

1. **Open House attendance.** Join the Zoom/Eventbrite attendee list by email, which adds the last step.
2. **Ad spend by campaign:** cost per sign-up, cost per entered account, cost per finished video.
3. **Page views on the `/open-house` form,** so "opened the form, did not submit" is measured, not inferred.
4. **A tag on the welcome-email link,** so its sign-ins are counted apart from other links.
5. **A multi-week trend chart** read from the weekly snapshots kept in `docs/reports/open-house-weekly/snapshots/`.
