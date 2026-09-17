# Session CC-20260909-q7m2 (student dashboard, Phase 3 — mentor feedback slice)

Separate per-PR file to avoid session-log merge conflicts with the other open
PRs from this session.

---

# My Internship: released mentor feedback on the dashboard (2026-09-17)

**Branch:** `feat/internship-dashboard-phase3c` (cut from `origin/main`, Phases 2 + 3a + 3b included)

Third Phase 3 slice (plan §5): the intern sees the mentor feedback on their
submissions — but only the feedback that cleared the release gate, and always
labelled honestly (AI-generated guidance, and whether a human then approved it).

- [x] Backend: one release gate, a list-by-enrollment read, tested pure
  - Date: 2026-09-17
  - Session: CC-20260909-q7m2
  - What changed: The existing `mentorFeedbackService.getFeedbackForSubmission` had the
    release rule (`['auto_approved','approved']`) as a local const inside itself. Lifted
    it into a new pure module `mentorFeedbackGate.ts` — `RELEASED_MENTOR_STATUSES`,
    `isReleasedToStudent(status)`, `StudentFeedbackItem`, and the pure shaper
    `toStudentFeedback(review, submission)` — so the gate is defined once and both the
    single-submission read and the new list read run through it (they cannot drift).
    The gate imports only TYPES from the models, so it's testable without a DB or
    OpenAI. `toStudentFeedback` enforces two rules: it returns null for
    `pending_review`/`dismissed` (never reaches a student), and it surfaces
    `reviewer_notes` ONLY for an `approved` (human-reviewed) item — an auto-released
    item shows no human notes even if a stray value sits on the row. New
    `listReleasedFeedback(enrollmentId)` on the service: released items newest-first,
    each joined to its `assignment_submissions` row for context (title, type, version,
    status, submitted_at); a missing id short-circuits to empty so it can't widen to
    another enrollment. Route `GET /api/portal/internship/feedback` (session-derived
    enrollment). `getFeedbackForSubmission` rewired to `isReleasedToStudent`.
  - Verification: `mentorFeedbackGate.test.ts` 9/9 pass (gate releases exactly
    auto_approved+approved; pending/dismissed dropped; auto_approved shows no notes even
    when present; approved carries notes and is human-reviewed; submission shaping +
    ISO dates; missing-submission tolerance + version default 1; a coverage test that
    exactly two of the four statuses release). Backend `tsc` (running).
  - Notes: the actual data model is simpler than the plan's §5 ideal — `MentorReviewItem`
    holds AI feedback text + confidence + status, not structured rubric criterion scores,
    so the slice shows what exists (the feedback text, the human-vs-auto label, the
    submission + version) rather than inventing a rubric. Resubmission history is visible
    via the submission's `version_number` (the model chains versions with
    `parent_version_id`); a full resubmit-and-compare flow is deferred to the assignment
    surface, since a dashboard read must not mutate.

- [x] Frontend: the "Feedback on your work" section
  - Date: 2026-09-17
  - Session: CC-20260909-q7m2
  - What changed: New `InternshipFeedback.tsx` on the dashboard (after the Projects
    section). Each card shows the submission title (+ "resubmission (vN)" when version
    > 1), the assignment type, the date, a badge — **"Mentor reviewed"** (green,
    human_reviewed) vs **"AI guidance"** (blue, auto-released) — the AI feedback text
    with whitespace preserved (its STRENGTHS / GAPS / NEXT STEPS shape), the mentor's
    note in a distinct block only when human-reviewed, and a caption that states plainly
    whether a mentor reviewed it. Empty state: "Once your submissions are reviewed, your
    mentor feedback shows up here." `internshipApi.ts` gained `StudentFeedbackItem` +
    `fetchInternshipFeedback()`.
  - Verification: frontend `tsc --noEmit` (running); no eslint-disable. Read-only —
    displays feedback, mutates nothing.
  - Notes: the AI-vs-mentor distinction is carried in the badge AND the caption, so a
    student can never mistake auto-released AI text for a human mentor's judgment.
