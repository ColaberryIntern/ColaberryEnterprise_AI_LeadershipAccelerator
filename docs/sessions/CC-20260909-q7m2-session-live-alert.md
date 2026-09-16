# Session CC-20260909-q7m2 (session-live-alert slice)

Separate per-PR file to avoid session-log merge conflicts with the other open PRs.

---

# Intern Today card: alert when a required session is live (2026-09-16)

**Branch:** `feat/internship-session-live-alert` (cut from `origin/main`)

- [x] "Session is live now" banner on the intern's Today command card
  - Date: 2026-09-16
  - Session: CC-20260909-q7m2
  - What changed: the other half of Ali's #2 — "alert them when the session is going via the timeline." When one of the intern's required meetings is happening right now, the active-intern Today command card (`InternshipCommandCard`) shows a red "live now" banner with a **Join in Rooms** link (never a raw Zoom link). New pure, timezone-safe `meetingLive.ts` (`findLiveMeeting`): the schedule is a Central day + local time, so "now" is compared in Central via `Intl` (DST-safe), and a meeting is live for `LIVE_WINDOW_MINUTES` (75) from its start. The card ticks every 60s so the banner appears/clears on its own without a reload. It reads `required_meetings` the card already fetches; no new endpoint.
  - Verification: `meetingLive.test.ts` 7/7 under `react-scripts test` (parse AM/PM, live at start, live 30m in, not 2h later, not before, not on an off day, right meeting on Friday). CI frontend typecheck gates the card wiring. No eslint-disable.
  - Notes: conflict-free with the open PRs (the command card is touched by none of them). The 75-minute window is a display choice; a precise end-time could come from a per-meeting duration later. Attendance for that join is captured by Phase 3a's endpoint once Phase 3b wires the click.
