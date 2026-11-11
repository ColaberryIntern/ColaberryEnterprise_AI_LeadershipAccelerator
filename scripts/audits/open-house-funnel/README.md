# Open House funnel report (C120)

Read-only. It counts people at every step of the Open House funnel, with the % kept from the step before, from landing page visitors, and from sign-ups. Test sign-ups are excluded by address (`ali+…`, `@colaberry.com`, `@colaberry-test.local`, and the `e2e-` / `test-fixture-` prefixes).

```
# on the prod host, from /opt/colaberry-accelerator
bash scripts/audits/open-house-funnel/run.sh                              # since the LP switched to /open-house
bash scripts/audits/open-house-funnel/run.sh 'since=2026-11-16 06:00:00+00'
```

## The steps and where each one is recorded

| # | Step | Source |
|---|---|---|
| 1 | Landing page visitors | `page_events` pageviews on `/lp/colaberry-training/ai-learning-platform`, both hosts |
| 2 | Open House sign-ups | `open_house_registrations`, `source = 'landing_page'` (the training site is shown separately) |
| 3 | New account created | the registration's enrollment was created within 2 minutes of the sign-up |
| 4 | Welcome email sent | `communication_logs`, `metadata->>'event' = 'open_house_welcome'`, sent by this sign-up |
| 5 | Email opened / clicked | **not in our database.** It is read from Mandrill by `mandrillFunnel.js` (search lags about 10 minutes) |
| 6 | Entered the account | Either path, split out in its own table:<br>- the C121 **Access your account** button: the video card's progress row was created after the sign-up (opening a card creates it);<br>- a sign-in link: `sign_in_link_uses` after the welcome email |
| 7 | Played the video | `timeline_card_progress.started_at` on the welcome video card (first watch beat) |
| 8 | Finished the video | `completed_at` (75% watched, credit collected) |
| 9 | Took the Quick check | `runtime_assessment_attempts` on the Quick check card |
| 10 | Aced it | a 5/5 attempt |

## What it cannot see (as of 11 Nov 2026)

- **Visits to the `/open-house` form page.** That page records no page views, so "visited the form but did not sign up" is unknown.
- **Where a sign-in link came from.** `sign_in_link_uses` counts any link sign-in, so a person who asked for a new link counts the same as one who clicked the welcome email.
- **Some welcome emails are missing from Mandrill.** Mandrill search did not find 2 of the first 5 welcome emails, the two sent before about 9:54 PM CST on 10 Nov, although our log records them as sent. Treat Mandrill's delivered/opened/clicked as a floor.
- **Open House attendance.** It is not recorded in this database, so the funnel stops at the Quick check.

## Tested end to end

On 11 Nov 2026 (5:40 AM CST), the test sign-up `ali+c120-oh-test-1111@colaberry.com` went through every step on production:

- **Sign-up:** `POST /api/v1/open-house/signup` returned 201, and the account, lead, registration and welcome email were all written within 3 seconds.
- **Email:** it arrived in 1 second, filed under Gmail's **Updates** tab.
- **Click:** the tracked link redirected to `/portal/verify` with the video as `next`, and sign-in was recorded.
- **Video:** watch beats moved 14% → 83%, the credit was collected, and the Quick check scored 5/5.
- **Mandrill:** it showed 1 open and 2 clicks about 10 minutes later.

The test account is excluded from every count by its `ali+` address.
