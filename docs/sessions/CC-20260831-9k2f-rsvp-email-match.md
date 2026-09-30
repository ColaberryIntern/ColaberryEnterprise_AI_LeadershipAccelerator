# Session CC-20260831-9k2f — RSVP banner disagreed with the Events page

**Date:** 2026-09-02
**Branch:** `fix/rsvp-check-malformed-emails` (cut from `origin/main` @ `c33322f8`)
**Scope:** `isEmailRegisteredForOpenHouse` answered "not registered" for every 2026
registration, while the Events page said the opposite for the same person and event.

**NOT DEPLOYED.**

---

- [x] Match the malformed emails CCPP stores in the RSVP-banner lookup too
  - Date: 2026-09-02
  - Session: CC-20260831-9k2f
  - What changed: `EventBrite_EventAttendees.Email` stores many addresses with their
    delimiters baked in — literally `'someone@example.com',`. Commit `7df3f64c` (another
    session) added a defensive second comparison for this in
    `publicEventsService.getRegisteredEventIds`, but `openHouseOnboardingService`
    `.isEmailRegisteredForOpenHouse` was left on an exact match. That function backs the
    Today "RSVP for the next event" banner, so production disagreed with itself. Added the
    same `@emailWrapped` binding and `AND (clean OR wrapped)` predicate, deliberately
    identical to the other reader rather than a second invention.
  - Verification: Found during an end-to-end registration test on production. A real
    registration made 2026-09-02 00:59:42 UTC produced an attendee row that
    `annotateRegistration` matched (marking exactly the right event, 1 of 46) while
    `isEmailRegisteredForOpenHouse` returned **false** for the same address and event.
    Measured on production: **26,216 of 99,377 rows carry the corrupt shape, and 100% of
    2026 registrations do** — so the banner was wrong for every current registrant.
    Extended `eventRegistrationEmailMatching.test.ts` with 8 cases for the second reader;
    suites `eventRegistrationEmailMatching` + `publicEventsService` + `openHouseService`
    green at **64 passed**. Mutation-tested: reverting to the exact match fails 2 of the
    new tests. Backend `tsc --noEmit` clean.
  - Notes: The tests live in the existing `eventRegistrationEmailMatching.test.ts` rather
    than a new file, because the invariant is "every reader of this corrupt column agrees
    on the corruption's shape" — splitting it across files is how the two readers drifted
    apart in the first place. One case asserts the OR stays inside parentheses: without
    them `EventId = @eventId AND clean OR wrapped` would match the wrapped form on ANY
    event, reporting a learner as registered for something they never signed up for.
    This is a DEFENSIVE READ, not a fix. CCPP's ingestion still writes corrupt rows and
    should be repaired upstream; that is outside this repo.
    Related but NOT addressed: the portal matches the enrollment address exactly, so a
    plus-alias (`ali+25@colaberry.com` vs `ali@colaberry.com`) does not mark the viewer
    registered even though Google treats them as one mailbox. Flagged to the operator as a
    separate decision.
