# Execution contract - template and rules

Written once per run, before planning, to `.loop-architect/runs/<run-id>/execution-contract.md`.
Everything downstream (plan, auditor, verifiers, hard-stops) reads this file as the
source of truth for scope. If a task or check isn't traceable to something in this
file, it's scope creep - log it, don't do it (CLAUDE.md Scope Lock: log the proposal,
keep working the approved scope, escalate expansion separately).

## Template

```markdown
# Execution Contract - <run-id>

## Goal
<one paragraph, in the requester's words plus what "done" means>

## In scope
- <bullet list>

## Out of scope
- <bullet list - be explicit; this is what stops scope creep mid-run>

## Repository facts (observed, not assumed)
- Deploy mechanism: <copy from SKILL.md "Repository facts", confirm still true>
- Protected branch / PR gate: <confirm from git + CI config, not memory>
- Quality gates present: <tsc/jest/playwright - confirm which actually run in this repo today>
- Relevant existing patterns to reuse: <file:line pointers, from DISCOVER>

## Assumptions (each one is a silent-assumption-allowance slot, max 5 per CLAUDE.md)
1. <assumption> - why it's safe to assume rather than ask
2. ...

## Inputs and sources
<files, APIs, data sources the build reads>

## Expected outputs and destinations
<files created/changed, DB changes, deployed services, docs produced>

## Dependencies
<external services, env vars that must exist, other in-flight branches>

## State carried between iterations
<what state-ledger.json tracks beyond the generic schema - e.g. "which of the 40 files
in the migration list have been converted">

## Per-task success criteria
<the general shape every task's acceptance criteria must satisfy - e.g. "tsc clean +
one passing test per touched service">

## Overall success criteria
<what makes the WHOLE run done, not just each task>

## Verification methods
- Unit/integration: <commands>
- E2E: <Playwright suite path, or "none exists for this surface - noted as a gap">
- Manual: <only if genuinely required - CLAUDE.md prefers code-verifiable tests>

## Production environment and deployment method
<exact command(s), confirmed against CLAUDE.md Tooling Assumptions>

## Rollback method
<redeploy last-known-good SHA <sha>, or git revert <commit> then redeploy>

## Retry limits
- Plan-audit cycles: 3
- Task attempts: 3 (per CLAUDE.md Stall Detection - 3x same failure = stop, not retry again)
- Production fix/deploy/verify cycles: 2

## Iteration cap
<if the request implies a bounded list - e.g. "convert 40 files" - state the count;
otherwise "bounded by the plan's task list">

## Time/cost guardrails
<only if the requester specified one; otherwise "none configured - proceeding without
one per repo default">

## Automatic-approval rules
- Plan auditor PASS (>=18/20, no zero) -> execution begins without a human approval step.
- Task verifier PASS (>=11/12, no zero) -> task marked complete, cursor advances.
- Production verifier PASS on all critical checks -> handoff.md is produced.
No other gate in this run requires a human to click approve mid-run.

## Hard-stop conditions
(generic list from SKILL.md, plus any repo-specific ones surfaced in DISCOVER)
- All tasks + quality gate + deploy + production verification pass.
- 3 failed plan-audit cycles.
- Any task fails 3 attempts.
- 2 failed production fix/deploy/verify cycles.
- Iteration/time/cost cap reached.
- Missing credentials/permissions/external approval/unknown prod target.
- Action would bypass a security control or CLAUDE.md governance boundary
  (see Strategic Decisions list - schema redesign, new paid external dependency,
  compliance/security posture change, prod infrastructure/environment modification
  beyond a routine app deploy, AI model class change, >25% module rewrite).
- Destructive/irreversible action outside this contract.
- Repository state changed externally in a way that invalidates the plan.
- Continuing risks data loss or an unsafe migration.
```

## Preflight question rules

Ask ONE consolidated, numbered question set, only if an answer is both (a) essential to
avoid building the wrong thing and (b) not discoverable from the repo. For each
question, propose the recommended default so the requester can just say "yes" to all.
Common answers already discoverable in THIS repo (do not ask these):

| Question the generic template suggests | Already answered here |
|---|---|
| Exact production environment / deploy command | `docker-compose.production.yml` via SSH - see SKILL.md |
| Is production deployment permitted | Yes, it's the repo's normal workflow |
| Required quality gates | `tsc --noEmit` both stacks (minimum), jest, Playwright where present |
| Protected branches / change management | `workstream/*` -> `main` via PR, 1 review + 4 checks |
| Retry/iteration caps | Defaulted to 3/3/2 above, matching CLAUDE.md Stall Detection |

Only genuinely ask about things like: a brand-new external service this build needs
that isn't in `.env.example`, an ambiguous choice between two existing patterns with
real behavioral difference, or a target environment that truly isn't inferable (e.g.
the request names a system with no existing integration in this repo).
