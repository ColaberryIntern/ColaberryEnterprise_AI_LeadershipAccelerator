# AI Campaign System Audit

Baseline architecture review of the campaign engine prior to the AI Operations Layer.

---

## Campaign Engine

The campaign system is built around three core models forming an action queue:

| Model | Role |
|---|---|
| **Campaign** | Top-level container — name, status, channel config, ICP profile, schedule rules |
| **FollowUpSequence** | Ordered steps within a campaign — delay, channel, content template, conditions |
| **ScheduledEmail** | Concrete action item queued for execution — recipient, channel, scheduled time, status |

A campaign moves through `draft → active → paused → completed`. When active, the scheduler materializes FollowUpSequence steps into ScheduledEmail rows for each lead at the appropriate time.

---

## Scheduler

- **Engine**: `node-cron` running inside the Node.js backend process
- **Cadence**: `processScheduledActions` fires every 5 minutes
- **Content generation**: AI-powered content is generated at send time (not at queue time) via OpenAI, allowing personalization against the latest lead context
- **Execution**: Each ScheduledEmail is dispatched through the appropriate channel handler, then marked `sent` or `failed`

---

## External Integrations

| Service | Purpose | Integration Point |
|---|---|---|
| **Apollo.io** | Lead sourcing and enrichment | REST API — `apolloService.ts` |
| **GoHighLevel** | CRM sync, SMS sending, contact management | REST API — `ghlService.ts` |
| **Synthflow** | AI voice calls | REST API — `synthflowService.ts` |
| **Mandrill / SMTP** | Transactional email delivery | SMTP / API — `emailService.ts` |
| **Stripe** | Payment processing, subscription management | REST API — `stripeService.ts` |
| **OpenAI** | Content generation, personalization | REST API — `openaiService.ts` |

---

## Existing Logging Tables

| Table | What It Captures |
|---|---|
| **Activity** | User-facing activity feed — campaign events, lead actions |
| **EventLedger** | Immutable append-only log of all system events with payload |
| **AuditLog** | Who changed what, when — admin-level audit trail |
| **AutomationLog** | Automation rule executions and outcomes |

---

## Missing Observability (Before AI Operations Layer)

| Gap | Impact |
|---|---|
| No health monitoring | Failed campaigns could run for days undetected |
| No self-healing | Every failure required manual intervention |
| No AI decision logging | No visibility into why AI generated specific content |
| No error aggregation | Repeated failures scattered across generic logs |
| No agent activity tracking | No concept of autonomous corrective actions |
| No channel connectivity checks | Integration outages discovered only after sends failed |

---

## Campaign Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CAMPAIGN LIFECYCLE                       │
└─────────────────────────────────────────────────────────────────┘

  [Admin creates campaign]
         │
         ▼
  ┌─────────────┐    activate     ┌─────────────┐
  │   DRAFT     │───────────────▶│   ACTIVE    │
  └─────────────┘                 └──────┬──────┘
                                         │
                          ┌──────────────┼──────────────┐
                          │              │              │
                          ▼              ▼              ▼
                     [pause]      [complete]     [schedule]
                          │              │              │
                          ▼              ▼              ▼
                   ┌──────────┐  ┌───────────┐  ┌──────────────┐
                   │  PAUSED  │  │ COMPLETED │  │ FollowUp     │
                   └──────────┘  └───────────┘  │ Sequence     │
                                                │ Steps        │
                                                └──────┬───────┘
                                                       │
                                          materialize steps
                                          for each lead
                                                       │
                                                       ▼
                                                ┌──────────────┐
                                                │ Scheduled    │
                                                │ Email Queue  │
                                                └──────┬───────┘
                                                       │
                                              every 5 min cron
                                                       │
                                                       ▼
                                                ┌──────────────┐
                                                │ Process      │
                                                │ Actions      │
                                                └──────┬───────┘
                                                       │
                                    ┌──────────────────┼──────────────────┐
                                    │                  │                  │
                                    ▼                  ▼                  ▼
                             ┌───────────┐     ┌───────────┐     ┌───────────┐
                             │   Email   │     │   Voice   │     │    SMS    │
                             │  (SMTP/   │     │(Synthflow)│     │  (GHL)    │
                             │ Mandrill) │     └───────────┘     └───────────┘
                             └───────────┘
```

---

## Data Flow Diagram

```
┌───────────┐     leads      ┌───────────────┐    enrich     ┌───────────┐
│ Apollo.io │──────────────▶│  Lead Store   │◀────────────▶│  OpenAI   │
└───────────┘                └───────┬───────┘               └─────┬─────┘
                                     │                             │
                              assign to campaign            generate content
                                     │                        at send time
                                     ▼                             │
                             ┌───────────────┐                     │
                             │   Campaign    │                     │
                             │   Engine      │◀────────────────────┘
                             └───────┬───────┘
                                     │
                            queue scheduled actions
                                     │
                                     ▼
                             ┌───────────────┐
                             │  Scheduled    │
                             │  Action Queue │
                             └───────┬───────┘
                                     │
                        ┌────────────┼────────────┐
                        │            │            │
                        ▼            ▼            ▼
                 ┌───────────┐ ┌──────────┐ ┌──────────┐
                 │  Mandrill │ │Synthflow │ │   GHL    │
                 │  (Email)  │ │ (Voice)  │ │  (SMS)   │
                 └─────┬─────┘ └────┬─────┘ └────┬─────┘
                       │            │            │
                       ▼            ▼            ▼
                 ┌─────────────────────────────────────┐
                 │         Logging Layer               │
                 │  Activity | EventLedger | AuditLog  │
                 └─────────────────────────────────────┘
```

---

## Summary

The pre-existing campaign engine is functional and handles multi-channel outreach with AI content generation. The primary gaps are in observability and resilience — failures are silent, recovery is manual, and there is no systematic tracking of AI decisions or system health. The AI Operations Layer addresses all of these gaps.
