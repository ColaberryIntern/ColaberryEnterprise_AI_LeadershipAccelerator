# Session CC-20260909-q7m2 (internship admin screen redesign)

Separate per-PR file to avoid session-log merge conflicts with the other open
PRs from this session.

---

# AI Internship admin console: master/detail redesign (2026-09-17)

**Branch:** `feat/internship-admin-redesign` (cut from `origin/main`)

Ali, on the live admin screen: "It is so confusing to navigate. I get lost when
things start expanding. It's a hot mess. Please redesign." Shared a clickable
prototype first (approved), then implemented it against the live data.

- [x] Rebuild `/admin/internship` from a 1000-line single-column page into a
      master/detail console
  - Date: 2026-09-17
  - Session: CC-20260909-q7m2
  - What changed: The old `AdminInternshipPage.tsx` was **1053 lines** in one
    scrolling column. Opening an applicant injected ~11 stacked `SectionCard`s into
    the middle of that column, and selection state (set from the KPI strip, the
    ready-for-project roster AND the queue) bounced the reader between the top and
    bottom of the page; the review tools were mixed in with the queue. Rebuilt into a
    three-mode console, decomposing the monolith into a focused `internship/` folder
    (each file under the 500-line ceiling):
    - **Applications mode** — a fixed **queue** (left) beside a **detail pane** (right)
      that shows ONE tab at a time (Overview · Assessment · Activity & Project ·
      Answers · Documents · Decide · Audit) under a **pinned applicant header**.
      Opening someone fills the pane; it never grows the page. KPI + bucket filters
      now filter the queue **without clearing the open applicant** (half the old
      disorientation).
    - **Projects mode** — the "ready for a project" roster + the two start-a-project
      tools, moved off the review screen. The roster's "assign" opens that applicant
      back in Applications.
    - **Manage mode** — convert existing interns, kept apart so it can't fire by
      accident.
    - New files: `internship/reviewContext.tsx` (`useInternshipReview` hook holding
      ALL review state + actions, exposed via context so the split surfaces read what
      they need without prop-drilling), `InternshipQueue.tsx`, `InternshipDetailPanel.tsx`
      (header + tab bar + Overview/Answers/Audit inline), `tabAssessment.tsx`,
      `tabActivity.tsx`, `tabDecide.tsx`, `InternshipApplicationsMode.tsx`,
      `InternshipTools.tsx` (Projects + Manage), `badges.tsx` (extracted
      Recommendation/Standing/Requirement badges), `adminInternship.css`.
      `AdminInternshipPage.tsx` is now a ~75-line container (mode nav + provider).
    - **New: the Activate control.** The backend has always had
      `POST /applications/:id/activate` — the ONLY action that places an applicant in
      the cohort — but no UI ever called it (activation was reachable only from a
      script). Added `activateInternshipApplication` to `adminInternshipApi.ts` (a
      refusal returns `{ ok:false, blockers }`, not a thrown error) and surfaced it on
      the **Decide** tab for the activatable states, showing the outstanding blockers
      when it's not ready.
  - Verification: frontend `tsc --noEmit` clean (the redesign files and the whole
    project). No eslint-disable. Every existing API call and interaction preserved —
    the behaviour moved, the wiring didn't change: queue/detail/assessment/activity/
    project-review/decision logic is the same, relocated into the `useInternshipReview`
    hook verbatim.
  - Notes: prototype approved by Ali before build. Pending: production screenshots for
    a before/after review, and (a small refinement) opening the Activity tab directly
    when "assign a project" is clicked from the roster (today it opens on Overview).
    Backend unchanged.
