# Session CC-20260831-9k2f — RSVP button opened a completed event

**Date:** 2026-09-01
**Branch:** `fix/rsvp-opens-current-event-url` (cut from `origin/main` @ `2f559fae`)
**Scope:** The Today "RSVP for the next event" button sent students to the Eventbrite page
of a finished event.

**NOT DEPLOYED.**

---

- [x] Open the displayed event's own Eventbrite link, not a hardcoded one
  - Date: 2026-09-01
  - Session: CC-20260831-9k2f
  - What changed: `TodayShell.doRsvp` recorded the RSVP against the correct `oh.id`, then
    finished with `window.open(EVENTBRITE_OPEN_HOUSE_URL, ...)` where that constant was a
    hardcoded link to `...open-house-tickets-1992498063344`. The card therefore named the
    right event ("AI Strategy And Collaboration Session · Sep 2") and then sent the student
    to the 16 July 2026 Open House, which Eventbrite renders as EVENT ENDED / Sales ended.
    Now captures `oh.registration_url` before the awaits and opens that, guarded on it
    being present. The constant is deleted.
  - Verification: Confirmed against live production CCPP that **all 46 upcoming public
    events carry their own `registration_url`** — 0 missing — so there was never anything to
    hardcode. The current next event's real link is
    `https://www.eventbrite.com/e/ai-strategy-collaboration-session-tickets-1993959926817`.
    6 new tests in `__tests__/TodayShell.rsvpUrl.test.ts`; all TodayShell suites green at
    **17 passed**. Mutation-tested: restoring the hardcoded URL fails 4 of the 6, so the
    tests target this defect rather than passing against it. Frontend `tsc --noEmit` clean.
  - Notes: This is the SECOND defect from the same hardcoded July Open House. The first
    (fixed in PR #1979) was `isEmailRegisteredForOpenHouse` defaulting to the same event id,
    which made all 209 of its registrants look already-RSVP'd for every later event. That
    fix corrected the "have they RSVP'd?" READ; this one corrects where the button SENDS
    them. Both had the same root shape: one specific event's identity frozen into code that
    runs for every event.
    The URL is captured into a local BEFORE `await rsvpOpenHouse` / `await loadAll()`,
    because `loadAll()` replaces `oh` mid-handler — reading `oh.registration_url` afterwards
    could open a different event than the one the student clicked. A test asserts that
    ordering.
    `window.open` deliberately stays outside the try/catch: securing the Eventbrite seat is
    the part that matters to the student, so it still fires when the in-app points call
    failed. No fallback URL — sending someone to a stale event is worse than sending them
    nowhere, so a missing `registration_url` opens nothing.
