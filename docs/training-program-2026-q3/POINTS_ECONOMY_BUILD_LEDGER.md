# Points Economy Build — Loop Architect State Ledger

> **Process:** Loop Architect (BC#10028907149). Maker/checker separation; a separate verifier scores each iteration; the maker never grades its own work. Hard stop conditions only.
> **Session:** CC-20260721-g8k4 · **Branch:** `workstream/points-economy` (cut from `main` @ 403b79f9) · **DRI:** Ali.
> **Design source of truth:** [POINTS_ECONOMY_AND_ARCHITECT_LADDER.md](./POINTS_ECONOMY_AND_ARCHITECT_LADDER.md).
> **Scope decision (Ali, 2026-07-21):** Option A — map onto the existing competency/evidence promotion as the real Architect gate; add the missing PAID gate so evidence is paid-only; reconcile the 3 disagreeing level tables into one 5-band ladder; keep the single summed points total for the gamey HUD/leaderboard; add daily caps. Do NOT build a parallel 3-currency builder-floor.

---

## LOOP SPECIFICATION

- **Goal:** Ship the reconciled points economy + 5-band Architect ladder onto the live platform without regressing the points/community subsystem, closing all 8 planned phases (building only what `main` doesn't already have).
- **Inputs:** The 8 phases (below) as loop items; the current `main` code; the design spec; the scout report of what's already built.
- **Outputs:** Per phase — committed code on `workstream/points-economy`, a PROGRESS.md entry, CI green, deployed to dev. Final: a PR + prod deploy after-hours.
- **State:** This ledger (per-phase status + verifier verdict), the git branch, the PR.
- **Success criteria (per phase):** implements the phase's intent; matches repo conventions; idempotent + failure-first per CLAUDE.md; flag-gated where blast radius is non-trivial; passes the separate Verifier ≥ 8/10 with no 0; CI green (tsc + jest + secret scan).
- **Verification:** A SEPARATE checker subagent grades each phase against the rubric (never the maker). CI is the build/test gate (local tsc/jest unavailable on this Windows host). Dev deploy = runtime gate.
- **Stop condition(s):** all 8 phases pass verification + on dev → HUMAN GATE (Ali looks at dev); then prod after-hours → HUMAN GATE (Ali looks at prod). OR iteration cap. OR a phase fails verification twice → flag for human.
- **Iteration cap:** 3 maker→checker retries per phase (CLAUDE.md stall rule), 8 phases.
- **Human gates:** (1) design approved ✅; (2) dev review after backend+data phases land on dev; (3) prod review after after-hours prod deploy.
- **Execution assumptions (stated, not asked):** flag-gate any behavior change that could affect live users (default OFF); deploy to **dev** autonomously (dev is safe anytime); prepare prod but deploy after-hours then surface; rebase on `main` before PR merge (concurrent instances active); commit only files this build touches; every code phase gets a PROGRESS.md entry tagged CC-20260721-g8k4.

## VERIFIER RUBRIC (code-adapted, run by a separate agent)
Score each 0–2 (0 fail / 1 partial / 2 pass). PASS = total ≥ 8 AND no 0.
1. **On-goal** — does it accomplish the phase's stated intent?
2. **Correctness** — logic sound; types consistent; no obvious runtime break (checker reads, since local tsc is unavailable).
3. **Safety** — idempotent, failure-first, flag-gated where required; can't harm live users if imperfect.
4. **Conventions** — matches existing repo patterns (models/routes/services/middleware/tests); no scope creep into unrelated files.
5. **No-defects** — no placeholders, secrets, broken imports, or governance violations (CLAUDE.md).

---

## STATE LEDGER

Status: TODO · MAKING · CHECKING · PASS · DEV · PROD · DONE(already on main)

| # | Phase | Exec order | Status | Verifier | Notes |
|---|---|---|---|---|---|
| 0 | Branch reconciliation | — | **PASS** | n/a | Worktree + branch `workstream/points-economy` @ main 403b79f9 |
| 2 | Paid/entitlement gate on build routes (flag-gated) | **1** | **PASS → committed** | **10/10** | New `requireBuildEntitlement` mw, flag `BUILD_PAID_GATE_ENABLED` default OFF, fail-open, scoped to `/api/portal/project/*`. Follow-up: `GET /project/evaluation` registered before the gate (read-only, non-blocking) |
| 3 | Reconcile 3 level tables → one 5-band ladder + rename | 2 | **PASS → committed** | **10/10** | New pure `bandLadder.ts` (`computeBand`): free bands from points, build bands from competency promotion; invariant "points alone never exceed AI Enabled" test-locked. Additive `band` field; ladder-B reconcile behind `COMMUNITY_LEVEL_USE_CANONICAL` (OFF). Display rename deferred to Phase 5 |
| 4 | Anti-cheat: daily caps + post-quality gate | 3 | **PASS → committed** | **10/10** | `dailyCap.ts` (ambient 100/day, community 75/day) + post-quality gate (post +5 on first peer like), flags `POINTS_DAILY_CAPS_ENABLED` / `COMMUNITY_POST_QUALITY_GATE_ENABLED` (OFF). 3 caps-ON follow-ups noted. Shared `centralDate.ts` breaks streak↔points cycle |
| 1 | Curriculum-type L/B/C value re-tune | 4 | TODO | — | Low priority under Option A (ledger sums to one total); align to design table |
| 5 | Frontend re-skin to 5 bands + locked-door/upgrade card | 5 | TODO | — | HUD/leaderboard/level badge already built; rename + add gate UI |
| 7 | Emit BuildManifest telemetry | 6 | TODO | — | ingest pipeline already built; emit on our changes |
| 6 | Rooms/community award wiring | — | **DONE** | n/a | Already live on main (posts/comments/likes/recognition/attendance award) |

_Updated after every iteration._
