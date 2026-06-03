# AI Ops Command Center — Overnight Completion Plan

**Session**: CC-20260602-9q4r
**Authorized**: Ali, 2026-06-02, "complete this entire project without prompting me"
**Cutoff**: morning of 2026-06-03

## Scope decision

Ship the **deterministic** version of every brief surface so the entire Command Center is testable in the morning. LLM-driven scoring / autonomous-action surfaces are **deferred** — running LLM API loops overnight without human oversight violates the operating doctrine ("LLMs are probabilistic, production systems must be deterministic") + would burn budget without owner present.

## Phases

### Phase 1.4 — clear the open loops from Phase 1.3 review

- 1.4a Hide-decided toggle on `/admin/ops` queue + Run My Day so decided tasks slide off-screen in-session
- 1.4b Per-project weight knob (0.0–2.0) UI lives on the project tab nav; multiplies `urgency_score` in the scorer so high-velocity admin projects can be down-weighted
- 1.4c Stale review panel — surface the 167 hidden zombies, batch "Mark for archive" / "Mark as still-active" so they can be cleared in bulk
- 1.4d CB-managed auto-detect — set `is_cb_managed=false` for any project with zero BC activity in the last 30 days (default is too generous)
- 1.4e Trigger fix: `processDavidAdReply.js` indexed by thread-id was missing replies; rewire to sender+subject matching

### Phase 2-light — skill extraction (deterministic)

- New `ops_skills` table: id, name, action_kind, captured_at, captured_from_todo_bc_id, reasoning, decision, is_active
- When "Approve + skill" is clicked on a decision, capture the reasoning + todo metadata as a skill entry (no LLM — the human's reasoning IS the skill)
- New "Captured Skills" panel on `/admin/ops`: list, filter by action_kind, toggle active, delete

### Phase 3-light — brand compliance preflight

- New `brandComplianceService.ts` runs a regex sweep on every outbound BC comment from `approvalService`: em-dashes (already blocked, hardened), banned phrases (per Skool memory), CTA presence on appropriate categories
- Returns `{ ok, blockers: string[], warnings: string[] }` — blockers prevent send, warnings surface in UI
- Wires into the decision write-back path

### Phase 4-light — automation rules engine

- `ops_automation_rules` table: id, name, condition_jsonb, action_jsonb, is_active, last_fired_at, fire_count
- Rule executor runs on the existing 2-min cron after sync+score
- Ships with 3 v0 rules: "flag for archive if no activity >180d", "auto-categorize as waiting_dependency if no due + >7d stale" (already in scoring; this surfaces it via the rules table for visibility), "alert on overdue red urgency >14d"
- Admin UI on `/admin/ops/automation-rules` (separate route): list rules, toggle, view fire history

### Polish

- Keyboard shortcuts in Run My Day: A=approve+next, R=revise (focus reasoning), X=reject, S=approve+skill, E=escalate, J/K=next/prev task
- Responsive layout pass for laptop screens (current page is desktop-only)
- Empty-state polish

### Verification

- Playwright headless screenshots of every surface, logged in as admin
- HTML walkthrough doc with embedded screenshots
- Email Ali via `sendWithBcAttach` to ticket 9953889114

## Boundaries (autonomous-mode guardrails)

- No LLM API calls overnight
- No external emails except to Ali
- No production data writes outside `ops_*` tables
- No deploy that takes down the existing live surfaces (Phase 0/1.1/1.2/1.3/1.3.1 must remain working)
- No `git push --force`, no destructive ops, no `git reset --hard`
- No new external dependencies unless trivially small (`qs`-level)

## Definition of done

- All listed phases ship + deploy + tsc clean
- Each phase commits separately so rollback is granular
- Final commit lands the screenshots HTML report
- Email to Ali contains: report doc, every screenshot inlined as base64, BC ticket attachment

## Honesty contract

If a phase blows up under unexpected complexity I will:
1. Roll back that phase commit if it broke prod
2. Mark it as deferred in the final report with honest "what blew up"
3. Move to the next phase rather than blocking the whole sweep
