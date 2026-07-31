---
name: loop-architect
description: End-to-end autonomous delivery loop for large, multi-step build requests in this repo - discover, plan, get the plan independently audited, execute one task at a time with a fresh-evidence verifier, run the full quality gate, deploy to production, get the live deploy independently verified, and hand back a plain-English testing guide. State persists to a run directory so it survives context compaction or a new session. Invoke for large multi-step builds, end-to-end features, migrations over many files, quality loops that must iterate until a measurable bar passes, or any request to plan+build+test+deploy+verify+hand off "without stopping." Trigger phrases: "use Loop Architect," "run this end to end," "keep going until it works," "build and deploy this," "complete the whole plan without stopping." Explicit invocation: `/loop-architect <task>`.
---

# loop-architect

A governed autonomous build loop for **this** repo. It does not replace `CLAUDE.md` -
it operationalizes it: the plan-auditor rubric *is* the confidence-scoring gate, the
task-verifier retry cap *is* Stall Detection (3 identical failures), the hard-stop list
*is* the Escalation Protocol, and every task the loop marks complete still needs a
`PROGRESS.md` entry under CLAUDE.md's hard gate. Read `CLAUDE.md` in full before running
this skill - it governs the run, this skill just sequences it.

Relationship to other skills in this repo: `remediate-pr` is the narrow maker/verifier
loop for *fixing one open PR*; `loop-architect` is the general-purpose loop for
*building a whole feature end to end* (plan -> build -> deploy -> verify -> handoff).
`telemetry-emission` still fires after non-trivial builds; `screenshot-review` still
runs before shipping user-facing portal UI; `story-build` still owns turning a
requirements doc into a Basecamp project. Use those directly when only their narrow job
is needed - use `loop-architect` when the ask is the whole pipeline.

## Phases (detail in `references/`)

| Phase | What happens | Reference |
|---|---|---|
| A. DISCOVER | Read `CLAUDE.md` + nested `CLAUDE.md`, inspect code/tests/CI/deploy config/git status, classify the request (finite tasks / repeated loop / quality loop / one-shot) | - |
| B. PREFLIGHT | Ask ONE consolidated question set only if something is genuinely undiscoverable and blocking; otherwise assume + log | `references/execution-contract.md` |
| C. EXECUTION CONTRACT | Write `request.md` + `execution-contract.md` to the run directory | `references/execution-contract.md` |
| D. PLAN | Small, dependency-aware, verifiable tasks in `plan.md` | `references/worked-examples.md` |
| E. PLAN AUDIT | `loop-plan-auditor` subagent scores 10 dimensions, 0-2 each; PASS >= 18/20, no zero; up to 3 cycles. **On PASS: fires the Kickoff dashboard.** | `references/plan-rubric.md` |
| F. EXECUTE | One task at a time; smallest complete change; `loop-task-verifier` grades fresh evidence, 6 criteria, 0-2 each; PASS >= 11/12, no zero; up to 3 attempts/task. **Fires the Halfway dashboard the first time passed-tasks cross 50%.** | `references/task-verification-rubric.md` |
| G. QUALITY GATE | Full repo checks - `tsc --noEmit` (both stacks), jest, Playwright where present, lint, git diff review for unrelated changes. **On green: fires the Shipping dashboard.** | - |
| H. DEPLOY | Documented prod deploy mechanism only; capture command, commit SHA, timestamp, URL in `deployment-log.md` | `references/production-verification.md` |
| I. PROD VERIFY | `loop-production-verifier` subagent checks the live release, not the local build; up to 2 fix/deploy/verify cycles. **On PASS: fires the Live dashboard alongside `handoff.md`.** | `references/production-verification.md` |
| J. HANDOFF | `handoff.md` - production link, plain-English test scenarios, regressions, limitations, troubleshooting, rollback | `references/worked-examples.md` |

State ledger schema and resume behavior: `references/state-ledger-schema.md`.

## Progress is visual, not a chat pause (`references/milestone-dashboard.md`)

This loop never pauses mid-run to narrate progress in chat, and it never asks for
routine approval between phases. Instead, at up to **5 fixed milestones**
(Kickoff -> Halfway -> Shipping -> Live, plus a conditional Blocked variant) it writes
one self-contained HTML dashboard into the run directory. `.claude/hooks/open-html.sh`
already auto-opens any `.html` file this loop writes - just writing the file is enough,
no separate "open browser" step. Every dashboard leads with a progress bar (`n of N
tasks, phase name`), an ETA, and a confidence level (mapped to CLAUDE.md's own
`>0.80 / 0.65-0.80 / <0.65` tiers), followed by what's next. Style matches
`/baseline-ui` tokens and the `docs/POST_DEPLOY_WALKTHROUGH.html` hero/summary-bar/card
pattern - this is "the right design" already established in this repo, reused rather
than reinvented. **This changes how progress is reported, not whether the loop
stops for real** - genuine hard-stops (below) still halt the run; they just render as
the Blocked dashboard instead of chat prose.

## Repository facts this skill assumes (verify at DISCOVER time - these drift)

- **Deploy mechanism:** `ssh root@95.216.199.47`, then `git pull origin main && docker
  compose -f docker-compose.production.yml up -d --build [service]` from
  `/opt/colaberry-accelerator`. Backend takes ~60-90s to bind port 3001 after a
  build - a 502 in that window is timing, not failure. Verify `HEAD` on the box equals
  `origin/main` before trusting a deploy (a dirty prod tree rebuilds stale). Never run
  two `compose ... up` invocations concurrently (race -> Cloudflare 521 / shared
  Postgres OOM cascade).
- **Protected path:** work happens on a `workstream/*` branch, merges to `main` via PR
  (1 review + 4 required checks; frontend typecheck is the authoritative frontend gate).
  Only `main` deploys to production.
- **Quality gates that exist today:** `tsc --noEmit` (backend and frontend, mandatory
  minimum), `jest` under `backend/src/**/__tests__/`, Playwright under
  `/tests/systemV2` (target coverage, not yet universal - if it doesn't cover the
  changed surface, say so rather than claiming E2E coverage that doesn't exist).
- **PROGRESS.md hard gate (CLAUDE.md, non-negotiable):** every task this loop marks
  `passed` needs a session-ID-tagged `PROGRESS.md` entry with verification evidence
  before the run's Phase G is considered satisfied. This loop does not substitute for
  that gate - it feeds it.
- **Escalation boundary (CLAUDE.md Autonomy Model):** routine app deploys (`docker
  compose up -d --build <service>` on an already-approved plan) are PROCEED-tier.
  Changes to `docker-compose*.yml`, `nginx/`, DB engine/schema redesign, new paid
  external dependencies, or anything in CLAUDE.md's Strategic Decisions list are
  ESCALATE-tier and become a hard-stop for this loop, not a task it executes silently.
- **Runtime state:** lives in `.loop-architect/runs/<timestamp>-<task-slug>/`, gitignored.
  Never put secrets in it; deploy/prod checks read credentials from the environment
  (VPS env vars), never from files this loop writes.

## Assumption defaults when the repo is silent

- Iteration caps: 3 plan-audit cycles, 3 attempts per task, 2 production fix cycles
  (matches CLAUDE.md Stall Detection's "same failure 3 times").
- No time/cost cap is configured repo-wide; if the request doesn't set one, log that as
  an assumption and proceed - do not block on it.
- Rollback default: redeploy the last known-good commit SHA with the same documented
  deploy command; `git revert` on `main` if the bad commit must not remain in history.

## Running it

`/loop-architect <describe the build>` or trigger it implicitly with the phrases above.
On invocation:
1. Mint or reuse this session's `CC-<YYYYMMDD>-<id>` per CLAUDE.md's Session Start
   Protocol (this loop's tasks still land in `PROGRESS.md` under that ID).
2. Check `.loop-architect/runs/` for an incomplete run matching this request's hash
   before starting a new one (see `references/state-ledger-schema.md` Resume Behavior).
3. Proceed through the phase table above, invoking `loop-plan-auditor`,
   `loop-task-verifier`, and `loop-production-verifier` (in `.claude/agents/`) as
   separate graders - never grade your own plan, task, or deployment. Do not pause for
   routine approval between phases; fire the milestone dashboards
   (`references/milestone-dashboard.md`) instead of narrating progress in chat.
4. Stop on any hard-stop condition (see `references/execution-contract.md`), fire the
   Blocked dashboard, and report exactly what's blocked and the exact resume command.

## Final report (every run, pass or blocked)

Plan audit score + cycles used; tasks passed/failed/blocked/skipped + retries; quality
gate result; deploy environment + commit SHA + URL; production-verification result;
path to `handoff.md`; which milestone dashboards fired and where they live; why the
loop stopped; the exact next action, if any.
