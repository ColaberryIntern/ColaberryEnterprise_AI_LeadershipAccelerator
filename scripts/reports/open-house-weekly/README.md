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

## C124: the starred move, the tour, the story, the Wednesday email

**Wednesdays at 08:00 CT,** Taiwo, Sohail and Ali receive the email edition.

| Part | What it holds |
|---|---|
| Email body | The ★ recommendation, the 10 most impactful numbers, a summary overview chart, the hypothesis verdicts and the latest decisions |
| `OPEN_HOUSE_WEEKLY_REPORT.html` (attached) | The full report, starting with the same three blocks. It has a **Take the tour** button that walks the 10 stops through the page. |
| `ONE_MOVE_PROMPT.md` (attached) | A detailed Claude Code prompt that makes the starred move. Ali runs it from inbox zero with "make the Open House move". |

**One view, three outputs.**
- `lib/view.js` computes the move, the 10 numbers and the overview once. The email, the report and the prompt are all rendered from it, so they cannot disagree.
- The move is chosen by `lib/recommend.js` from the steps in `lib/playbook.js`:
  - **Score:** people short of target × closeness to the first win × sample confidence × whether Claude Code can build it.
  - **Top-of-funnel moves count half** while the sign-up rate is on target.
  - **A move someone must make by hand** wins only if it scores 1.5× the best move Claude Code can build.

**The story.**
- `story/decisions.json` is an append-only ledger. It holds every decision, change of direction, build, measurement, correction and hypothesis.
- The report renders the ledger as the decision timeline and grades every hypothesis against the week's numbers.
- A move whose `measure_until` has not passed is never starred again. It shows as "being measured" instead.
- The prompt makes the build append its own entries in the same PR, so each move adds a little more to the report.
- To reverse a direction, append a `retraction` or `pivot` entry with `supersedes`. Never edit or delete an older entry.

**Schedule** (`scheduled.js`, house pattern: the script decides the Central slot):

```
0 13,14 * * 3 /opt/colaberry-accelerator/scripts/cron-env-wrapper.sh /opt/colaberry-accelerator/scripts/reports/open-house-weekly/scheduled.js >> /var/log/open-house-weekly.log 2>&1
```

- **Fresh code every run:** each run extracts this folder, the C120 audit and `backend/src/scripts/lib` from `origin/main` into a work dir. A merged ledger or playbook change reaches the next email with no deploy.
- **Never twice:** a ledger in `/var/lib/colaberry/open-house-weekly/` keys each send on its Wednesday, so a second run the same week doesn't send again.
- **Never silent:** a failure sends Ali an alert email.
- **Manual commands:**
  - `--dry-run` builds everything and sends nothing.
  - `--force --to ali@colaberry.com` sends a test copy.
  - `--ref origin/<branch>` runs a branch's code.

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
