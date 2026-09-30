# Session CC-20260826-r4k8

**Date:** 2026-08-26
**Branch:** `docs/repo-readme-coverage` (cut from `origin/main`)
**Scope:** Repository-wide README coverage, to make the codebase legible for case study authoring.

---

- [x] Repo-wide README creation and refresh
  - Date: 2026-08-26
  - Session: CC-20260826-r4k8
  - What changed: Added 16 new READMEs and rewrote 2 existing ones, covering every top-level directory and the largest backend subtrees. `main` previously had **no root README** and 20 READMEs total, most of them inside `apps/`, `gov-bid-builds/`, and `docs/` subfolders.
  - Verification: Automated link checker over all 18 files — **225 markdown links, 0 broken**, resolved against `git ls-files` on `origin/main`. Separate identifier sweep confirmed every cited service, model, route, and component resolves to a real file on main; the only survivors are env vars, DB column names, and React APIs. Both checkers were self-tested against deliberately bad input before being trusted.
  - Notes: Documentation only. No source, config, or infrastructure changed.

## Files created

| File | Covers |
|---|---|
| `README.md` | Root front door: problem statement, runtime topology, governance layers, repo map, quickstart, subsystem primers, scale table, deploy notes |
| `backend/README.md` | Stack, directory map, request flow, mount-order rules, route surface |
| `backend/src/services/README.md` | 1,726 files across 18 feature subtrees plus capability clusters |
| `backend/src/intelligence/README.md` | 529 files; the System State Engine's ~40 modules |
| `backend/src/models/README.md` | 404 models by domain; the three-edit rule for column changes |
| `backend/src/routes/README.md` | 167 route files; the two mount-order traps |
| `backend/src/scripts/README.md` | 531 scripts by verb prefix; Mandrill and idempotency patterns |
| `frontend/README.md` | Three surfaces, portal/admin sub-structure, build-breaking gotchas |
| `docs/README.md` | Index for 937 files across ~27 subdirectories |
| `scripts/README.md` | CB System, capture pipeline, PR review automation, safety guards |
| `intelligence/README.md` | Python Flask engine: discovery, orchestrator, ML, vectors, migrations |
| `nginx/README.md` | Multi-stage build, security headers, the `try_files` header-loss trap |
| `tests/README.md` | Where the 1,099 tests live and how the browser E2E layer actually runs |
| `system/README.md` | Auto-generated state; the manifest-not-edit workflow |
| `preview-db-init/README.md` | Preview stack init and its Docker-socket security note |
| `execution/README.md` | Retired layer; where the work went |

## Files rewritten

| File | Change |
|---|---|
| `directives/README.md` | Was 6 lines. Now indexes all 13 directives, the 7 required sections, naming rules, and the skill-vs-directive distinction. |
| `scripts/ops-engine/README.md` | Documented a superseded script set. Rewritten around the current engine: the three cron processes, the reply-sanitizer pipeline, `cb-control` (kill switch), `cb-quality-audit`, `cb-replay`, and `cb-lessons.md`. |

## Process note: the stale-checkout trap

The work was first written against the OneDrive working tree, which turned out to be **~3,000 commits behind `origin/main`**. Verification passed cleanly there, because the checkers resolved against that tree.

Re-running the same checkers against `origin/main` exposed the problem: main is roughly twice the size, and several claims were materially wrong.

| Claim (stale tree) | Reality on main |
|---|---|
| ~3,500 tracked files | ~7,150 |
| 106 test files; "E2E layer does not exist" | 1,099 test files; 8 working browser E2E scripts in `tests/systemV2/` |
| `services/` 518 files | 1,726, with 18 feature subtrees absent from the old tree |
| `frontend/src/pages/project/` documented | Directory does not exist on main |
| `scripts/commission/` documented | Not on main |
| `config/` documented | Not on main; the README for it was dropped |

Every count and structural claim was then re-derived from `git ls-files` on main. **The lesson worth keeping: verifying against the checkout you happen to be sitting in proves nothing about the branch you are merging into.**

## Discrepancies found and recorded

Documented truthfully rather than papered over:

1. **The browser E2E layer runs outside CI.** `tests/systemV2/` holds eight raw-Playwright scripts invoked by hand with `node` via `PW_PATH`. There is no `@playwright/test` and no Playwright config, and they are not wired into `npm test`. The practical merge gate is `tsc --noEmit` plus Jest.
2. **Test distribution is not the pyramid `CLAUDE.md` describes** — 1,099 files, overwhelmingly service-level unit tests.
3. **`backend/src/middlewares/` is plural**; `backend/CLAUDE.md` documents it singular.
4. **`execution/` is empty** (`.gitkeep` only), retired at the Node migration.
5. **The public-routes-before-`adminRoutes` trap is real and now test-pinned** — `publicCaseStudyRoutes.test.ts` asserts 200 above / 401 below against an `adminRoutes`-shaped stand-in, so the failure mode is caught by a test rather than a comment.

## Not done

- `apps/`, `packages/`, and `gov-bid-builds/` READMEs left untouched — the first two already carry their own per-app READMEs and `EXTRACTION.md` files; the third is scoped to extractable projects.
- `CLAUDE.md` inaccuracies (the `middleware/` naming, the aspirational test pyramid) were recorded here and in the relevant READMEs but not edited, since `CLAUDE.md` is DRI-owned.
