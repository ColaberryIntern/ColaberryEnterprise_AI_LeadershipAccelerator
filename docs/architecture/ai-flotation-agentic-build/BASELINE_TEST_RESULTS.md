# AI Flotation Agentic Build — Gate 0 Baseline Test Results

- Date: 2026-09-03
- Session: CC-20260902-m8q4
- Base: `e99fdb35` (`origin/main`), clean worktree
- Branch: `workstream/ai-flotation-gate0`

Baseline taken **before any feature work**, so later runs can be compared against a known
starting point rather than a remembered one.

## Command

```
cd backend && npx jest -c jest.ci.config.ts
```

The CI config is used deliberately. Scoped local runs miss contract suites in this repo,
so a green scoped run is not evidence the suite is green.

## Result

```
Test Suites: 1 failed, 3 skipped, 1033 passed, 1034 of 1037 total
Tests:       121 skipped, 15943 passed, 16064 total
Snapshots:   0 total
Time:        309.192 s
```

**15,943 passing tests. One suite could not run. Zero failing assertions.**

## The one failure is environmental, not a defect

```
FAIL src/__tests__/services/interviewService.test.ts
  ● Test suite failed to run
    Cannot find module '@anthropic-ai/sdk' from 'src/__tests__/services/interviewService.test.ts'
```

`@anthropic-ai/sdk` **is** declared — `backend/package.json:18`, `"^0.106.0"` — and is
**not installed** in this worktree's `node_modules`. The suite never executed, so nothing
asserted and nothing failed. CI installs the dependency and this suite passes there; every
PR merged today was green on "Backend unit tests".

Recorded rather than quietly rounded to "all green", because the next person to take a
baseline in a fresh worktree will hit exactly this and should not spend an hour on it.
Fix if it gets in the way: install workspace dependencies from the repository root.

## Also true of this machine

Local backend `tsc` **cannot be used as a signal at all**. The only TypeScript resolvable
here is the root-hoisted **4.9.5**, which fails to parse `@types/d3-dispatch` and
`zod/v4` and dies on dependency type definitions before reaching project code. CI's
"Backend typecheck" is the authority for type errors, and it has been used that way for
every change in this session.

## What this baseline is for

Any later claim that a change "broke nothing" must be measured against **15,943 passing
and one uninstalled dependency** — not against a scoped run, and not against CI alone.
