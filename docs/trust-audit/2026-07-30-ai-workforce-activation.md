# AI Workforce Activation — Trust Addendum (2026-07-30)

Addendum to the [TBI compliance audit](TRUST_COMPLIANCE_REPORT.md). Scope: the 10 `orgRegistry.ts` directors (`backend/src/services/workforce/`), activated as individually-scoped, individually-costed autonomous agents for the first time. This does **not** re-run the full 10-phase audit against the whole repo — that headline score (34/100, GO WITH CONDITIONS) is unchanged and out of scope here. This addendum scores the **new surface** only, using the same INPACT/GOALS vocabulary the audit established.

## What shipped

10 directors, each with exactly one tool and one write, gated by `backend/src/services/workforce/workforceAgentRuntime.ts`:

- 9 `write_with_audit` — one internal table each (`workforce_tasks` or `workforce_messages`). A human still has to act on the resulting row; nothing external happens automatically.
- 1 `suggest_only` (Marketing, the sole outward-facing director) — one LLM-drafted content idea per manual trigger, queued in `proposed_agent_actions`, never posted or sent.

Extends the existing Trust Command Center (`/admin/trust`) with a new "AI Workforce" section (`getAgentRoster`/`getAgentDetail` in `trustMetricsService.ts`) rather than a second dashboard.

## Governance (GOALS-G) — the mechanism this addendum is really about

The repo-wide `abac_enforcement` setting defaults to `shadow` (evaluate + log, never block — see `agentAuthorizationService.ts`). Rather than depending on that global flag, `workforceAgentRuntime.ts` adds a **local, unconditional hard gate**: `isKillSwitchActive()` / `isSafeModeActive()` / `AiAgent.enabled` are checked directly before every write or LLM call, and the check always actually blocks — independent of the shadow-mode default. This is the addendum's answer to gap-analysis.md's **P0-2** ("kill switch & safe mode don't gate actions") for this specific surface: for these 10 agents, they do, unconditionally, from day one.

**Evidence, not assertion:** `backend/src/services/workforce/__tests__/workforceAgentRuntime.test.ts` (15 tests) proves this empirically — kill switch active, safe mode active, and a disabled/paused agent each independently block the write or the LLM call (`build()` is never invoked) before any side effect occurs. Every director routes through the same two functions (`runDirectorWrite` / `runDirectorProposal`), so this is one shared, tested code path covering all 10 — not 10 separate claims to verify.

**P0-4** ("OpenClaw auto-approves social posts → enforce HITL until scored") is the other audit finding this design was built not to repeat: the one director with any outward-facing capability (Marketing) is `suggest_only`, and `agentPermissionService.validateAgentWrite()` structurally cannot let a `suggest_only` agent write anywhere except `proposed_agent_actions` — there is no code path from "content idea drafted" to "content published" without a human in between.

## Observability (GOALS-O)

Every director write and every LLM call emits `ai_events` with `agent_id` populated — for the marketing director's one LLM call, this is the **first call site in the repo** to ever populate `agent_id` on an `ai_events` row (previously only `agentAuthorizationService`'s authorization-decision events carried it; see the Phase 0 research this build was grounded in). Every write is also logged to `ai_agent_activity_logs` with a `trace_id`, giving the dashboard's drill-down a real L3 (raw event) to show, not a placeholder.

## Per-agent scoring methodology (new, this addendum)

The system-level composite score stays INPACT-scored (unchanged). Per-director scoring in the new dashboard section uses **GOALS** (Governance / Observability / Availability / Lexicon / Solid) instead, since those five axes map onto a single agent's runtime behavior more directly than INPACT's data-infrastructure dimensions do. Two of the five are **structurally fixed, not live-measured**, and the dashboard tags them as such (`source: 'fixed'` vs `'live'` in `AgentDetail.goals`, rendered with the same live/baseline badge vocabulary the rest of this file already uses) rather than presenting a false impression of continuous measurement:

| Dimension | Source | What it measures |
|---|---|---|
| Governance | fixed (5/5) | The hard gate exists and is code-verified by test — not re-measured per run, because it can't regress without the code changing. |
| Observability | live | % of that agent's last 20 logged actions carrying a `trace_id`. |
| Availability | live | Enabled + trigger type + whether it has actually run. |
| Lexicon | fixed (4/5) | Domain mapping is fixed at build time against `orgRegistry.ts` — structurally correct, not dynamically re-validated. |
| Solid | live | Failure rate over the last 20 logged actions. |

This is a deliberate, narrower methodology than the full 36-question INPACT rubric or the 6-question-per-dimension GOALS self-assessment in the TBI book — it's automatable evidence from tables that already exist, not a new manual audit process. A future full GOALS self-assessment (the book's Section 7 checklist) against this surface would be a legitimate independent exercise, not required for this addendum.

## What this addendum does NOT claim

- It does not raise the repository's 34/100 composite score — that number reflects the whole codebase and this activation touches a narrow, new, additive surface.
- It does not close gap-analysis.md's P0-1 (unauthenticated admin routes), P0-3 (PII redaction), P1-2 (the other 80+ un-instrumented LLM call sites), or any gap outside this surface.
- "Governance 5/5" and "Lexicon 4/5" per director are **fixed**, not measured — the dashboard says so, on purpose, per the file's own live/baseline/placeholder honesty rule.

## Rollout state as of this commit

All 10 directors ship activated (`enabled: true` — see PROGRESS.md for the explicit decision to skip a multi-day shadow-mode staging period, made with the operator's explicit hands-off authorization). Any director can be individually disabled via its `ai_agents.enabled` flag, or all of them at once via the existing global kill switch, without a redeploy.
