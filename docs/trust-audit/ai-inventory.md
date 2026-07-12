# Phase 2 — AI System Inventory

**Audit:** TBI compliance · **Repo:** `accel-repo` · evidence cited `file:line`.

> **Headline.** One provider only — **OpenAI** (`gpt-4o-mini` default; `gpt-4o` for outreach/vision; `text-embedding-3-small` embeddings in the Python engine). **No Anthropic/Claude, Gemini, or Ollama SDK runs anywhere** (the `anthropic*` files are a public-docs change-watcher, not an SDK; `inbox/llmClassificationService.ts:75` comment claims "Claude" but calls `gpt-4o-mini`). The central audit wrapper `callLLMWithAudit` is used by **only 8 services**; **50+ other call sites instantiate `new OpenAI()` directly and log nothing**. **Dollar cost is never computed.** No trace ID, no prompt version on any call.

## Risk legend
**CRITICAL** = public/irreversible external action or sensitive-data exposure with no enforced control · **HIGH** = customer/student-facing or autonomous internal action, weak controls · **MEDIUM** = internal decision support, human nearby · **LOW** = read-only/dev/internal analytics.

## AI capability register

| # | Capability | Entry (file:line) | Model | Inputs → Outputs | Audited? (sink) | Risk |
|---|---|---|---|---|---|---|
| 1 | **Maya chatbot** (public, tool-calling) | `chatService.ts:393`, tool loop `:443`; tools `mayaActionService`/`MAYA_TOOLS` | `env.chatModel` gpt-4o-mini | visitor msgs + identity → reply + **actions** (create lead, book appt, tag campaign) | tokens→`chat_messages.tokens_used` (`chatService.ts:313`); **no trace, no cost, no user-IP on msg** | **CRITICAL** |
| 2 | **Synthflow voice agent** | `services/synthflowService.ts:102` (POST calls); post-call summary `synthflowWebhookController.ts:363` | external voice agent + gpt-4o-mini summary | lead phone/profile → outbound AI phone call | call→lead `Activity` (`:341`); summary **not audited**; **no consent capture** | **CRITICAL** |
| 3 | **OpenClaw social posting** | `openclawContentResponseAgent.ts:447`; posting `openclawPlatformPostingService.ts:34,98` | gpt-4o | thread context → public comment/post on Dev.to/Hashnode/LinkedIn | quality gate **auto-approves** (`openclawQualityGateAgent.ts:262`); `OpenclawTask`; **no human gate, route unauth** | **CRITICAL** |
| 4 | **Outbound email automation** | `services/aiMessageService.ts:314` (gen) → `emailService.ts:100` (send) | gpt-4o-mini | lead data → personalized email sent via Mandrill | `AutomationLog` (`automationService.ts:61`); **tokens dropped (no column); no idempotency; no consent**; PII unredacted | **CRITICAL** |
| 5 | **Curriculum generation** | `curriculumGenerationService.ts:193` | env model | program vars → modules/lessons for paying students | **AUDITED** → `content_generation_logs` (`llmCallWrapper.ts:184`) | HIGH |
| 6 | **Content/lesson generation** | `contentGenerationService.ts:127` | env model | lesson context + profile → student lesson content | **AUDITED** (wrapper) | HIGH |
| 7 | **Portfolio generation** | `portfolioGenerationService.ts:404` | gpt-4o-mini | artifacts/scores → student portfolio + exec summary | **bypasses wrapper; no token capture** | HIGH |
| 8 | **Artifact compiler** | `agents/artifactGenerationAgent.ts:54` | gpt-4o-mini | project context → student deliverables | **bypasses wrapper** | HIGH |
| 9 | **Requirements generation** | `requirementsGenerationService.ts:130,160` | env model, 16k max_tokens | NL requirements → structured steps (student wizard) | **bypasses wrapper** | HIGH |
| 10 | **Session chat mentor** | `promptLabService`/portal chat `chatService.ts:293,521` | gpt-4o-mini | enrolled-student chat → mentor responses | `chat_messages`; **no trace/cost** | HIGH |
| 11 | **Curriculum architect agent** | `agents/curriculumArchitectAgent.ts:70` | gpt-4o-mini | program/cohort → curriculum blueprint (admin approves) | action→`ai_agent_activity_logs` (`:88`); **no tokens** | HIGH |
| 12 | **Cory strategic agent (AI COO)** | `cory/coryBrain.ts` → `intelligence/strategy/aiCOO`; LLM `intelligence/assistant/openaiHelper.ts:31` | gpt-4o-mini | NL command → tickets/plans/dispatch | `logAiEvent`→`ai_system_events`; **no tokens/cost** | HIGH |
| 13 | **Inbox classification** | `inbox/llmClassificationService.ts:107` | gpt-4o-mini | email → routing verdict for Ali's inbox | `InboxClassification`; **tokens not persisted** | MEDIUM |
| 14 | **Inbox reply draft / style** | `inbox/replyDraftService.ts:89`, `styleLearningService.ts:165` | gpt-4o-mini | thread → draft reply in Ali's voice | **bypasses wrapper** | MEDIUM |
| 15 | **Campaign self-healing** | `selfHealingService.ts:245` | env model | campaign metrics → auto-fix/flag | **AUDITED** (wrapper) | MEDIUM |
| 16 | **Executive deliverable** | `executiveDeliverableService.ts:301` | env model | data → exec narrative | **bypasses wrapper** | MEDIUM |
| 17 | **PMO daily email** | `scripts/lib/launchPmoDailyUpdate.js:374` | gpt-4o-mini | project state → Ali's daily summary | **no audit (OS-cron script)** | MEDIUM |
| 18 | **Mentor matching** | `mentorService.ts:199` | env model | profiles → mentor assignment | **bypasses wrapper** | MEDIUM |
| 19 | **Brownfield/UI/visual analysis** | `brownfieldDiscoveryService.ts:603`, `uiAnalysisService.ts:31`, `visualScanService.ts:202` (vision) | gpt-4o(-mini) | code/screenshots → analysis | **bypasses wrapper** | MEDIUM |
| 20 | **Intelligence OS engine (NL→SQL→narrative)** | `intelligence/ai_engine/orchestrator/query_engine.py:39,210` | gpt-4o | NL question → SQL + answer over prod data | **no token/cost/trace anywhere** | HIGH |
| 21 | **Vector memory / RAG** | `intelligence/memory/vectorMemory.ts`; embed `ai_engine/services/embedding_service.py:44` | text-embedding-3-small (1536d) | text → embeddings + similarity search | **retrieved doc IDs/citations NOT persisted**; "sources" = table names | MEDIUM |
| 22 | **Prompt lab** | `promptLabService.ts:67` | gpt-4o-mini | admin prompt tests | execution logged; **usage not captured** | LOW |
| 23 | **Anthropic content watcher** | `services/anthropicContentWatcher.ts` + `anthropicCurriculumImpactAgent.ts:81` | read-only fetch + gpt-4o-mini scoring | public Anthropic docs → change events | `AnthropicChangeEvent` | LOW |
| 24 | **MCP servers** | `mcp/portalApiServer.js`, `postgresAnalyticsServer.js` | none (read-only tools) | Claude Code tool calls → state/analytics | connection/tool logs | LOW |

**Rule-based (no LLM) — confirmed NOT FOUND any completion call:** lead scoring (`leadScoringEngine.ts`), lead intelligence (`leadIntelligenceService.ts`), opportunity scoring (`opportunityScoringService.ts:20-39`), executive briefing digest (`executiveBriefingService.ts`), conversation intelligence (`mayaConversationIntelligenceService.ts:34`), ops priority engine (`priorityEngineService.ts` — deterministic, writes `OpsAiAssessment` with `llm_*: null`).

## Per-capability detail (Purpose / Risks / Owner / Approval / Observability)

For the four **CRITICAL** capabilities (full detail; remainder summarized in the register):

**#1 Maya chatbot** — *Purpose:* convert public visitors. *Risks:* unauthenticated public endpoint executes tool-actions (creates leads/books) on model output; PII (name/email) sent to OpenAI unredacted (`chatService.ts:57-60`); no per-message user/IP linkage for audit. *Owner:* unassigned (admissions). *Approval:* none — fully autonomous (HITL Level 1). *Observability:* tokens only; no trace/cost/decision log.

**#2 Synthflow voice** — *Purpose:* AI phone outreach to prospects. *Risks:* outbound calls with **no consent/TCPA gate** (`grep consent` NOT FOUND in messaging path); irreversible; gated only by `enableVoiceCalls` flag, **not** the kill switch. *Owner:* unassigned. *Approval:* none. *Observability:* call logged to `Activity`; LLM summary unaudited.

**#3 OpenClaw social posting** — *Purpose:* automated brand engagement. *Risks:* publishes to public platforms; "human review" is a **deterministic score auto-approving** (`openclawQualityGateAgent.ts:130,262`); trigger route `openclawRoutes.ts:584` is **unauthenticated**. *Owner:* unassigned (marketing). *Approval:* AI self-approval. *Observability:* `OpenclawTask` + `actions[]`; no decision/cost log.

**#4 Outbound email** — *Purpose:* lead nurture. *Risks:* `enableAutoEmail` defaults **ON** (`env.ts:63`); transport `emailService.sendMail` is **not** flag- or kill-switch-gated; **no idempotency** despite `CLAUDE.md` mandate → duplicate-send risk; PII logged (`emailService.ts:110,505`). *Owner:* unassigned. *Approval:* none for automation. *Observability:* `AutomationLog`; tokens dropped.

## Cross-cutting findings (apply to nearly every capability)

1. **No unified trace ID** across an AI workflow (only 3 models carry `trace_id`, populated only inside one in-process engine run).
2. **No dollar cost** computed/persisted — `llm_cost_usd` columns written `null` (`priorityEngineService.ts:350`); `agent_total_cost_usd` written `0` (`metricsDailyService.ts:85`); only an in-memory vision *estimate* exists (`operationalCostGovernance.ts:16`, "not for billing").
3. **No prompt versioning** — prompts hardcoded as string literals at call sites; a `prompt_templates` table exists (`models/PromptTemplate.ts`, `timestamps:false`) but is **not** the runtime source for chat/agent inference.
4. **No PII redaction** before LLM/voice; **no consent capture**; **no retention policy**.
5. **Inconsistent auditing** — 8 of ~60 LLM services log to `content_generation_logs`; the rest are dark.

## Evidence gaps
- Static code only; runtime row counts of audit tables unverified.
- 40+ `scripts/*.js` operational LLM scripts: call sites confirmed, per-script persistence not exhaustively traced.
- `-Ali-AI` duplicate variants not diffed against canonical files.
