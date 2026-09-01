# Session CC-20260831-9k2f — RSVP prompt checked the wrong event

**Date:** 2026-09-01
**Branch:** `fix/rsvp-uses-current-event` (cut from `origin/main` @ `f2d12e8b`)
**Scope:** The Today "RSVP for the next event" banner reported RSVP state for a long-completed
Open House instead of the event on screen.

**NOT DEPLOYED.**

---

- [x] Check CCPP registration against the CURRENT event, not a hardcoded default
  - Date: 2026-09-01
  - Session: CC-20260831-9k2f
  - What changed: `openHouseService.getOnboardingSchedule` called
    `isEmailRegisteredForOpenHouse(email)` with no event id, relying on that function's
    `eventId: string = OPEN_HOUSE_EVENT_ID` default. The banner therefore *displayed*
    the correct next event (`getNextPublicEvent()`) while *answering* "has this person
    registered for event `1992498063344`?" — a different, fixed event. Now passes
    `next.id`, guarded on `next` being non-null. The default parameter was REMOVED so no
    future caller can fall into the same trap; `eventId` is required.
  - Verification: Confirmed against live production CCPP that `1992498063344` is
    **"Colaberry AI Systems Architect Accelerator Open House", Status `completed`,
    2026-07-16, with 209 distinct registrants.** Every one of those 209 people was
    reported as already RSVP'd for whatever the next event happened to be, and nobody who
    registered for the real next event was ever detected. Six new tests; suites
    `openHouseService` + `publicEventsService` green at **47 passed** (was 41).
    Mutation-tested: restoring the hardcoded id fails the "passes the id of the event
    actually being shown" test and nothing else, so the test targets exactly this defect.
    Backend `tsc --noEmit` clean.
  - Notes: The reason this shipped unnoticed is worth recording. `openHouseService.test.ts`
    never mocked `openHouseOnboardingService`, and every existing fixture happened to have
    no `email` field, so the `if (email && ...)` branch short-circuited in every test — the
    suite was green while the branch was never executed once. The mock is now in place and
    six cases cover the branch, including that no CCPP query is issued when there is no
    upcoming event, when the enrollment has no email, or when the points ledger already
    shows an RSVP.
    The RSVP *action* was never wrong: `handleRsvpOpenHouse` takes the event id from the
    route and validates it with `isKnownPublicEvent`, so clicking the button always
    recorded against the right event. Only the "have they already RSVP'd?" read was wrong.
    `syncOpenHouseExplorers` still defaults to `OPEN_HOUSE_EVENT_ID`, which is correct for
    that admin backfill script — it exists to onboard that specific Open House's
    registrants — and is left alone deliberately.
