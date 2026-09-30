# Session CC-20260909-q7m2 (student dashboard, Phase 4 — case-study pipeline slice)

Separate per-PR file to avoid session-log merge conflicts with the other open
PRs from this session.

---

# My Internship: the case-study editorial pipeline (2026-09-17)

**Branch:** `feat/internship-dashboard-phase4-casestudies` (cut from `origin/main`)

Second Phase 4 slice (plan §7). Answers the plan's fifth question — "how does this
work become proof of capability?" — for the projects already nominated into a case
study, by showing where each one sits in the editorial pipeline.

- [x] Frontend: the Case studies section on the dashboard
  - Date: 2026-09-17
  - Session: CC-20260909-q7m2
  - What changed: New `InternshipCaseStudies.tsx` on the dashboard (after the
    Certification section). Reads `activity.case_studies` — which the dashboard
    payload ALREADY carries (`{ id, title, status, slug }` per case study) — so there
    is no new endpoint and no extra fetch. Each case study shows its title, an
    editorial-stage pill, and a four-step pipeline (Drafting → In review → Approved →
    Published) with the current step marked; an `archived` record is shown off to the
    side rather than on the pipeline. Empty state points the intern to the Projects
    section above for candidate readiness.
  - Verification: frontend `tsc --noEmit` clean (the UI gate for a display-only slice);
    no eslint-disable. Read-only; no mutation.
  - Notes: **Honest stages, not invented ones.** The stages shown are exactly the
    case-study record's real states (`draft|review|approved|published|archived`), not
    the richer candidate→gathering→submitted→changes-requested pipeline the plan
    sketches — that data isn't in the model, so it isn't shown. Candidate readiness
    (how close a NOT-yet-nominated project is) stays in the Projects section (Phase 3a),
    which already shows the readiness score + gaps. No per-item deep link: published
    case studies live on the public site (`/proof`, not a verifiable portal route), so
    linking a specific slug risked a 404 — the section shows status truthfully instead.
    Deferred: nomination detail (who/why) and the publication-evidence checklist, which
    would need discovery of the case-study nomination/review model.
