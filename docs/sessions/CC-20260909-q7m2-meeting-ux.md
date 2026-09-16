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

- [x] Direct interns to the curriculum (the decision-free half of #3)
  - Date: 2026-09-16
  - Session: CC-20260909-q7m2
  - What changed: the onboarding "Complete week 1 of the curriculum" step, when incomplete, now shows an **"Open the Classroom"** button (a `Link` to `/portal/classroom`) so an intern is pointed straight at the curriculum. Research confirmed interns already HAVE curriculum access (payment/comp predicate, both paywall flags off) and existing-student interns already have a class cohort for tracking (verified on Ali's own enrollment `aced5b39`: paid, Cohort - July 2026) — so this is purely the "start moving through the 3 weeks" nudge, no access grant needed. The remaining #3 piece (placing a cohort-less external convert into a cohort so tracking works) needs Ali's class-cohort-vs-dedicated-cohort decision and is not in this PR.
  - Verification: frontend `Link` already imported on this branch; CI frontend typecheck gates. No eslint-disable.
  - Notes: bundled onto the meeting-UX PR (#2616) since both touch `InternshipOnboarding.tsx`.
