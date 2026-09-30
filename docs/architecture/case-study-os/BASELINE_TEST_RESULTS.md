# Case Study OS — Baseline Test Results

**Gate 0 deliverable (spec §4).** The measured pre-implementation state of this worktree, recorded
before a single line of Case Study OS code was written.

**The headline, stated plainly: the baseline is fully clean. Zero TypeScript errors on the
backend, zero on the frontend, and a clean dependency install. Therefore any error that appears
from this point forward was introduced by this build and cannot be dismissed as pre-existing.**

---

## 1. Environment

| Property | Value |
|---|---|
| Worktree | `C:/Users/ali_m/casestudy-os-wt` |
| Branch | `workstream/case-study-os` |
| Base commit | **`cfd016d9`** (`cfd016d98ec23a39542493b7bb4334d023e3db26`) = `origin/main` |
| Base commit subject | `Merge pull request #1713 from ColaberryIntern/workstream/auth-failure-visibility` |
| Working tree at measurement | **clean** — `git status --porcelain` returned no output |
| Date | 2026-08-22 |
| Platform | Windows 11 Pro, Node 20 |

### 1.1 Why this worktree and not the OneDrive checkout

The primary OneDrive checkout of this repository was measured at **2,673 commits behind
`origin/main`, 76 ahead**, with 795 untracked and 63 modified files belonging to other concurrent
sessions. Per this project's own recorded history, editing that tree and opening a PR from it
silently reverts whole subsystems — a previous pass destroyed a full implementation by PR-ing
against a stale pre-RBAC `AuthContext.tsx`.

All Case Study OS work therefore happens in an external worktree at
`C:/Users/ali_m/casestudy-os-wt`, created off `origin/main`. It is deliberately **outside**
OneDrive: nested worktrees under a synced folder have repeatedly lost their `.git` metadata under
concurrent load. **The OneDrive tree is not touched by this run.**

---

## 2. Toolchain versions — and the one that must never be used as a gate

| Location | Declared in `package.json` | Installed in this worktree |
|---|---|---|
| repo root | **not declared** | **TypeScript 4.9.5** |
| `backend/` | `typescript: ^5.7.3` (devDependency) | **TypeScript 5.9.3** |
| `frontend/` | `typescript: ^5.7.3` (devDependency) | **TypeScript 5.9.3** |

Verified by reading `node_modules/typescript/package.json`,
`backend/node_modules/typescript/package.json`, and
`frontend/node_modules/typescript/package.json`.

### The root 4.9.5 must never be used as the gate

The root TypeScript is **4.9.5**, hoisted by `react-scripts@5.0.1` and pinned in the root
`package-lock.json`. Running `npx tsc --noEmit` from the repository root resolves that compiler and
**reports a clean tree on code that TypeScript 5.9 rejects** — a false clean, not a pass.

Both baseline typechecks below were therefore run with the **explicit local compiler path**,
which cannot resolve anywhere else:

```bash
cd backend  && ./node_modules/.bin/tsc --noEmit
cd frontend && ./node_modules/.bin/tsc --noEmit
```

`npx` from inside `backend/` usually resolves the local 5.9.3, but `npx` walks upward and can fall
through to the root binary. The explicit path removes the ambiguity. CI achieves the same result
via `working-directory:` in `.github/workflows/ci.yml`.

**Rule for the rest of this build: every typecheck claim must come from
`./node_modules/.bin/tsc --noEmit` run inside `backend/` or `frontend/`. A typecheck run from the
repo root is not evidence of anything.**

---

## 3. Measured baseline results

| # | Gate | Command | cwd | Result |
|---|---|---|---|---|
| 1 | Dependency install | `npm ci` | repo root | **exit 0** |
| 2 | Backend typecheck | `./node_modules/.bin/tsc --noEmit` (TypeScript **5.9.3**) | `backend/` | **exit 0 — zero errors** |
| 3 | Frontend typecheck | `./node_modules/.bin/tsc --noEmit` (TypeScript **5.9.3**) | `frontend/` | **exit 0 — zero errors** |

### 3.1 Detail

**`npm ci` at the repository root — exit 0.**

Run at the root only. This repository is an npm workspaces monorepo
(`workspaces: ["frontend","backend"]`), and running a per-package `npm install` inside `backend/`
or `frontend/` prunes the sibling workspace's dependencies and can leave a phantom module graph.
The root install is the correct and only supported form.

**Backend typecheck — exit 0, zero errors.**

`backend/tsconfig.json`: `strict: true`, `target: ES2022`, `module: commonjs`, `rootDir: ./src`,
`outDir: ./dist`, and — importantly — `exclude: ["node_modules", "dist", "**/*.test.ts",
"**/__tests__/**"]`.

**Backend test files are NOT typechecked by `tsc --noEmit`.** A type error inside a backend test
surfaces only when jest runs it. This is a scope limit on the baseline, not a defect: it means a
clean backend typecheck says nothing about the type health of `__tests__/` files, and any new
backend test must be validated by running it, not by typechecking.

**Frontend typecheck — exit 0, zero errors.**

`frontend/tsconfig.json`: `strict: true`, `noEmit: true`, `jsx: react-jsx`,
`isolatedModules: true`, `include: ["src"]`.

**Frontend test files ARE typechecked.** A type error in `frontend/src/**/__tests__/*.tsx` fails
this gate. Two different surfaces, two different failure modes — plan for both.

---

## 4. What this baseline means

**It is fully clean. There are no pre-existing TypeScript failures to separate out.**

Spec §4 asks for pre-existing failures to be distinguished from new ones. On this baseline that
separation is trivial, and the consequence is strict:

> **Any TypeScript error appearing after this point was introduced by the Case Study OS build.
> There is no pre-existing failure to attribute it to. "That was already broken" is not available
> as an explanation for a typecheck failure in this workstream.**

The same applies to the dependency graph: `npm ci` at the root exits 0 on `cfd016d9`, so an
install failure later in this build is caused by a dependency this build added or a lockfile this
build touched.

---

## 5. Gates not measured at Gate 0, and why

Gate 0 is discovery only. The remaining gates were deliberately not executed at baseline; the
reasons are recorded so that no later reader mistakes an unmeasured gate for a passing one.

| Gate | Command | Why not measured now | Expected value from the repo's own records |
|---|---|---|---|
| Backend jest (CI set) | `cd backend && npx jest -c jest.ci.config.ts --ci` | Long-running; no Case Study code exists to regress | `backend/jest.ci.config.ts` records a measured **589 suites / 588 passed / 1 skipped / exit 0** (the skip is the one opt-in real-Postgres suite). The full suite is 614 with 25 failures — those 25 are exactly the DB-touching suites in `testPathIgnorePatterns` (`:45-81`) |
| Frontend tests | `cd frontend && CI=true npx react-scripts test --watchAll=false` | **No CI job runs these**, so there is no automated baseline to compare against. Must be run manually and recorded when frontend tests are added | unknown at baseline |
| Frontend production build | `CI=true npm run build:frontend` | Not required to establish the type baseline | `frontend-build` is a green CI job on `main` |
| Backend build | `npm run build:backend` | `tsc --noEmit` already proves the type gate | expected clean |
| Route-auth lint | `node scripts/lint-route-auth.js` | No new admin route file exists yet | expected pass |
| Secret scan | `node scripts/secret-scan.js` | Runs per-commit via `.githooks/pre-commit` and per-PR in CI | expected pass |
| Playwright `tests/systemV2/*` | `node tests/systemV2/<file>.e2e.js` | Requires a running local stack; no Case Study UI exists yet | not applicable at baseline |

**When any of these is first run during this build, its result is recorded in `PROGRESS.md` with
concrete evidence — the CI-set jest count and exit code, or the build's exit code — never as an
assertion of intent.**

---

## 6. Reproducing this baseline

```bash
cd /c/Users/ali_m/casestudy-os-wt

git rev-parse --abbrev-ref HEAD          # workstream/case-study-os
git rev-parse --short HEAD               # cfd016d9
git status --porcelain                   # (empty)

npm ci                                   # root only — never per-package

cd backend  && ./node_modules/.bin/tsc --noEmit && echo "backend  OK"
cd ../frontend && ./node_modules/.bin/tsc --noEmit && echo "frontend OK"
```

Confirm the compilers before trusting the result:

```bash
cd backend  && ./node_modules/.bin/tsc --version   # Version 5.9.3
cd frontend && ./node_modules/.bin/tsc --version   # Version 5.9.3
```

If either reports **4.9.5**, the wrong binary was resolved and the result is meaningless.

---

## 7. Baseline summary

```text
Worktree           C:/Users/ali_m/casestudy-os-wt
Branch             workstream/case-study-os
Base commit        cfd016d9  (origin/main)
Working tree       clean

npm ci (root)                                          exit 0
backend  ./node_modules/.bin/tsc --noEmit  (TS 5.9.3)  exit 0   ZERO ERRORS
frontend ./node_modules/.bin/tsc --noEmit  (TS 5.9.3)  exit 0   ZERO ERRORS

root TypeScript is 4.9.5 — NEVER use it as the gate (false clean)

Pre-existing failures to carry forward:  NONE
```

**The baseline is fully clean. Any error appearing later is introduced by this build.**
