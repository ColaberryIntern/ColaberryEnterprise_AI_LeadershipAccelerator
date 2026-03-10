# AI Agent Registry Audit

**Generated**: 2026-03-09
**Total Registered Agents**: 16
**Categories**: outbound (3), behavioral (4), maintenance (2), accelerator (2), ai_ops (4), + on-demand services

---

## Registered Autonomous Agents

### Outbound (3 agents)

| Agent | Type | Schedule | Source | Risk |
|---|---|---|---|---|
| **ScheduledActionsProcessor** | scheduled_processor | `*/5 * * * *` | schedulerService.ts | **High** — sends emails, voice calls, SMS to real leads |
| **NoShowDetector** | scheduled_processor | `*/15 * * * *` | schedulerService.ts | Medium — modifies call/lead status, enrolls in recovery |
| **EmailDigest** | digest | `0 * * * *` | schedulerService.ts | Low — sends admin digests only |

**ScheduledActionsProcessor**: Processes pending ScheduledEmail records across all channels (email, voice, SMS). Applies AI content generation at send time, handles test mode overrides, and enforces pacing/rate limits per campaign.

**NoShowDetector**: Detects strategy calls >30 minutes past scheduled time still marked "scheduled". Marks as no_show, auto-completes CampaignLead, cancels prep nudges, and enrolls lead in recovery sequence.

**EmailDigest**: Checks if email digest is enabled. Compiles and sends daily/weekly digest emails at the configured hour and day to admin recipients.

---

### Behavioral Intelligence (4 agents)

| Agent | Type | Schedule | Source | Risk |
|---|---|---|---|---|
| **BehavioralSignalDetector** | signal_detector | `*/10 * * * *` | behavioralSignalService.ts | Low — read-only analysis, writes signals |
| **IntentScoreRecomputer** | intent_scorer | `7,22,37,52 * * * *` | intentScoringService.ts | Low — updates computed scores only |
| **BehavioralTriggerEvaluator** | trigger_evaluator | `5,15,25,35,45,55 * * * *` | behavioralTriggerService.ts | Medium — auto-enrolls leads in campaigns |
| **OpportunityScoreRecomputer** | opportunity_scorer | `3,23,43 * * * *` | opportunityScoringService.ts | Low — updates computed scores only |

**BehavioralSignalDetector**: Detects 16 buying signal types from PageEvent data on closed visitor sessions. Signals include pricing page visits, enrollment CTA clicks, deep scrolls, form submissions, and multi-category research patterns.

**IntentScoreRecomputer**: Recomputes intent scores for visitors with recent behavioral signals. Uses time-decay weighting (7-day half-life) to prioritize recent activity. Maps to intent levels: low, medium, high, very high.

**BehavioralTriggerEvaluator**: Evaluates behavioral trigger rules and automatically enrolls qualifying leads in behavior-triggered campaigns. Creates CampaignLead records and queues initial outreach actions.

**OpportunityScoreRecomputer**: Recomputes opportunity scores for active leads based on behavioral signals, intent scores, ICP alignment, and campaign engagement metrics.

**ICPInsightComputer** (listed under behavioral):

| Agent | Type | Schedule | Source | Risk |
|---|---|---|---|---|
| **ICPInsightComputer** | insight_computer | `0 2 * * *` | icpInsightService.ts | Low — aggregates analytics, updates ICP stats |

Computes aggregated ICP insights from 90 days of interaction data. Analyzes by industry, title, company size, and source type. Uses Wilson score confidence intervals. Auto-refreshes active ICP profile stats.

---

### Maintenance (2 agents)

| Agent | Type | Schedule | Source | Risk |
|---|---|---|---|---|
| **PageEventCleanup** | maintenance | `0 3 * * *` | schedulerService.ts | Low — deletes old data (90-day retention) |
| **ChatMessageCleanup** | maintenance | `30 3 * * *` | schedulerService.ts | Low — deletes old data (180-day retention) |

**PageEventCleanup**: Data retention — deletes PageEvent records older than 90 days.

**ChatMessageCleanup**: Data retention — deletes ChatMessage records older than 180 days.

---

### Accelerator (2 agents)

| Agent | Type | Schedule | Source | Risk |
|---|---|---|---|---|
| **SessionReminders** | reminder | `*/30 * * * *` | schedulerService.ts | Medium — sends emails to enrolled participants |
| **SessionLifecycle** | session_manager | `*/5 * * * *` | schedulerService.ts | Medium — modifies session status, sends recap emails |

**SessionReminders**: Sends 24-hour and 1-hour reminder emails to enrolled participants for upcoming live sessions.

**SessionLifecycle**: Manages session state transitions: marks sessions as "live" 15 min before start and "completed" 30 min after end. Post-completion: detects absent participants, sends session recaps, and recomputes readiness scores.

---

### AI Operations (4 agents)

| Agent | Type | Schedule | Source | Risk |
|---|---|---|---|---|
| **CampaignHealthScanner** | health_scanner | `*/15 * * * *` | campaignHealthScanner.ts | Low — read-only health scoring |
| **CampaignRepairAgent** | repair | `8,28,48 * * * *` | agents/campaignRepairAgent.ts | **High** — retries failed sends, modifies campaign state |
| **ContentOptimizationAgent** | content_optimization | `0 */6 * * *` | agents/contentOptimizationAgent.ts | **High** — rewrites email content using AI |
| **ConversationOptimizationAgent** | conversation_optimization | `0 4 * * *` | agents/conversationOptimizationAgent.ts | Medium — enhances AI instructions for future sends |

**CampaignHealthScanner**: Scans all active campaigns and computes health scores (0-100) based on channel connectivity, delivery rate, AI generation success, engagement metrics, and error rate.

**CampaignRepairAgent**: Detects and repairs broken campaign automations. Retries failed ScheduledEmail sends (up to 3 attempts with 30min backoff). Detects stalled campaigns. Auto-resolves errors older than 7 days. Config: `auto_retry_enabled`, `max_retry_attempts: 3`, `retry_delay_minutes: 30`, `auto_resolve_stale_days: 7`.

**ContentOptimizationAgent**: Detects campaigns with low engagement (open rate <10% or reply rate <1% over 48h) and rewrites pending email subjects and bodies using AI. Rate-limited to 10 rewrites per run with 6-hour cooldown. Config: `open_rate_threshold: 0.10`, `reply_rate_threshold: 0.01`, `min_sample_size: 10`.

**ConversationOptimizationAgent**: Detects step-level conversation dropoffs (>80% reply rate decline between steps) and enhances AI instructions for future sends. Rate-limited to 5 enhancements per run with 24-hour cooldown. Config: `dropoff_threshold: 0.80`, `min_sent_per_step: 5`.

---

## On-Demand AI Services (Not Scheduled)

These services are invoked by user actions or other agents, not on a schedule:

| Service | File | Trigger | Purpose |
|---|---|---|---|
| **aiMessageService** | `services/aiMessageService.ts` | On send | Generates personalized email/SMS/voice content using Claude API |
| **contentGenerationService** | `services/contentGenerationService.ts` | On demand | Generates campaign content, follow-up sequences, ICP profiles |
| **autoRepairService** | `services/agents/campaignRepairAgent.ts` | By CampaignRepairAgent | Executes repair actions (retry sends, unstall campaigns) |
| **icpInsightService** | `services/icpInsightService.ts` | By ICPInsightComputer | Computes ICP analytics from interaction data |
| **behavioralSignalService** | `services/behavioralSignalService.ts` | By BehavioralSignalDetector | Detects buying signals from visitor sessions |
| **intentScoringService** | `services/intentScoringService.ts` | By IntentScoreRecomputer | Computes intent scores with time-decay |
| **opportunityScoringService** | `services/opportunityScoringService.ts` | By OpportunityScoreRecomputer | Computes opportunity scores for leads |

---

## Safety Controls

### Per-Agent Controls
- **enabled** flag — disables agent without removing it (checked by `instrumentCronJob` wrapper)
- **status: paused** — temporarily pauses agent execution
- **config overrides** — per-agent thresholds (retry limits, rate limits, cooldowns)

### System-Wide Controls
- **Admin UI** at `/admin/ai-settings` — 6-tab control panel (Overview, Agent Registry, Activity, Health Monitor, Error Center, Controls)
- **Test mode** — global and per-campaign test mode redirects all outbound to test recipients
- **Confidence scoring** — AI agents log confidence levels; low-confidence actions are flagged

### Observability
- **trace_id** — UUID linking all activity log entries from a single execution pass
- **duration_ms** — execution time tracked per run
- **before/after state** — AI agents snapshot state before and after modifications
- **reason logging** — every agent action includes human-readable reasoning
- **error tracking** — `campaign_errors` table with severity, stack traces, AI analysis, repair attempt links

### Rate Limiting
- ContentOptimizationAgent: 10 rewrites/run, 6h cooldown
- ConversationOptimizationAgent: 5 enhancements/run, 24h cooldown
- CampaignRepairAgent: 3 retry attempts per failed send, 30min backoff
- ScheduledActionsProcessor: per-campaign `max_leads_per_cycle` (default 10)

---

## Execution Flow

```
Server Start
  |
  +-> schedulerService.startScheduler()
  |     |-> 12 cron jobs registered (each wrapped with instrumentCronJob)
  |     +-> aiOpsScheduler.startAIOpsScheduler()
  |           |-> seedAgentRegistry() — upserts 16 agent records
  |           +-> 4 AI Ops cron jobs registered (instrumented via aiOrchestrator)
  |
  +-> Each cron tick:
        1. instrumentCronJob checks agent.enabled && status !== 'paused'
        2. Sets agent status = 'running'
        3. Generates trace_id (UUID)
        4. Executes job function
        5. Records duration_ms
        6. Updates agent: run_count, avg_duration_ms, last_run_at
        7. Logs to ai_agent_activity_logs (trace_id, result, duration)
        8. If error: updates error_count, last_error, last_error_at
        9. Sets agent status = 'idle'
```

---

## Database Tables

| Table | Purpose |
|---|---|
| `ai_agents` | Agent registry (16 rows) — status, config, metrics, schedule |
| `ai_agent_activity_logs` | Immutable execution log — action, result, confidence, before/after, trace_id, duration_ms |
| `campaign_health` | Health score snapshots per campaign (0-100) |
| `campaign_errors` | Error tracking with severity, stack traces, AI analysis, repair links |
| `ai_system_events` | System-wide event log for AI operations |

---

## Files

| File | Role |
|---|---|
| `backend/src/services/schedulerService.ts` | Main scheduler — 12 cron jobs + instrumentCronJob wrapper |
| `backend/src/services/aiOpsScheduler.ts` | AI Ops scheduler — 4 cron jobs + agent seed |
| `backend/src/services/aiOrchestrator.ts` | Central orchestrator for AI Ops agents — trace_id, duration, metrics |
| `backend/src/services/agentRegistrySeed.ts` | 16-agent registry seed data |
| `backend/src/services/aiOpsService.ts` | API service layer — registry queries, drill-down data, agent control |
| `backend/src/services/aiEventService.ts` | Event/activity logging helper |
| `backend/src/services/campaignHealthScanner.ts` | Health score computation |
| `backend/src/services/agents/campaignRepairAgent.ts` | Auto-repair agent |
| `backend/src/services/agents/contentOptimizationAgent.ts` | Content rewrite agent |
| `backend/src/services/agents/conversationOptimizationAgent.ts` | Conversation optimization agent |
| `backend/src/models/AiAgent.ts` | Agent model (24 columns) |
| `backend/src/models/AiAgentActivityLog.ts` | Activity log model (15 columns) |
| `backend/src/models/CampaignError.ts` | Error model (15 columns) |
| `frontend/src/pages/admin/AdminAISettingsPage.tsx` | Main AI Ops admin page (6 tabs) |
| `frontend/src/pages/admin/ai-settings/AgentRegistryTab.tsx` | Agent registry table |
| `frontend/src/pages/admin/ai-settings/AgentDetailModal.tsx` | Agent drill-down modal |
| `frontend/src/pages/admin/ai-settings/ActivityDetailModal.tsx` | Activity drill-down modal |
| `frontend/src/pages/admin/ai-settings/ExecutionTraceModal.tsx` | Execution trace timeline |
| `frontend/src/pages/admin/ai-settings/ErrorDetailModal.tsx` | Error drill-down modal |
| `frontend/src/pages/admin/ai-settings/CampaignTimelineModal.tsx` | Campaign timeline modal |
