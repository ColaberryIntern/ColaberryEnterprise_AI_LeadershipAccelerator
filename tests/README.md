# Tests

**1,099 test files** repo-wide. Most of them live next to the code they test, not in this directory.

This directory holds the browser-driven end-to-end layer. Unit and integration tests are colocated in `__tests__/` folders throughout `backend/` and `frontend/`.

Local conventions: [CLAUDE.md](CLAUDE.md).

---

## Where the tests are

| Location | Files | What |
|---|---|---|
| `backend/src/services/**/__tests__/` | 537 | Service unit tests — the bulk of the suite |
| `backend/src/__tests__/` | 185 | Backend integration and cross-cutting |
| `frontend/src/pages/**/__tests__/` | 77 | Page-level tests |
| `backend/src/scripts/` | 68 | Script tests |
| `backend/src/intelligence/**/__tests__/` | 49 | Intelligence layer |
| `backend/src/routes/**/__tests__/` | 41 | Route tests |
| `frontend/src/components/` | 30 | Component tests |
| `backend/src/db/__tests__/` | 24 | Schema-ensure guards |
| `backend/src/controllers/` | 13 | Controller tests |
| `frontend/src/utils/`, `backend/src/modules/` | 24 | Utility and module tests |
| `scripts/ops-engine/__tests__/` | 6 | CB System guards |
| `tests/systemV2/` | 8 | Browser E2E (this directory) |

```bash
npm test                  # all workspaces
npx jest                  # backend, from backend/
npx tsc --noEmit          # the merge gate, both packages
pytest ai_engine/tests/   # python engine, from intelligence/
```

The `backend/src/db/__tests__/` suite is worth knowing about: each `ensure*Schema.test.ts` guards a schema-ensure migration, so schema drift fails a test rather than surfacing in production.

---

## `systemV2/` — browser E2E

| File | Proves |
|---|---|
| `caseStudyAdmin.e2e.js` | Authenticated review desk at `/admin/case-studies` |
| `caseStudyPublic.e2e.js` | Public case study surface |
| `pointsEarnFlow.e2e.js` | The portal points loop: card completion awards exactly the badge value, `GET /api/portal/points` rises by that amount, and the top-bar HUD renders the new total |
| `ecosystemIsolation.e2e.js` | Tenant/ecosystem isolation |
| `resolveWorkTabSmoke.e2e.js` | Resolve work tab smoke test |
| `v2-page-health.js` | Visits every route **both** directly and via client-side navigation |
| `storyHeroMeasure.js`, `storyVisualReview.js` | Story surface measurement and visual review |
| `logs/run-1.md` | Historical run log |

### How these run — read before adding one

**Raw Playwright driven by `node`. There is no `@playwright/test` and no `playwright.config.*` in this repo**, and adding one would make these files unrunnable the way the others are run.

Each script requires Playwright through a module specifier in `PW_PATH`:

```js
const { chromium } = require(process.env.PW_PATH);
```

So they are invoked directly:

```bash
PW_PATH=<path-to-playwright> node tests/systemV2/pointsEarnFlow.e2e.js
```

They are **not** wired into `npm test`, which runs the workspace Jest and CRA suites. These are run deliberately, against a live target.

`v2-page-health.js` encodes a real lesson: it visits each page both by direct load and by client-side navigation, because a reveal bug appeared only on client-side navigation and a direct-load-only check missed it entirely.

---

## Conventions

- **Match the existing shape.** Raw Playwright via `require(process.env.PW_PATH)`, run with `node`. Do not introduce a test runner here without deciding what happens to the eight existing scripts.
- **One file per user journey**, not per page.
- **Prefer `data-testid` selectors.** CSS classes and text content break under normal UI churn.
- **Clean up after yourself.** A test that creates a project deletes it. No orphaned data.
- **Never point at production.** These drive a live target; the base URL must be staging or local unless explicitly overridden.
- **Fix or delete flaky tests.** A flaky test is worse than no test, because it teaches the team to ignore red.

What does not belong here: unit tests (colocate them in `__tests__/`), one-off diagnostic scripts (`backend/src/scripts/`), and disabled tests (delete them).

---

## Honest status

The test count is high and the schema guards are genuinely strong, but the distribution is not the 70/20/10 pyramid described in [../CLAUDE.md](../CLAUDE.md) — it is overwhelmingly service-level unit tests, with eight browser E2E scripts that run outside CI and outside `npm test`.

The practical merge gate on any change is `tsc --noEmit` plus the Jest suites. Browser-level regression coverage exists but is invoked by hand.

Screenshot capture for review docs is a separate concern — see [../scripts/README.md](../scripts/README.md).
