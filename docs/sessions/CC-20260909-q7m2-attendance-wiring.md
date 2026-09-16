# Session CC-20260909-q7m2 (attendance-wiring slice / Phase 3b)

Per-PR file to avoid shared-session-log merge conflicts.

---

# Phase 3b: wire attendance capture + admin display (2026-09-16)

**Branch:** `feat/internship-attendance-wiring` (cut from `origin/main` after the Phase-3a stack merged)

- [x] Record the join on "Open in Rooms" and show attendance in admin
  - Date: 2026-09-16
  - Session: CC-20260909-q7m2
  - What changed: consumes the Phase-3a capture backend (#2628, now on main). INTERN side: the onboarding "Open in Rooms" link and the Today command-card "Join in Rooms" live-alert link now fire `recordInternshipMeetingJoin(meeting.day)` (fire-and-forget, best-effort) before navigating to Rooms — the join click is the attendance capture point, keyed by the meeting's day. `findLiveMeeting` now returns the meeting `day` so the live-alert can record it. ADMIN side: `internActivity` now also returns `attendance` (`meetingAttendanceSummary`: total occurrences, per-meeting counts, last attended), and the admin Activity KPI strip gains a **"Sessions attended"** StatCard (green once > 0, hint shows the last date).
  - Verification: `meetingLive.test.ts` 7/7 (still green after adding `day`); backend `tsc` clean; frontend types are a new fire-and-forget client call + a StatCard using existing props. No eslint-disable.
  - Notes: closes the attendance loop end to end (record on join → count in admin). Attendance is a join-click proxy (`source: join_click`); a Zoom-participant-webhook upgrade is a later option. Depends on #2628 (merged).
