# False-Positive Elimination Plan
**Created 2026-05-19. Owner: queue / systemStateEngine. Status: ready to execute in cycles.**

## Why this exists

Across 7 walks of the operational queue today we eliminated five distinct false-positive clusters (reliability/automation, determinism, ux_exposure, improve_health, optimize_health gate, phantom pages, recursive agent_stack proposals). Each cycle followed the same pattern:

1. Ship a fix that removes one tier of noise
2. Re-walk the top 10 (or top 5)
3. Discover the next tier of noise hiding beneath
4. Repeat

After 8 commits the queue is at 45 items (40 ui_review polish + 5 agent_stack proposals). The remaining false-positive risk lives in two places:

- **Agent_stack tier**: Option B's `< 3 agents` floor surfaces stack-completion proposals that operator may dispute on a case-by-case basis (e.g., "Validation has 1 agent — does it really need a 3-agent stack?")
- **Queue gaps** the system isn't surfacing because it lacks evidence: 100+ brownfield-discovered caps with no requirements get no concrete next-step task

This plan is the durable roadmap for closing both, in priority order, without regressing the gains.

## Operating principles (locked in by today's work)

These are non-negotiable for any future task-generator change:

1. **Positive evidence, not absence of evidence.** A task fires only when there's a *concrete action the operator can take*. "Score is low" alone is insufficient — what would the operator DO to close the gap?
2. **One task type = one action.** "Improve health" was vague and got duplicated by improve_<weakest>. Each task type maps to one specific operator action.
3. **Per-dimension actionability gates layered on top of per-kind applicability.** A dimension can APPLY (count in averages) but not be ACTIONABLE (worth surfacing as a task).
4. **Cap state derived consistently across all signals.** The `is_page_bp` ↔ `kind` derivation bug taught us: every cap field that derives from heuristics must use the *same chain of signals*. Diverging derivations are systemic bugs in waiting.
5. **Cross-reference data claims at write time.** The phantom-page bug taught us: a `frontend_route` is a CLAIM that must be VALIDATED against the actual router. Same principle applies to any auto-discovered field.
6. **Conservative gates beat noisy ones.** When in doubt, gate stricter. False negatives surface in next-tier walks; false positives erode operator trust.

## Tier-1 candidates (ship this week)

### 1. Agent_stack: per-walk consistency tuning
**Status:** Option B (`< 3 agents`) just shipped with name-anywhere filter for recursive cases. The walk-5 test showed 3 real / 2 recursive — recursive ones now blocked.

**Next consistency tests** (run after deploy verifies):
- Walk the new agent_stack list (likely 3 caps after recursive filter)
- For each, confirm the suggested agent roles (monitor/alert/follow-up for pages; scheduled/queue/data-monitor for services) are appropriate
- If any test cap turns out to NOT need a stack at all (e.g., genuinely complete with its 1 agent), record the name and consider an explicit operator-set field like `agent_stack_status='complete'`

**Fallback gate adjustments if needed:**
- Dial floor from `< 3` to `< 2` (only surface caps with 0-1 agents)
- Add evidence-based filter: only surface when code_evidence shows `scheduled` OR `queue` signals AND the existing agents don't cover those roles

### 2. Surface the 100+ "brownfield caps with no requirements" problem
**Problem:** Project has 141 active caps. 129 are "system-actionable" per the accounting but only 45 surface tasks. The 84 caps with no surfaced task are brownfield-discovered code units with zero requirements attached — the system has nothing concrete to ask the operator to do.

**Options (pick one, ship in one sprint):**

| Option | Effort | Operator outcome |
|---|---|---|
| **A. Add `triage` task type** | small | Operator gets "Confirm or reject: <Cap Name>" cards. Decisions: spec it, mark verified, or delete. Drains the queue honestly. |
| **B. LLM-generated requirements** | larger | gpt-4o-mini reads cap name + linked file contents, drafts 3-5 requirements per cap. Operator reviews per cap. Unlocks implement_reqs tasks. |
| **C. Hide them from the accounting** | small | `system_actionable_count` excludes brownfield-no-req caps. Honest metric, but the work doesn't move forward. |

**Recommended:** A first (fast, simple, drains pollution). B once the project has more operator history about which caps deserve effort.

### 3. Phantom-page scanner extension to other discovery paths
**What the route-aware fix did:** `discoverFrontendPages` now validates inferred routes against React Router registry before creating page caps.

**What's still vulnerable:** Other auto-discovery scanners that create caps from filename heuristics without cross-reference:
- `commitDrivenMatcher.ts`
- `coryOrchestrator.ts` (some paths)
- `brownfield` discovery in general — any service cap auto-created from `src/services/X.ts`

**Plan:** audit each path, apply the same "validate at write time" principle. For service caps, what should be cross-referenced? Routes have a router. Services have... no obvious validation target. Possibly the agent_stack work itself: a brownfield service cap should be linked to *something* (a route, a job, an external trigger) — otherwise it might be dead code.

## Tier-2 candidates (after Tier-1 lands)

### 4. Agent role categorization
**Why:** Option C from the agent_stack discussion. Today's `< 3` count-based floor is a proxy for "stack complete." A direct measure would be: "does this cap have a monitoring agent? an alerting agent? a follow-up agent?"

**Implementation sketch:**
- New field on agent (or BP feature): `agent_role` enum {core, monitor, alert, follow_up, ingest, other}
- Either operator-tagged at agent creation OR LLM-inferred from agent file name/contents
- agent_stack generator switches from `< 3 count` to `missing required roles for this cap kind`

**Lifts:**
- Eliminates the "did operator deliberately choose 2 agents" ambiguity
- Future "build agent N for this cap" suggestions can specify the role

### 5. Maturity-aware queue prioritization
**Current state:** Queue is ranked by composite (priority*0.30 + blocking*0.25 + ...). agent_stack at 50 outranks ui_review at 25, which outranks (now-eliminated) optimization. Good.

**Gap:** When the queue has 100+ items, the operator doesn't see the *strategic* picture. "What 5 caps unlock the most downstream value if completed?" isn't a question the queue ranking answers.

**Plan:** maturity-weighted ranking. Higher rank for tasks whose completion would push the most caps over the L3 maturity threshold (or readiness ≥ 80, etc.). Compute this as part of the dependency-resolution pass.

### 6. Deep-link round-trip validation
**Current state:** ui_review task → Critique workspace → page preview. If the preview 404s, that's a UX dead-end the operator hits *after* clicking.

**Plan:** validate the preview URL at task-generation time. If it returns 4xx, EITHER:
- Don't surface the task (the cap is misconfigured — surface a triage task instead)
- OR surface the task with an inline "route appears broken: check or fix the cap's frontend_route" warning

The validation is a cheap HEAD request, cached per refresh.

## Tier-3 candidates (longer horizon)

### 7. Operator feedback loop on tasks
**Today:** task fires → operator clicks → either acts or ignores. No signal flows back to the system about whether the task was useful.

**Future:** "thumbs up / thumbs down on this task" — quick operator signal. Aggregate per task type. If a task type has >30% thumbs-down rate over N weeks, surface as a "gate is too loose" investigation.

This is the durable mechanism that replaces "ali walks 10 items every few days" with "system flags its own degraded task types."

### 8. Inter-cap dependency surfacing
**Today:** Tasks are per-cap. Dependencies between caps (e.g., "ui_review for Contact Page blocks agent_stack for Contact Page") are partially modeled in the dependency_score but not explicitly surfaced.

**Future:** A cap's task description should call out blocked downstream work. "Improve agent stack for X — unlocks 3 downstream agent_stacks once this lands."

## Cycle protocol (use for every Tier-1 ship)

1. Make the smallest change that closes ONE noise pattern
2. Add tests (positive + negative cases minimum)
3. `tsc --noEmit` + jest scoped to the affected suite
4. Commit + push + deploy
5. Force-refresh prod state (`?fresh=1`)
6. Walk the top 10 (or top 5 if change targets a small tier)
7. Tabulate: real / borderline / false-positive
8. If FP rate > 20%, ship the next tightening in the same cycle
9. Update PROGRESS.md with the walk results

## What this plan will NOT do

- **Re-architect the engine.** All fixes layer on the existing systemStateEngine, healthScorer, authoritativeTaskQueue.
- **Replace any task generator wholesale.** Tightening lives in gates, not in the core formulas.
- **Add new task types unless operator-requested.** Today's `agent_stack` was operator-driven. Future types follow the same bar.
- **Block on test-pollution flakes.** Phase11/12/13 have pre-existing DB-coupling issues unrelated to queue work. Fix when convenient, don't gate cycles on them.

## Success criteria (90-day)

- Queue items < 30 sustained
- Conversion rate (real / total) > 80% on any sampled walk
- Operator can act on every top-10 item without external context
- No task in the queue points at a broken or misconfigured target (no 404s, no nonexistent files)
- System surfaces its own gate-degradation signals (Tier-3 item 7)
