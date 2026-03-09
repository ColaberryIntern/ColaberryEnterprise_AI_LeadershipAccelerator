# AI Operations Layer — Architecture

Technical architecture of the AI Operations Layer that adds health monitoring, self-healing agents, and observability to the campaign engine.

---

## Database Schema

Five new tables support the operations layer:

### ai_agents

Stores registered AI agent definitions and their current state.

| Column | Type | Purpose |
|---|---|---|
| id | UUID | Primary key |
| name | VARCHAR | Agent identifier (e.g., `campaign-repair`) |
| type | ENUM | `repair`, `content_optimization`, `conversation_optimization` |
| status | ENUM | `active`, `paused`, `disabled` |
| config | JSONB | Agent-specific configuration and thresholds |
| lastRunAt | TIMESTAMP | Last execution time |
| totalActions | INTEGER | Lifetime action count |
| successRate | DECIMAL | Rolling success percentage |

### ai_agent_activity_logs

Immutable log of every action taken by an AI agent.

| Column | Type | Purpose |
|---|---|---|
| id | UUID | Primary key |
| agentId | FK → ai_agents | Which agent acted |
| actionType | VARCHAR | `retry_send`, `rewrite_content`, `pause_campaign`, etc. |
| targetType | VARCHAR | `campaign`, `scheduled_email`, `follow_up_step` |
| targetId | UUID | ID of the affected record |
| reason | TEXT | Why the agent took this action |
| confidence | DECIMAL | Agent confidence score (0.0–1.0) |
| beforeState | JSONB | Snapshot before the action |
| afterState | JSONB | Snapshot after the action |
| outcome | ENUM | `success`, `failure`, `skipped` |

### campaign_health

Point-in-time health snapshots for each active campaign.

| Column | Type | Purpose |
|---|---|---|
| id | UUID | Primary key |
| campaignId | FK → campaigns | Monitored campaign |
| overallScore | INTEGER | Weighted health score 0–100 |
| channelHealth | JSONB | Per-channel connectivity status |
| deliveryRate | DECIMAL | Successful sends / total attempts |
| aiGenerationHealth | DECIMAL | Successful AI generations / total |
| engagementScore | DECIMAL | Opens, clicks, replies normalized |
| errorRate | DECIMAL | Errors / total actions |
| scannedAt | TIMESTAMP | When this snapshot was taken |

### campaign_errors

Aggregated error tracking with resolution status.

| Column | Type | Purpose |
|---|---|---|
| id | UUID | Primary key |
| campaignId | FK → campaigns | Affected campaign |
| errorType | VARCHAR | `delivery_failure`, `ai_generation`, `channel_timeout`, etc. |
| errorMessage | TEXT | Raw error detail |
| count | INTEGER | Occurrence count for this error pattern |
| firstSeen | TIMESTAMP | First occurrence |
| lastSeen | TIMESTAMP | Most recent occurrence |
| resolved | BOOLEAN | Whether the error has been resolved |
| resolvedBy | VARCHAR | `agent:campaign-repair`, `manual`, etc. |

### ai_system_events

System-wide event log for the AI operations layer itself.

| Column | Type | Purpose |
|---|---|---|
| id | UUID | Primary key |
| eventType | VARCHAR | `agent_started`, `health_scan`, `threshold_breach`, `agent_error` |
| source | VARCHAR | Originating component |
| severity | ENUM | `info`, `warning`, `error`, `critical` |
| payload | JSONB | Event-specific data |

---

## Self-Healing Agents

### 1. CampaignRepairAgent

**Schedule**: Every 20 minutes
**Purpose**: Detect and fix delivery failures and stalled campaigns.

| Action | Trigger | Behavior |
|---|---|---|
| Retry failed sends | ScheduledEmail with `failed` status, < 3 retries | Re-queue with exponential backoff |
| Detect stalls | Campaign active but no sends in 2x expected interval | Log warning, retry next batch; pause if repeated |
| Channel failover | Primary channel errors > threshold | Switch to fallback channel if configured |

**Safety**: Max 3 retries per item. Pauses campaign and alerts after repeated failures.

### 2. ContentOptimizationAgent

**Schedule**: Every 6 hours
**Purpose**: Improve AI-generated content based on engagement signals.

| Action | Trigger | Behavior |
|---|---|---|
| Rewrite subject lines | Open rate < 15% over 50+ sends | Generate new variant via OpenAI with engagement context |
| Rewrite body content | Click rate < 2% over 50+ sends | Regenerate with updated prompt including performance data |
| A/B variant creation | Sufficient volume on a step | Create alternative content, split future sends |

**Safety**: Logs before/after content. Requires minimum sample size before acting. Confidence threshold 0.7.

### 3. ConversationOptimizationAgent

**Schedule**: Daily (2:00 AM)
**Purpose**: Enhance follow-up sequence step instructions based on aggregate performance.

| Action | Trigger | Behavior |
|---|---|---|
| Enhance step prompts | Step reply rate below campaign average | Rewrite AI instructions with performance context |
| Adjust timing | Low engagement at current delay | Suggest delay adjustments (logged, not auto-applied) |
| Flag underperformers | Step conversion < 50% of campaign average | Mark for review, log recommendation |

**Safety**: Prompt changes logged with full diff. Timing changes are recommendations only.

---

## Campaign Health Scanner

Runs every 15 minutes against all active campaigns.

### Health Score Calculation

```
Overall Score = weighted average of:
  Channel Connectivity  (weight: 0.25) — Are integrations responding?
  Delivery Rate         (weight: 0.30) — Successful sends / total attempts
  AI Generation Health  (weight: 0.15) — Successful content generations / total
  Engagement Score      (weight: 0.20) — Normalized opens + clicks + replies
  Error Rate (inverse)  (weight: 0.10) — 1 - (errors / total actions)
```

### Score Thresholds

| Range | Status | Action |
|---|---|---|
| 80–100 | Healthy | No action |
| 60–79 | Degraded | Alert, trigger repair agent |
| 40–59 | Critical | Pause new sends, escalate |
| 0–39 | Failed | Pause campaign, notify admin |

---

## AI Orchestrator

Central coordinator that manages agent scheduling and lifecycle.

```
┌─────────────────────────────────────────────────────┐
│                  AI Orchestrator                     │
│                  (node-cron)                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ Health      │  │ Campaign     │  │ Content   │  │
│  │ Scanner     │  │ Repair       │  │ Optimize  │  │
│  │ (15 min)    │  │ Agent        │  │ Agent     │  │
│  │             │  │ (20 min)     │  │ (6 hr)    │  │
│  └──────┬──────┘  └──────┬───────┘  └─────┬─────┘  │
│         │                │               │          │
│         ▼                ▼               ▼          │
│  ┌──────────────────────────────────────────────┐   │
│  │         ai_agent_activity_logs               │   │
│  │         campaign_health                      │   │
│  │         campaign_errors                      │   │
│  │         ai_system_events                     │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────┐                                    │
│  │Conversation │                                    │
│  │ Optimize    │                                    │
│  │ Agent       │                                    │
│  │ (daily)     │                                    │
│  └─────────────┘                                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Orchestrator Responsibilities

1. Start/stop agents based on their `status` in `ai_agents` table
2. Enforce schedule cadence via cron expressions
3. Prevent overlapping runs (lock check before each execution)
4. Log all agent starts, completions, and errors to `ai_system_events`
5. Respect admin overrides from the dashboard controls

---

## Safety Controls

Every agent action is governed by:

- **Confidence scoring**: Actions below the confidence threshold are logged but skipped
- **Before/after snapshots**: Full state captured in `ai_agent_activity_logs`
- **Reason logging**: Plain-text explanation of why the action was taken
- **Rate limiting**: Maximum actions per run to prevent cascading changes
- **Admin override**: All agents can be paused or disabled from the dashboard
- **Audit trail**: All activity is queryable and exportable

---

## Admin Dashboard

Accessible at `/admin/ai-settings` with five tabs:

| Tab | Content |
|---|---|
| **Overview** | System summary — active agents, health distribution, recent actions, error count |
| **Agent Activity** | Filterable log of all agent actions with reason, confidence, outcome |
| **Health Monitor** | Per-campaign health scores, trend charts, component breakdown |
| **Error Center** | Aggregated errors by type, resolution status, affected campaigns |
| **Controls** | Enable/disable agents, adjust thresholds, trigger manual scans, pause all automation |

---

## Integration Points

```
Existing System                    AI Operations Layer
─────────────────                  ────────────────────
Campaign Engine  ◀──── reads ────  Health Scanner
ScheduledEmail   ◀──── retries ──  CampaignRepairAgent
FollowUpSequence ◀──── rewrites ─  ContentOptimizationAgent
FollowUpSequence ◀──── enhances ─  ConversationOptimizationAgent
EventLedger      ◀──── writes ───  All agents (via system events)
Admin UI         ◀──── serves ───  AI Settings Dashboard
```

The AI Operations Layer reads from the existing campaign tables and writes corrective actions back through the same service layer the campaign engine uses, ensuring consistency.
