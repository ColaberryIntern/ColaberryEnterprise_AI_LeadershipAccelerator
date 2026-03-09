# AI Campaign Engine — Comprehensive Guide

End-to-end reference for the campaign engine including lifecycle, multi-channel outreach, AI content generation, health monitoring, self-healing, and admin controls.

---

## Table of Contents

1. [Campaign Lifecycle](#campaign-lifecycle)
2. [Multi-Channel Outreach](#multi-channel-outreach)
3. [AI Content Generation](#ai-content-generation)
4. [Health Monitoring and Scoring](#health-monitoring-and-scoring)
5. [Self-Healing Agents](#self-healing-agents)
6. [Error Tracking and Resolution](#error-tracking-and-resolution)
7. [Admin Controls and Manual Overrides](#admin-controls-and-manual-overrides)
8. [Event Logging and Audit Trail](#event-logging-and-audit-trail)

---

## Campaign Lifecycle

### States

```
  DRAFT ──▶ ACTIVE ──▶ COMPLETED
               │
               ▼
            PAUSED ──▶ ACTIVE (resume)
```

| State | Description | Allowed Transitions |
|---|---|---|
| **draft** | Campaign configured but not running. Sequences and leads can be edited. | → active |
| **active** | Scheduler is processing this campaign. Sends are being queued and dispatched. | → paused, → completed |
| **paused** | Temporarily halted. No new sends queued. Existing queue items are held. | → active |
| **completed** | All sequences finished for all leads. Terminal state. | None |

### Activation Flow

1. Admin sets campaign to `active`
2. Scheduler picks up campaign on next 5-minute cycle
3. For each lead assigned to the campaign, FollowUpSequence steps are evaluated
4. Steps whose delay has elapsed are materialized into ScheduledEmail rows
5. ScheduledEmail rows are processed (content generated, then dispatched)
6. When all leads have completed all steps, campaign moves to `completed`

---

## Multi-Channel Outreach

Each FollowUpSequence step specifies a channel. The system supports three channels:

### Email (Mandrill / SMTP)

- Content generated via OpenAI at send time
- Supports HTML templates with merge fields
- Delivery tracked via Mandrill webhooks (opens, clicks, bounces)
- Fallback to SMTP if Mandrill unavailable

### Voice (Synthflow)

- AI voice calls placed through Synthflow API
- Call script generated via OpenAI based on step instructions and lead context
- Call outcomes logged (answered, voicemail, no answer, failed)
- Duration and transcript captured when available

### SMS (GoHighLevel)

- Messages sent via GoHighLevel API
- Content generated via OpenAI, kept under 160 characters when possible
- Delivery status tracked via GHL webhooks
- Reply handling routed back to GHL conversation

### Channel Selection per Step

```
FollowUpSequence step config:
{
  "stepNumber": 2,
  "channel": "email",          // email | voice | sms
  "delayDays": 3,
  "delayHours": 0,
  "aiInstructions": "Follow up on the initial outreach, reference their company's recent funding round",
  "fallbackChannel": "sms"     // optional
}
```

---

## AI Content Generation

Content is generated at send time, not at queue time. This ensures personalization uses the latest available data.

### Generation Flow

```
ScheduledEmail ready to send
        │
        ▼
Gather context:
  - Lead profile (name, title, company, industry)
  - ICP profile (pain points, value props)
  - Campaign tone and instructions
  - Step-specific AI instructions
  - Previous interactions (if any)
        │
        ▼
OpenAI API call
  - System prompt: campaign context + brand voice
  - User prompt: step instructions + lead specifics
        │
        ▼
Content returned
  - Subject line (email)
  - Body text
  - Personalization tokens resolved
        │
        ▼
Dispatch via channel handler
```

### Personalization Signals

| Signal | Source | Usage |
|---|---|---|
| Lead name, title, company | Apollo / CRM | Direct merge fields |
| Industry and company size | Apollo enrichment | Tone and reference selection |
| ICP pain points | ICP Profile | Problem framing in content |
| Previous step outcomes | ScheduledEmail history | Adjust follow-up approach |
| Engagement data | Webhook events | Inform re-engagement strategy |

---

## Health Monitoring and Scoring

The Campaign Health Scanner runs every 15 minutes and produces a health snapshot for each active campaign.

### Health Score Components

| Component | Weight | Measurement | Healthy Threshold |
|---|---|---|---|
| Channel Connectivity | 25% | API ping / recent success | All channels responding |
| Delivery Rate | 30% | Sent successfully / total dispatched | > 95% |
| AI Generation Health | 15% | Successful generations / total attempts | > 98% |
| Engagement Score | 20% | Weighted: opens (1x) + clicks (2x) + replies (3x) | > 10% composite |
| Error Rate (inverse) | 10% | 1 - (errors / total actions) | < 2% errors |

### Score Interpretation

| Score | Status | Visual | System Response |
|---|---|---|---|
| 80–100 | Healthy | Green | No action needed |
| 60–79 | Degraded | Yellow | Repair agent triggered, admin notified |
| 40–59 | Critical | Orange | New sends paused, escalation created |
| 0–39 | Failed | Red | Campaign paused, admin alerted immediately |

### Trend Tracking

Health scores are stored historically, enabling trend analysis. A campaign that drops 20+ points between scans triggers an immediate repair agent run regardless of absolute score.

---

## Self-Healing Agents

Three autonomous agents monitor and correct campaign issues.

### CampaignRepairAgent

**Runs**: Every 20 minutes
**Focus**: Delivery failures and operational stalls

| Scenario | Detection | Action | Limit |
|---|---|---|---|
| Failed email send | ScheduledEmail status = `failed` | Retry with exponential backoff | 3 retries max |
| Failed voice call | Call outcome = `failed` | Retry after 30 min | 2 retries max |
| Failed SMS | GHL delivery status = `failed` | Retry once, then flag | 1 retry |
| Stalled campaign | No sends in 2x expected interval | Re-trigger scheduler for campaign | 1 re-trigger |
| Channel down | Consecutive failures > 5 | Switch to fallback channel | Auto-revert after 1 hour |

### ContentOptimizationAgent

**Runs**: Every 6 hours
**Focus**: Improving content performance

| Scenario | Detection | Action | Minimum Sample |
|---|---|---|---|
| Low open rate | < 15% opens | Regenerate subject lines | 50 sends |
| Low click rate | < 2% clicks | Rewrite body with new angle | 50 sends |
| Low reply rate | < 1% replies | Adjust tone and CTA | 30 sends |
| High unsubscribe | > 3% unsub rate | Soften approach, reduce frequency | 50 sends |

### ConversationOptimizationAgent

**Runs**: Daily at 2:00 AM
**Focus**: Step-level instruction quality

| Scenario | Detection | Action |
|---|---|---|
| Underperforming step | Reply rate < 50% of campaign average | Rewrite AI instructions |
| Drop-off point | Engagement drops sharply at a step | Flag for review, suggest timing change |
| Channel mismatch | Step channel underperforms alternatives | Recommend channel switch |

---

## Error Tracking and Resolution

### Error Categories

| Category | Examples | Severity |
|---|---|---|
| `delivery_failure` | SMTP timeout, GHL rate limit, Synthflow API error | High |
| `ai_generation` | OpenAI timeout, token limit exceeded, content filter | High |
| `channel_timeout` | Integration not responding within SLA | Medium |
| `data_error` | Missing lead email, invalid phone format | Low |
| `rate_limit` | API rate limit exceeded on external service | Medium |
| `auth_error` | Expired API key, invalid credentials | Critical |

### Error Lifecycle

```
Error occurs
     │
     ▼
Logged to campaign_errors (count incremented if pattern exists)
     │
     ▼
Repair agent evaluates on next run
     │
     ├──▶ Auto-resolved (retry succeeded) → resolved = true, resolvedBy = agent
     │
     └──▶ Cannot auto-resolve → remains open, surfaced in Error Center
                │
                ▼
         Admin reviews and resolves manually → resolvedBy = manual
```

### Error Aggregation

Errors are deduplicated by campaign + error type + message pattern. The `count` field tracks occurrences, and `firstSeen`/`lastSeen` timestamps show the window. This prevents log noise from repeated transient failures.

---

## Admin Controls and Manual Overrides

All AI operations are controllable from `/admin/ai-settings`.

### Agent Controls

| Control | Effect |
|---|---|
| Enable/Disable agent | Toggles `status` on `ai_agents` record; orchestrator respects on next cycle |
| Pause all automation | Master kill switch — all agents stop, health scanning continues (monitoring only) |
| Trigger manual scan | Run health scanner immediately outside of cron schedule |
| Adjust thresholds | Modify confidence minimums, sample sizes, retry limits per agent |

### Campaign-Level Overrides

| Override | Effect |
|---|---|
| Exclude campaign from agents | Campaign flagged as manually managed — agents skip it |
| Force health rescan | Immediately recompute health score for a specific campaign |
| Clear error history | Reset error counts (e.g., after fixing an integration issue) |
| Override health status | Manually set health status (e.g., mark healthy after manual fix) |

### Safety Guarantees

- No agent action is irreversible — all changes are logged with before/after state
- Agents can be disabled at any time without data loss
- Manual overrides take precedence over agent decisions
- Rate limits prevent agents from making excessive changes in a single run

---

## Event Logging and Audit Trail

### Log Destinations

| Log | What Goes In | Retention |
|---|---|---|
| `ai_agent_activity_logs` | Every agent action with full context | Indefinite |
| `ai_system_events` | Orchestrator lifecycle, health scans, threshold breaches | Indefinite |
| `campaign_health` | Health snapshots per campaign per scan | 90 days (configurable) |
| `campaign_errors` | Aggregated error patterns | Until resolved + 30 days |
| `EventLedger` (existing) | Agent actions also written here for unified timeline | Indefinite |

### Audit Fields

Every agent action log includes:

- **agentId**: Which agent acted
- **actionType**: What it did
- **targetType + targetId**: What it acted on
- **reason**: Plain-text explanation
- **confidence**: Numeric confidence score
- **beforeState**: JSON snapshot before the change
- **afterState**: JSON snapshot after the change
- **outcome**: Whether it succeeded, failed, or was skipped
- **timestamp**: When it happened

### Querying the Audit Trail

The admin dashboard provides filtered views across all logs. Common queries:

- "Show all actions taken on campaign X in the last 24 hours"
- "Show all failed repair attempts this week"
- "Show content rewrites with their before/after text"
- "Show all threshold breaches by severity"

---

## Quick Reference

| Component | Schedule | Purpose |
|---|---|---|
| Campaign Scheduler | Every 5 min | Process scheduled sends |
| Health Scanner | Every 15 min | Compute campaign health scores |
| CampaignRepairAgent | Every 20 min | Fix delivery failures and stalls |
| ContentOptimizationAgent | Every 6 hours | Improve underperforming content |
| ConversationOptimizationAgent | Daily 2:00 AM | Enhance step-level AI instructions |
