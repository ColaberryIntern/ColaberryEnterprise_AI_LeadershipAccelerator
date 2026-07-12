# Phase 3 — Observability Audit

**Audit:** TBI compliance · evidence cited `file:line`. Scores 0–100 per dimension, each justified by evidence. Absence ("NOT FOUND") is a finding.

> **Headline.** The repo's own `CLAUDE.md` "Observability Framework" (structured JSON logs, correlation IDs, p50/p95/p99 metrics, error_class tagging) is **aspirational target state, not implemented**. There is **no logging library** (2,436 raw `console.*` calls across 392 files; structured JSON in only 8 files via copy-pasted local helpers), **no metrics backend** (no Prometheus/Datadog/OpenTelemetry/StatsD/Grafana anywhere — verified against all three `package.json`), and **no correlation ID propagated across calls**. A handful of well-shaped audit/decision tables exist but writes are scattered and partial.
>
> **Composite Observability Score: 39 / 100** (mean of the seven dimensions below).

| Dimension | Score | One-line justification |
|---|---:|---|
| User | **25** | IP/session exist for web visitors only; AI-action logs carry no user identity or IP |
| Workflow | **40** | `trace_id` links 3 tables within one in-process engine run; no cross-service propagation; `execution_path` returned in-body, not persisted |
| Agent | **70** | Rich agent fields (reason/confidence/before-after) exist, but only when agents opt into `logAgentActivity()`; the execution wrapper persists nothing |
| Tool | **15** | No tool/external-call telemetry; only DB-write `target_table` and LLM `model_used` |
| Retrieval | **20** | Vector RAG works but retrieved doc IDs/citations aren't persisted; "sources" are table names, in-body only |
| Decision | **75** | `IntelligenceDecision` captures reasoning, confidence, risk, before/after — but only the autonomous engine writes it |
| Cost | **30** | Tokens captured only via a wrapper most call sites bypass; zero dollar-cost, no per-user/per-workflow attribution |

---

## User Observability — 25/100
*Can we determine who initiated an action, when, from where?*

- **Web visitors only:** `VisitorSession` captures `ip_address`, `started_at`, `utm_*`, `referrer` (`models/VisitorSession.ts:20,45`). `AuditLog.ip_address` captures admin IP (`models/AuditLog.ts:25`) — **but tied to `admin_user_id` which is always `null`** (see [governance-audit.md](governance-audit.md) §5, the `req.adminUser` vs `req.admin` bug at `middlewares/auditMiddleware.ts:69`).
- **AI-action logs carry no human identity:** `AiAgentActivityLog` and `ContentGenerationLog` have **no `user_id`/`initiated_by`/IP** (grep confirmed). `ChatConversation` links to `visitor_id/lead_id/session_id` but the message rows have no IP.
- **Verdict:** cannot reliably answer "which human triggered this AI action, from what IP/session."

## Workflow Observability — 40/100
*Can we reconstruct the full path, order, and duration?*

- Within a single `autonomousEngine` run, `trace_id` links rows across the only 3 models that carry it: `models/AiAgentActivityLog.ts:37`, `models/IntelligenceDecision.ts:90`, `models/AgentWriteAudit.ts:34`. Trace minted locally (`intelligence/autonomy/autonomousEngine.ts:49`) and passed as a function arg.
- The assistant engine emits `pipelineSteps`/`execution_path` in the HTTP response body (`intelligence/assistant/queryEngine.ts:296-297`) but **does not persist it**.
- **No cross-service propagation** — the request middleware does not assign/read a correlation ID (`intelligence/agents/processObservationAgent.ts:41-74` logs only path/method/status/duration). `participantRoutes.ts:161` honors an inbound `x-correlation-id` in exactly 2 catch blocks.
- **Verdict:** reconstruction works inside one engine invocation; breaks across HTTP/job/service boundaries.

## Agent Observability — 70/100
*Which agent executed, why, with what inputs/outputs?*

- Best-covered. `AiAgentActivityLog` (`models/AiAgentActivityLog.ts:6-43`): `agent_id, action, reason, confidence, before_state, after_state, result, execution_context, retry_of, trace_id, duration_ms`. `AgentWriteAudit` adds `agent_name, operation, before/after_state, permission_tier, was_allowed`.
- **Caveat:** populated only when agents call `logAgentActivity()` (`services/aiEventService.ts:45`) or route writes through `agentPermissionService.ts:342`. The shared `agentExecutionWrapper.ts` **persists nothing** (`:95-110` enrich in memory only).
- **Verdict:** strong schema, inconsistent population.

## Tool Observability — 15/100
*Which tools/APIs/external systems were touched?*

- **Largely NOT FOUND.** No tool-invocation table. Closest signals: `AgentWriteAudit.target_table/operation` (DB writes only) and `ContentGenerationLog.model_used` (LLM name only).
- External calls to Mandrill/Basecamp/Apollo/Synthflow/Google are **not captured as structured tool events** — the `CLAUDE.md` "log request start/end/duration/status at every external boundary" rule is unimplemented.
- **Verdict:** cannot enumerate which external systems a given run touched.

## Retrieval Observability — 20/100
*Which documents were retrieved; were citations produced?*

- RAG exists (`intelligence/memory/vectorMemory.ts:19,55-70`, pgvector `similarity` score) but **retrieved document IDs and citations are not persisted with the answer**.
- The `sources` field in assistant responses is **DB table names, not document citations** — `intelligence/assistant/coryAgenticEngine.ts:841` (`sources: [...new Set(enrichedSql.flatMap(sr => sr.tables))]`), returned in-body only (`queryEngine.ts:295`).
- **Verdict:** cannot audit which documents grounded an AI answer. (This directly fails TBI Transparent dimension / TP-13 Citation & Provenance.)

## Decision Observability — 75/100
*Why was a decision made; confidence; evidence?*

- Strongest model. `IntelligenceDecision` (`models/IntelligenceDecision.ts:33-188`): `trace_id, problem_detected, analysis_summary, recommended_action, risk_score, confidence_score, risk_tier, reasoning, before_state, after_state, impact_after_24h, monitor_results`. Confidence also on `AiAgentActivityLog.confidence` (DECIMAL(3,2), `:70`).
- **Caveat:** written only by the autonomous engine's code paths — not by Maya, generation, inbox, or OpenClaw decisions.
- **Verdict:** decision rationale + confidence are well-modeled where written; coverage is narrow.

## Cost Observability — 30/100
*Tokens, API cost, cost per workflow/user?*

- **Tokens:** captured only in `content_generation_logs` (`models/ContentGenerationLog.ts:13-15`, written by `llmCallWrapper.ts:192-194`) and `chat_messages.tokens_used` (`models/ChatMessage.ts:9`). Token logging fires only through `callLLMWithAudit` — used in **8 services**; **50+ direct call sites bypass it**.
- **Dollar cost: NOT FOUND.** `ops_ai_assessments.llm_cost_usd` always `null` (`priorityEngineService.ts:350`); `ops_metrics_daily.agent_total_cost_usd` always `0` (`metricsDailyService.ts:85`); only an in-memory vision estimate (`operationalCostGovernance.ts:16`, header says "not for billing").
- **Per-workflow / per-user cost: NOT FOUND** — no `user_id`/`workflow_id`/cost dimension on any token row.
- **Verdict:** partial token coverage, zero cost attribution.

---

## Logging & metrics infrastructure (supporting evidence)

- **No logging library** — `backend/package.json:15-49` has no winston/pino/bunyan. Primary mechanism: `console.*` (2,436 sites). Global error handler dumps freeform: `middlewares/errorHandler.ts:15` `console.error(err.stack)`.
- **Structured JSON logging in 8 files only**, via a copy-pasted local `function log()` (canonical `controllers/v1LeadController.ts:7-16`). Files: `v1LeadController`, `serviceAuthMiddleware`, `anthropicChangeDetector`, `anthropicContentWatcher`, `anthropicCurriculumImpactAgent`, `courseLinkService`, `externalLeadIngestService`, `projectDnaService`.
- **No metrics backend** — NOT FOUND: Prometheus, `prom-client`, Datadog/`dd-trace`, `@opentelemetry`, StatsD, Grafana, New Relic. No `/metrics` endpoint.
- **Health endpoints present:** `routes/healthRoutes.ts:7` `GET /health` (`SELECT 1`), `:18` `GET /health/full` → `runFullSystemHealthCheck()`. Container/proxy probes: `docker-compose.production.yml:22`, `nginx/nginx.conf:101`.
- **"Metrics" live in DB tables, not a TSDB:** `OpsMetricsDaily`, `AgentPerformanceMetric/Snapshot`, `KPISnapshot`, `SystemStateSnapshot`, `system_processes` — queryable, but no p50/p95/p99 latency or rolling success-rate series, no alerting.

## What this means for TBI
TBI's GOALS **Observability** pillar requires (Appendix DA-2): APM operational, **LLM calls 100% traced with per-query cost**, dashboards for latency/errors/cost/cache, **alerts at latency>5s / error>5% / cost>$1,000/day**, **MTTD <5 min**, drift detection. **None of these are implemented.** Current GOALS-O maturity ≈ **2/5** (app logs only, no APM/cost). TBI's own rule is "fix Observability first" — this audit confirms it is the correct starting point.

## Evidence gaps
1. Static code only — runtime write-frequency of each audit table unknown (a table can exist and be near-empty, e.g. `AgentWriteAudit` fires only via the permission service).
2. Frontend client-side analytics (`PageEvent`/`EngagementEvent`) not audited.
3. `runFullSystemHealthCheck()` internals (`services/systemHealthService.ts`) not opened.
