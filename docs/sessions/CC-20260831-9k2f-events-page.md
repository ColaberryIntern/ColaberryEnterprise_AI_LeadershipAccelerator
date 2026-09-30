# Session CC-20260831-9k2f — Portal Events page

**Date:** 2026-08-31
**Branch:** `feat/portal-events-page` (cut from `origin/main` @ `19d8c346`)
**Scope:** A public Events page in the portal, directly under Schedule, reproducing the legacy
training-site event list (`app.colaberry.com/app/training/events`) minus its month calendar,
including the Eventbrite promo artwork.

**NOT DEPLOYED.** Code and tests only.

---

- [x] Carry the Eventbrite promo image and end time through the public-events feed
  - Date: 2026-08-31
  - Session: CC-20260831-9k2f
  - What changed: `OpenHouseView` (`backend/src/services/openHouseTypes.ts`) gained
    `image_url: string | null` and `ends_at: Date | null`. `publicEventsService.ts` now selects
    `e.Logo_url` in the CCPP query and maps both fields in `ccppRowToView` — `ends_at` gets the
    same Central-wall-clock-read-as-UTC correction as `starts_at`, and `image_url` normalises
    CCPP's three shapes (missing column, NULL, blank string) to `null` so the UI does one
    truthiness check. The Postgres fallback returns `null` for both, since that table has
    neither column. Frontend mirror in `frontend/src/services/onboardingApi.ts` updated in the
    same diff, as its header comment requires.
  - Verification: Backend suites `publicEventsService` + `openHouseService` green at **32
    passed** (was 28; the exact-shape `toEqual` contract test caught the change and was updated
    rather than loosened). Four new cases cover image passthrough, the missing/null/blank
    normalisation, the `ends_at` DST correction, and a SQL assertion that `e.Logo_url` is
    actually selected — without it every card silently falls back to a lettered tile, which
    looks deliberate rather than broken. Backend `tsc --noEmit` clean on TypeScript 5.9.3.
    Confirmed against live production CCPP that all 46 Registration-labelled upcoming events
    carry a populated `Logo_url` on `img.evbuc.com`.
  - Notes: `Logo_url` is typed optional (`?`) on `CcppEventRow` because rows CCPP synced before
    the column existed omit it entirely.

- [x] Events page at `/portal/events`, linked under Schedule
  - Date: 2026-08-31
  - Session: CC-20260831-9k2f
  - What changed: New `frontend/src/pages/portal/events/EventsPage.tsx` + `EventsPage.css`.
    Card grid — Eventbrite image in a fixed 16:9 frame, cherry date-time line, bold title,
    truncated blurb with an ellipsis, and a Register button opening the Eventbrite listing.
    Cards group under month headings. Route added to `portalRoutes.tsx` (ungated, like
    Schedule — these are open-to-the-community events, not paid content) and a nav item added
    to `NAV_GROUPS` in `PortalShell.tsx` immediately after Schedule, per the request.
    No calendar, per the request.
  - Verification: 13 new tests in
    `frontend/src/pages/portal/events/__tests__/eventsPageHelpers.test.ts`, all passing, over
    the three exported pure helpers. They pin the behaviours most likely to regress silently:
    Central rendering (`15:00Z -> 10:00 AM`), correct handling across the DST boundary (Nov 24
    is CST, so `16:00Z -> 10:00 AM`, not 11:00), month bucketing by Central rather than UTC
    (`2026-10-01T02:00Z` is September), suppression of degenerate `ends_at` values that would
    print "10:00 AM - 10:00 AM", word-boundary truncation, and empty-string output instead of
    "Invalid Date" for unparseable input. Frontend `tsc --noEmit` reports no error in any file
    touched here (pre-existing `@dnd-kit/*` TS2307s in `TimelineBuilderPanel.tsx` and
    `TimelineEditorTab.tsx` come from the older junctioned `node_modules` and are unrelated).
  - Notes: Failure paths designed before the happy path. A broken or blocked Eventbrite CDN URL
    swaps to a lettered gradient tile via `onError` rather than leaving a broken-image frame;
    that tile is `aria-hidden` because the title beneath already carries the meaning. A failed
    fetch renders an explicit error state, distinct from the empty state — the feed already
    degrades server-side (CCPP -> Postgres -> empty), so an exception here means the request
    itself failed and must not be shown as "no events scheduled". `prefers-reduced-motion` is
    honoured for the hover lift and the spinner. The page requests the endpoint's maximum
    90-day window, since the legacy page was a long scrolling list rather than a 30-day slice.
    Per the repo date rule, no `new Date()` runs at module top level.
