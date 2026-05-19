# tests/CLAUDE.md
**Local conventions for the automated test suite.** Root rules in `/CLAUDE.md` > Testing & Validation Rules apply.

## What lives here
End-to-end and integration tests that run against the actual stack. Per-feature unit tests live next to the code they test (`backend/src/services/__tests__/...`), NOT here.

## Directory map
| Path | What's there |
|---|---|
| `systemV2/` | Playwright E2E flows against staging/prod portal surfaces. The main browser-automation suite. |
| (other subdirs as added) | API contract tests, visual regression suites — to be filled in as those layers come online. |

## Required patterns for new Playwright tests
- **One spec file per user journey.** Not one file per page; one file per coherent flow (e.g., "first-time admin onboards a project").
- **All selectors via `data-testid`** when possible. CSS-class or text-content selectors are fragile under UI churn; testids are explicit contracts.
- **Auth via stored session token**, not by walking through the login form. The login flow itself has its own spec; downstream tests reuse the saved session.
- **Cleanup is the test's responsibility.** If a test creates a project, it must delete that project (or use a known-disposable one) on completion. No orphaned test data in staging.
- **Tests must NEVER touch production.** Hard rule. The Playwright base URL is configured via env (`PLAYWRIGHT_BASE_URL`); default points at staging. Pointing it at prod requires an explicit override AND a confirmation prompt.
- **Test files end in `.spec.ts`**, lowercase, hyphen-separated, descriptive: `admin-creates-project.spec.ts`, `participant-completes-critique.spec.ts`.

## What NOT to put here
- Unit tests. Those live next to the code: `backend/src/services/__tests__/visitorTrackingService.test.ts`.
- One-off test scripts. Those go in `backend/src/scripts/` with `test-` prefix.
- Disabled tests. Either fix them or delete them. Skipped tests rot.

## Running
- All tests: from repo root, `npm test`.
- Playwright only: `npx playwright test --config=tests/systemV2/playwright.config.ts`.
- Single spec: `npx playwright test tests/systemV2/<spec>.spec.ts`.
- Headed (for debugging): add `--headed`.

## Screenshot captures used by tests
Screenshot capture for review docs is a separate concern — see root CLAUDE.md > Screenshot Verification Safety Protocol. Capture scripts live in `scripts/`, NOT here.

## When a test is flaky
Flaky tests get fixed or deleted within 7 days. A flaky test is worse than no test because it trains the team to ignore failures. If you find one:
1. Reproduce in headed mode.
2. Add explicit waits (`waitFor(...)`) instead of arbitrary `sleep(...)`.
3. If it's a timing issue with a network call, mock the network call or add a deterministic completion signal.
4. If none of that works, delete it and open an issue.

## Test pyramid expectations
Per root CLAUDE.md > Test Strategy Framework: ~70% unit, ~20% integration, ~10% E2E. This directory is the 10%. If this directory's spec count rivals or exceeds the unit-test count, the pyramid is inverted — push assertions down to unit/integration before adding more here.
