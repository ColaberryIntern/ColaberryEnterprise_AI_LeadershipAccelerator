# Session CC-20260909-q7m2 (attendance-capture slice)

Separate per-PR file to avoid session-log merge conflicts with the other open PRs.

---

# Phase 3: intern meeting attendance capture (backend) (2026-09-16)

**Branch:** `feat/internship-attendance` (cut from `origin/main`)

- [x] Capture attendance at the required intern meetings (backend + endpoint)
  - Date: 2026-09-16
  - Session: CC-20260909-q7m2
  - What changed: the attendance-capture backend for Ali's "track if they joined a session, across all sessions." Research settled that a persistent video-room join records nothing durable (only room bookings do), and Ali wants interns to navigate to Rooms rather than see raw Zoom links — so attendance is recorded on the **join click** (the codebase's own deterministic capture point), when an intern opens a meeting's room from their internship view. New purpose-built table `internship_meeting_attendance` (one row per enrollment per meeting per occurrence date; unique on `(enrollment_id, meeting_key, session_date)`) in `ensureInternshipSchema`, its model `InternshipMeetingAttendance`, and the model added to the schema/model parity test. Service `internshipAttendanceService`: `recordMeetingJoin` (idempotent per day), `meetingAttendanceSummary`, `centralDateKey` (occurrence day in CT), and the pure `summarizeAttendance` fold. Endpoint `POST /api/portal/internship/meetings/join` (`requireParticipant`, keyed on the enrollment not an open application, so an ACTIVE intern still records after their application closes).
  - Verification: `internshipAttendance.test.ts` (summarize + centralDateKey) and `internshipSchemaModelParity.test.ts` (now covering the new table) — 19/19 together. Backend `tsc` clean. No eslint-disable.
  - Notes: this is Phase 3a (capture backend). Phase 3b — wiring the intern "Open in Rooms" click to POST the join then navigate, and rendering the attendance summary in the admin Activity view — is deferred until the other open PRs (#2616 touches the intern onboarding view, #2618 touches the admin Activity view) merge, to avoid same-file conflicts. Attendance is a join-click proxy (source `join_click`), the same fidelity as the room-booking `intent` source; a Zoom-participant-webhook upgrade is a later option.
