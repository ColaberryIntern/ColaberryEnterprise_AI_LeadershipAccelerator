# CC-20261120-plan-scale-and-rich-command-center — Plan size follows the material; Story 000 builds a rich Command Center

Goal (Ali, 2026-11-19): the ShiftFill end-to-end project produced a shallow Command Center. Audit
it, make sure project size is driven by the depth of the input (a scope document could mean 100
stories), and improve Story 000 so the Command Center is the detailed one Ali expects.

## Shipped

- #4255 (L12.3) Plan generation in stages: requirements with a checklist, a completeness audit
  against the source (every addition must quote it verbatim, checked in code), a release outline
  sized by the material (tier is a floor, up to 10 releases), then stories one release per call.
  Guardrails are pulled no later than the behavior they guard. Kill switch:
  `SBP_STAGED_GENERATION=off`. Merged 2026-11-20 17:33 UTC.
- #4252 (L12.4) Story 000: a "what good looks like" spec per tab; `plan.json` gains
  `derived.understanding`, `handoffs`, `artifacts`; a closed schedule window rolls forward from
  the publish day; the platform commits `.nojekyll`; 12 prompt/data contradictions fixed.
  Merged 2026-11-20 17:33 UTC.
- #4256 (follow-up) first publish passes `truthForRender`, so a new repo's first Command Center
  carries the student's answers instead of waiting for the next sync.

## Verification

- Deployed `70362b1fd` with `scripts/deploy-prod.sh backend` (registry mode); marker
  `generateStagedPlan` present in `/app/dist/services/sbp/stagedGeneration.js`; home 200.
- Live re-run of the ShiftFill intake on prod ("ShiftFill (E2E v2)", project
  `dd00273c-cb13-4f06-bbfb-480cfb72b3b5`, correlation `eaad6588-...`): logs show
  `sbp_requirement_coverage_merged` (18 -> 19+), outline, four `sbp_release_stories_completed`,
  `sbp_staged_generation_completed`. Plan: 20 requirements, 14 stories, 4 releases (first run:
  11 requirements, 9 stories). Dates start 2026-11-28 (first run: 2026-10-01, in the past).
- A cold agent ran the new Story 000 prompt against that project's bundle and built all 9 tabs
  plus 18 detail routes; standalone render in headless Edge: 0 console errors.
- Before merge, against the real model in the prod container: a 46k-character blueprint went
  from 22 requirements / 13 stories to 44 / 26 with 0 blocking issues; a 120-requirement fake
  makes a 120-story plan in tests.

## Open (found by the cold Story 000 run)

- No release is marked as the demo target.
- Intake files today's cost under `success_definition`, so "What good looks like" shows the
  baseline; baselines are not tied to a measure.
- `derived.roles` omits Dana as a role although 5 stories are "As Dana".
- Gates on three requirements name no approver.
- Intake says ranking is a human decision while a Hygienist Ranker agent does it.

## Rollback

Set `SBP_STAGED_GENERATION=off` to return to one-call generation, or revert the PRs.
