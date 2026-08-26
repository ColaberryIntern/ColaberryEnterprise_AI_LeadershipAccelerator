# Tests

**Read this before you go looking for the test suite: it is not in this directory.**

This directory holds the conventions for the end-to-end layer and one historical run log. There are **no tracked Playwright specs and no tracked Playwright config** here. The E2E layer described in [CLAUDE.md](CLAUDE.md) is a target, not a current state.

Real, running test coverage lives colocated with the code it tests.

---

## Where the tests actually are

**106 test files**, distributed:

| Location | Files | What |
|---|---|---|
| `backend/src/__tests__/` | 40 | Backend suite |
| `backend/src/intelligence/**/__tests__/` | 39 | Intelligence layer, 35 of them in `systemStateEngine/__tests__/` |
| `frontend/src/__tests__/` | 9 | Frontend |
| `backend/src/services/**/__tests__/` | 7 | Service unit tests |
| `backend/src/scripts/` | 5 | Script tests |
| `scripts/ops-engine/__tests__/` | 3 | CB System guards |
| `backend/src/routes/`, `backend/src/data/`, `frontend/src/components/` | 3 | Assorted colocated |

Plus `intelligence/ai_engine/tests/` for the Python engine (pytest; `test_discovery/` is the populated suite).

```bash
npx jest                        # backend, from backend/
pytest ai_engine/tests/         # python engine, from intelligence/
npx tsc --noEmit                # the actual merge gate, both packages
```

---

## What is in this directory

| Path | Contents |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Conventions for E2E tests, written ahead of the suite |
| `systemV2/logs/run-1.md` | A single historical run log |
| `.gitkeep` | Placeholder |

---

## Honest status

CLAUDE.md specifies a 70/20/10 unit/integration/E2E pyramid and a Playwright suite under `systemV2/`. Neither is measured today, and the E2E tier is empty. The current gate on every change is `tsc --noEmit` plus whatever colocated Jest coverage exists.

Stating that plainly is more useful than implying coverage that is not there. If you are assessing this repo — for a case study, an audit, or a decision about what to trust — **type-checking and targeted unit tests are the real safety net; browser-level regression testing is not yet in place.**

---

## Conventions for when the suite lands

From [CLAUDE.md](CLAUDE.md), still the intended design:

- **One spec per user journey**, not per page. `admin-creates-project.spec.ts`, not `admin-page.spec.ts`.
- **Selectors via `data-testid`.** CSS classes and text content break under normal UI churn; testids are an explicit contract between test and component.
- **Auth via a stored session token.** The login flow gets its own spec; every other spec reuses the saved session rather than walking the form.
- **The test cleans up after itself.** A test that creates a project deletes it. No orphaned data in staging.
- **Never point at production.** Base URL comes from `PLAYWRIGHT_BASE_URL`, defaulting to staging. Overriding to prod requires an explicit confirmation.
- **Fix or delete flaky tests within 7 days.** A flaky test is worse than no test, because it teaches the team to ignore red.

What does *not* belong here: unit tests (colocate them), one-off test scripts (`backend/src/scripts/`), and disabled tests (delete them).

---

## Related

- Screenshot capture for review docs is a separate concern — [../scripts/README.md](../scripts/README.md) and the `/screenshot-review` skill.
- Test strategy and the risk-based prioritization model: [../CLAUDE.md](../CLAUDE.md).
