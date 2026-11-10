# Session CC-20261102-k9r4 — Open House signup (OH-1 .. OH-4)

PROGRESS.md is sealed, so this is the session record for this workstream. One file for the
whole OH ladder; the ADS ladder from the same session ID has its own files.

**The ask (Ali, 2026-11-10).** "Is there a way to sign people up for open house automatically
at the time we get the email?" — which, once the landing page was looked at, turned into: the
ads say *sign up for the Open House*, the page they land on says *create an account*, and the
two have nothing to do with each other. Make the page continue the ad: sign up for the next
Open House, always the next one, and get a $0 account out of it with an email that lands on the
first lesson.

**The decision that shaped it (Ali, option B).** Eventbrite's API has no endpoint that creates
a registration, so the seat could not be taken on the visitor's behalf through Eventbrite. B
was: we own Open House registration ourselves.

---

## OH-1 — the six-hour time defect

- Date: 2026-11-10
- Session: CC-20261102-k9r4
- Ticket: https://app.basecamp.com/3945211/buckets/7463955/todos/10494891680
- PR: https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3819
- What changed: `openHouseEventService` read CCPP's `StartDate` as UTC when it is Central
  wall-clock, so a 6:30 PM event was advertised as **12:30 PM CT**, and its
  `StartDate >= GETUTCDATE()` window retired the event about six hours before it began.
  `publicEventsService` had been fixed for this on 2026-09-02 and kept the SQL fragment
  private, which is why the second service stayed broken. The fix moves
  `CCPP_NOW_CENTRAL` into `centralDate.ts` next to `centralWallClockToInstant`, so there is one
  place that knows this, and extracts a pure `ccppRowToOpenHouseInfo` mapper.
- Verification: measured on production before the fix — `/api/v1/open-house/event` returned
  `2026-11-19T18:30:00.000Z` labelled "12:30 PM CT" while `/api/v1/events` returned
  `2026-11-20T00:30:00.000Z` for the same Eventbrite id. New suite asserts the label is not
  "12:30 PM CT" and that the two services agree on the instant. All 10 CI checks green; merged.
- Notes: the cross-service assertion is the one that matters. A test that only pinned the new
  label would pass again the next time one service is fixed and the other is not.

## OH-2 — a public signup, and an attendee list we own

- Date: 2026-11-10
- Session: CC-20261102-k9r4
- Ticket: https://app.basecamp.com/3945211/buckets/7463955/todos/10494891707
- PR: https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3821
- What changed: `POST /api/v1/open-house/signup`, unauthenticated with its own strict limiter
  (5 per 15 minutes per IP), plus `open_house_registrations` keyed unique on
  `(event_id, email_lower)` with `ON CONFLICT DO NOTHING`, so a repeat keeps the first
  `created_at` and sends nothing twice. One call takes the seat, creates the $0 Explorer
  account and sends the welcome.
- Verification: 20 new cases across the store and the controller. All 10 CI checks green; merged.
- Notes: the public schema deliberately REJECTS `ip_address`, `user_agent`, `order_id` and
  `marketing_consent_text`, which the service-authed sibling accepts. On a public route the
  request is the end user, so those are read off the request — otherwise anyone could post a
  consent record stamped with someone else's IP, and the one artifact that makes consent
  falsifiable would be forgeable. Not `session_guests`, because `countGuests` and the raffle
  draws read that table.

## OH-4 — the welcome email lands on the first assignment

- Date: 2026-11-10
- Session: CC-20261102-k9r4
- Ticket: https://app.basecamp.com/3945211/buckets/7463955/todos/10494891749
- PR: https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3822
- What changed: `sendPortalWelcome` now appends `&next=<first assignment>` to the magic link, so
  a new Explorer lands on Ali's AI-avatar welcome video rather than on a dashboard.
  `FIRST_ASSIGNMENT_PATH` is derived from `PROGRAM_VIDEO_ID`, so replacing the video does not
  leave a stale uuid behind. `next: null` still means "the dashboard, on purpose".
- Verification: 6 new cases. All 10 CI checks green; merged.
- Notes: Ali's suggested destination (`/portal/today?stay=1&first=1`) cannot survive
  `safeNextPath`, which rejects query strings on purpose — "removes a whole class of
  parameter-smuggling bugs". A path-only card route was used instead rather than widening a
  security-sensitive sanitizer to fit a marketing link. A test pins that the rejected form is
  still rejected.
- Miss worth recording: CI caught one failure, in `explorerEnrollmentWelcome.test.ts`, which
  also pinned the old link. Two suites asserted that URL and only the one beside the edited
  module was updated. Found by the full backend run (2,583 suites, 42,518 tests), not by me.

## OH-3 — the landing page becomes an Open House signup

- Date: 2026-11-10
- Session: CC-20261102-k9r4
- Ticket: https://app.basecamp.com/3945211/buckets/7463955/todos/10494891727
- PR: (this change)
- What changed:
  - `frontend/public/v1/next-open-house.js` — fills `{{open_house_*}}` tokens in a hosted
    landing page's copy from `GET /api/v1/open-house/event`, so the date on the page is always
    the next event and nobody has to remember to rewrite it. The date that was there on
    2026-11-10 was for an event in July.
  - `landingPageRenderer` emits that script on every hosted page (unconditional, like
    `welcome-back.js`) and strips the tokens out of the `<title>`, meta description and OG card,
    where no script runs and a crawler would otherwise be served `{{open_house_when}}` for ever.
  - `/open-house` — a standalone page that takes the seat, the account and the email in one
    request, showing the real next event or saying plainly that the date is being confirmed.
  - `OpenHouseModal` no longer says "Reserve Your Free Open House Seat" / "The Open House is
    free." — two live breaches of 40 TAC 807.172(d) on the membership pages. The copy-lint
    baseline drops from 275 to 273 and the file's entry is deleted.
- Verification: 2 renderer cases, ~20 script cases in jsdom, ~20 page cases. The token pattern
  on both sides was executed in node against the shipped text (21/21) because jest cannot run
  in this checkout. CI is the real gate.
- Notes: `/portal/signup` was deliberately left alone. It is a live paid-ad funnel measured at
  41.6% conversion with its own welcome-back path, phone-consent handling and acquisition
  fallbacks, and adding a second purpose to it would put all of that in the blast radius of a
  marketing change. The cost is a duplicated scoped CSS block, which is the cheaper of the two.
- Still outstanding after this PR: the landing page's own stored copy and its CTA targets. That
  text lives in `landing_pages`, not in git, so it is a direct write to a live published page
  rather than anything a PR can show — it waits on Ali reading the words.

---

## Found and not fixed here

Recorded so they are not rediscovered from scratch:

- `/api/portal/free-signup` and `/api/create-free-account` are public, account-creating and
  carry **no rate limiter**. OH-2's new route has one; these predate it.
- `selectNextOpenHouse` is dead code reading `open_house_events`, a table nothing writes. The
  table exists and is empty.
- `OPEN_HOUSE_CAMPAIGN` / `OPEN_HOUSE_LABEL` are hardcoded to the July event.
- `live_sessions` holds exactly one Open House row ever (Oct 29, completed) and nothing
  upcoming, while Eventbrite has three upcoming. `session_guests` has 23 guests for an event
  Eventbrite recorded 188 registrations for.
- Three British spellings remain in `explorerEnrollmentWelcome.test.ts` plus the matching
  `programme` in `enrollmentService.ts`. Left deliberately: `programme` is contrastive domain
  vocabulary there ("`enrollment_type` is the PROGRAMME, `tier` is the ACCESS LEVEL"), not a
  spelling slip.
