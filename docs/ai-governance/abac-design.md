# ABAC + Narrowed Autonomy — Design for Sign-Off

**TBI audit gap:** P2-1 (Governance/Security) — *"No ABAC on AI actions; broad autonomy; RBAC scaffold unapplied."*
**Status:** Design phase (green-lit 2026-06-22). No code yet — this is the proposal for DRI review.
**Companion docs:** [consent-capture-design.md](consent-capture-design.md), [../trust-audit/governance-audit.md](../trust-audit/governance-audit.md), [../trust-audit/gap-analysis.md](../trust-audit/gap-analysis.md).

---

## 1. Purpose

Today our AI agents (Maya, Cory, OpenClaw, the scheduled cron agents, and ~200 `.js` ops scripts) operate with **broad, mostly-unenforced autonomy**. The goal of this work is **least privilege**: each agent may take only the actions, on only the resources, that its role requires — and an attempt outside that envelope is **blocked**, not merely logged.

This is **not greenfield.** The codebase already has ~60% of the machinery (permission tiers, a write-audit table, a communication-safety gate, a kill switch). It is **advisory, scattered, and incomplete**. This design **unifies and enforces** it behind one checkpoint, then **scopes** it.

---

## 2. Current state (what we're building on)

| Primitive | Where | What it does | The gap |
|---|---|---|---|
| **Permission tiers** | `services/agentPermissionService.ts` | Classifies agents into `read_only` / `suggest_only` / `write_with_audit` / `communication`; an `allowedTables` allowlist; per-agent `max_runs_per_hour` / `max_writes_per_execution` / `max_proposals_per_run`. | **Advisory** — `validateAgentWrite()` returns a decision the caller may ignore. Only covers DB writes. |
| **Write audit** | `models/AgentWriteAudit.ts`, `agentPermissionService.logAudit()` | Records every gated write with `was_allowed` + `blocked_reason` + before/after state + `trace_id`. | **Logs only.** A "blocked" write is still executed by callers that ignore the result. |
| **Communication safety** | `services/communicationSafetyService.evaluateSend()` | Central gate for sends: scheduler-pause, global rate limit, campaign-sendable, lead-sendable (suppression/DND), test-mode redirect. | **Not agent-aware** (no `agent_id`/tier); only enforced on the scheduler path, not Cory/intelligence agents. |
| **Kill switch / safe mode** | `services/launchSafety.ts`, `services/systemControlService.ts` | Global stop. Checked inside `emailService` and `synthflowService.triggerVoiceCall`. | **Incomplete** — gates email + voice only. Does **not** gate DB writes, ticket creation, SQL, or social posts. |
| **HITL approval** | `services/ops/approvalService.ts` | Human approve/revise/reject for OpenClaw social content. | Async + optional — the agent does not *wait* on it before posting. |
| **Agent registry** | `models/AiAgent.ts` | Rich attributes: `agent_name`, `agent_type`, `category` (21), `enabled`, `status`, the rate limits above, `agent_group`, and `config` JSONB (holds `department`, `role`). | No indexed `autonomy_level`, `department`, or **resource scope** (any CampaignRepairAgent can touch *any* campaign). |
| **RBAC middleware** | `middlewares/rbacMiddleware.ts` (`requireAdmin`, `requireRole`, `requireCoryAuthorized`) | Gates **humans** calling admin HTTP routes. | Does **not** gate **agents** — agents run in-process, not via HTTP, so no middleware sees them. |

**Bottom line:** the building blocks exist but enforcement is optional, the kill switch is partial, there is no central chokepoint, and there is no per-resource scope. `.js` cron scripts bypass the registry entirely.

---

## 3. The design

### 3.1 The model — the "Five W's"

Every agent action is authorized against five attribute groups:

| W | Attribute(s) | Source |
|---|---|---|
| **Who** | agent identity, `autonomy_level`, `department` | `AiAgent` row |
| **What** | `action` (e.g. `send_email`, `create_ticket`, `update_campaign`) + `resource_type` | call site |
| **Where** | `resource_id` must fall in the agent's **scope** (allowed campaigns / departments / lead segments) | agent policy + resource |
| **When** | rate limits, time-of-day windows, kill-switch / safe-mode state | registry + settings |
| **Why** | does this action require human approval (HITL) before it fires? | action policy |

### 3.2 Autonomy levels (explicit, replacing the implicit tier map)

Promote the existing tier concept to an **indexed, explicit** ladder on `AiAgent`:

| Level | Can do | Examples |
|---|---|---|
| `observe` | read only | MonitorAgent, RiskEvaluatorAgent |
| `suggest` | propose actions (write to `proposed_agent_actions` only) | CostOptimizationAgent |
| `act_audited` | write to an **allowlisted set of tables**, every write audited | ExecutionAgent, campaign repair |
| `communicate` | outbound email/SMS/voice/social, **within scope + consent + HITL rules** | Maya, OpenClaw |

Default for any new/unclassified agent: **`observe`** (fail-closed).

### 3.3 The central chokepoint

One function every side-effecting agent path must call **before** the irreversible step:

```ts
authorizeAgentAction({
  agentId, agentName, action, resourceType, resourceId, context
}): Promise<{ allowed: boolean; reason?: string; requiresApproval?: boolean }>
```

It evaluates, in order, and **returns `allowed: false` (and the caller MUST abort)**:
1. Kill switch / safe mode active → block (now covers **every** action, not just email/voice).
2. Agent `enabled` and not `paused`.
3. Agent `autonomy_level` permits this `action`.
4. `resource_id` is within the agent's **scope** (department / campaign allowlist / segment).
5. Rate + budget limits not exceeded (`max_runs_per_hour`, `max_writes_per_execution`).
6. For consent-gated channels (voice/email): consent on file (see [consent-capture-design.md](consent-capture-design.md)).
7. If the action policy says `requiresApproval`, return `requiresApproval: true` → the action is **queued for HITL**, not executed.

Every call — allowed or blocked — is written to `AgentWriteAudit` (extended to cover non-write actions too, or a sibling `agent_action_audit`).

### 3.4 Where it's inserted (the chokepoints that exist vs. need adding)

| Action | Insert at | Today |
|---|---|---|
| email / SMS / voice | extend `evaluateSend()` to take `agent_id` + call `authorizeAgentAction` | partial (comms-safety only) |
| DB writes | make `validateAgentWrite()` **enforced** — wrap as `executeAgentWrite()` that throws on deny | advisory only |
| ticket creation | add a gate in `ticketService.createTicket()` (Cory calls it ungated today) | **none** |
| SQL (`run_sql_query`) | already read-only by convention — add an assertion + scope check | convention only |
| social post | make `openclawPlatformPostingService` **wait** on the approval gate | async/optional |
| agent lifecycle (create/activate/retire) | gate `agentFactory` behind `act_audited`+admin | partial (PENDING→admin activate) |

### 3.5 Policy representation

Two options for where policy lives (decision below):
- **(A) Columns on `AiAgent`** — add `autonomy_level`, `department`, `scope` (JSONB: `{campaigns:[], segments:[], tables:[]}`). Simplest; co-located with the agent.
- **(B) A dedicated `agent_policies` table** — `(agent_id, action, resource_pattern, effect, conditions)` rows, like AWS IAM statements. More expressive (multiple statements per agent), more work.

**Recommendation: start with (A)** — it covers 90% of cases and reuses the existing registry; graduate to (B) only if per-action statements are needed.

---

## 4. Phased rollout (low-risk, reversible)

| Phase | What | Risk |
|---|---|---|
| **0 — Inventory** | Classify every agent into an autonomy level + scope (a one-time data pass; most are obvious from `category`). | none |
| **1 — Shadow mode** | Ship `authorizeAgentAction()`; insert at every chokepoint but **log-only** (`would_block`). Compare decisions to reality on the Trust dashboard for ~1 week. | none — nothing blocked |
| **2 — Enforce high-risk** | Flip enforcement **on** for the irreversible/external set first: outbound comms, agent lifecycle, campaign writes. | medium — caught by shadow data first |
| **3 — Enforce all + unify kill switch** | Enforce everywhere; make the kill switch block **all** actions; make HITL **synchronous** for social. | medium |
| **4 — Scope tightening + cron registration** | Add per-resource scope; register the `.js` cron scripts in `AiAgent` so they stop bypassing the gate. | low |

Phase 1 is **fail-open by design** (observe only); enforcement (Phases 2+) is **fail-closed**. Each phase is independently shippable and reversible (a single `abac_enforcement` setting per action class).

---

## 5. Decisions for your sign-off ⬅ **the part I need from you**

1. **Default posture during rollout.** Shadow-first (recommended) vs. enforce-immediately on a small set?
2. **Which actions ALWAYS require human approval (HITL), no exceptions?** My proposal: public social posts, agent creation/activation, any send to a brand-new (un-contacted) lead, anything during a campaign's first 24h. Add/remove?
3. **Autonomy levels** — accept the 4-level ladder (`observe` / `suggest` / `act_audited` / `communicate`), or do you want a different cut?
4. **Scope granularity** — is per-**department** scope enough to start (recommended), or do you need per-**campaign** / per-**lead-segment** from day one?
5. **Policy storage** — columns on `AiAgent` (recommended, fast) vs. a dedicated `agent_policies` table (IAM-style, more flexible)?
6. **Kill-switch behavior** — when the kill switch is on, should in-flight agent *reads/analysis* keep running (recommended) or freeze entirely?
7. **The `.js` cron scripts** — register all ~200 in the registry so they're governed (bigger lift), or only the ones that take external actions (sends/posts)? Recommended: only the side-effecting ones.

Reply with answers (or "your recommendations are fine") and I'll turn this into the Phase 0 + Phase 1 build.

---

## 6. Non-goals / risks

- **Non-goal:** replacing human RBAC (`requireAdmin`) — that stays; this is the *agent* side.
- **Non-goal:** a full IAM/policy-language engine in v1 — start attribute-simple.
- **Risk:** over-tight scope blocking legitimate work → mitigated by Phase 1 shadow mode (we see every would-block before enforcing).
- **Risk:** the `.js` script bypass remains until Phase 4 — until then those scripts are governed only by their own code, not the gate. Flagged explicitly.
- **Failure-first:** the gate itself is on the critical path of every action, so it must be **fast (single indexed lookup, cached per-run)** and **fail-closed** (if the policy lookup errors, deny the action and log) — except `observe`-level reads, which fail-open.

---

*Prepared 2026-06-22 · grounded in `agentPermissionService.ts`, `communicationSafetyService.ts`, `launchSafety.ts`, `AgentWriteAudit.ts`, `AiAgent.ts`. Lifts Governance + Security once enforced.*
