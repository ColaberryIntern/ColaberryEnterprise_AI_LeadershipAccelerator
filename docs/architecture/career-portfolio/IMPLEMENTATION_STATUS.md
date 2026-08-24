# IMPLEMENTATION_STATUS

**Session:** CC-20260823-p4k9 · **Date:** 2026-08-23
**Branch:** `workstream/career-portfolio` off `origin/main` `dead58d6`
**Deployment state: NOT DEPLOYED** (plan §73 production boundary — nothing was deployed, no
production migration run, no student portfolio published, no employer contacted).

## Gate status

| Gate | Scope | Status |
|---|---|---|
| 0 | Discovery, Kes mapping, current architecture | ✅ complete — 15 docs in this folder |
| 1 | Paid + resume access gate | ✅ complete, enforced server-side |
| 2 | Person-level career profile | ✅ complete as a read-only projection |
| 3 | Career evidence adapters | ✅ complete — 6 adapters, one intentionally empty |
| 4 | Resume/LinkedIn structured ingest | ⛔ deferred — reuses existing parse; no new ingest |
| 5 | Multi-repo catalog | ⛔ deferred — repos read-only, no eligibility state |
| 6 | Repository intelligence | ⛔ deferred — the real Kes-adaptation gate |
| 7 | Career portfolio composer | ✅ complete, **deterministic** (no LLM) |
| 8 | Private Career Studio UI | ✅ complete — 6 components + stylesheet |
| 9 | Readiness + review | ⚠️ **half** — readiness engine ✅, review workflow ⛔ |
| 10 | Versioned publication | ⛔ deferred |
| 11 | Recruiter portfolio | ⛔ deferred |
| 12 | PDF + GitHub export | ⛔ deferred |
| 13 | Talent network | ⛔ deferred |
| 14 | Employer analytics | ⛔ deferred |
| 15 | Job target mode / portfolio AI | ⛔ deferred |
| 16 | Full E2E | ⚠️ **partial** — unit-level only; no Playwright, no screenshots |

## Files

**Created — backend (7)**

```
backend/src/services/career/careerEvidenceAdapters.ts        332
backend/src/services/career/careerProfileService.ts          240
backend/src/services/career/careerReadiness.ts               165
backend/src/services/career/__tests__/careerProfileService.test.ts   246
backend/src/services/career/__tests__/careerReadiness.test.ts        189
backend/src/schemas/careerPortfolioSchema.ts                 135
backend/src/controllers/careerPortfolioController.ts          51
backend/src/routes/careerPortfolioRoutes.ts                   31
```

**Created — frontend (8)**

```
frontend/src/services/careerApi.ts                           131
frontend/src/pages/portal/portfolio/PortfolioPage.tsx        184
frontend/src/pages/portal/portfolio/StudioOverview.tsx       171
frontend/src/pages/portal/portfolio/CapabilityList.tsx       137
frontend/src/pages/portal/portfolio/BuildsSection.tsx        129
frontend/src/pages/portal/portfolio/PublishingPanel.tsx       89
frontend/src/pages/portal/portfolio/ResumePrerequisite.tsx    62
frontend/src/pages/portal/portfolio/PortfolioPage.css        206
```

Every file is inside the root CLAUDE.md ceiling (500 hard); the largest, `careerEvidenceAdapters.ts`,
is 332 and sits just above the ~300 soft target.

**Modified (5, all one-to-three-line extensions)**

```
backend/src/middlewares/requireContentEntitlement.ts   GatedFeature union += 'portfolio'
backend/src/server.ts                                  mount careerPortfolioRoutes
frontend/src/components/paywall/gatedFeatures.tsx      GatedFeatureKey += 'portfolio' + copy + icon
frontend/src/routes/portalRoutes.tsx                   /portal/portfolio behind <PageGate>
frontend/src/pages/portal/today/PortalShell.tsx        Portfolio nav: soon → real gated link
```

**Schema/migrations: NONE.** No table, column, migration or seed was added.

## API added

```
GET /api/portal/career/profile
    requireParticipant → requireContentEntitlement('portfolio') → handler
    subject = req.participant.sub only (no id/slug parameter anywhere)
```

## Verification — exact commands and results

### Backend typecheck
```
cd backend && node ./node_modules/typescript/bin/tsc --noEmit     # tsc 5.9.3
→ EXIT 0, zero errors
```

### Frontend typecheck
```
cd frontend && node ./node_modules/typescript/bin/tsc --noEmit    # tsc 5.9.3
→ EXIT 0, zero errors
```

### Unit tests (new)
```
cd backend && node ../node_modules/jest/bin/jest.js --config jest.config.ts src/services/career
→ Test Suites: 2 passed, 2 total
  Tests:       36 passed, 36 total
```

### Regression fence (pre-existing, re-run unchanged)
```
contentEntitlement · requireContentEntitlement · portfolioShareService · portfolioGenerationService
→ Test Suites: 4 passed, 4 total · Tests: 32 passed, 32 total
```

### Frontend production build
```
npm run build:frontend
→ EXIT 0 — "The build folder is ready to be deployed."
```
Run because CI gates `frontend-build` separately from `frontend-typecheck` (a typecheck is not a
build — see the comment at `.github/workflows/ci.yml:44`). Confirmed the Career Studio actually
reached the bundle rather than merely compiling: the lazy chunk containing its markup
(`build/static/js/3912.444b32ac.chunk.js`) carries the page's own class names.

## Browser proof

**None.** No Playwright run, no screenshots. Plan §65/§66 require both, and neither was produced:
doing so needs a running stack seeded with a paid learner who has a resume, CAPE evidence,
artifacts and a connected repo, which was not stood up in this session. The UI's data contract is
unit-tested and both stacks typecheck; **the rendered page has not been looked at.** That is the
single largest gap in this increment and should not be described as anything smaller.

## Backward compatibility

- `/portfolio/share/:token` and `GET /api/public/portfolio/:token` — untouched, test still green.
- `PortfolioResult` shape — unchanged; all 10 consumers intact.
- `runtime_portfolio_artifacts` auto-generation — untouched.
- CAPE ledger and proficiency recompute — read-only consumption, no writes.
- Nav: `Cert Prep` remains the only `soon` item; `Portfolio` became a real gated destination and
  therefore also appears in the mobile tab bar (which filters on `to && !soon`).

## Privacy / security

- Every route is self-scoped to the session subject; no route takes an identifier.
- Resume **content** is never projected — filename and timestamp only.
- Nothing publishes; there is no public surface, slug, or snapshot.
- The resume prerequisite is a server-side branch that returns before any evidence is read,
  proven by a test asserting the adapters are never invoked.

## Known risks

1. **No visual verification.** See Browser proof — this is the largest remaining gap.
2. **`skillAdapter`'s grouped aggregate has never executed against Postgres.** It is typechecked
   and its consumers are unit-tested against fixtures, but the SQL itself is unproven at runtime.
3. **Paywall ships inert.** `CONTENT_PAGE_GATE_ENABLED` is default-off, so today every
   authenticated participant reaches the Studio. The resume prerequisite still applies. This
   matches Classroom/Projects exactly and is deliberate, but it means the paywall path is
   untested in a live environment.
4. **`delivery_verified` is unreachable**, so one third of the evidence model has no runtime
   coverage. Note this changed mid-session: the Refactored delivery **schema** landed on main
   while this was being built (merged in before push). The level is still unreachable because
   the tables are empty — nothing writes `DeliveryProjectMember` or `DeliveryDecision` yet — and
   because delivery membership is keyed on `platform_identity_id` rather than `enrollment_id`,
   a bridge that is not yet documented. `deliveryAdapter` remains the seam. See
   `REFACTORED_INTEGRATION_MAP.md`.
5. **Gates were re-run after merging `origin/main`**, not only against the branch point, since
   that merge introduced new backend models and a boot-time schema step.

## Deferred work

Gates 4, 5, 6, 9b, 10, 11, 12, 13, 14, 15 — see the gate table above and `KES_REUSE_MAP.md` for
which Kes components map to each. The plan's §72 "legitimate deferrals" list covers most of them;
the ones it calls non-deferrable (versioned publication, recruiter-facing portfolio) are the
public half of the product and are **not** claimed as complete here.
