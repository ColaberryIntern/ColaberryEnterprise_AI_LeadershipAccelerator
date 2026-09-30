# Session CC-20260909-q7m2 (room-names slice)

Per-PR file to avoid shared-session-log merge conflicts.

---

# Intern meetings: name the room + deep-link to it (2026-09-16)

**Branch:** `feat/internship-meeting-room-names` (cut from `origin/main`)

- [x] Tell the intern which room each meeting is in, and open that room directly
  - Date: 2026-09-16
  - Session: CC-20260909-q7m2
  - What changed: Ali's feedback — the intern view said "Open in Rooms" but never named the room or took them to it. Now each required meeting shows **"in the [room name] room"** and the button reads **"Open [room name]"** and **deep-links to that specific room** (`/portal/rooms/:roomId`, the existing route). `RequiredMeeting` gained `room_id` + `room_name`; `applyRoomLinks` now takes a `RoomRef {slug,id,name,link}` per audience and stamps all four; `ensureInternshipMeetingRooms` passes each room's id + name. The Today command-card live-alert ("Join [room]") deep-links the same way (`LiveMeeting`/`findLiveMeeting` carry room_id + room_name).
  - Verification: `internshipMeetingRooms.test.ts` `applyRoomLinks` 5/5 (now asserts room_id + room_name routing); `meetingLive.test.ts` 7/7 (still green after extending LiveMeeting); backend `tsc` clean. No eslint-disable.
  - Notes: after deploy, the provisioning must be re-run once on prod (`ensureInternshipMeetingRooms`) so the cohort's `required_meetings` config is rewritten WITH `room_id` + `room_name` — idempotent (rooms/links already exist; this only enriches the config). The intern view then shows the room name and deep-links.
