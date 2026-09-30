# TEST_PLAN (plan §67, §63)

## What is covered by automated tests in this increment

Two suites, **32 tests**, both pure/mocked — no DB, deterministic, fast.

### `careerReadiness.test.ts` (10 tests)

The readiness scorer is pure, so it is tested for real rather than mocked. A readiness number
a learner sees must be reproducible from its inputs; a test that proves determinism is what
makes "we did not let a model invent this" checkable.

| Class | Cases |
|---|---|
| Happy path | complete portfolio → 100, clears policy |
| Failure path | empty portfolio → every required item blocking, below threshold |
| Evidence-level discipline | resume-level capabilities never satisfy the verified requirement; delivery-verified ones do |
| Boundary | exactly at `min_artifacts` passes, one below blocks; whitespace-only name counts as missing |
| Policy configurability | a custom stricter policy changes both the verdict and the rendered label |
| Determinism | identical input → identical result |

### `careerProfileService.test.ts` (22 tests)

| Class | Cases |
|---|---|
| **Authorization (the important one)** | a paid learner without a resume gets `needs_resume`, empty everything, **and the evidence adapters are never invoked** — proving the prerequisite is a real boundary, not a hidden UI section |
| Happy path | resume present → `ready`, evidence assembled, readiness computed, `visibility: 'private'` |
| Failure path | unknown enrollment → 404 |
| Privacy | resume **content** never appears in the payload; only filename + timestamp |
| Publication safety | payload never reports itself as published |
| **Failure-first** | one adapter throwing degrades that section only, names itself in `degraded[]`, and the rest of the page still renders; a healthy read reports `degraded: []` |
| **AI claim safety (§57)** | no invented headline when no title is set; no seniority/contribution verbs (`Senior`, `Led`, `Architected`, `Built`, …); no percentages or currency; only true counts; nothing emitted at all when there is nothing true to say |
| Evidence-level derivation | claim-only → `resume`; no evidence → `resume`; each of knowledge/application/judgment → `colaberry_verified`; a large resume claim never outranks a small verified one |
| Recent activity | window inclusion/exclusion, null timestamps ignored, newest-first ordering, list cap |

## Regression fence (pre-existing, must stay green)

- `src/__tests__/services/access/contentEntitlement.test.ts`
- `src/middlewares/__tests__/requireContentEntitlement.test.ts`
- `src/__tests__/services/portfolioShareService.test.ts` — legacy `/portfolio/share/:token`
- `src/__tests__/services/portfolioGenerationService.test.ts` — frozen `PortfolioResult` shape

## Gates run

| Gate | Command |
|---|---|
| Backend typecheck | `cd backend && node ./node_modules/typescript/bin/tsc --noEmit` |
| Frontend typecheck | `cd frontend && node ./node_modules/typescript/bin/tsc --noEmit` |
| Frontend build | `npm run build:frontend` (CI treats this as separate from typecheck — a typecheck is not a build) |
| Unit tests | `cd backend && node ../node_modules/jest/bin/jest.js --config jest.config.ts src/services/career` |

Results in `IMPLEMENTATION_STATUS.md`.

## What is NOT covered, and why — stated plainly

- **No Playwright walkthrough, no screenshots** (plan §65, §66). These require a running stack
  with a seeded paid learner who has a resume, verified CAPE evidence, artifacts and a
  connected repo. That environment was not stood up in this session, so the UI is proven by
  typecheck + build + unit-tested data contract, **not by a browser**. Any claim that the
  Career Studio has been visually verified would be false.
- **No integration test against a real database.** The adapters' SQL (notably the grouped
  aggregate in `skillAdapter`) is typechecked but not executed against Postgres.
- **No cross-tenant test** (plan §54-K). Not because it was skipped, but because there is
  nothing to test: no route accepts an identifier, so there is no enumeration surface to probe.
  See `MULTITENANCY_PRIVACY_MAP.md`.

## Failure-first checklist (plan §63) — status

| Scenario | Status |
|---|---|
| Adapter/DB failure mid-assembly | ✅ tested — degrades section, page survives |
| Missing enrollment | ✅ tested — 404 |
| Missing resume | ✅ tested — hard prerequisite |
| Entitlement lookup failure | ✅ pre-existing — `requireContentEntitlement` fails open, already tested |
| Corrupt/unparseable resume | ⚠️ not applicable here — this increment never parses a resume, it only reads presence |
| GitHub token revoked / repo deleted | ⚠️ degrades as a section failure; not specifically simulated |
| Slug collision, publication retry, PDF timeout, reviewer double-click | n/a — those gates are not built |
