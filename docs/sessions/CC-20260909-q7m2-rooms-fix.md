# Session CC-20260909-q7m2 (rooms-fix slice)

Per-PR file (the entries moved here after the shared `CC-20260909-q7m2.md`
conflicted on merge with the other PRs from this session).

---

# Internship rooms: canonical-schedule fix + grant standup room on activation (2026-09-16)

**Branch:** `fix/internship-meeting-rooms-canonical-schedule` (PR #2606)

- [x] Base the provisioning write on the canonical default, not the stale cohort settings
  - Date: 2026-09-16
  - Session: CC-20260909-q7m2
  - What changed: `ensureInternshipMeetingRooms` based the written schedule on `internshipSettings(cohort).required_meetings`, which merges the cohort's `settings_json` OVER the defaults — and the live cohort still held the stale 2-entry list, so the run wrote the wrong meetings. Now it bases the write on `DEFAULT_INTERNSHIP_SETTINGS.required_meetings` (the four real meetings), preserving every other settings key. Prod was already corrected in place; this makes the service correct so a re-run stays right.
  - Verification: `internshipMeetingRooms.test.ts` `applyRoomLinks` 5/5; backend `tsc` clean.

- [x] Interns activated later auto-get the interns-only standup room
  - Date: 2026-09-16
  - Session: CC-20260909-q7m2
  - What changed: `ensureInternInStandupRoom(enrollmentId)` (idempotent `findOrCreate` RoomMembership on the interns room; no-op when the room is not provisioned yet), called from `activate()` best-effort in a try/catch so a room-grant failure can never block an intern's activation. The provisioning run seeds current interns; this covers everyone activated afterward. No import cycle.
  - Verification: backend `tsc` clean; failure path logs `intern_standup_room_grant_failed` and continues.
  - Notes: rebased onto main after the other session PRs merged; the shared session-log entries were moved here to resolve the merge conflict.
