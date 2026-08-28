# Baseline Test Results (Checkpoint A)

**Purpose:** confirm the repo is green *before* any Checkpoint B code is written, so any future regression is attributable. No code was changed to produce these results — this is a read of the existing `origin/main` state (`7a0ad328`) from the `research/ai-workforce-management-checkpoint-a` worktree.

All commands run from `C:\Users\ali_m\ai-workforce-mgmt-wt` (fresh worktree — `npm ci` was required first; this worktree had no `node_modules` installed).

## 1. Dependency install

```
npm ci
```
**Result:** exit code 0.

## 2. Backend typecheck (backend/CLAUDE.md's mandatory minimum gate)

```
cd backend && npx tsc --noEmit
```
**Result:** exit code 0, no output. `tsc --noEmit` prints nothing on success — a clean exit with empty output is the pass signal.

## 3. Frontend typecheck (frontend/CLAUDE.md's mandatory minimum gate)

```
cd frontend && npx tsc --noEmit
```
**Result:** exit code 0, no output. Same pass signal as above.

## 4. Relevant jest suites

Scoped to every test file directly touching the systems this checkpoint's architecture proposal depends on (org chart / reports-to, the real live-agent registry, and Trust registry health) — not the full backend suite, since Checkpoint A changed no code and a full-suite run is orthogonal to this proposal's own baseline.

```
cd backend && npx jest \
  src/services/workforce/__tests__/orgChartHierarchyService.test.ts \
  src/services/workforce/__tests__/orgChartTaskAssignmentService.test.ts \
  src/services/__tests__/trustMetricsService.registryHealth.test.ts \
  src/services/__tests__/agentRegistryAuditClassification.test.ts \
  src/services/workforce/__tests__/liveAgentsService.test.ts \
  src/services/workforce/__tests__/liveAgentsTimelineService.test.ts \
  src/services/workforce/__tests__/org.test.ts \
  --silent
```

**Result (real output, verbatim):**
```
PASS src/services/__tests__/agentRegistryAuditClassification.test.ts (12.14 s)
PASS src/services/workforce/__tests__/org.test.ts (12.153 s)
PASS src/services/__tests__/trustMetricsService.registryHealth.test.ts (31.399 s)
PASS src/services/workforce/__tests__/orgChartTaskAssignmentService.test.ts (31.464 s)
PASS src/services/workforce/__tests__/liveAgentsTimelineService.test.ts (31.516 s)
PASS src/services/workforce/__tests__/liveAgentsService.test.ts (31.889 s)
PASS src/services/workforce/__tests__/orgChartHierarchyService.test.ts (31.902 s)

Test Suites: 7 passed, 7 total
Tests:       76 passed, 76 total
Snapshots:   0 total
Time:        40.067 s
```

Non-blocking warning noted (not a failure): `ts-jest[config] (WARN) "isolatedModules" is deprecated` — a pre-existing `tsconfig.json` config item, unrelated to this checkpoint, not fixed here since Checkpoint A makes no code changes.

## 5. Playwright / E2E

**Not run — no existing Playwright coverage targets `/admin/agents/:id`, `agentGovernanceRoutes`, or the org-chart hierarchy service** (confirmed by the absence of any matching spec under `tests/systemV2/` during discovery). No E2E baseline exists to capture. This is itself a finding: `TEST_PLAN.md`'s proposed E2E specs (`manager-views-agent-team.spec.ts` etc.) will be genuinely new coverage, not an extension of an existing spec.

## Summary

| Gate | Command | Result |
|---|---|---|
| Backend typecheck | `npx tsc --noEmit` (backend/) | ✅ PASS (exit 0) |
| Frontend typecheck | `npx tsc --noEmit` (frontend/) | ✅ PASS (exit 0) |
| Relevant jest suites | 7 suites, see above | ✅ 76/76 PASS |
| Playwright baseline | N/A | No existing coverage of this surface |

**The repo is green on every gate this checkpoint's scope touches, before any Checkpoint B work begins.**
