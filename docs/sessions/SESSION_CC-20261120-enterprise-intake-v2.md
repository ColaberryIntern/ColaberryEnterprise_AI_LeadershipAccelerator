# Session CC-20261120-l5j6: Enterprise intake v2 (2026-11-21)

**Ask (Ali, 2026-11-21):** make clear what the 10-minute AI interview is for, with its time saving against a 20-30 minute call with everyone; let clients upload their own research; show our research (company, industry, trends, news, AI) and options based on potential ROI; AI interview now or later; book the human meeting in the same flow, always after the AI interview, on Ali's calendar; then email Ali a visual summary led by the meeting date.

**Decisions (Ali):** uploads raised to 25 MB on that one path; earliest meeting is 1 business day after the AI interview; meetings on Ali's calendar, not admissions.

## Tasks (loop-architect run 20261121-enterprise-intake-v2; plan audit 19/20)
| Task | What | Review |
|---|---|---|
| T1 | New intake columns | 12/12 |
| T2 | Slots on Ali's calendar, now/later, once-only booking | 11/12 |
| T3 | Research uploads (magic bytes, 25 MB, Basecamp attach) | 11/12 |
| T4 | News, AI trends, ROI-ranked options (internal only) | 12/12 (2nd attempt) |
| T5 | Reminder for "later" interviews | 12/12 |
| T6 | Ali's meeting brief + Basecamp meeting post | 12/12 (2nd attempt) |
| T7 | One sweep module (server.ts smaller) | 11/12 |
| T8 | The redesigned page, admin card, /my-pilot | 12/12 |

## Where things live
- Backend: `backend/src/services/enterpriseIntake/` (Schedule, Files, News, Roi, Reminders, Emails, AliBrief, MeetingPost, Sweep, Time)
- Frontend: `frontend/src/pages/publicV2/DemoPilotIntake.tsx`, `frontend/src/pages/publicV2/intake/`
- Directive: `directives/run-enterprise-intake.md`
- Walkthrough: `~/visual-decisions/2026-11-21-enterprise-intake-verify/index.html`

## Not live yet
"Our AI calls me then" for a later interview, and "Call me now", wait for the Synthflow Enterprise agent ID.
