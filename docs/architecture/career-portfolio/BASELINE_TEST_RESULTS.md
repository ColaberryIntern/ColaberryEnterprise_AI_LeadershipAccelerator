# BASELINE_TEST_RESULTS (Gate 0)

Captured **before** any feature code was written, on the clean worktree.

**Base SHA:** `dead58d6` (origin/main) · **Date:** 2026-08-23 · **Session:** CC-20260823-p4k9
**Worktree:** `C:/Users/ali_m/acc-portfolio-wt` · **Node** v22.16.0 · **npm** 10.9.2

## Toolchain provenance

Dependencies installed with a single **root** `npm ci` (the repo is an npm-workspaces
monorepo; per-package installs prune the sibling workspace's hoisted deps). Exit 0.

| Compiler | Version | Used for |
|---|---|---|
| `backend/node_modules/typescript` | **5.9.3** | backend gate ✅ |
| `frontend/node_modules/typescript` | **5.9.3** | frontend gate ✅ |
| root `node_modules/typescript` | 4.9.5 (CRA pin) | **NOT USED** — resolving to this produces bogus zod/d3 `.d.ts` parse errors and can report a false clean |

## Baseline results

### Backend typecheck

```
cd backend && node ./node_modules/typescript/bin/tsc --noEmit
```

**Exit 0. Zero errors.** A genuinely clean baseline — no pre-existing `@anthropic-ai/sdk`
or `@dnd-kit` module-resolution noise, because dependencies were really installed rather
than junctioned from a stale tree.

### Existing tests touching the surfaces this build extends

```
cd backend && node ../node_modules/jest/bin/jest.js --config jest.config.ts \
  src/__tests__/services/access/contentEntitlement.test.ts \
  src/middlewares/__tests__/requireContentEntitlement.test.ts \
  src/__tests__/services/portfolioShareService.test.ts \
  src/__tests__/services/portfolioGenerationService.test.ts
```

```
PASS src/middlewares/__tests__/requireContentEntitlement.test.ts
PASS src/__tests__/services/portfolioShareService.test.ts
PASS src/__tests__/services/access/contentEntitlement.test.ts
PASS src/__tests__/services/portfolioGenerationService.test.ts

Test Suites: 4 passed, 4 total
Tests:       32 passed, 32 total
Time:        30.418 s
```

These four are the regression fence for this build: the paywall resolver, the paywall
middleware, the legacy project share link, and the frozen `PortfolioResult` shape.
