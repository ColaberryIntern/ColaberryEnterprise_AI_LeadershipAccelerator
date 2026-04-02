# Cory Autonomous Campaign System - Complete Implementation Blueprint

> Full architecture, data models, AI pipeline, and autonomous operations for building an AI-driven multi-channel campaign system from scratch.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Data Models (Complete Schemas)](#2-data-models)
3. [Campaign Creation and Configuration](#3-campaign-creation-and-configuration)
4. [The Scheduler Engine (Autonomous Execution)](#4-the-scheduler-engine)
5. [AI Message Generation Pipeline](#5-ai-message-generation-pipeline)
6. [Voice Call System (Synthflow)](#6-voice-call-system)
7. [SMS System (GHL)](#7-sms-system)
8. [Email Delivery (Mandrill/SMTP)](#8-email-delivery)
9. [Interaction Tracking and Webhooks](#9-interaction-tracking-and-webhooks)
10. [Lead Pipeline and Auto-Enrollment](#10-lead-pipeline-and-auto-enrollment)
11. [Autonomous Campaigns (Ramp + Evolution)](#11-autonomous-campaigns)
12. [Campaign Health and Self-Healing](#12-campaign-health-and-self-healing)
13. [Campaign Intelligence and Learning](#13-campaign-intelligence-and-learning)
14. [Cory Engine (AI COO)](#14-cory-engine)
15. [Autonomous Decision Engine](#15-autonomous-decision-engine)
16. [Behavioral Triggers and Visitor Tracking](#16-behavioral-triggers-and-visitor-tracking)
17. [LinkedIn Automation (OpenClaw)](#17-linkedin-automation)
18. [Communication Safety and Compliance](#18-communication-safety-and-compliance)
19. [Cron Schedule Reference](#19-cron-schedule-reference)
20. [Configuration and Environment Variables](#20-configuration-and-environment-variables)
21. [End-to-End Flow Examples](#21-end-to-end-flow-examples)
22. [Key Files Reference](#22-key-files-reference)

---

## 1. System Overview

### Architecture

The system follows an **Agent-First, Deterministic-Execution** model:

```
CORY (AI COO) - Strategic intelligence, monitors KPIs, proposes/approves decisions
       |
AUTONOMOUS ENGINE - Detects problems, plans fixes, auto-executes safe actions
       |
SCHEDULER - Claims pending actions, generates AI content, sends via channels
       |
CHANNELS - Email (Mandrill), Voice (Synthflow), SMS (GHL)
       |
TRACKING - Opens, clicks, replies, bounces, call outcomes
       |
LEARNING - Harvest insights, score confidence, apply to future campaigns
```

### Design Principles

1. **All message content is AI-generated at send-time** - not pre-templated
2. **Deterministic timing** - AI generates content, but scheduling uses fixed delays (never AI-chosen delays)
3. **Safety-first** - Every send passes through safety evaluation (unsubscribe, DNC, rate limits, test mode)
4. **Self-healing** - Failed actions retry, campaigns auto-repair, health scores trigger intervention
5. **Learning loop** - Campaign outcomes feed back into future AI generation prompts

### Tech Stack

- **Runtime**: Node.js + TypeScript
- **Database**: PostgreSQL (Sequelize ORM)
- **AI**: OpenAI (gpt-4o / gpt-4-turbo) for message generation
- **Email**: Mandrill SMTP relay (fallback: generic SMTP)
- **Voice**: Synthflow AI voice agents
- **SMS**: GoHighLevel (GHL) API
- **Lead Intelligence**: Apollo API
- **LinkedIn**: OpenClaw multi-agent system
- **Scheduling**: node-cron with database-driven overrides

---

## 2. Data Models

### 2.1 Campaign

**Table**: `campaigns` (UUID primary key)

```
id                  UUID (PK, auto-generated)
name                VARCHAR(255) NOT NULL
description         TEXT
type                ENUM: 'warm_nurture', 'cold_outbound', 're_engagement',
                          'behavioral_trigger', 'alumni', 'alumni_re_engagement',
                          'payment_readiness', 'executive_outreach'
status              ENUM: 'draft', 'active', 'paused', 'completed'
campaign_mode       ENUM: 'standard', 'autonomous'
sequence_id         UUID (FK to follow_up_sequences)
targeting_criteria  JSONB - filters for lead enrollment:
                    {
                      industries: string[],
                      title_patterns: string[],
                      company_size_min: number,
                      company_size_max: number,
                      score_min: number,
                      lead_source_type: string
                    }
channel_config      JSONB:
                    {
                      email: { enabled: bool, daily_limit: number },
                      voice: { enabled: bool, max_daily_calls: number },
                      sms: { enabled: bool }
                    }
ai_system_prompt    TEXT - campaign-wide AI personality/instructions
settings            JSONB:
                    {
                      test_mode_enabled: bool,
                      test_email: string,
                      test_phone: string,
                      delay_between_sends: number (seconds, default 120),
                      max_leads_per_cycle: number (default 10),
                      call_time_start: '09:00',
                      call_time_end: '17:00',
                      call_timezone: 'America/Chicago',
                      call_active_days: [1,2,3,4,5],
                      max_daily_calls: 50,
                      voicemail_enabled: bool,
                      auto_dnc_on_request: bool,
                      sender_email: string,
                      sender_name: string
                    }
budget_total        DECIMAL
budget_spent        DECIMAL
budget_cap          DECIMAL
cost_per_lead_target DECIMAL
expected_roi        DECIMAL
goals               TEXT
gtm_notes           TEXT
interest_group      VARCHAR - GHL integration identifier
qa_status           ENUM: 'untested', 'passed', 'failed'
ramp_state          JSONB (nullable) - autonomous ramping metadata
evolution_config    JSONB (nullable) - variant evolution settings
approval_status     ENUM: 'draft', 'pending_approval', 'approved', 'live', 'paused', 'completed'
approved_by         UUID
approved_at         TIMESTAMP
created_by          UUID
created_at          TIMESTAMP
updated_at          TIMESTAMP
```

### 2.2 Follow-Up Sequence

**Table**: `follow_up_sequences` (UUID primary key)

```
id                  UUID (PK)
name                VARCHAR(255)
description         TEXT
steps               JSONB[] - array of SequenceStep objects (see below)
created_at          TIMESTAMP
updated_at          TIMESTAMP
```

**SequenceStep structure**:
```
{
  delay_days: number,                     // Fixed calendar days from enrollment
  minutes_before_call?: number,           // T-minus for strategy call campaigns
  days_before_cohort_start?: number,      // T-minus for class readiness campaigns
  channel: 'email' | 'voice' | 'sms',
  subject: string,
  body_template: string,                  // Static fallback content
  ai_instructions: string,               // PRIMARY: prompt for AI generation
  ai_tone: string,                        // 'professional', 'warm', 'consultative'
  ai_context_notes?: string,
  step_goal?: string,                     // Intent context for AI
  max_attempts: number,                   // Retries (1 or 2)
  fallback_channel?: 'email' | 'sms',    // If primary fails
  voice_agent_type?: 'welcome' | 'interest',
  voice_prompt?: string
}
```

**Timing validation rules**:
- Max 12 steps per sequence
- Max 45-day campaign duration
- Min 2-day gap between steps (voice: 3-day gap)
- Email + SMS on same day allowed; duplicate channels on same day blocked
- System IGNORES AI-provided delays and assigns deterministic spacing

### 2.3 Campaign Lead

**Table**: `campaign_leads` (UUID PK, unique constraint on campaign_id + lead_id)

```
id                    UUID (PK)
campaign_id           UUID (FK to campaigns)
lead_id               INTEGER (FK to leads)
status                ENUM: 'enrolled', 'active', 'paused', 'completed', 'removed'
lifecycle_status      ENUM: 'active', 'inactive', 're_engaging', 'enrolled', 'dnd', 'bounced'
enrolled_at           TIMESTAMP
completed_at          TIMESTAMP (nullable)
outcome               VARCHAR - e.g., 'booked_call', 'unsubscribed'
current_step_index    INTEGER (0-based)
total_steps           INTEGER
last_activity_at      TIMESTAMP
next_action_at        TIMESTAMP
touchpoint_count      INTEGER
response_count        INTEGER
campaign_cycle_number INTEGER - for re-enrollment tracking
last_campaign_entry   TIMESTAMP
metadata              JSONB
```

### 2.4 Scheduled Email (Action Queue)

**Table**: `scheduled_emails` (UUID PK)

This is the **central work queue** - the scheduler processes records from this table.

```
id                    UUID (PK)
lead_id               INTEGER (FK to leads)
campaign_id           UUID (FK to campaigns, nullable)
sequence_id           UUID (FK to follow_up_sequences, nullable)
step_index            INTEGER (0-based position in sequence)
channel               ENUM: 'email', 'voice', 'sms'
subject               VARCHAR(255)
body                  TEXT (AI-generated or template)
to_email              VARCHAR
to_phone              VARCHAR
voice_agent_type      VARCHAR - 'interest', 'discovery', etc.
max_attempts          INTEGER (default 1, up to 2 for voice)
attempts_made         INTEGER
fallback_channel      VARCHAR
scheduled_for         TIMESTAMP - when to send (compared to NOW())
sent_at               TIMESTAMP
status                ENUM: 'pending', 'processing', 'sent', 'failed', 'cancelled', 'paused'
processing_started_at TIMESTAMP
processor_id          VARCHAR - concurrency control
ai_instructions       TEXT - prompt for AI generation
ai_generated          BOOLEAN
is_test_action        BOOLEAN
metadata              JSONB:
                      {
                        ai_tone: string,
                        ai_context_notes: string,
                        variant_id: UUID,
                        variant_label: string,
                        ai_tokens_used: number,
                        ai_model: string,
                        step_goal: string,
                        step_number: number
                      }
created_at            TIMESTAMP
```

**Key indexes**:
- `(status, scheduled_for)` - scheduler query
- `(status, processing_started_at)` - stale detection
- `(campaign_id, status)` - per-campaign filtering

### 2.5 Communication Log

**Table**: `communication_logs`

```
id                  UUID (PK)
lead_id             INTEGER (FK)
campaign_id         UUID (FK, nullable)
channel             ENUM: 'email', 'sms', 'voice'
direction           ENUM: 'outbound', 'inbound'
delivery_mode       ENUM: 'live', 'simulated', 'test'
status              ENUM: 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'
to_address          VARCHAR
from_address        VARCHAR
subject             VARCHAR
body                TEXT
provider            VARCHAR - 'mandrill', 'ghl', 'synthflow'
provider_message_id VARCHAR
provider_response   JSONB
metadata            JSONB
created_at          TIMESTAMP
```

### 2.6 Interaction Outcome

**Table**: `interaction_outcomes`

```
id                      UUID (PK)
lead_id                 INTEGER (FK)
campaign_id             UUID (FK, nullable)
scheduled_email_id      UUID (FK, nullable)
channel                 VARCHAR
step_index              INTEGER
outcome                 ENUM: 'sent', 'opened', 'clicked', 'replied', 'booked_meeting',
                              'converted', 'no_response', 'bounced', 'unsubscribed',
                              'voicemail', 'answered', 'declined'
lead_industry           VARCHAR
lead_title_category     VARCHAR
lead_company_size_bucket VARCHAR
lead_source_type        VARCHAR
metadata                JSONB
created_at              TIMESTAMP
```

### 2.7 Campaign Health

**Table**: `campaign_health` (UUID PK, unique per campaign)

```
id                  UUID (PK)
campaign_id         UUID (FK, unique)
health_score        INTEGER (0-100)
status              ENUM: 'healthy', 'degraded', 'critical', 'unknown'
lead_count          INTEGER
active_lead_count   INTEGER
sent_count          INTEGER (24h window)
error_count         INTEGER
components          JSONB:
                    {
                      email: { ok: bool, error?: string },
                      voice: { ok: bool, error?: string },
                      sms: { ok: bool, error?: string }
                    }
metrics             JSONB:
                    {
                      open_rate, reply_rate, bounce_rate,
                      ai_generation_success_rate,
                      delivery_latency_avg_ms
                    }
last_scan_at        TIMESTAMP
```

### 2.8 Campaign Error

**Table**: `campaign_errors`

```
id                  UUID (PK)
campaign_id         UUID (FK)
component           VARCHAR(50) - 'email_send', 'voice_api', 'sequence_step'
severity            ENUM: 'info', 'warning', 'error', 'critical'
error_message       TEXT
context             JSONB
resolved            BOOLEAN (default false)
resolved_at         TIMESTAMP
resolved_by         UUID
stack_trace         TEXT
ai_reasoning        TEXT - repair agent analysis
repair_attempt_id   UUID (FK to ai_agent_activity_logs)
retry_count         INTEGER
last_retry_at       TIMESTAMP
created_at          TIMESTAMP
```

### 2.9 Campaign Variant (A/B Testing)

**Table**: `campaign_variants`

```
id                      UUID (PK)
campaign_id             UUID (FK)
step_index              INTEGER
channel                 VARCHAR
variant_label           VARCHAR - 'A', 'B', 'C'
subject                 TEXT
body                    TEXT
ai_instructions_override TEXT
status                  ENUM: 'active', 'testing', 'promoted', 'retired'
sends                   INTEGER
opens                   INTEGER
replies                 INTEGER
bounces                 INTEGER
conversions             INTEGER
performance_score       FLOAT
parent_variant_id       UUID (FK, nullable)
generation_metadata     JSONB
created_at              TIMESTAMP
updated_at              TIMESTAMP
```

### 2.10 Campaign Insight

**Table**: `campaign_insights`

```
id                  SERIAL (PK)
campaign_id         UUID (nullable - null = global insight)
insight_type        ENUM: 'channel_perf', 'timing', 'audience', 'message_pattern', 'conversion'
category            VARCHAR(100)
insight             TEXT - human-readable finding
evidence            JSONB - data backing the insight
confidence          FLOAT (0-1)
applicable_to       JSONB - filters for when this insight applies
times_applied       INTEGER
last_applied_at     TIMESTAMP
created_at          TIMESTAMP
updated_at          TIMESTAMP
```

### 2.11 Intelligence Decision

**Table**: `intelligence_decisions`

```
decision_id         UUID (PK)
trace_id            UUID
problem_detected    TEXT
analysis_summary    TEXT
recommended_action  ENUM: 'update_campaign_config', 'adjust_lead_scoring',
                          'launch_ab_test', 'pause_campaign',
                          'update_agent_config', 'modify_agent_schedule'
action_details      JSONB
risk_score          INTEGER (0-100)
confidence_score    INTEGER (0-100)
risk_tier           ENUM: 'safe', 'moderate', 'risky', 'dangerous'
execution_status    ENUM: 'proposed', 'approved', 'executing', 'executed',
                          'rejected', 'failed', 'rolled_back'
executed_at         TIMESTAMP
executed_by         VARCHAR
before_state        JSONB
after_state         JSONB
impact_after_24h    JSONB
monitor_results     JSONB
reasoning           TEXT
observation_count   INTEGER
created_at          TIMESTAMP
updated_at          TIMESTAMP
```

---

## 3. Campaign Creation and Configuration

### Creation Flow

1. **Create campaign** with name, type, targeting criteria, channel config
2. **Link to sequence** (existing or newly created)
3. **Set AI system prompt** (brand voice, tone, messaging constraints)
4. **Configure settings** (send window, pacing limits, test mode)
5. **Approval gate**: draft -> pending_approval -> approved -> live

### Pre-Built Sequence Templates

**Standard Cold Outbound (7 steps, 21 days)**:
```
Day 0  [Email]  Cold intro - research industry, spark curiosity
Day 2  [Email]  Social proof - share graduate outcomes
Day 5  [Voice]  Intro call - identify pain, book strategy call
Day 8  [Email]  ROI justification - business case
Day 12 [Voice]  Follow-up call - overcome objections, close
Day 16 [Email]  Value-add - share actionable insight
Day 21 [Email]  Breakup - graceful close, leave door open
```

**Strategy Call Readiness (6 steps, countdown)**:
```
T-0     [Email]  Booking confirmation with call details
T-3d    [Email]  Encourage prep form completion
T-1d    [Email]  Preview agenda
T-6h    [SMS]    Reminder with prep form link
T-3h    [Email]  Productivity tips + logistics
T-15min [SMS]    Final reminder with Meet link
```

**Payment Readiness (5 steps, countdown to cohort start)**:
```
T-7d  [Email]  Welcome + spot reserved, payment required
T-5d  [Email]  Friendly reminder + benefits
T-3d  [Email]  Urgency - spots being finalized
T-2d  [Email]  Final reminder + offer help
T-1d  [Email]  Final notice - pay now or spot released
```

### Targeting Criteria Schema

```json
{
  "industries": ["SaaS", "FinTech", "Healthcare"],
  "title_patterns": ["CTO", "VP Engineering", "Director AI"],
  "company_size_min": 51,
  "company_size_max": 5000,
  "score_min": 40,
  "lead_source_type": "cold"
}
```

---

## 4. The Scheduler Engine

### Architecture

The scheduler runs every **5 minutes** and processes the `scheduled_emails` table.

### Processing Pipeline

**Step 0: Claim Pending Actions (Atomic)**
```sql
SELECT id FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY campaign_id ORDER BY scheduled_for ASC
  ) as rn
  FROM scheduled_emails
  WHERE status = 'pending'
    AND scheduled_for <= NOW()
    AND attempts_made < max_attempts
) ranked
WHERE rn <= 10
ORDER BY rn, scheduled_for ASC
LIMIT 40
FOR UPDATE SKIP LOCKED
```
- Max 40 actions per cycle, max 10 per campaign (round-robin)
- `FOR UPDATE SKIP LOCKED` prevents race conditions across instances
- Sets `status = 'processing'`, records `processor_id`

**Step 1: Interleave by Campaign**
- Reorder [A,A,A,B,B,B] to [A,B,A,B,A,B]
- Prevents single campaign from monopolizing processing time

**Step 2: Guard Checks (per action)**

a) **Campaign status guard** - Skip if campaign not active
b) **Payment guard** - Cancel payment reminders if already paid
c) **Pacing limits** - Auto-calculate max sends per cycle:
   ```
   pendingToday = count pending actions due today
   hoursRemaining = hours left in send window
   cyclesPerHour = 12 (every 5 min)
   limit = max(1, ceil((pendingToday / hoursRemaining) / cyclesPerHour))
   ```
d) **Send window** - Email/SMS: 8 AM to 5 PM CT, Mon-Fri
e) **Call schedule** - Voice: 9 AM to 5 PM CT, Mon-Fri, max 50/day
f) **Test safety** - Test actions can only target test domains

**Step 3: AI Content Generation**
- Load lead profile, campaign context, conversation history
- For autonomous campaigns: select A/B variant
- Call `generateMessage()` (see Section 5)
- Update action with generated body/subject

**Step 4: Safety Evaluation**
- Check unsubscribe list
- Check do-not-contact (DNC)
- Check bounce history (hard bounce = never retry)
- Check rate limits (max 2 emails/day per lead)
- Test mode redirect

**Step 5: Send via Channel**
- Email: Mandrill SMTP (Section 8)
- Voice: Synthflow API (Section 6)
- SMS: GHL API (Section 7)

**Step 6: Post-Send**
- Mark action `status = 'sent'`, record `sent_at`
- Create `InteractionOutcome` record
- Log to `communication_logs`
- Schedule next sequence step
- Advance lead pipeline stage

**Step 7: Error Handling**
- On failure: reset to `pending`, increment `attempts_made`, retry in 30 min
- After max retries: try `fallback_channel` if configured
- Final failure: mark `failed`, log error

### Stale Action Recovery

Runs every **15 minutes**:
- Finds actions stuck in `processing` for > 10 minutes
- Resets to `pending` for re-processing
- Prevents deadlocks if scheduler crashes

### Pacing Constants

```javascript
CYCLE_INTERVAL     = 5 minutes
MAX_PER_CYCLE      = 40 actions total
MAX_PER_CAMPAIGN   = 10 actions per campaign per cycle
DEFAULT_DELAY      = 120 seconds between sends
STALE_THRESHOLD    = 10 minutes
SEND_WINDOW_START  = '08:00' (CT)
SEND_WINDOW_END    = '17:00' (CT)
CALL_WINDOW_START  = '09:00' (CT)
CALL_WINDOW_END    = '17:00' (CT)
CALL_ACTIVE_DAYS   = [1, 2, 3, 4, 5] (Mon-Fri)
MAX_DAILY_CALLS    = 50
MAX_CALL_DURATION  = 300 seconds
```

---

## 5. AI Message Generation Pipeline

### Core Function: `generateMessage()`

**Input**:
```typescript
{
  channel: 'email' | 'sms' | 'voice',
  ai_instructions: string,
  tone?: string,
  lead: {
    name, email, company, title, industry, lead_score,
    technology_stack, annual_revenue, employee_count,
    linkedin_url, notes, interest_area
  },
  conversationHistory: [
    { timestamp, sender, channel, body, outcome }
  ],
  campaignContext?: {
    type, name, step_goal, step_number, system_prompt
  },
  cohortContext?: {
    name, start_date, seats_remaining
  },
  appointmentContext?: {
    scheduled_at, timezone, meet_link
  },
  compositeContext?: {
    lead_intent, engagement_state, icp_fit
  }
}
```

**Output**:
```typescript
{
  body: string,        // HTML for email, plain text for SMS/voice
  subject?: string,    // Email only
  tokens_used: number,
  model: string
}
```

### Prompt Construction

**System Prompt** includes:
- Campaign-wide AI personality and instructions
- Channel-specific output format rules:
  - Email: JSON with `subject` and `body` (HTML)
  - SMS: Plain text, max 160 chars, no opt-out language
  - Voice: Conversational script, talking points, objection handling
- URL whitelist (NEVER invent URLs):
  - `https://enterprise.colaberry.ai/ai-architect` (strategy call booking)
  - `https://enterprise.colaberry.ai/alumni-ai-champion` (alumni landing)
  - `https://enterprise.colaberry.ai` (main site)

**User Prompt** includes:
- Step-specific AI instructions and tone
- Lead profile (enriched: name, company, title, industry, score)
- ICP intelligence (pain indicators, buying signals)
- Conversation history (last 20 interactions, 30-day lookback)
- Campaign context (type, name, step number)
- Cohort info (name, start date, seats remaining)
- Appointment details (if strategy call scheduled)
- Proven patterns from CampaignInsight table

### Post-Generation Cleanup

1. Strip markdown code fences from LLM output
2. **URL sanitization**: Replace hallucinated Calendly/placeholder URLs with real booking link
3. **SMS cleanup**: Remove "Reply STOP" language, remove AI agent names, trim to 160 chars
4. **Validation**: Run through message validator (if composite context available)

### Configuration

```
AI Model:        gpt-4o or gpt-4-turbo (configurable)
Temperature:     0.7
Timeout:         60 seconds
Fallback:        Use template body if AI fails
Token tracking:  Stored in action metadata for cost analysis
```

---

## 6. Voice Call System

### Provider: Synthflow

**API**: `https://api.synthflow.ai/v2/calls`

### Call Flow

1. Scheduler claims voice action from queue
2. Load lead profile, conversation history, cohort info
3. Build voice prompt (AI-generated or hydrated template)
4. Call Synthflow API:
   ```json
   {
     "model_id": "SYNTHFLOW_INTEREST_AGENT_ID",
     "phone": "+1234567890",
     "name": "John Smith",
     "prompt": "AI-generated call script...",
     "custom_variables": [
       { "key": "company", "value": "Acme Corp" },
       { "key": "title", "value": "CTO" },
       { "key": "call_objective", "value": "Book strategy call" },
       { "key": "conversation_history", "value": "..." }
     ]
   }
   ```
5. Record call initiation, store `call_id`
6. Webhook returns outcome: booked_meeting, not_interested, voicemail, etc.

### Voice Agent Types

- `welcome` - New lead introduction calls
- `interest` - Follow-up and discovery calls

### Fallback Logic

If voice call fails and `fallback_channel` is set:
- Create new email/SMS action
- Schedule at step delay + offset
- Mark original voice action as failed

---

## 7. SMS System

### Provider: GoHighLevel (GHL)

### Daily Ramp System

SMS volume is controlled by a level-based ramp:

```
Level 1:  100/day
Level 2:  250/day
Level 3:  500/day
Level 4:  750/day
Level 5: 1500/day
Level 6: 2250/day
Level 7: 3000/day
Level 8: 3000+/day (unlimited)
```

**Auto-promotion**: If yesterday's send count >= current level limit, promote to next level.

Current level stored in `system_settings` table as `ghl_sms_level`.

### SMS Content Rules

- Max 160 characters
- NO "Reply STOP" language (carrier handles compliance)
- NO AI agent names
- Plain text only
- Human, warm, conversational tone

---

## 8. Email Delivery

### Provider: Mandrill SMTP (primary), Generic SMTP (fallback)

### Configuration

```
Primary:   smtp.mandrillapp.com:587 (user: 'apikey', pass: MANDRILL_API_KEY)
Fallback:  SMTP_HOST:SMTP_PORT (SMTP_USER, SMTP_PASS)
```

### Email Structure

```
From:     campaign.settings.sender_email or env.EMAIL_FROM
Reply-To: campaign.settings.sender_email
To:       action.to_email
Subject:  AI-generated
HTML:     AI-generated body
Text:     Auto-stripped from HTML
Headers:
  List-Unsubscribe: <mailto:email?subject=unsubscribe>
  X-MC-Tags: campaign_id (Mandrill tracking)
```

### Test Mode

When `test_mode_enabled = true`:
- Redirect all emails to `test_email` address
- Prepend `[TEST -> original@address]` to subject
- Prevents accidental sends during development

---

## 9. Interaction Tracking and Webhooks

### Tracking Flow

1. **Send**: Create `InteractionOutcome` with outcome='sent'
2. **Open**: Mandrill webhook fires, create outcome='opened'
3. **Click**: Mandrill webhook fires, create outcome='clicked'
4. **Reply**: Detected via inbox monitoring, create outcome='replied'
5. **Bounce**: Mandrill webhook fires, create outcome='bounced'
6. **Meeting booked**: Strategy call created, create outcome='booked_meeting'
7. **Converted**: Enrollment created, create outcome='converted'

### Engagement Metrics (7-day rolling)

```
open_rate    = opened / sent * 100
click_rate   = clicked / sent * 100
reply_rate   = replied / sent * 100
bounce_rate  = bounced / sent * 100
meeting_rate = booked_meeting / sent * 100
```

### Hot Lead Detection

A lead is "hot" if:
- 2+ email opens, OR
- Any click

Computed via:
```sql
SELECT COUNT(DISTINCT lead_id) FROM (
  SELECT lead_id FROM interaction_outcomes WHERE outcome = 'opened'
  GROUP BY lead_id HAVING COUNT(*) >= 2
  UNION
  SELECT DISTINCT lead_id FROM interaction_outcomes WHERE outcome = 'clicked'
) sub
```

---

## 10. Lead Pipeline and Auto-Enrollment

### Pipeline Stages

```
new_lead -> contacted -> meeting_scheduled -> proposal_sent -> negotiation -> enrolled | lost
```

### Lead Scoring

```
Corporate email (non-free domain):  +20
Executive title (VP, C-level):      +20
Phone provided:                     +30
Evaluating within 90 days:          +15
Company size 51+:                   +10
UTM source contains 'pricing':      +10
Base:                                 0
Max:                                105
```

### Auto-Enrollment Triggers

| Trigger | Campaign Enrolled |
|---------|-------------------|
| New inbound lead created | Inbound Warm Lead Nurture |
| Strategy call booked | Strategy Call Readiness |
| Enrollment created (unpaid) | Payment Readiness |
| Enrollment paid | Class Readiness |
| Behavioral signals detected | Behavioral trigger campaigns |
| Manual admin action | Any campaign |

### Enrollment in Sequence

When a lead is enrolled in a campaign:

1. Load sequence steps (0 to N)
2. Create `CampaignLead` record (status = 'enrolled')
3. For each step, create `ScheduledEmail` record:
   ```
   scheduled_for = NOW() + step.delay_days + random_jitter(0-1 hour)
   ```
4. For countdown campaigns (strategy call, payment):
   ```
   scheduled_for = event_date - step.minutes_before_call
   ```
   Auto-cancel steps whose countdown already passed
5. Update `CampaignLead.total_steps`

---

## 11. Autonomous Campaigns

### Ramp System

Autonomous campaigns use phased launch to control risk.

**Ramp State**:
```json
{
  "current_phase": 1,
  "phase_sizes": [20, 80, 200, -1],
  "leads_enrolled_per_phase": { "1": 20, "2": 0 },
  "phase_started_at": "2026-03-01T00:00:00Z",
  "phase_health_score": 85,
  "status": "ramping",
  "evaluation_history": [
    { "phase": 1, "health_score": 85, "decision": "advance", "at": "..." }
  ]
}
```

**Phase Advancement Logic**:
- Evaluator runs every 2 hours
- Minimum 12 hours at each phase before evaluation
- Health score >= advance_threshold (70): advance to next phase
- Health score 50-69: hold, re-evaluate in 2 hours
- Health score < 50 OR safety violation: pause for human review
- Safety checks: max unsubscribe rate, max bounce rate, max SMS failure rate

**Ramp Profiles by Campaign Type**:
```
Cold Outbound:  phases [20, 80, 200, -1], advance >= 70, hold >= 50
Alumni:         phases [15, 30, 75, 150, -1], advance >= 65, hold >= 50
```

### Evolution System (A/B Testing)

**Evolution Config**:
```json
{
  "enabled": true,
  "evolution_frequency_sends": 100,
  "evolution_frequency_hours": 24,
  "similarity_threshold": 0.70,
  "max_active_variants": 3,
  "last_evolution_at": null,
  "sends_since_last_evolution": 0
}
```

**Variant Selection** (on each send):
1. Load all variants for this step/channel
2. Select based on performance (multi-armed bandit) or random 50/50 if new
3. Override AI instructions if variant has custom prompt
4. Track variant_id and variant_label in metadata
5. Increment variant.sends counter

**Evolution Cycle** (every N sends):
1. Evaluate variant performance scores
2. Promote high-performers, retire low-performers
3. Generate new challenger variants
4. Continue testing

---

## 12. Campaign Health and Self-Healing

### Health Scanner (every 15 minutes)

Computes per-campaign health score (0-100):

```
score = 100
- (open_rate < 15%)             : -20
- (reply_rate < 2%)             : -20
- (bounce_rate > 10%)           : -30
- (error_count > 0)             : -10 per error
- (AI generation success < 80%) : -15
Clamp to 0-100

Status:
  80-100: healthy
  60-79:  degraded
  < 60:   critical
```

### Self-Healing Agent (every 30 minutes)

1. Find failed actions in last 6 hours
2. Group by campaign, identify patterns
3. Retry failed sends (if not test action)
4. Validate lead is still sendable
5. Log healing actions

### Repair Agent (every 20 minutes)

1. **Email retry**: Reset failed actions to pending if retries remaining
2. **Voice fallback**: Create email action if voice failed
3. **Bounce cleanup**: Mark bounced leads, remove from active campaigns
4. **Rate limit recovery**: Back off 1 hour, resume next cycle
5. **Campaign rebalancing**: If one campaign consuming > 60% of sends, reduce its limit

### QA Agent (every 15 minutes, weekdays)

Tests:
1. All sequence steps present with AI instructions
2. Lead data valid (emails, phones, required fields)
3. Send simulation to test domain
4. Outcome tracking verification

Scoring: 0-100, status: 'passed' (>80), 'degraded' (60-79), 'failed' (<60)

---

## 13. Campaign Intelligence and Learning

### Insight Harvesting

When a campaign completes, the system extracts:

1. **Channel performance**: Which channels had highest open/reply rates
2. **Message patterns**: Best/worst performing steps
3. **Conversion funnel**: Send-to-enrolled conversion rates
4. **Audience insights**: Which lead segments respond best

### Confidence Scoring

```
confidence = min(total_sends / 50, 1.0)
```
- 5 sends = 10% confidence
- 50+ sends = 100% confidence

### Applying Insights to Future Campaigns

When generating messages:
```
Query: getInsightsForPrompt({
  campaign_type: 'cold_outbound',
  channel: 'email',
  min_confidence: 0.3,
  limit: 5
})
```

Injected into AI prompt:
```
CAMPAIGN KNOWLEDGE (proven patterns from past campaigns):
- Email channel achieved 22% open rate and 3.5% reply rate across 45 sends
- Step 2 (email) had highest reply rate at 4.1% - consider similar messaging
- Campaign X converted 8% of leads through nurture sequences
```

Each applied insight increments `times_applied` for ranking.

### Optimization Recommendations

System generates ranked recommendations:
- **HIGH**: Bounce > 10%, open < 15%, reply < 2%
- **MEDIUM**: Bounce 3-10%, open 15-20%, reply 2-5%
- **LOW**: Good metrics, optimization suggestions

---

## 14. Cory Engine (AI COO)

### Command Intents (16 types)

```
briefing, analyze, hire_agent, retire_agent, launch_experiment,
department_status, agent_status, optimize, create_ticket,
plan_curriculum, curriculum_status, fix_platform, strategic_plan,
executive_briefing, github_automation
```

### Decision Flow

```
Command -> Keyword matching -> Intent + Parameters
        -> Load context (departments, agents, entity data)
        -> Execute appropriate agent
        -> Store IntelligenceDecision record
        -> Format response in executive voice
```

### Scope-Aware Intelligence

Cory supports scoped queries:
- "How is the Intelligence Department doing?" - only discusses that department
- "Show me campaign health" - references specific campaign metrics
- Injects actual entity data into LLM context
- Prevents scope drift

### Risk Assessment

- Actions with risk < 50 AND confidence > 70: auto-execute
- All others: mark as 'proposed' for human review
- Same problem detected within 60 min: increment observation_count (dedup)

---

## 15. Autonomous Decision Engine

### 8-Step Cycle (every 10 minutes)

1. **DETECT**: Scan for KPI anomalies, conversion drops, error spikes, agent failures
2. **INVESTIGATE**: Root cause analysis
3. **RECOMMEND**: Generate 3+ ranked action options (safe actions only)
4. **ESTIMATE**: Predict metric changes based on historical data
5. **EVALUATE RISK**: Score 0-100, determine auto-executability
6. **DEDUP**: Check for same problem in last 60 min
7. **CREATE DECISION**: Store with before_state, create ticket
8. **AUTO-EXECUTE** (if safe): Risk < 50 and confidence > 70

### Safe Action Types

Only these actions can be auto-executed:
```
update_campaign_config
adjust_lead_scoring
launch_ab_test
pause_campaign
update_agent_config
modify_agent_schedule
```

### Effort Estimation

```
risk < 20  -> 30 minutes
risk < 40  -> 2 hours
risk < 60  -> 4 hours
risk < 80  -> 1 day
risk >= 80 -> 3 days
```

### Learning

After execution:
- Store outcome in vector memory
- Update decision with after_state
- Check impact at 24h
- Feed into future decision-making

---

## 16. Behavioral Triggers and Visitor Tracking

### Visitor Tracking (Fingerprint-Based)

```
Browser fingerprint generated (client-side)
    -> findOrCreateVisitor(fingerprint)
    -> getOrCreateSession(visitor_id) [30-min timeout]
    -> recordPageEvent(session_id, visitor_id, event_type, page_url)
    -> [On form submit] resolveIdentity(visitor_id, lead_id)
```

**Page Categories**: homepage, pricing, program, contact, enroll, advisory, sponsorship, strategy_call_prep, executive_overview, roi_calculator, portal, alumni

### Behavioral Trigger Campaigns

**Trigger Rules**:
```json
{
  "trigger_rules": [
    { "signal_type": "page_view_pricing", "min_count": 2 },
    { "signal_type": "watched_demo_video", "min_count": 1 }
  ],
  "min_intent_score": 50,
  "require_all_rules": true,
  "cooldown_hours": 72,
  "auto_start_chat": true
}
```

**Evaluation** (every 10 minutes):
1. Find active behavioral_trigger campaigns
2. Match visitors against trigger rules (signal counts in last 30 days)
3. Check intent score threshold
4. Respect cooldown period
5. Auto-enroll matching leads in campaign

### Intent Score

```
Base score: from lead creation (0-105)
+10 per behavioral signal in last 7 days
Decay over 30 days
Recomputed every 15 minutes
```

---

## 17. LinkedIn Automation (OpenClaw)

### Multi-Agent Network

| Agent | Schedule | Purpose |
|-------|----------|---------|
| Supervisor | Every 2 min | Orchestrate network |
| Market Signal | Every 30 min | Detect relevant posts |
| Conversation Detection | Every 5 min | Monitor comments |
| Content Response | Every 10 min | Generate comments |
| LinkedIn Flow | 9am + 3pm (weekdays) | Suggest actions |
| Comment Monitor | 8am, 12pm, 4pm | Track replies |
| Learning Optimization | Every 4 hours | Analyze performance |

### Lead Capture from LinkedIn

When engagement detected:
1. Create placeholder email: `openclaw-linkedin-{hash}@pending.local`
2. Create lead: source = 'openclaw', temperature = 'warm'
3. Score: `relevance_score * 100`
4. Track engagement in `notes.openclaw`
5. Flag for follow-up if `intent_score > 0.6`

**Important**: All LinkedIn actions (comment, connect, DM) are stored as 'pending' and never auto-executed. Human review required.

---

## 18. Communication Safety and Compliance

### Safety Evaluation (per send)

```typescript
evaluateSend({ leadId, campaignId, channel }) -> {
  allowed: boolean,
  blockedReason?: string,
  deliveryMode: 'production' | 'test_redirect',
  redirect?: { email, phone }
}
```

### Checks

1. **Unsubscribe list** - Block all future sends
2. **Do-Not-Contact (DNC)** - Block all channels
3. **Hard bounce** - Never retry
4. **Soft bounce** - Retry after 3 days
5. **Rate limiting** - Max 2 emails/day per lead
6. **Test mode** - Redirect to test address
7. **Domain validation** - Test actions must target test domains

---

## 19. Cron Schedule Reference

| Pattern | Job | Purpose |
|---------|-----|---------|
| `*/5 * * * *` | ScheduledActionsProcessor | Process pending queue |
| `*/15 * * * *` | RecoverStaleActions | Reset stuck actions |
| `*/7 * * * *` | CampaignWatchdog | Silent failure detection |
| `*/10 * * * *` | BehavioralSignalDetector | Visitor behavior analysis |
| `*/10 * * * *` | BehavioralTriggerEvaluator | Auto-enroll triggers |
| `*/15 * * * *` (offset) | IntentScoreRecomputer | Intent score updates |
| `*/15 * * * *` (offset) | CampaignHealthScanner | Health scores |
| `*/15 * * * *` (offset) | CampaignQAAgent | Quality assurance |
| `*/20 * * * *` (offset) | OpportunityScoreRecomputer | Lead scoring |
| `*/20 * * * *` | CampaignRepairAgent | Fix broken campaigns |
| `*/30 * * * *` | SessionReminders | Session reminders |
| `5,15,25... * * * *` | AutonomousEngine | 8-step decision cycle |
| `0,30 * * * *` | CoryStrategicCycle | Strategic intelligence |
| `0 * * * *` | EmailDigest | Hourly digest reports |
| `2 * * * *` | MetaAgentLoop | Agent meta-analysis |
| `0 */4 * * *` | SequenceValidation | Validate sequences |
| `0 */6 * * *` | ContentOptimization | Message optimization |
| `0 2 * * *` | ICPInsightComputer | ICP insights |
| `0 3 * * *` | PageEventCleanup | Delete events > 90d |
| `30 3 * * *` | ChatMessageCleanup | Delete chats > 180d |
| `0 4 * * *` | ConversationOptimization | Sequence optimization |
| `0 11 * * *` | StrategyCallReadiness | Prep nudges |
| `0 13 * * 1-5` | WeeklyReportGeneration | Weekly reports |

---

## 20. Configuration and Environment Variables

### Required

```
DATABASE_URL          PostgreSQL connection string
OPENAI_API_KEY        OpenAI API for message generation
MANDRILL_API_KEY      Mandrill SMTP relay for email
EMAIL_FROM            Sender email address
JWT_SECRET            Authentication
```

### Optional (Channel-Specific)

```
SYNTHFLOW_API_KEY              Voice calls
SYNTHFLOW_INTEREST_AGENT_ID    Voice agent for follow-ups
SYNTHFLOW_WELCOME_AGENT_ID     Voice agent for intros
ENABLE_VOICE_CALLS             Feature flag (true/false)
GHL_API_KEY                    SMS via GoHighLevel
APOLLO_API_KEY                 Lead intelligence
```

### Campaign Defaults

```
CAMPAIGN_TEST_EMAIL_DOMAIN     Test email domain
FRONTEND_URL                   For links in emails
AI_MODEL                       Default: gpt-4o
AI_MAX_TOKENS                  Default: 2048
```

---

## 21. End-to-End Flow Examples

### Example: Cold Outbound Campaign

```
T=0h:   Admin creates campaign (type: cold_outbound, 7-step sequence)
T=1h:   Import 500 leads from Apollo
T=2h:   Enroll 500 leads -> 500 ScheduledEmail records created (step 0)
T=3h:   Admin approves, campaign goes live
T=3-27h: Scheduler processes step 0 (50/day cap):
          - Claim actions from queue
          - AI generates personalized email per lead
          - Safety check -> send via Mandrill
          - Record InteractionOutcome
T=24-48h: Leads react:
          - Opens -> outcome='opened'
          - Clicks -> outcome='clicked'
          - Replies -> outcome='replied'
T=48h:   Step 1 sends (social proof follow-up)
T=120h:  Step 2 (voice call via Synthflow)
          - On success: book strategy call
          - On failure: fallback to email
T=168h:  Analytics review:
          - 500 sent, 145 opened (29%), 32 replied (6.4%), 8 meetings
          - Insights harvested for future campaigns
```

### Example: Strategy Call Countdown

```
T=0:      Lead books strategy call for March 25, 5pm
          -> Auto-enrolled in Strategy Call Readiness campaign
          -> 6 ScheduledEmail records created (countdown)
T-3 days: Email: Encourage prep form completion
T-1 day:  Email: Preview agenda
T-6 hours: SMS: Reminder with prep form link
T-3 hours: Email: Productivity tips + logistics
T-15 min:  SMS: Final reminder with Meet link
```

### Example: Autonomous Campaign Ramp

```
Phase 1: Enroll 20 leads
         Wait 12+ hours, evaluate health
         Health = 85 (> 70 threshold) -> ADVANCE
Phase 2: Enroll 80 more leads
         Wait 12+ hours, evaluate
         Health = 72 -> ADVANCE
Phase 3: Enroll 200 more leads
         Health = 55 -> HOLD (below 70, above 50)
         Re-evaluate in 2 hours
         Health = 68 -> HOLD
         Health = 71 -> ADVANCE
Phase 4: Unlimited (-1) -> COMPLETE
```

---

## 22. Key Files Reference

### Models
| File | Table |
|------|-------|
| `models/Campaign.ts` | campaigns |
| `models/CampaignLead.ts` | campaign_leads |
| `models/FollowUpSequence.ts` | follow_up_sequences |
| `models/ScheduledEmail.ts` | scheduled_emails |
| `models/CommunicationLog.ts` | communication_logs |
| `models/InteractionOutcome.ts` | interaction_outcomes |
| `models/CampaignHealth.ts` | campaign_health |
| `models/CampaignError.ts` | campaign_errors |
| `models/CampaignVariant.ts` | campaign_variants |
| `models/CampaignInsight.ts` | campaign_insights |
| `models/CampaignExperiment.ts` | campaign_experiments |
| `models/IntelligenceDecision.ts` | intelligence_decisions |
| `models/AiAgent.ts` | ai_agents |
| `models/Visitor.ts` | visitors |
| `models/VisitorSession.ts` | visitor_sessions |
| `models/PageEvent.ts` | page_events |

### Services
| File | Purpose |
|------|---------|
| `services/schedulerService.ts` | Autonomous execution engine |
| `services/aiMessageService.ts` | AI content generation |
| `services/emailService.ts` | Email delivery (Mandrill/SMTP) |
| `services/synthflowService.ts` | Voice call API |
| `services/campaignService.ts` | Campaign CRUD and enrollment |
| `services/campaignBuilderService.ts` | Sequence templates |
| `services/sequenceService.ts` | Step timing and validation |
| `services/campaignAnalyticsService.ts` | Campaign metrics |
| `services/campaignHealthScanner.ts` | Health scoring |
| `services/campaignOptimizationService.ts` | AI recommendations |
| `services/campaignKnowledgeService.ts` | Insight harvesting |
| `services/campaignStrategyService.ts` | Lead-campaign matching |
| `services/autonomousRampService.ts` | Phased launch |
| `services/behavioralTriggerService.ts` | Visitor signal triggers |
| `services/leadService.ts` | Lead management |
| `services/communicationSafetyService.ts` | Send safety checks |
| `services/visitorTrackingService.ts` | Browser fingerprint tracking |
| `services/aiOpsScheduler.ts` | Cron job orchestration |

### Intelligence
| File | Purpose |
|------|---------|
| `intelligence/strategy/coryEngine.ts` | AI COO command interpreter |
| `intelligence/autonomy/autonomousEngine.ts` | 8-step decision cycle |
| `intelligence/agents/agentRegistry.ts` | Agent discovery and invocation |
| `intelligence/agents/agentFactory.ts` | Dynamic agent creation |

### Agents
| File | Purpose |
|------|---------|
| `agents/campaignSelfHealingAgent.ts` | Auto-fix failed actions |
| `agents/campaignRepairAgent.ts` | Campaign error recovery |
| `agents/campaignQAAgent.ts` | Quality assurance testing |
| `agents/openclaw/*.ts` | LinkedIn automation (17 agents) |
| `agents/admissions/*.ts` | Admissions funnel (24 agents) |

### Routes
| File | Purpose |
|------|---------|
| `routes/admin/campaignRoutes.ts` | Campaign CRUD API |
| `routes/admin/campaignIntelligenceRoutes.ts` | Graph and analytics API |
| `routes/admin/dashboardRoutes.ts` | Dashboard KPIs |

---

*This document contains the complete implementation blueprint for the Cory Autonomous Campaign System. All data models, services, AI pipelines, scheduling logic, and autonomous operations are documented at implementation-level detail.*
