# Baseline Test Results

**Session:** CC-20260823-r4k9
**Base SHA:** `d1d46d1e72ead44d6e4c04d2ca7c54966843d51e` (`origin/main`)
**Branch:** `workstream/refactored-delivery-os-gate0`
**Worktree:** `C:/Users/ali_m/refactored-os-wt`
**Date:** 2026-08-23

These numbers are the "before" line. Any change from Checkpoint B onwards is measured
against them. **No feature code was written before these ran.**

---

## Environment

| Item | Value |
|---|---|
| `node_modules` | Junctioned from `C:\Users\ali_m\accel-repo` (npm workspaces monorepo — deps hoist to root) |
| TypeScript used | **5.9.3**, invoked explicitly from `C:\Users\ali_m\Downloads\acc-github-sync-wt\backend\node_modules\typescript\bin\tsc` |
| TypeScript NOT used | The hoisted root `node_modules/typescript` is **4.9.5** (CRA's pin) |
| Jest | Root-hoisted, `node ../node_modules/jest/bin/jest.js --config jest.config.ts` |

**Why the compiler version is called out:** a bare `npx tsc --noEmit` from `backend/`
resolves 4.9.5 from the root of the workspace, which cannot parse modern `.d.ts` syntax.
It emits a few hundred parse errors inside `node_modules/zod` and `@types/d3-*` and can
report **zero** `src/` errors while never having properly checked them. A run under 4.9.5
is not a gate. The version is recorded here so this baseline carries its own proof.

---

## 1. Backend typecheck

```
cd backend
node <ts-5.9.3>/bin/tsc --noEmit
```

**Result: 2 errors, both known junction artifacts. Effectively clean.**

```
src/services/interviewService.ts(1,23): error TS2307:
  Cannot find module '@anthropic-ai/sdk' or its corresponding type declarations.
src/services/runtime/anthropicClient.ts(16,23): error TS2307:
  Cannot find module '@anthropic-ai/sdk' or its corresponding type declarations.
```

Both are the documented artifact of junctioning `node_modules` from a donor tree whose
install predates the `@anthropic-ai/sdk ^0.106.0` dependency. The package **is** declared
in `backend/package.json`; it is simply not physically present in the donor.

- Errors in `src/` attributable to the codebase: **0**
- Errors attributable to the junctioned toolchain: **2**
- CI's **Backend typecheck** job, which installs fresh, is the authoritative gate.

---

## 2. Targeted test suites

The two suites this plan must not regress: the Student Build Pipeline (the largest reuse
target) and the tenancy module (the isolation guarantee).

```
cd backend
node ../node_modules/jest/bin/jest.js --config jest.config.ts \
  src/services/sbp/__tests__ src/modules/tenancy/__tests__
```

**Result:**

```
Test Suites: 1 failed, 1 skipped, 49 passed, 50 of 51 total
Tests:       1 failed, 5 skipped, 879 passed, 885 total
Time:        103.146 s
```

### The one failure is environmental, and was verified as such

```
FAIL src/services/sbp/__tests__/docsBundle.studentFiles.test.ts
  ● the archive never lands on a student-owned path
    › carries no file at the live .colaberry/progress.json path
    thrown: "Exceeded timeout of 5000 ms for a test."
```

Re-run in isolation with a 30s timeout:

```
Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Time:        8.335 s
```

**8/8 pass in 8.3 seconds.** The failure is Jest's default 5,000 ms per-test timeout being
exceeded while the full 51-suite run saturates this machine — the suite reported 24 s
wall-clock under parallel load for work that takes 8.3 s alone. The test builds a zip
archive; it is I/O-bound and it is running against junctioned `node_modules`.

It is **not** a code defect and **not** attributable to anything in this session. It is
recorded rather than quietly re-run into a green number.

### Corrected baseline

| Measure | Value |
|---|---|
| Suites passing | **50 of 51** (51st is `skipped` by its own guard) |
| Tests passing | **879** |
| Tests failing for code reasons | **0** |
| Tests failing for environment reasons | **1** (`docsBundle.studentFiles`, passes in isolation) |
| Tests skipped | 5 |

---

## 3. Not executed

Reported as not-executed, never as passing.

| Suite | Why |
|---|---|
| Full backend Jest run | Only the two suites relevant to this plan were run. A full run is the Checkpoint B baseline |
| Frontend tests / CRA build | `react-scripts` is not installed locally; the frontend production build requires Docker |
| Playwright (`tests/systemV2`) | No running stack and no staging credentials in this environment. Same limitation the multi-tenancy Gate 0 recorded as its D-10 |
| Any database test against production | Forbidden. Master plan §20 |

---

## 4. Regression contract for later gates

Every checkpoint from B onwards must re-run §1 and §2 and show:

1. Backend typecheck: still 0 `src/` errors beyond the 2 junction artifacts.
2. SBP suites: still 879 passing, **and specifically**:
   - `planGate*` verdicts on `__tests__/fixtures/pilot-dryrun-plan.json` unchanged —
     this is the single most sensitive assertion in the reuse plan, because a changed
     gate verdict means student build behaviour just moved;
   - `materializeTasks.idempotency.test.ts` unchanged;
   - `repoWriter*.test.ts` unchanged;
   - `multiProjectIsolation.integration.test.ts` unchanged.
3. Tenancy suites: `tenantAccessGuards` and `tenantAuthorization` unchanged.

A checkpoint that cannot show these is not complete, regardless of what it built.
