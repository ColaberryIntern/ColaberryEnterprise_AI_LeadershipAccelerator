# Session CC-20260909-q7m2 (meeting-UX slice)

Separate per-PR file to avoid session-log merge conflicts with the other open
PRs from this session (#2606, #2610), which append to `CC-20260909-q7m2.md`.

---

# Intern meetings UX: standup in orientation + join via Rooms (2026-09-16)

**Branch:** `feat/internship-meeting-ux` (cut from `origin/main`)

- [x] Surface the Monday standup in orientation, and route joins through Rooms
  - Date: 2026-09-16
  - Session: CC-20260909-q7m2
  - What changed: two of Ali's refinements. (1) The onboarding **orientation** step now names the interns-only Monday standup: label "Join orientation and the Monday standup", detail tells them to meet in the AI Internship room and be there every Monday at 9:00 AM CT, opened from Rooms. (2) The intern view's meeting list no longer exposes a **raw Zoom link** — the "Join" link became **"Open in Rooms"** (a `Link` to `/portal/rooms`), gated on `room_slug`. Ali's rule: the Zoom URL shows only on the public Eventbrite listing; in-app, interns navigate to the Room (which is also the attendance-capture point). No behaviour change to the schedule/times shown.
  - Verification: `internshipOnboarding.test.ts` 21/21 (orientation label/detail is not asserted, so the copy change is safe); frontend `tsc` clean (only vendored d3 4.9.5 parse noise). No eslint-disable.
  - Notes: the timeline "a session is live" alert (the other half of Ali's #2) is a follow-up tied to the live-session/timeline system. Attendance still needs the per-occurrence booking so that a Rooms join records durable attendance (Phase 3).
