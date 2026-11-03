# Session CC-20261103-m9x4 — measurement definitions

Scope of this log: the approved-measurement-definition feature, which makes
`operational_result` reachable. Separate file from `CC-20261103-m9x4.md` (the message
email fix) because two PRs appending to one log both append at end-of-file and conflict
on merge, which has cost approvals here before.

- [x] A student project can reach `operational_result`, so a project-linked case study can be published
  - Date: 2026-11-03
  - Session: CC-20261103-m9x4
  - What changed: two new tables (`ensureProjectMeasurementSchema.ts`, ensured at boot)
    holding measurement DEFINITIONS and the READINGS taken against them, a pure rules
    module (`sbp/projectMeasurement.ts`) deciding what counts, an I/O store
    (`sbp/projectMeasurementStore.ts`), the wiring through `caseStudyFoundationLoader`
    into both the portal read and the publish gate, and an operator script
    (`scripts/projectMeasurement.ts`, dry-run by default). `computeMaturity` gains an
    optional `outcomes` count and can now return `operational_result`;
    `outcomeEvidence.items` stops being typed `readonly never[]`.
  - Verification: backend `tsc --noEmit` and 5 jest suites — `projectMeasurement`,
    `ensureProjectMeasurementSchema`, `caseStudyFoundation`, `pilotCaseStudyPolicy`,
    `sbpRoutes.caseStudyFoundation` — **81 tests passed**. Includes an explicit
    regression test that `computeMaturity` with no `outcomes` returns exactly the rung
    it returned before, because every existing caller omits it.
  - Notes: the obvious design was to merge the `measurementEvents` stories already
    report. Measured first, that design would have merged NOTHING: across all 15
    projects carrying enrichments the total number of measurement events ever recorded
    is **zero**, because `enrichmentPromptBlock` ships the field to the agent as a bare
    `measurementEvents: []` with no worked example while every other field has one. So
    an outcome is recorded by a person against a definition approved in advance.
    Two signatures are required and neither may be the author's: the approver of a
    definition may not be its creator, and the confirmer of a reading may not be its
    recorder. Both are CHECK constraints as well as service rules, because a rule in
    one caller is a rule until somebody writes a second caller.
    `direction` is carried but never consulted when filtering — a measurement that
    went the wrong way is still an outcome measured in use, and a rung that only
    climbed on good news would be a marketing ladder.
  - Deliberately escalated, not decided: `pilotCaseStudyPolicy.ts` (C8.7) carried a
    test written to fail the day this landed — *"If the measurement-definition concept
    ever lands, this test fails and the design must be revisited rather than silently
    outdated."* Its PREMISE ("no measurement-definition concept exists") is now false;
    its CONCLUSION (a twelve-week pilot still cannot honestly claim a business outcome,
    per C7.6) stands and was left untouched, including `MATURITY_CEILING_TODAY`. The
    header records the change and asks for C8.7 to be re-read. Ali's call, not mine.
  - Follow-ups not done here: no admin HTTP routes (the script is the surface);
    `impact_case_study` remains unreachable, deliberately, because nobody has written
    down what distinguishes it from a measured outcome.
