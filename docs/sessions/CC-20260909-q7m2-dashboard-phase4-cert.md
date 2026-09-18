# Session CC-20260909-q7m2 (student dashboard, Phase 4 — Certification slice)

Separate per-PR file to avoid session-log merge conflicts with the other open
PRs from this session.

---

# My Internship: certification headline (practice estimate + official claim, apart) (2026-09-17)

**Branch:** `feat/internship-dashboard-phase4-cert` (cut from `origin/main`, all of Phase 2/3 + hero deployed)

First slice of Phase 4 (plan §6). Surfaces the two headline certification signals on
the dashboard, kept deliberately separate, and links to the existing full Cert Prep
page (`/portal/cert-prep`) for practice, mock exams and per-domain detail rather than
rebuilding it.

- [x] Backend: internCertification — readiness estimate + official claim, kept separate
  - Date: 2026-09-17
  - Session: CC-20260909-q7m2
  - What changed: New `internshipCertification.ts`. `internCertification(enrollmentId)`
    returns two independent shapes: `readiness` (from the SAME `getCertReadinessField`
    the dashboard's readiness stat already uses — state, overall_scaled, knowledge_scaled,
    evidence_coverage_pct, weights_available, computed_at) and `official` (the student's
    certificate claim from `student_certifications`, via the pure
    `summarizeOfficialClaim`). Discovery confirmed the two are separate subsystems in
    code: practice = `cert_sessions`/`cert_readiness_snapshots` (a Colaberry estimate,
    100-1000, NOT an Anthropic score; `weights_available=false` means coverage-only);
    official = `student_certifications` (a self-reported upload a named staff member
    approves — there is NO external/automated verifier). The service keeps them in
    different fields so a UI can't merge them. `summarizeOfficialClaim` picks the claim
    to show: an approved claim wins, else the most recently submitted. Route
    `GET /api/portal/internship/certification` (session-derived enrollment).
  - Verification: `internshipCertification.test.ts` 4/4 (none-state; approved wins over a
    newer pending; falls back to most-recent when none approved; Date→ISO normalization +
    DATEONLY passthrough). Backend `tsc` (running).
  - Notes: deliberately a SUMMARY, not a rebuild — the full practice/mock/domain map
    already lives at `/portal/cert-prep`, which the section links to. Deferred: surfacing
    per-domain gaps and attempt history inline (they exist at `/portal/cert-prep`); could
    be added later if the dashboard should carry them too.

- [x] Frontend: the Certification section on the dashboard
  - Date: 2026-09-17
  - Session: CC-20260909-q7m2
  - What changed: New `InternshipCertification.tsx` (after the feedback section). Two
    cards side by side: **Practice readiness** (state pill, the scaled estimate labelled
    "a Colaberry practice estimate, not an Anthropic exam score", the knowledge/evidence
    split, and a caption when `weights_available` is false that it's a coverage estimate,
    not weighted) and **Official certificate** (status pill none/pending/approved/rejected
    with plain-language detail, the passed-on date when approved, and a caption that it's
    self-reported and staff-approved, separate from the estimate). A header link opens the
    full Cert Prep page. `internshipApi.ts` gained the certification types +
    `fetchInternshipCertification()`.
  - Verification: frontend `tsc --noEmit` (running); no eslint-disable. Read-only.
  - Notes: the two cards never merge into one number; copy states plainly that readiness
    is an estimate and the official claim is a staff-approved upload, not external
    verification.
