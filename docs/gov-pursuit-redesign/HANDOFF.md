# Gov Pursuit daily process: handoff

**Live 2026-11-05 and running on its own: one email to Ali and Ram at 7:30 AM Central every morning, built from the same data as the Gov Opportunities board.** Session CC-20261104-g7p2. Runbook: [directives/government-pursuit-runbook.md](../../directives/government-pursuit-runbook.md), section "The daily rhythm".

## What runs every day (Central)

| Time | Job | What it does |
|---|---|---|
| 6:15 AM | `GovAiVettingCatchup` | Retries unfinished AI checks, then backfills up to 10 older ZIPs, bids on the board first. |
| 7:30 AM | `GovOpportunityDailySweep` | Hides what didn't survive (low fit, off-target, an AI pass on a bid nobody has worked on), then sends the email. |
| After any upload | Extraction hook | Extraction, capability fit, go/no-go, summary and buyer questions run on their own and are saved. |

All three are on: `ENABLE_GOV_OPP_SWEEP`, `ENABLE_GOV_AI_VETTING` and `ENABLE_GOV_AI_EXTRACTION` are `true` in `docker-compose.production.yml`. A once-a-day slot in `system_settings` keeps the three scheduler instances to one run each.

## Ali's routine

1. Read the 7:30 email. ⭐ bids are AI-vetted; 👀 bids need a read; 📦 bids need their ZIP uploaded.
2. Upload ZIPs from the 📦 links. Results are on the board within about a minute each.
3. For a bid you like: confirm the requirements, Establish, get second-admin approval, build, and assign an intern. It then moves to Interns > Gov Contracts and leaves the board and the email.

The AI never approves, establishes or assigns.

## What shipped

| PR | What |
|---|---|
| [#3664](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3664) | One email, automatic AI vetting, saved results, Hidden list with Restore, assigned bids leave the board, note to Ali, current projects, no bid shown twice |
| [#3670](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3670) | Backfill clears the board first; "in the AI queue" wording |
| [#3673](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3673) | Email links survive the click tracker (a "(" returned HTTP 400) |
| [#3679](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3679) | AI calibrated for a software firm (0 stars in 18 bids became 5); email reports AI vs Ali |

Production: `5b94857a`. Recipients set to `ali@colaberry.com,ram@colaberry.com` on 2026-11-05.

## Proven, and not yet

**Proven on production:** the catch-up, the upload-triggered AI checks (8 of 10 uploads within about a minute each), a real hide, the real email, tracked links returning 302 to the right record, and 4 stars after recalibration.

**Not yet proven:**
- A Restore by a person.
- Ram receiving it. The first send to both is the 7:30 run on 2026-11-06.
- The email in Outlook. Gmail and Chromium are fine.
- The AI-agreement line, which appears after the first decided bid.

## Known issues and next steps

| Item | Owner | Note |
|---|---|---|
| Secret scan "Sweep full history" fails on main (7 findings) | DRI | Started before #3664; findings not yet opened. Use a separate tab. |
| Work Order has two project records, one with no intern | Ali | Retire the duplicate. |
| Saratoga Springs has no close date on record | Ali | Bonfire's Q&A says Nov 12, so its "OK" status isn't based on a real deadline. |
| Teach the AI from Ali's decisions (step 3) | Next build | After 20 to 30 decided bids, put them in the prompt as examples. |
| "Bank the capability" | Next build | Add each built project to Our Services, so future capability matches rise. |
| Other mail templates may have the same link bug | Next build | Check any `esc(href)` or `encodeURIComponent` in sent links. |
| Scheduler log says "(dark until enabled)" | Cosmetic | The flags are on; the label is stale. |

## Rollback

- One bid: Hidden, then Restore, on the board.
- Many bids: `node dist/scripts/restoreGovAiHides.js --since=YYYY-MM-DD` (dry run until `--execute`).
- Stop the AI: `ENABLE_GOV_AI_VETTING=false`.
- Stop the email and hides: `ENABLE_GOV_OPP_SWEEP=false`.
- Code: `git revert` the merge on main, then `DEPLOY_MODE=build ./scripts/deploy-prod.sh backend nginx`. Registry mode can't roll back.
