# Session CC-20260831-9k2f — events vanished 5 hours before they started

**Date:** 2026-09-02
**Branch:** `fix/event-window-central-time` (cut from `origin/main` @ `df0b2372`)

**NOT DEPLOYED** at time of writing.

---

- [x] Evaluate the upcoming-event window in Central, the frame CCPP stores
  - Date: 2026-09-02
  - Session: CC-20260831-9k2f
  - What changed: `fetchFromCcpp` filtered on `e.StartDate > GETUTCDATE()`.
    `EventBrite_Events.StartDate` is stored as CENTRAL wall-clock — the very thing
    `ccppRowToView` corrects with `centralWallClockToInstant` when reading a row — so the
    filter compared two different frames. An event dropped out of the feed as soon as
    UTC-now passed its Central start: **five hours early in CDT, six in CST.** Replaced
    both bounds with `CCPP_NOW_CENTRAL`, a static
    `GETUTCDATE() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time'` expression.
  - Verification: Observed on production. At 14:27 UTC (09:27 CDT) the Sep 2 AI Strategy
    session — starting 10:00 AM CDT, 33 minutes later, registration still open — was
    ALREADY absent from `getUpcomingPublicEvents`, the calendar and the "Next event" chip.
    Tested all three candidate predicates directly against CCPP: `GETUTCDATE()` dropped the
    event, `GETDATE()` and `AT TIME ZONE` both kept it. Suites `publicEventsService` +
    `openHouseService` + `eventRegistrationEmailMatching` green at **68 passed**. Backend
    `tsc --noEmit` clean.
  - Notes: Chose `AT TIME ZONE` over `GETDATE()`. The CCPP host runs Central today (GETDATE
    trailed GETUTCDATE by exactly 5h), so `GETDATE()` would work — but it would break
    silently if that host were ever moved, and it does not state the intent. `AT TIME ZONE`
    is explicit, handles CST/CDT automatically, and was verified available on CCPP's SQL
    Server 2017 (needs 2016+).
    Both bounds were changed, not just the lower one: leaving the 180-day horizon on UTC
    would skew the far end of the window too. A test asserts the conversion appears twice.
    One pre-existing test had to be updated rather than deleted — it asserted
    `e.StartDate > GETUTCDATE()`, i.e. it was pinning the defect. It now asserts the
    Central-converted form, with a comment recording why it changed.
    This is the third defect in this workstream from CCPP's Central-stored-as-UTC
    convention; the display path was already corrected, the filter never was.
