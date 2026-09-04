# Trust & hierarchy — reference detail

Deep-detail backing for `SKILL.md`'s Step 0 and step E.5. Verified against
`origin/main` (AI Workforce Management / AI Workforce Reset work, 2026-08-18 through
2026-09-04). Pulled out here because it's lookup material, not something every
invocation needs to read start to finish.

## The `AiAgent` schema — 33 real columns, no formal migrations

Table `ai_agents`, `timestamps: false` (manual `created_at`/`updated_at`). This repo
has no migrations folder — every column landed via an additive, idempotent
`ensure*Schema.ts` script (each statement individually try/caught, so a partial DB
self-heals on next boot), called from `server.ts` at every startup, in this order:

1. `backend/src/db/ensureAiAgentIdentitySchema.ts` (2026-08-18/19) → `system_prompt`,
   `tools_granted`, `persona_version`.
2. `backend/src/db/ensureAiAgentReportsToSchema.ts` (2026-08-18) →
   `reports_to_org_member_id` — **deprecated**, superseded the next day, kept only
   for historical/audit value, no longer read by the resolver.
3. `backend/src/db/ensureAiAgentHierarchySchema.ts` (2026-08-19) → `reports_to_type`,
   `reports_to_id` — the real, live pair.
4. `backend/src/db/ensureAiAgentAutonomyLevelSchema.ts` (2026-08-24, corrected
   2026-08-25) → `autonomy_level`, `autonomy_level_set_at`.
5. `backend/src/db/ensureAiAgentDepartmentScopeSchema.ts` (2026-08-24) →
   `department`, `scope`.

Fields relevant to onboarding, beyond what `SKILL.md`'s main body already covers:

| Column | Type | Default | Notes |
|---|---|---|---|
| `department` | STRING(50), nullable | — | Real, distinct from `category`. Nothing enforces its value set. |
| `scope` | JSONB, nullable | `{}` | **Confirmed unused today.** Its own header comment: *"`department` alone IS the scope for this phase... nothing populates or reads it yet."* Reserved for a future per-campaign/per-lead-segment grant — don't populate it expecting anything to read it. |
| `reports_to_type` | STRING(10), nullable | — | `'human' \| 'agent' \| null`. |
| `reports_to_id` | UUID, nullable | — | No DB FK — target table depends on `reports_to_type`. |
| `autonomy_level` | STRING(20), nullable | `'observe'` | Inert until `autonomy_level_set_at` is stamped — see below. |
| `autonomy_level_set_at` | DATE, nullable | — | `null` = untouched migration default; non-null = a human deliberately ran the reactivation flow. |
| `max_runs_per_hour` / `max_writes_per_execution` / `max_proposals_per_run` | INTEGER, nullable | — | `null` = system default applies (60/100/50 — see below), not zero. |

No unique/FK constraint exists on any actor-ref column (`reports_to_id`,
`reports_to_org_member_id`) — deliberate repo convention so a data-shape surprise
can never fail a write.

## The two onboarding mechanisms — pick deliberately, don't blend them

**A. Static registry + identity seed — what `SKILL.md`'s main body builds.**
`agentRegistrySeed.ts`'s `AGENT_REGISTRY` array (~250 entries as of 2026-09-04),
`findOrCreate`'d per entry on every boot (`seedAgentRegistry()`); on an existing row
it refreshes definitional fields including `system_prompt`/`tools_granted`/
`persona_version` if the entry sets them, but preserves `status`/`config`/run stats.
`agentIdentitySeed.ts`'s `seedAgentIdentity()` is the generic identity-building block
this skill's Execution section E already documents in full.

**B. `agentFactory.ts`'s `createAgent()` — Cory's dynamic runtime hire, a DIFFERENT,
narrower mechanism.** Used by AI COO (Cory) to hire/retire agents at runtime
(`agent_type: 'dynamic'`). Creates the row **disabled** (`status: 'paused'`,
`enabled: false`, `config.pending_approval: true`), and stores its own
`Department`/`role`/`responsibilities` inside `config` using a **separate, Title-case
`Department` enum local to that file — do not confuse it with the real `department`
column** from the schema table above. Sets none of `system_prompt`, `tools_granted`,
`department`, `reports_to_type/id`, or `autonomy_level`. A human calls
`activatePendingAgent()` to turn it on. This is the only other `AiAgent.create(` call
site in the backend. Not what this skill builds — flagged here only so nobody
mistakes a Cory-hired pending agent for one built through this skill's own pattern,
or vice versa.

## `reports_to` resolution — `ticketCreatorReportsToResolver.ts`

`resolveReportsToChainWithTrail(agent, trail, depth)` is the one canonical recursive
walk: `reports_to_type === 'human'` returns `reports_to_id` directly. `'agent'` loads
that agent by `reports_to_id` and recurses. `MAX_CHAIN_DEPTH = 5` — a cycle/
misconfiguration guard, not a design assumption (today's real data is only ever 2
hops: AI Staff → AI Leadership → human). Hitting the cap, or an unset chain, returns
`null` — **fails closed**, silently, not loudly.

`enforceReportsToGate()` is the real ticket-creation-time enforcement: throws
`TicketCreatorNotReportableError` before any DB write if the creator agent is
unregistered, or its chain resolves to no human. `'human'`/`'org_member'` actor types
bypass the gate entirely (not relevant to an AI agent's own identity).

`resolveCreatorAiAgent(createdByType, createdById)`: for `'agent'`/`'cory'`,
`createdById` IS the literal `AiAgent.agent_name` string; for `'ai_staff'`,
`createdById` is an `AdminUser.id`, resolved via `AdminUser.agent_id → AiAgent`.

## Permission tiers — `agentPermissionService.ts`

Real defaults:
```
DEFAULT_MAX_RUNS_PER_HOUR = 60
DEFAULT_MAX_WRITES_PER_EXECUTION = 100
DEFAULT_MAX_PROPOSALS_PER_RUN = 50
```
`checkRunLimit`/`checkWriteLimit`/`checkProposalLimit` do `agent.max_X || DEFAULT_X`
— `null`, `undefined`, **or `0`** all fall back to the default (know this before
setting an override to `0` expecting it to mean "no runs allowed" — it doesn't).
An agent not found in the registry at all fails OPEN (`{ allowed: true, ... }`), never
blocks on a missing row.

`AGENT_PERMISSIONS: Record<string, AgentPermission>` — hand-maintained, keyed by
exact `agent_name`, one of 4 tiers:

| Tier | Meaning |
|---|---|
| `read_only` | Observe only. |
| `suggest_only` | Can propose (`proposed_agent_actions`) but not write directly. **This is `DEFAULT_PERMISSION`** — what any unlisted agent silently gets. |
| `write_with_audit` | Direct writes to its own `allowedTables`, audited. |
| `communication` | Can send — `requiresEvaluateSend: true` routes the send through `communicationSafetyService.ts`'s consent gate (see below). |

There is no way to grant a tier from the `AiAgent` row itself — it must be added to
this map by hand, in code, per agent.

## Autonomy ladder + ABAC shadow-mode

`agentAutonomy.ts` — pure policy, no DB. 4-rung, cumulative ladder:
`['observe', 'suggest', 'act_audited', 'communicate']`. `levelForTier()` maps the
4 permission tiers onto this ladder 1:1 (`read_only→observe`,
`suggest_only→suggest`, `write_with_audit→act_audited`,
`communication→communicate`).

HITL rules (`actionRequiresApproval()`) — always require a human regardless of
autonomy level: R3/R4 risk-tier actions, ERP writes, `agent_lifecycle` category
actions, public social posts, first-touch to a brand-new lead, anything in a
campaign's first 24h.

`agentAuthorizationService.ts`'s `authorizeAgentAction()` — the real chokepoint,
shadow-first by design: `getAbacMode()` reads settings key `abac_enforcement`,
default `'shadow'` — evaluates and logs every call (`agent.authorization` ai_events
row) but only actually blocks when explicitly set to `'enforce'`. Fails open on any
internal error.

**`autonomy_level`'s real effect** — `resolveLevel(row, tier)`: the DB column governs
ONLY when `autonomy_level_set_at` is non-null, i.e. `reactivateAgent()`
(`agentReactivationService.ts`) was explicitly called, stamping both fields together
in the same update. Otherwise the gate silently derives the level from the
permission tier via `levelForTier()` — the column is simply not consulted. **A brand
new agent's `autonomy_level` (default `'observe'`) has zero effect on anything until
someone explicitly runs the reactivation flow.**

Don't confuse this `AUTONOMY_LEVELS` (validated via Zod in
`workforceController.ts:208`, `z.enum(AUTONOMY_LEVELS)`) with the unrelated,
same-named constant in `backend/src/types/inboxCase.ts`
(`'READ_ONLY'|'PREPARE'|'EXECUTE_APPROVED'|'TRUSTED_LOW_RISK_RULES'`) — a completely
separate governance model for a different subsystem.

## GOALS™ scoring — `agentGoalsDimensionsService.ts`

5 dimensions (`governance`/`observability`/`availability`/`lexicon`/`solid`), each
typed `source: 'live' | 'fixed'` in the code (the frontend UI badge presents this as
"Live"/"Declared" — same distinction, different label).

**`governance` and `lexicon` are hardcoded constant scores — configuration does not
move the number, only the evidence text:**
- `governance: 5` always. Evidence reads `getAgentPermission(agent.agent_name)` —
  setting a real `AGENT_PERMISSIONS` entry (step E.5.2) is what makes the evidence
  text real instead of generic-default.
- `lexicon: 4` always. Evidence reads `agent.category` (not the new `department`
  column) — a real `category` (already required on every registry entry) is what
  makes this evidence real.

The 3 `'live'` dimensions ARE genuinely computed, from the last 20
`AiAgentActivityLog` rows for that agent:
- `observability`: `max(1, round((rows_with_trace_id / total) * 5))`, defaults 3 if
  no logs.
- `availability`: 1 if `!agent.enabled`; 5 if `trigger_type === 'on_demand'`; 5 if any
  recent logs exist; 2 otherwise.
- `solid`: `max(1, 5 - round((failed / total) * 4))`, defaults 5 if no logs.

For these 3 to score well, the agent needs to actually run and log activity with
`trace_id` populated and a low failure rate — nothing about onboarding config moves
them directly; they earn themselves over time via real runs.

There's a separate, older, synthetic-roster GOALS implementation in
`trustMetricsService.ts` scoped to only 12 roster agents — don't conflate it with
`agentGoalsDimensionsService.ts`, which is the real, generic, per-agent one every
`AgentDetailPage` reads from.

## Manager-conversation prompt vs. learner-facing prompt

- `agentManagerConversationPrompt.ts`'s `buildAgentManagerConversationSystemPrompt()`
  reads `AiAgent.system_prompt` DIRECTLY (its real caller,
  `agentManagerConversationService.ts:103`, passes `agent.system_prompt` straight
  through). Null/empty → an honest fallback frame, never a fabricated persona. Layers
  in active `ManagerDirective` texts, approved `AgentMemoryProposal` texts, and (as of
  2026-09-04) real recent tickets/ai_events activity, with an honest "no recent
  activity" line when there's none.
- `agentSystemPrompt.ts`'s `buildAgentSystemPrompt()` — the student-facing one this
  skill's Derivation rule 2 builds — does **not** read the DB column at all;
  `personaBlock` is a plain argument the caller supplies (a dedicated constant file,
  mirroring `reeseSystemPrompt.ts`'s `REESE_PERSONA_BLOCK` pattern).

Setting `system_prompt` on the registry entry is sufficient for a working manager
conversation. It is NOT sufficient for a working student conversation — that needs
the separate persona-block file this skill already builds in Derivation rule 2 /
step B.

## The 5 manager-authored tables — not part of initial onboarding

None of these are created when an agent is onboarded — all are added later, by a
manager, through their own controllers/routes, once the agent exists. Every one FKs
`agent_id → ai_agents.id`, no DB-level FK enforcement (matches repo convention).

| Table (model) | Purpose | Key fields |
|---|---|---|
| `agent_goals` (`AgentGoal`) | A manager-set target | `metric_key` (`'monthly_cost_usd' \| 'open_ticket_count'` — closed set), `comparison` (`'at_most'\|'at_least'`), `target_value`, `status` default `'active'` |
| `agent_one_on_ones` (`AgentOneOnOne`) | A scheduled/completed check-in | `agenda` (required), `outcome_notes`, `status` default `'scheduled'`, `held_at` |
| `agent_report_subscriptions` (`AgentReportSubscription`) | A recurring digest | `content_scope` (JSONB array of `'cost'\|'activity'\|'trust'\|'tickets'`), `cadence` (`'daily'\|'weekly'`), `delivery_hour_local`, `timezone` default `'America/Chicago'`, `channel` — only `'email'` is live (Slack code exists, dormant, deliberately not selectable) |
| `agent_memory_proposals` (`AgentMemoryProposal`) | The governed-memory approval queue | `content`, `evidence`, `status` default `'pending'`; only `status='approved'` rows are ever injected into a live prompt |
| `manager_directives` (`ManagerDirective`) | A standing instruction | `directive_text`, `status` default `'active'` (`'active'\|'revoked'`) — append-only/versioned, never edited, only superseded; restrict-only by construction, never read to grant a tool or raise autonomy |

If hardening this skill further, a reasonable next step is proactively seeding a
starter `ManagerDirective` or `AgentGoal` at onboarding time for agents that clearly
need one from day one — not built yet, flagged here as a real option.

## Consent — relevant only to `communication`-tier agents

`consentService.ts` — a separate outbound-send consent gate (TCPA/GDPR), same
shadow-first pattern as authorization (`consent_enforcement` setting, default
`'shadow'`, fails open). Only in play when `AGENT_PERMISSIONS`'s
`requiresEvaluateSend: true` (the `communication` tier) routes a send through
`communicationSafetyService.ts`'s `evaluateSend()`. A `read_only`/`suggest_only`/
`write_with_audit` agent never touches this path.

## `docs/ai-governance/ai-systems-registry.csv` — usually NOT needed for a new agent

This is a **system/product-level** registry (columns: `System, Area, Tier,
User-Facing, HITL Level, Data Sensitivity, Owner, Provisional INPACT band,
Provisional GOALS, Target INPACT, Target GOALS, Remediation Phase, Key Gaps, Logging
Today`), read at runtime by `trustInpactGoalsService.ts` for the Trust Command
Center's averaged INPACT%/GOALS estimate. Rows are entire capability surfaces
("Maya Admissions Chatbot," "Curriculum Architect Agent"), not individual agent
names — the file's own last row explicitly flags per-agent breakout as
still-pending future work ("Assign tier+owner+HITL per agent in Phase 0"). A single
new `AiAgent` row does not need its own CSV row unless it constitutes a genuinely new
"AI System" surface, and per `TBI_COMPLIANCE_PROGRAM.md` §4.1 (cited in the file's own
header), assigning a real Tier/HITL Level/GOALS score there is supposed to go through
a cross-functional council scoring process, not be self-declared by whoever's
onboarding the agent.
