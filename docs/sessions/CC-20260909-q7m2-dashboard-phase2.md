# Session CC-20260909-q7m2 (student dashboard, Phase 2 slice)

Separate per-PR file to avoid session-log merge conflicts with the other open
PRs from this session.

---

# My Internship: the two-view student dashboard shell (2026-09-17)

**Branch:** `feat/internship-dashboard-phase2` (cut from `origin/main`)

Phase 2 of the `INTERN_DASHBOARD_PLAN.md` build: the spine of the student-facing
"My Internship" dashboard. A single next action, an attention queue split by whose
turn it is, and a read-only summary of what is already tracked. Deep drill-downs
(project delivery, cert attempts, case studies) are later phases; this is the shell
they hang off.

- [x] Backend: one dashboard endpoint that folds the checklist + activity together
  - Date: 2026-09-17
  - Session: CC-20260909-q7m2
  - What changed: New `internshipStudentDashboard.ts` service. `internDashboard(application)`
    runs `activeInternView` and `internActivity` in parallel and returns
    `{ ...view, activity, attention }`. The new piece is the **attention queue**:
    `deriveAttentionQueue(checklist)` is a pure function that filters incomplete
    steps and splits them by `actor` — student steps go to `your_turn`, Colaberry
    steps go to `waiting_on_colaberry`. This encodes the fault-line Ali cares about:
    an intern is never shown Colaberry's outstanding work as their own lateness.
    Controller `handleGetInternshipDashboard` mirrors the onboarding handler
    (`requireOpenApplication`, returns `{ state, ...dashboard }`); route
    `GET /api/portal/internship/dashboard` behind `requireParticipant`.
  - Verification: backend `tsc --noEmit` clean (exit 0); `internshipStudentDashboard.test.ts`
    4/4 pass (the four `deriveAttentionQueue` cases: student→your_turn,
    Colaberry→waiting_on, completed dropped from both, blocking/waiting_on carried through).
  - Notes: the endpoint reuses existing derivations — no new data model. `internActivity`
    already reads the correctness-guarded fields (verified-vs-complete stories,
    practice-vs-official cert, 30% week threshold), so the dashboard inherits those
    guarantees rather than re-deriving them.

- [x] Frontend: Dashboard/Onboarding view switch on an active intern
  - Date: 2026-09-17
  - Session: CC-20260909-q7m2
  - What changed: New `InternshipDashboard.tsx` renders, top to bottom: a dark
    **next-action hero** (`d.next_action`, with the week), a **read-only Stat strip**
    (Training weeks 1-3 done/total with a "ready for a project" flag, Sessions attended,
    Project stage + verified/total stories, Cert readiness labelled "practice estimate,
    not an exam result"), the **attention queue** in two columns (Your turn / Waiting on
    Colaberry, the latter captioned "Ours to do — not counted as your lateness"), a
    **"Your first three weeks"** callout with per-week progress bars and a Classroom link,
    and the **required-meetings** list (room name + deep-link to `/portal/rooms/:id`).
    Every number states its denominator; nothing on the page mutates status.
    `internshipApi.ts` gained `DashboardActivity`, `AttentionItem`, `AttentionQueue`,
    `InternDashboard extends OnboardingView`, and `fetchInternshipDashboard()`.
    `InternshipPage.tsx` now shows a Dashboard/Onboarding tab pair for an **active**
    intern only (an applicant mid-onboarding has no dashboard yet), with the choice
    kept in the URL (`?view=`) so refresh, back and direct links work; a non-active
    onboarding participant still sees the checklist alone.
  - Verification: frontend `tsc --noEmit` (running at write time); no eslint-disable
    added (an errant one was reverted). Read-only by construction.
  - Notes: Stat strip reuses the intern activity payload rather than re-fetching. The
    view switch defaults to the dashboard. Phase 3 (project delivery + week-3 handoff)
    and Phase 4 (certification + case studies) hang the drill-downs off this shell.
