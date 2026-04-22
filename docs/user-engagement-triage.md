# User Engagement and Feedback — Requirement Triage

Snapshot map of the 22 "User Engagement and Feedback" requirements against
existing code as of 2026-04-22. Purpose: stop the Build Prompt generator
from claiming "No existing implementation files detected" when substantial
code already exists.

**Totals:** 8 COVERED · 8 PARTIAL · 6 GAP.

## Triage table

| # | Requirement | Status | Key evidence |
|---|---|---|---|
| 1 | Alerts with severity on pattern deviation | COVERED | `backend/src/models/Alert.ts` (severity 1-5), `services/alertService.ts`, `alertDeliveryService.ts` |
| 2 | Pattern / anomaly / trend detection | PARTIAL | `services/risk/anomalyDetectionService.ts`, `services/strategic-intelligence/anomalyDetectionEngine.ts` — missing baseline aggregation |
| 3 | Session duration, flow paths, drop-off | COVERED | `models/VisitorSession.ts`, `models/PageEvent.ts`, `models/StudentNavigationEvent.ts` |
| 4 | What-if simulation | COVERED | `models/CampaignSimulation.ts`, `models/CampaignTestRun.ts` |
| 5 | Capture interaction events w/ timestamps | COVERED | `models/PageEvent.ts`, `services/behavioralSignalService.ts` |
| 6 | Example persona "Mark Johnson" | GAP | No persona/seed data. Add to `backend/src/seeds/` if needed for demos. |
| 7 | Feedback loop to adjust responses | PARTIAL | `models/UserInsightFeedback.ts`, `models/InsightReplacement.ts` — no orchestration service |
| 8 | 80% users find recommendations useful | GAP | Survey/NPS model missing |
| 9 | 20% satisfaction lift | GAP | Satisfaction KPI tracking missing |
| 10 | Post-module surveys | PARTIAL | `models/AssignmentSubmission.ts` tracks submissions — no survey form model or UI |
| 11 | Feedback → course adjustment | GAP | Content-adjustment pipeline missing |
| 12 | Sponsorship metrics dashboard | PARTIAL | `Lead.sponsorship_*`, `controllers/sponsorshipController.ts` — no SponsorshipAgreement model |
| 13 | Alumni engagement levels | COVERED | `models/AlumniReferral.ts`, `models/ReferralActivityEvent.ts`, `services/alumniReferralService.ts` |
| 14 | Alumni personal metrics view | PARTIAL | `middlewares/alumniAuth.ts`, `models/AlumniReferralProfile.ts` — no dashboard UI |
| 15 | Alumni engagement A/B tests | COVERED | `models/CampaignExperiment.ts`, `models/CampaignVariant.ts` |
| 16 | Post-program exec surveys | GAP | No survey models/pages |
| 17 | Initial feedback via interviews/surveys | GAP | Collection model missing |
| 18 | Platform versioning driven by feedback | GAP | Version tracking missing |
| 19 | Initial feedback documented | PARTIAL | `models/ContentFeedback.ts`, `models/UserInsightFeedback.ts` — no aggregation service |
| 20 | 80% feedback analyzed + actionable | GAP | Analysis pipeline missing |
| 21 | Exec segmentation (tech/finance/healthcare/mfg) | PARTIAL | `Lead.industry` present — no sector segmentation logic |
| 22 | Post-launch satisfaction surveys | GAP | Survey models + scheduler missing |

## Themes

Where the real work is:

1. **Survey subsystem** (rows 6, 8, 10, 16, 17, 22) — 6 of 6 GAPs collapse
   into one project: a `Survey` / `SurveyResponse` / `SurveyQuestion` model
   trio + scheduled delivery + admin UI + alumni/participant portal UI.
   This is the single highest-leverage build on the list.
2. **Satisfaction KPIs** (rows 9, 20) — KPI-layer, not product-layer. Belongs
   in a reporting doc / dashboard, not a new model. Feeds off #1 output.
3. **Feedback-to-action orchestration** (rows 7, 11, 19) — service layer on
   top of existing `UserInsightFeedback` / `ContentFeedback` models. Moderate
   size.
4. **Exec segmentation** (row 21) — small. Add `industry_category` derivation
   on top of the existing `Lead.industry` column.

## What NOT to build

Rows 8, 9, 20 are **KPI targets**, not features. They define success criteria
for the survey subsystem once it exists. They don't map to code.

## Build-order recommendation

If the survey subsystem is greenlit, land it in this order so the KPIs in
rows 8/9/20 become measurable without a second pass:

1. Models: `Survey`, `SurveyQuestion`, `SurveyResponse` (UUID PKs, JSONB
   `questions` / `answers`).
2. Admin CRUD at `/api/admin/surveys` (follows the existing admin route
   pattern — `requireAdmin`, pagination, search).
3. Trigger hooks: on module completion (row 10), on cohort end (row 16),
   scheduled post-launch (row 22), on advisory session complete (row 17).
4. Participant UI: `/portal/surveys/:id` render + submit.
5. Alumni UI: `/alumni/surveys/:id` using existing `alumniAuth`.
6. Reporting: aggregate surface for the admin dashboard — satisfaction
   scores, lift vs prior cohort, actionable-item extraction status.

## Why this doc exists

The portal's Build Prompt generator produces prompts with "No existing
implementation files detected" for BPs whose `implementation_links` are
sparse, even when the underlying features are built. Link rows above to
the BP's implementation_links in the portal, or update the prompt
generator to consult actual code before claiming nothing exists.

Last updated: 2026-04-22.
