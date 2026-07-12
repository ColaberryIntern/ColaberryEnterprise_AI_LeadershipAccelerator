# Phase 6 — Event Model Audit

**Audit:** TBI compliance · evidence cited `file:line`.

## Current state

There is **no unified event model and no event bus.** Events are scattered, single-purpose table inserts with **inconsistent shapes**.

- **No event bus / pub-sub:** `grep emitEvent|EventEmitter|eventBus|publishEvent` → NOT FOUND in `backend/src`. Async coordination is in-process cron/`setInterval` + DB tables used as queues (`raw_lead_payloads` `server.ts:328`, `ops_approval_queue` `server.ts:168`).
- **Parallel, non-unified event tables (each its own envelope):**

| Table | Model (file:line) | Shape | Writer |
|---|---|---|---|
| `ai_system_events` | `models/AiSystemEvent.ts:4-67` | `source, event_type, entity_type, entity_id, details(JSONB), created_at` | `logAiEvent()` `services/aiEventService.ts:16` |
| `event_ledger` | `models/EventLedger.ts:4-62` | `event_type, actor, entity_type, entity_id, payload(JSONB), created_at` | scattered |
| `ai_agent_activity_logs` | `models/AiAgentActivityLog.ts:6-43` | `agent_id, action, reason, confidence, before/after_state, result, trace_id, duration_ms` | `logAgentActivity()` `aiEventService.ts:45` |
| `agent_write_audits` | `models/AgentWriteAudit.ts:4-38` | `agent_id, operation, target_table, before/after_state, was_allowed, trace_id, execution_id` | `agentPermissionService.ts:342` |
| `intelligence_decisions` | `models/IntelligenceDecision.ts:33-81` | `trace_id, problem_detected, reasoning, confidence_score, risk_tier, before/after_state` | autonomous engine |
| `content_generation_logs` | `models/ContentGenerationLog.ts:4-40` | `lesson_id, generation_type, model_used, prompt/completion_tokens, duration_ms, cache_hit` | `llmCallWrapper.ts:184` |
| `audit_logs` | `models/AuditLog.ts:4-33` | `admin_user_id, action, entity_type, old/new_values, ip_address` | `auditMiddleware.ts:69` (actor null) |
| `build_manifests` | `models/BuildManifest.ts:13-115` | build telemetry (files/db/apis/ui/tests, `decision_trace`) | telemetry ingest `telemetryIngestionService.ts:38` |
| + domain events | `behavioral_events`, `engagement_events`, `page_events`, `department_events`, `cognition_events`, `preview_events`, `alert_events`, `anthropic_change_events`, `student_navigation_events`, `unsubscribe_events` | each different | per-domain |

- **The one real pipeline** is `BuildManifest`/`SystemStateEngine` telemetry — `POST /api/portal/project/telemetry` → `routes/projectRoutes.ts:3130-3150` → `telemetry/telemetryIngestionService.ts:23-78` (Zod-validated, `BuildManifest.create` `:38`, fire-and-forget `refreshSystemState` `:74`). **But it tracks what Claude Code *built* (CI/dev), not runtime AI actions.**

## Missing state (vs. what TBI requires)

| Capability | Status |
|---|---|
| Single canonical event envelope | **NOT FOUND** — 15+ disjoint shapes |
| Correlation/trace ID across services | **NOT FOUND** — `trace_id` only inside one engine run; no HTTP-header propagation |
| `user_id`/`initiated_by` on AI events | **NOT FOUND** on AI-action tables |
| Tool/external-call events | **NOT FOUND** |
| Retrieval/citation events | **NOT FOUND** |
| Cost (USD) on events | **NOT FOUND** |
| Approval status on events | Partial (`agent_write_audits.was_allowed`, campaign approval) |
| Event bus / streaming | **NOT FOUND** |

## Recommended state — canonical AI event schema

A single append-only `ai_events` table (and a thin `emitAiEvent()` helper that **every** LLM/agent/action path calls), superseding the scattered inserts. Designed to answer all 7 observability questions and feed the Trust Dashboard ([dashboard-design.md](dashboard-design.md)).

```jsonc
{
  "eventId":        "uuid",            // unique per event
  "traceId":        "uuid",            // SAME across all steps of one workflow (propagate via x-trace-id header + job payload)
  "spanId":         "uuid",            // this step; parentSpanId links the tree
  "parentSpanId":   "uuid|null",
  "timestamp":      "2026-06-20T14:03:22.118Z",
  "eventType":      "llm.call | agent.run | tool.invoke | retrieval.query | decision.make | action.email|voice|social|db_write | approval.request|grant|deny",

  // WHO
  "actor":          { "type": "user|agent|system|visitor", "id": "...", "email": "...", "ip": "...", "sessionId": "..." },
  "userId":         "string|null",     // human who initiated (REQUIRED for action.* events)

  // WHAT
  "workflowId":     "maya_chat | curriculum_gen | openclaw_post | outbound_email | ...",
  "agentId":        "string|null",
  "action":         "human-readable verb",
  "targetTable":    "string|null", "targetId": "string|null",   // for db_write
  "externalSystem": "openai|synthflow|mandrill|apollo|basecamp|null", // for tool.invoke/action.*

  // WHY / EVIDENCE
  "reasoning":      "string|null",
  "confidence":     0.0,               // 0..1
  "evidence":       { "retrievedDocIds": [], "citations": [], "promptTemplateId": "...", "promptVersion": 3 },

  // OUTCOME
  "outcome":        "success|failure|escalated|blocked",
  "errorClass":     "string|null",
  "durationMs":     0,

  // COST
  "model":          "gpt-4o-mini|gpt-4o|text-embedding-3-small|null",
  "promptTokens":   0, "completionTokens": 0,
  "costUsd":        0.0,                // computed from token×price table — see below

  // GOVERNANCE
  "hitlLevel":      "1..5",            // autonomy level (TBI HITL spectrum)
  "approvalStatus": "not_required|pending|approved|rejected|auto_approved",
  "approvedBy":     "string|null",
  "reversible":     true,
  "killSwitchHonored": true            // proof the action checked the global stop
}
```

**Cost computation** (closes the #1 gap): a small `MODEL_PRICING` map (`{ 'gpt-4o-mini': {in: 0.15/1e6, out: 0.60/1e6}, 'gpt-4o': {...}, 'text-embedding-3-small': {...} }`) applied at emit time → `costUsd = promptTokens*in + completionTokens*out`. This is the only missing piece for per-workflow and per-user cost (group `ai_events` by `workflowId`/`userId`).

## Migration path (no big-bang)

1. Add `ai_events` table (Sequelize model + `CREATE TABLE IF NOT EXISTS`, matching the repo's boot-time DDL pattern, `server.ts:115`).
2. Make `llmCallWrapper.callLLMWithAudit` **also** emit an `ai_events` row (it already has tokens/duration/model) + compute `costUsd`. Then **route the 50+ bypassing call sites through the wrapper** (mechanical refactor — see [gap-analysis.md](gap-analysis.md) P1).
3. Add a one-line `emitAiEvent()` at each action site (`emailService.sendMail`, `synthflowService.triggerVoiceCall`, `openclawPlatformPostingService`, Maya `mayaActionService`).
4. Add a per-request `traceId` middleware (mint if absent, read `x-trace-id`) and propagate into job payloads.
5. Backfill-friendly: keep existing tables; `ai_events` is the unified read model the dashboard queries.

## Evidence gaps
- `IntelligenceMemory` embedding/citation columns inferred from `vectorMemory.ts:42-49`, not opened directly.
- Runtime write volumes per table unknown (static audit).
