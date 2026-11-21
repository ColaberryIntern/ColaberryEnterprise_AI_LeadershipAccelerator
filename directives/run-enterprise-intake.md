# Run the Enterprise intake (Book a demo pilot to signed)

## 1. Purpose
A prospect books a demo pilot on enterprise.colaberry.ai/demo-pilot and, in the same visit, plans the rest: a 10-minute AI interview (now or at a time they pick), any research they already have, and a 30-minute meeting with Ali on Ali's calendar at least one business day after the interview. We research the company, its industry, recent news and AI trends, and draft pilot options ranked by potential return. Ali gets one email about the client, led by the meeting date. Everything is tracked on the client's list in the Basecamp project "Colaberry Enterprise Intake" until they sign or are marked lost.

## 2. Inputs
- Env (prod `/opt/colaberry-accelerator/.env`): `GOOGLE_CALENDAR_ID` and `GOOGLE_CALENDAR_OWNER_EMAIL` = ali@colaberry.com (the meeting calendar; never the admissions calendar), `BASECAMP_ENTERPRISE_INTAKE_PROJECT_ID`, `MANDRILL_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL`, optional `SYNTHFLOW_ENTERPRISE_INTAKE_AGENT_ID` (turns on calls), optional `ENTERPRISE_INTAKE_UPLOAD_DIR` (default `/app/uploads/enterprise-intake`, on the `uploads` volume).
- Code: `backend/src/services/enterpriseIntake/` (one module per step), `backend/src/controllers/enterpriseIntake*Controller.ts`, routes in `backend/src/routes/leadRoutes.ts`, page in `frontend/src/pages/publicV2/DemoPilotIntake.tsx` and `intake/`.
- nginx: the only path allowed over 1 MB is `^/api/enterprise/intake/<uuid>/files$` (26m).

## 3. Steps (what the system does; each has a signal)
1. Form submitted: lead + intake row; Basecamp list opens. Signal: list `[Form] <Company> - <Name>` with 9 to-dos, description ending `Intake ref: <id>`.
2. Client picks the AI interview now or later. Signal: `interview_mode` set on the row.
3. Client books the meeting. Signal: log `enterprise_meeting_booked` with `calendar: default`; event on Ali's calendar tagged `enterprise_intake_id`; Basecamp comment "Meeting with Ali booked"; to-do "Book the scoping meeting" ticked.
4. Optional upload. Signal: log `enterprise_client_file_stored`; Basecamp comment "The client shared a file" with the attachment.
5. Interview (typed now, or by the reminder link at the chosen time; log `enterprise_interview_reminder_sent`). Signal: write-up and transcript on the list; list renamed `[Interviewed]`.
6. Research. Signal: research comment with news, AI trends and options ranked by potential return; list renamed `[Options drafted]`.
7. Ali's brief. Signal: log `enterprise_ali_brief_sent`; email "Pilot meeting <day>, <time> CT: <Company> (<Name>)" in Ali's inbox.
8. The 5-minute sweep (`enterpriseIntakeSweep.ts`) retries any step above that failed. Signal: `enterprise_sweep_<step>` lines; no `_failed` lines.

## 4. Outputs
Rows in `enterprise_intakes`; events on Ali's Google Calendar; files under the upload dir; comments and ticks on the Basecamp list; emails (the reminder to the client, the brief to Ali); structured log lines named above. Option and proposal emails go out only when a person clicks Send in Admin, Enterprise clients (proposal and signed: Ali only).

## 5. Verification
- `curl -s https://enterprise.colaberry.ai/api/enterprise/intake/<id>/slots` returns dates whose first slot is on or after the next business day (Central).
- The booked event exists on ali@colaberry.com (search the calendar by private property `enterprise_intake_id=<id>`), not on the admissions calendar.
- A 2 MB PDF to `/files` returns 201; a 2 MB body to any other `/api/` path returns 413.
- `docker logs` for the backend show `enterprise_sweep_*` lines without `_failed`, and no `enterprise_intake_dead_letter`.
- Walkthrough with screenshots: `~/visual-decisions/2026-11-21-enterprise-intake-verify/index.html`.

## 6. Edge cases / failure modes
- Calendar unreachable: the page says so and offers Try again; nothing is booked that Google did not confirm.
- Slot taken between listing and booking: 409, the client picks again.
- Interview never done: Ali's brief still goes 24 hours before the meeting, flagged red "AI interview NOT done yet".
- Any step that fails repeatedly stops at its cap and logs `enterprise_intake_dead_letter` with the step name (Basecamp file 5, meeting post 5, reminder 3, brief 3). Fix the cause, then reset the attempt column for that row to retry.
- News feed down: research runs without news ("nothing recent found").
- "Brief WAS sent; sent_at not recorded" dead letter: set `ali_brief_sent_at` by hand so a restart cannot resend.

## 7. Safety constraints
- Meetings go on Ali's calendar only (`defaultCalendar()`); never `admissionsCalendar()`.
- Every side effect is once-only (atomic claim columns) and retry-capped.
- ROI estimates are internal: never in client copy (checked when drafted and when sent).
- Uploaded files: checked by content (magic bytes), 25 MB, 5 per intake; their text reaches a model only fenced as data.
- Retention: files are kept while the intake exists. When test or requested deletions remove an intake row, also call `deleteIntakeFiles(<id>)` (or remove `<upload dir>/<id>`), trash its Basecamp list, and cancel its calendar event. Back up rows before deleting.
- Client emails: no word "free", no em dashes, American spelling.
