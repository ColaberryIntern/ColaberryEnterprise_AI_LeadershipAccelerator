# Session CC-20260915-a1x7 (Case Study 01)

**Date:** 2026-09-15
**Branch:** `workstream/case-study-01-cora-recovery` (cut from `origin/main`)
**Scope:** Case Study 01, "Recovering the Calls the Workflow Lost", built from
`KesetebirhanDelele/cora-recap-engine` at commit `534124e1` under the brief
`CLAUDE_CODE_CASE_STUDY_01_RECOVERING_LOST_CALLS.md`. Draft only: the record was
never approved or published, and nothing in this session changed platform source.

Run state: `.loop-architect/runs/20260915-case-study-01-cora/` (`scope.txt`, 35 path
prefixes approved by Ali; `evidence-report.md`, 19 commit-pinned evidence rows).
The consolidation-program half of this session ID is logged separately in
`docs/sessions/CC-20260915-a1x7.md` (PR #2582).

---

## Assets (the only committed change)

- [x] Two real captures, the walkthrough video, captions and poster
  - Date: 2026-09-15
  - Session: CC-20260915-a1x7
  - What changed: `frontend/public/site-v2/shot-cora-recovery-panel.png` (2200x1320 cover),
    `shot-cora-operations-cards.png` (1205x670), `cora-recovery-walkthrough.mp4`
    (87.74 s by ffprobe, 1920x1080, md5 `a51e1137176e2e4766791260b3adafc0`),
    `cora-recovery-walkthrough.vtt` (10 cues), `poster-cora-recovery-walkthrough.jpg`;
    deck `scripts/walkthrough-video/decks/cora-recovery.json` + `.timings.json`.
  - Verification: PR #2589 checks all green (backend and frontend typecheck, unit tests,
    frontend build, secret and security scans). Captures were taken from the source
    repository's own dashboard running locally at the pinned commit on synthetic rows
    (`demo-launch-NN`, `demo-contact-NN`); every identifier on screen is a placeholder.
    Local: `tsc --noEmit` (backend) and `jest -c jest.ci.config.ts` over
    `src/services/caseStudy src/types src/routes/admin src/scripts`: 177 suites,
    2922 tests, all passed.
  - Notes: burned-in captions are deliberately off (one caption source, the VTT track,
    per Ali's ruling on the earlier records). Not deployed: nginx must be rebuilt with
    `--no-deps` after merge before the URLs on the record resolve.

## Record (production data, no source change)

- [x] Canonical record authored and hardened to draft
  - Date: 2026-09-15
  - Session: CC-20260915-a1x7
  - What changed: `case_studies` row `80808a8c-03ed-43bd-bb1a-d6c8366a7464`, slug
    `recovering-the-calls-the-workflow-lost`; repository row
    `dc02ac27-510a-461e-bfa2-9ce566d78648` scoped to 35 prefixes; snapshots v1 (sync)
    through v14 (approved snapshot, `approved_by ali@colaberry.com`); two
    `case_study_artifacts` rows (approved, public, `source_type repo`). Record status
    `review`, visibility `private`, organisation `anonymized`/consent false, builder
    `role_only`/consent false, built-by `colaberry_team`.
  - Verification: readiness 99/100 "substantial" on v14; the single gap is
    `publication.record_approved`, which is the draft state by design.
    `evaluateCaseStudyPublication` refuses on `case_study_not_approved` only, on all
    three surfaces. Re-sync after the last override: `unchanged` (overrides survive).
    Projection scans on all three surfaces: 0 vendor names, 0 banned phrases,
    0 phone-like strings (19 regex hits, all ISO dates), 0 em-dashes.
    Rendered page (`/stories/<slug>` on the CRA dev server with the v14 projection
    intercepted): no horizontal overflow at 1440 or 390, masthead carries the video
    with poster and one caption track, diagram renders as SVG, all five images load,
    no page errors.
  - Notes:
    1. Every metric is a capability or build measurement; the repository persists no
       count of events lost or recovered, so the record carries no outcome figure.
       Hero: `recovery_paths` (count with a stated baseline). Supporting:
       `recovery_test_cases` (count), `recovery_build_span` (span).
    2. `applyHumanOverride` auto-sets the record to `approved` each time; it was set
       back to `review` after every override so the record stops short of approval.
    3. Two authoring slips found by the rendered check and fixed in v14: descriptive
       sentences in `architecture.integrations` and `architecture.dataStores` were
       slugified into single wrapped chips; they are now short items matching the
       platform's existing records.
    4. Platform, not this record: the detail page prints `industry` and
       `primaryCapability` as facet slugs (`caseStudyPublicProjection.ts:150`,
       `storyDetailV2Model.ts:236`), so every record's context strip shows
       `career-services-and-technical-hiring`-style values. Left for a separate fix.
    5. `scripts/previewStoryLayout.js` needs the wire envelope `{surface, caseStudy}`
       with `surface` as the profile object, and its header promises an image-origin
       rewrite the code no longer performs. Worked around in a scratch wrapper; the
       script itself was not changed in this PR.
