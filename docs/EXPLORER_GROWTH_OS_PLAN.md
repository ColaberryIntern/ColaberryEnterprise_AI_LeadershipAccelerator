# Explorer Growth OS — Implementation Plan

**Status:** PLAN FOR APPROVAL — no code written.
**Author:** Claude Code · **Session:** CC-20260812-k4m9 · **Date:** 2026-08-12
**Studied against:** `origin/main` @ `1bf1a782` (a clean worktree; the OneDrive tree was 1,922 commits stale and was NOT used).
**Production facts verified live** against `accelerator-db` / `accelerator_prod` on 2026-08-12.

---

## 1. EXECUTIVE SUMMARY

### The business problem

Colaberry now creates free "Explorer" accounts. **154 are active, and 151 of them were created in the last 30 days** — this program is four weeks old. Of those 154:

| Explorer behaviour | Count | % |
|---|---|---|
| Active Explorer accounts | 154 | 100% |
| Ever served a learning card | 67 | 43% |
| Ever *interacted* with the feed | 19 | 12% |
| Ever *completed* a card | 13 | 8% |
| Ever earned a point | 22 | 14% |

Nothing currently reaches out to these people based on what they did or did not do. They sign up, receive one welcome email, and are then invisible to the growth system. Meanwhile a mature, sophisticated campaign engine sits alongside them operating on a **completely separate** population of 24,238 CRM leads.

### The solution in one sentence

**Explorer Growth OS is a decision layer — not a second campaign engine.** It watches what each free learner actually does, scores them along four independent dimensions, decides the single best next action for that person today, and then executes that action through the campaign engine that already exists.

### What is genuinely new vs. what we reuse

| Layer | Verdict |
|---|---|
| Email/SMS/voice delivery, retries, test mode, tracking, webhooks | **Reuse 100%.** `schedulerService` + `communicationSafetyService` already do this. |
| Campaign + sequence + queue data model | **Reuse 100%.** `campaigns`, `follow_up_sequences`, `scheduled_emails`, `campaign_leads`. |
| AI copy generation at send time | **Reuse 100%.** `aiMessageService` + `contextGraphService`. |
| Ramp, variants, health, QA, self-healing | **Reuse 100%.** Already built and running. |
| Behavioural web signals, intent scoring, decay | **Reuse the pattern**, extend the population. |
| **Learner-side scoring (E/I/F), journey state, arbitration between competing campaigns, decision audit, content registry, cohort forecast** | **NEW.** This is the actual build. |

### The core architectural claim

Today, five different systems can independently decide to email the same person, and none of them knows about the others. The engine's only cross-campaign protection is a blunt rule buried in the scheduler: *max one outbound per lead per day across all campaigns* (`schedulerService.ts:799-817`). That is a rate limit, not a decision.

Explorer Growth OS replaces "whoever enqueues first wins" with **one governed decision per learner per day, with a recorded reason.**

### Honest read on the 125-student target

125 paid students cannot come from 154 Explorers. At a generous 5% free→paid conversion, today's Explorer pool yields ~8. The target requires **either** growing the Explorer pool by roughly 20× **or** treating Explorer Growth OS as one of several contributors alongside the 24,238-lead CRM pool and the Open House funnel. §24 models this explicitly and refuses to fabricate benchmark conversion rates. **This system's honest job is to raise the free→paid rate and make the pool convertible — not to conjure the pool.**

### Governance posture

Everything ships **dark**. Stage 1 is shadow mode: the system computes every score, state, and decision for all 154 Explorers and **sends nothing**. The admin can inspect exactly what it *would* have done. We validate the brain before we connect the mouth. Voice and SMS stay behind independent, default-off flags and are blocked on the compliance decisions in §35.

---

## 2. CURRENT REPOSITORY ARCHITECTURE

### 2.1 The campaign engine — five files

| Concern | File | Notes |
|---|---|---|
| Campaign container | `backend/src/models/Campaign.ts` → `campaigns` | `status: draft\|active\|paused\|completed`; `settings` JSONB; `ai_system_prompt` |
| Ordered steps | `backend/src/models/FollowUpSequence.ts` → `follow_up_sequences` | `steps` JSONB array of `SequenceStep` |
| The work queue | `backend/src/models/ScheduledEmail.ts` → `scheduled_emails` | `status: pending\|processing\|sent\|failed\|cancelled\|paused` |
| Enrollment join | `backend/src/models/CampaignLead.ts` → `campaign_leads` | UNIQUE `(campaign_id, lead_id)` |
| The only worker | `backend/src/services/schedulerService.ts` (3,270 lines) | `startScheduler()` @ 1774, node-cron **in the API process** |

`SequenceStep` (`FollowUpSequence.ts:5-26`) carries `delay_days`, `channel`, `subject`, `body_template`, `step_goal`, `ai_instructions`, `ai_tone`, `ai_context_notes`, `fallback_channel`, `max_attempts`, plus two T-minus variants (`minutes_before_call`, `days_before_cohort_start`).

**Sequencing is event-driven, not pre-scheduled.** `sequenceService.ts:428` creates only step 0 at enrollment; `scheduleNextStep()` (`:527`) creates step N+1 after step N reaches `sent`. Gap math is `next.delay_days - current.delay_days` measured **from now**, not from enrollment.

**There is no branching.** `SequenceStep` has no conditional field and no branch evaluator exists. This is the single most important structural fact in this document — it is why the Journey Governor must live *above* sequences rather than inside them.

### 2.2 The send path, end to end

```
cron */5 → instrumentCronJob('ScheduledActionsProcessor')
  → processScheduledActions()                        schedulerService.ts:528
     ├─ reconcileStrandedSends()                                    :978
     ├─ zombie expiry (pending older than N days → cancelled)       :543
     ├─ CLAIM: ROW_NUMBER() per campaign, rn<=10, LIMIT 40          :572
     ├─ interleave campaigns [A,A,B,B] → [A,B,A,B]                  :626
     └─ per action:
        ├─ campaign.status !== 'active' → cancel                    :666
        ├─ calculatePacedLimit()                                    :471
        ├─ send window / call window (CAMPAIGN timezone)            :707
        ├─ is_test_action must target @colaberry-test.local         :737
        ├─ generateAIContent() [60s race]                           :757 / :189
        ├─ evaluateSend()               communicationSafetyService.ts:258
        ├─ CROSS-CAMPAIGN CAP: 1 outbound/lead/day unless replied   :799
        ├─ processEmailAction / processVoiceAction / processSmsAction
        ├─ scheduleNextStep(action) if sent                         :882
        └─ hard 5s sleep between every action                       :904
```

### 2.3 The safety chokepoint — `evaluateSend()`

`backend/src/services/communicationSafetyService.ts:258` is the one function every send *should* pass through.

| # | Check | Fail mode |
|---|---|---|
| 0 | `scheduler_paused` setting | open |
| 1 | `enforceGlobalRateLimit()` — `max_sends_per_minute` (20) | **open** |
| 2 | `checkCampaignSendable()` — status must be `active` | closed |
| 3 | `checkLeadSendable()` — `Lead.status ∈ {unsubscribed,dnd,bounced}` OR any `unsubscribe_events` row | closed |
| 3.5 | `assertConsentForSend()` — **shadow mode by default** | **open** |
| 4 | `resolveRecipient()` — test-mode redirect, fail-closed | closed |

It has **only 5 production call sites**: `schedulerService.ts:763`, `callbackRequestService.ts:78`, and the three admissions agents. All 26 `emailService.ts` functions bypass it entirely.

### 2.4 Consent, suppression, and compliance as they actually are

- `consent_records` (`models/ConsentRecord.ts`) — a real append-only consent ledger, 355 rows in prod. Channels `voice|sms|email`, statuses `granted|revoked|pending`, bases including `express_written` and `double_opt_in`, jurisdictions `US|EU|UK|CA|unknown`. Design doc: `docs/ai-governance/consent-capture-design.md`.
- `consent_enforcement` DB setting defaults to **`'shadow'`** (`settingsService.ts:54`). The gate computes a verdict, logs `consent.check` to `ai_events` with `would_block: true`, and **blocks nothing**.
- `unsubscribe_events` — 302 rows. `processOptOut()` (`unsubscribeEnforcementService.ts:132`) is the single opt-out entry point and cascades to `Lead.status`, all `CampaignLead.lifecycle_status='dnd'`, cancellation of pending `ScheduledEmail`s, a `consent_records` revoke, and a GHL DND tag.
- Unsubscribe links are HMAC-signed (`unsubscribeTokenService.ts`) with RFC 8058 one-click headers on campaign sends.

### 2.5 Learner data — a separate universe

**There is no `User` model and no `Participant` model.** `Enrollment` (`enrollments`, UUID PK) *is* the learner. `enrollment_type` is `VARCHAR(20)` with exactly two values, `'standard'` and `'explorer'`.

The authoritative access predicate is pure and testable — `services/access/contentEntitlement.ts:72-85`:

```ts
export function hasFullCurriculumAccess(enrollment, cohort, roleInfo?, now = new Date()): boolean {
  if (!enrollment) return false;
  if (isAccessStartDeferred(enrollment.access_starts_at, now)) return false;
  const paid = enrollment.payment_status === 'paid';
  const comped = roleInfo?.hasActiveComp === true;
  const staff = roleInfo?.isStaff === true;
  const business = String(cohort?.cohort_type ?? '').toLowerCase() === 'business';
  return paid || comped || staff || business;
}
```

Learning telemetry that already exists and is rich: `timeline_card_progress`, `student_points_events` (with `event_key` as idempotency key), `xp_events`, `student_architecture_skill`, `student_level` / `builder_levels`, `assignment_submissions`, `attendance_records`, `community_contributions`, `projects`, `github_connections`, `onboarding_profiles` (resume + LinkedIn), `user_curriculum_profiles` (stated `goal`).

**The single best engagement signal is `today_feed_impressions`** — `served_at` versus `interacted_at`/`interaction`, unique on `(enrollment_id, position)`. Its DDL is raw SQL in `server.ts:1359` with no model file. `capeLifecycleModeService.ts:76` already derives `days_since_last_activity` from `MAX(served_at)`.

### 2.6 The identity bridge — email, and only email

| | Campaign world | Learning world |
|---|---|---|
| Table | `leads` | `enrollments` |
| PK type | **INTEGER** | **UUID** |
| Link | `leads.visitor_id` → visitors | `enrollments.cohort_id` → cohorts |

**There is no `leads.enrollment_id` and no `enrollments.lead_id`.** The only join is `LOWER(leads.email) = LOWER(enrollments.email)`, created best-effort inside a try/catch in `enrollmentService.createExplorerEnrollment:325`.

**Verified in production: all 154 active Explorers currently resolve to a lead by email (154/154).** The bridge works today but is undefended — nothing enforces it and nothing repairs it.

### 2.7 What already exists that maps onto this project's asks

| The ask | What already exists |
|---|---|
| Experiments / holdouts | `CampaignExperiment`, `CampaignVariant`, `campaignEvolutionService` (multi-armed bandit variant selection) |
| Shadow / simulation | `CampaignSimulation`, `CampaignSimulationStep`, `campaignSimulationRoutes`, `services/testing/campaignSimulator.ts` |
| Governance thresholds | `CampaignGovernanceConfig` (max unsubscribe/bounce/SMS-failure rates, min open/reply) |
| Behavioural triggers | `behavioralTriggerService.ts` (356 lines) — trigger rules, min intent score, cooldown, auto-enroll |
| Intent scoring with decay | `intentScoringService.ts` — `DECAY_HALF_LIFE_DAYS = 7`, `weight = 2^(-age/7)` |
| Signal strength table | `behavioralSignalService.ts` — `SIGNAL_DEFINITIONS` 1-100 |
| Campaign recommendation | `campaignStrategyService.ts` — scores campaigns against a lead, returns `{score, reasons}`. **Advisory only; does not arbitrate, suppress, or enroll.** |
| Explorer targeting | `explorerRosterService.ts` — explicitly written to feed campaign targeting *"without inventing a new scoring scheme"* |
| Kill switch | `launchSafety.ts` — `system_kill_switch`, pauses all campaigns and disables outbound agents |
| Admin design system | `frontend/src/components/admin/shell/` — `PageHeader`, `StatCard`, `StatusBadge`, `SectionCard`, `TrustBadge` |

### 2.8 Correcting the brief's premises

Three premises in the request do not survive contact with the repository. Stating them plainly, because the plan depends on it:

**(a) Kes's Explorer engagement/nurture system does not exist.** Searched all 823 remote refs by content and filename: zero hits for `EXPLORER_NURTURE_ENABLED`, `explorerNurture`, `explorer_engagement`, `engagement_score`. No branch `feature/explorer-engagement-scoring-nurture`. No file with "nurture" in its name has ever existed in this repo's history. The Kes branches that do exist (`kes/enterprise-crm-v1-leads`, `kes/github-integration`, `kes/project-dna-wizard-ui`) are unrelated. **There is nothing to reconcile — the E-score is a fresh build**, and the proposed 35/35/30 weighting and Day 3/7/14 checkpoints are treated as Ali's design input, not as existing code.

**(b) `explorerVoiceLeadIsolation` does not exist.** No file, no symbol, anywhere. The nearest real safety invariant is `__tests__/services/communicationSafety.test.ts` (12 tests) plus `simulationIsolation.test.ts`. The invariant they actually protect is *fail-closed test mode*. We will preserve and extend that, but there is no existing voice isolation to avoid breaking.

**(c) The 28-experience library maps to far fewer than 18 new Campaign rows.** Many entries in the requested list are journey *actions* or *overlays*, not campaigns. Creating 18 campaign rows would be exactly the duplication the brief warns against. §12 proposes **8 new Campaign rows** plus reuse of 3 existing ones.

---

## 3. GAPS

Ordered by whether they block the build.

### 3.1 Blocking gaps — must be built

| # | Gap | Evidence |
|---|---|---|
| G1 | **No learner-side score of any kind.** Every scorer in the repo is lead-side. | `explorerRosterService` uses only the points ladder; `pointsService.LEVELS` has no decay/recency |
| G2 | **No journey state machine for learners.** | No model, no enum, no service |
| G3 | **No arbitration between competing campaigns.** Whoever enqueues first wins, capped by 1/lead/day. | `schedulerService.ts:799-817` is the *only* cross-campaign protection |
| G4 | **No decision audit.** Impossible to answer "why did this learner get this message?" | `CampaignError`/`AiAgentActivityLog` record actions, not choices |
| G5 | **No durable Explorer↔Lead bridge.** Join is best-effort email inside a try/catch. | `enrollmentService.ts:325` |
| G6 | **No content registry.** AI cannot cite a cohort date or event without a hardcoded fact. | `contextGraphService` `allowedUrls` are hardcoded at `:227-234` |
| G7 | **No learner behavioural event writer.** `student_navigation_events` exists, is read by two services, and has **zero writers**. | verified |
| G8 | **No holdout/incrementality framework for learners.** `CampaignExperiment` is campaign-level, not per-learner assignment. | model has no subject column |

### 3.2 Live defects discovered during this study

These are pre-existing production bugs, not new work. Two of them directly affect this project.

| # | Defect | Impact | Verified |
|---|---|---|---|
| **D1** | **`contextGraphService.ts:135-139` queries `page_events WHERE lead_id = :leadId`. `page_events` has no `lead_id` column in production.** The query throws inside `Promise.all`, so `buildCompositeContext()` throws, so `schedulerService.ts:311`'s try/catch swallows it and **every campaign email in production is generated from the legacy prompt path, never the grounded composite-context path.** | HIGH — silently degrades all AI copy today | ✅ Confirmed live: `page_events` columns are `id, session_id, visitor_id, event_type, page_url, page_path, page_title, page_category, event_data, timestamp, created_at`. No `lead_id`. |
| **D2** | **Nothing ever writes `Lead.status = 'bounced'`.** Hard bounces write an `InteractionOutcome` only. The bounce branch in `checkLeadSendable` is unreachable, so a hard-bounced address is suppressed *per campaign* but not globally — re-enroll them elsewhere and mail flows again. | HIGH — deliverability + compliance | ✅ Zero writers found |
| D3 | `processOptOut()` accepts a `channel` parameter but always sets `Lead.status='unsubscribed'` globally. An SMS STOP kills email too. | MEDIUM — over-suppression | ✅ |
| D4 | Two divergent STOP matchers (`unsubscribeEnforcementService.ts:22` whole-message vs `smsOptOutProcessor.ts:18` prefix), with different outcomes (`unsubscribed` vs `dnd`). `smsOptOutProcessor` is orphaned. | MEDIUM | ✅ |
| D5 | No voice reconciliation. A Synthflow call whose webhook never arrives stays `pending` forever; the action is marked `sent` immediately so it never retries. | MEDIUM | ✅ |
| D6 | Synthflow webhook fallback matches "most recent pending voice log in last 10 min" — cross-contamination under concurrency. GHL and Synthflow webhooks have **no signature verification**. | MEDIUM | ✅ |
| D7 | `triggerVoiceCall` returns `{success:true, data:{skipped:true}}` on every gate. A skip is indistinguishable from a success unless the caller inspects `data.skipped`. | LOW-MED | ✅ |
| D8 | Per-campaign `max_daily_calls` uses an in-process counter that resets on every restart. | LOW | ✅ |
| D9 | `campaignGraduationService.ts:20-22` hardcodes three campaign UUIDs. | LOW | ✅ |

**D1 and D2 are prerequisites for this project** and are scheduled into EPIC 1. The rest are logged in §35 for Ali to prioritise separately; this project does not silently expand scope to fix them.

### 3.3 Content gaps

Assets the AI would be asked to reference that have **no queryable source**: case studies (hardcoded in `CaseStudiesPage.tsx`, and the file itself admits they are *"realistic, specific placeholders pending client consent"*), internships (absent entirely), certifications (no learner-level record), free tools, platform-feature marketing copy. Cohort **price** is a TypeScript constant in `subscriptionService.PLANS`, not a DB column. Cohorts have **no `application_deadline` column**.

---

## 4. ARCHITECTURE

### 4.1 System context

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          EXPLORER GROWTH OS                             │
│                        (new — decision layer)                           │
└─────────────────────────────────────────────────────────────────────────┘

  SIGNAL SOURCES (all existing)                    ┌──────────────────┐
  ┌────────────────────────┐                       │  Content         │
  │ timeline_card_progress │──┐                    │  Intelligence    │
  │ today_feed_impressions │  │                    │  Registry        │
  │ student_points_events  │  │                    │  (index over     │
  │ community_contributions│  │                    │   real sources)  │
  │ attendance_records     │  ├──▶ ┌────────────┐  └────────┬─────────┘
  │ assignment_submissions │  │    │  SIGNAL    │           │
  │ student_architecture_* │  │    │  INGESTOR  │           │
  └────────────────────────┘  │    │  (new)     │           │
  ┌────────────────────────┐  │    └─────┬──────┘           │
  │ page_events / visitors │  │          │                  │
  │ behavioral_signals     │──┤          ▼                  │
  │ interaction_outcomes   │  │   ┌──────────────┐          │
  │ unsubscribe_events     │  │   │   LEARNER    │          │
  │ consent_records        │──┘   │ INTELLIGENCE │          │
  └────────────────────────┘      │  E / I / F   │          │
                                  │  Affinity    │          │
                                  │  Contactable │          │
                                  └──────┬───────┘          │
                                         │                  │
                                         ▼                  │
                                  ┌──────────────┐          │
                                  │   JOURNEY    │◀─────────┘
                                  │   GOVERNOR   │
                                  │              │
                                  │ 1 candidates │
                                  │ 2 eligibility│
                                  │ 3 suppression│
                                  │ 4 rank       │
                                  │ 5 tie-break  │
                                  │ 6 audit      │
                                  └──────┬───────┘
                                         │ ONE decision
                                         ▼
                              ┌─────────────────────┐
                              │  explorer_journey_  │  append-only
                              │     decisions       │  "why"
                              └──────────┬──────────┘
                                         │
                    ┌────────────────────┴───────────────┐
                    │  mode = OBSERVE / SHADOW → STOP    │
                    │  mode = PILOT / FULL → execute     │
                    └────────────────────┬───────────────┘
                                         ▼
╔═════════════════════════════════════════════════════════════════════════╗
║              EXISTING CAMPAIGN ENGINE (unchanged execution)             ║
║                                                                         ║
║   enrollLeadInSequence(leadId, sequenceId, campaignId)  ← the 18th      ║
║                    │                       call site of a proven fn     ║
║                    ▼                                                    ║
║          scheduled_emails (queue)                                       ║
║                    │                                                    ║
║          schedulerService cron */5                                      ║
║                    │                                                    ║
║          generateAIContent → aiMessageService (OpenAI gpt-4o-mini)      ║
║                    │                                                    ║
║          evaluateSend()  ← final chokepoint, unchanged                  ║
║                    │                                                    ║
║          Mandrill SMTP / Synthflow / GoHighLevel                        ║
╚═════════════════════════════════════════════════════════════════════════╝
                                         │
                                         ▼
                              outcomes: interaction_outcomes,
                              communication_logs, enrollments,
                              subscriptions, attendance_records
                                         │
                                         └──────▶ back to SIGNAL INGESTOR
```

### 4.2 Signal ingestion

Two classes of signal, two existing homes, one new writer.

```
LEARNER-SIDE (enrollment_id, UUID)          WEB/CRM-SIDE (lead_id, INTEGER)
─────────────────────────────────           ──────────────────────────────
portal actions, card progress,              page views, CTA clicks,
points, community, attendance               email opens/clicks/replies

        │                                              │
        │  explorerSignalWriter (NEW)                  │  behavioralSignalService
        │  writes to student_navigation_events         │  (EXISTING, unchanged)
        │  — the table that already exists             │  writes behavioral_signals
        │    and has ZERO writers today                │
        ▼                                              ▼
┌──────────────────────────┐              ┌──────────────────────────┐
│ student_navigation_events│              │   behavioral_signals     │
│ enrollment_id, event_type│              │ visitor_id, lead_id,     │
│ page, duration_ms, meta  │              │ signal_type, strength    │
└────────────┬─────────────┘              └────────────┬─────────────┘
             │                                         │
             └──────────────┬──────────────────────────┘
                            ▼
                 explorerSignalReader (NEW)
                 unified read across both,
                 joined on the identity bridge
```

**Design decision: we do not create a new `learner_signals` table.** `student_navigation_events` already exists with exactly the right shape (`enrollment_id, lesson_id, event_type, page, duration_ms, metadata JSONB, created_at`), is already read by `studentBehaviorIntelligenceAgent` and `reeseSignalService`, and has no writers. Filling it serves this project and two existing consumers.

### 4.3 Learner intelligence

```
                       ┌───────────────────────────┐
                       │  explorer_journey_profiles│   one mutable row
                       │  PK enrollment_id (UUID)  │   per Explorer
                       │  lead_id  (INTEGER)  ◀────┼── THE IDENTITY BRIDGE
                       │  email_normalized         │   (durable, repaired
                       │  primary_state            │    nightly)
                       │  overlays TEXT[]          │
                       │  e_score / i_score /      │
                       │  f_score / c_eligibility  │
                       │  affinities JSONB         │
                       │  scores_computed_at       │
                       └───────────┬───────────────┘
                                   │ daily snapshot
                                   ▼
                       ┌───────────────────────────┐
                       │ explorer_score_snapshots  │   append-only,
                       │ (enrollment_id, as_of_date│   for trend + forecast
                       │  e,i,f, state, overlays)  │   UNIQUE(enr, as_of_date)
                       └───────────────────────────┘
```

### 4.4 Journey Governor internals

```
   for each eligible Explorer (batched, idempotent per (enrollment, decision_date)):

   ┌────────────────────────────────────────────────────────────────┐
   │ STEP 1  CANDIDATE GENERATION  (deterministic, pure)            │
   │   each of ~20 rules returns 0..1 candidate actions             │
   │   { action_type, campaign_key, priority_tier, rationale[] }    │
   └───────────────────────────┬────────────────────────────────────┘
                               ▼
   ┌────────────────────────────────────────────────────────────────┐
   │ STEP 2  HARD ELIGIBILITY  (deterministic, fail-closed)         │
   │   converted? suppressed? unsubscribed? consent? channel flag?  │
   │   → drop candidate, record suppression_reason                  │
   └───────────────────────────┬────────────────────────────────────┘
                               ▼
   ┌────────────────────────────────────────────────────────────────┐
   │ STEP 3  CONTACT POLICY  (deterministic)                        │
   │   frequency caps, min gap, quiet hours, recent reply,          │
   │   channel caps, active friction → drop or downgrade to WAIT    │
   └───────────────────────────┬────────────────────────────────────┘
                               ▼
   ┌────────────────────────────────────────────────────────────────┐
   │ STEP 4  RANK                                                   │
   │   priority tier ASC, then score DESC, then age DESC            │
   │   AI ranking (flag-gated) may REORDER WITHIN a tier only —     │
   │   it can never add a candidate or cross a tier boundary        │
   └───────────────────────────┬────────────────────────────────────┘
                               ▼
   ┌────────────────────────────────────────────────────────────────┐
   │ STEP 5  HOLDOUT CHECK                                          │
   │   stable hash assignment; control → action becomes WAIT,       │
   │   decision still recorded with holdout=true                    │
   └───────────────────────────┬────────────────────────────────────┘
                               ▼
   ┌────────────────────────────────────────────────────────────────┐
   │ STEP 6  AUDIT  → explorer_journey_decisions (ALWAYS written,   │
   │                  in every mode, including OBSERVE)             │
   └───────────────────────────┬────────────────────────────────────┘
                               ▼
   ┌────────────────────────────────────────────────────────────────┐
   │ STEP 7  EXECUTE (only if mode ∈ {PILOT, LIMITED, FULL})        │
   │   enrollLeadInSequence(lead_id, sequence_id, campaign_id)      │
   └────────────────────────────────────────────────────────────────┘
```

### 4.5 Feedback loop

```
  decision ──▶ enrollment ──▶ scheduled_email ──▶ send ──▶ interaction_outcomes
      │                                                          │
      │                                                    (open/click/reply)
      │                                                          │
      │            ┌─────────────────────────────────────────────┘
      │            ▼
      │   explorerOutcomeAttributionService (NEW)
      │   links interaction_outcomes + enrollments + subscriptions
      │   back to the decision_id that caused them
      │            │
      ▼            ▼
  explorer_journey_decisions.outcome  ◀── closed loop
              │
              ├──▶ per-action conversion rates  → §24 forecast
              ├──▶ treatment vs holdout lift    → §25 experiments
              └──▶ AI ranking training signal   → §21 (later stage only)
```

### 4.6 Admin control

```
  /admin/explorer-growth  (new page, existing shell components)
  ┌──────────────────────────────────────────────────────────────┐
  │ PageHeader: "Explorer Growth OS"  [mode pill] [KILL SWITCH]  │
  │ TrustSignal: source=explorer_journey_profiles, updated_at    │
  │ StatCard row: Explorers · Activated · Active · Engaged ·     │
  │               Dormant · High Intent · Friction · Converted   │
  ├──────────────────────────────────────────────────────────────┤
  │ Tabs: Overview │ Journey │ Decisions │ Shadow │ Content │    │
  │       Forecast │ Experiments │ Settings                      │
  └──────────────────────────────────────────────────────────────┘
                              │
                              ▼
        GET /api/admin/explorer-growth/*    (new router, requireAdmin)
                              │
                              ▼
        explorerGrowth* services ── read ──▶ profiles / decisions / snapshots
                              │
                              └── control ─▶ mode, pause, recalc, suppress
```

---

## 5. DATA MODEL

### 5.1 Principle

Add the minimum durable state, reuse everything else, and make only the things that must be historically auditable into append-only tables.

### 5.2 Existing models — REUSED UNCHANGED

`Campaign`, `FollowUpSequence`, `ScheduledEmail`, `CampaignLead`, `Lead`, `Enrollment`, `Cohort`, `LiveSession`, `CommunicationLog`, `InteractionOutcome`, `UnsubscribeEvent`, `ConsentRecord`, `Visitor`, `VisitorSession`, `PageEvent`, `BehavioralSignal`, `IntentScore`, `TimelineCardProgress`, `StudentPointsEvent`, `XpEvent`, `CommunityMember`, `ContributionEvent`, `AttendanceRecord`, `AssignmentSubmission`, `OnboardingProfile`, `UserCurriculumProfile`, `StudentArchitectureSkill`, `Subscription`, `OpenHouseEvent`, `Podcast`, `SystemSetting`, `AiAgent`, `EventLedger`.

### 5.3 Existing models — CHANGED (additive only)

| Model | Change | Why | Risk |
|---|---|---|---|
| `models/PageEvent.ts` + `page_events` | **ADD `lead_id INTEGER NULL`** + index; backfill from `visitor_sessions.lead_id`; extend `resolveIdentity()` to backfill it | **Fixes defect D1.** Without it `buildCompositeContext()` throws and all grounded AI generation is dead. | Low — additive nullable column |
| `models/StudentNavigationEvent.ts` | No schema change. Gains its first writer. | Learner signal stream (G7) | None |
| `models/Lead.ts` | No schema change. New writer sets `status='bounced'` on hard bounce. | **Fixes defect D2** | Low, but changes suppression behaviour — see §35 |

**No other existing model is modified.** In particular `Campaign`, `FollowUpSequence`, and `ScheduledEmail` are untouched: Explorer campaigns are ordinary rows in the existing tables.

### 5.4 New models

All created via **`backend/src/db/ensureExplorerGrowthSchema.ts`** following the `ensureReeseOutreachSchema.ts` pattern verbatim (array of `CREATE ... IF NOT EXISTS`, each statement in its own try/catch, columns matching the Sequelize model exactly, additive only), `await`ed in `server.ts start()` before line 2619. **Production does not run `sequelize.sync`.**

#### T1 — `explorer_journey_profiles` (mutable, one row per Explorer)

| Column | Type | Notes |
|---|---|---|
| `enrollment_id` | UUID **PK** → `enrollments(id)` | the learner |
| `lead_id` | INTEGER NULL → `leads(id)` | **the identity bridge**, repaired nightly |
| `email_normalized` | VARCHAR(255) NOT NULL | `LOWER(TRIM(email))`, indexed |
| `primary_state` | VARCHAR(32) NOT NULL default `'NEW_EXPLORER'` | §8 |
| `overlays` | TEXT[] NOT NULL default `'{}'` | §8 |
| `e_score` `i_score` `f_score` | SMALLINT NOT NULL default 0 | 0-100 |
| `contactability` | JSONB NOT NULL default `'{}'` | resolved per-channel eligibility + reasons |
| `affinities` | JSONB NOT NULL default `'[]'` | `[{tag, confidence, sources[]}]` |
| `signal_summary` | JSONB NOT NULL default `'{}'` | top contributing signals, for the audit UI |
| `days_since_last_activity` | SMALLINT NULL | |
| `state_entered_at` | TIMESTAMPTZ NULL | for dwell-time rules |
| `last_decision_at` | TIMESTAMPTZ NULL | |
| `last_contacted_at` | TIMESTAMPTZ NULL | learner-side, distinct from `leads.last_contacted_at` |
| `scores_computed_at` | TIMESTAMPTZ NOT NULL | staleness detection |
| `created_at` `updated_at` | TIMESTAMPTZ | |

Indexes: `(primary_state)`, `(lead_id)`, `(email_normalized)`, `(scores_computed_at)`, GIN on `overlays`.
Retention: permanent (one row per learner).

#### T2 — `explorer_journey_decisions` (**append-only**, the audit spine)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `enrollment_id` | UUID NOT NULL | |
| `lead_id` | INTEGER NULL | |
| `decision_date` | DATE NOT NULL | **UNIQUE `(enrollment_id, decision_date)` = idempotency** |
| `mode` | VARCHAR(24) NOT NULL | `observe\|shadow\|test_users\|pilot\|limited\|full` |
| `primary_state` / `overlays` | VARCHAR(32) / TEXT[] | snapshot at decision time |
| `e_score` `i_score` `f_score` | SMALLINT | snapshot |
| `triggering_signals` | JSONB | `[{signal, weight, at}]` |
| `candidate_actions` | JSONB | every candidate generated, with tier + score |
| `suppressed_actions` | JSONB | `[{action, reason}]` — the "why NOT" record |
| `selected_action` | VARCHAR(48) NULL | null ⇒ WAIT |
| `selected_campaign_id` | UUID NULL | |
| `selected_sequence_step` | SMALLINT NULL | |
| `selected_content_assets` | JSONB | which real assets were chosen |
| `channel` | VARCHAR(16) NULL | |
| `reason` | TEXT NOT NULL | one human sentence |
| `deferred_actions` | JSONB | what was postponed and until when |
| `ai_involved` | BOOLEAN NOT NULL default false | |
| `ai_rationale` | TEXT NULL | |
| `ruleset_version` | VARCHAR(16) NOT NULL | replay/debug |
| `holdout_group` | VARCHAR(24) NULL | `treatment\|control\|null` |
| `experiment_key` | VARCHAR(64) NULL | |
| `executed` | BOOLEAN NOT NULL default false | false in observe/shadow |
| `scheduled_email_id` | UUID NULL | link into the queue |
| `outcome` | VARCHAR(32) NULL | back-filled by attribution |
| `outcome_at` | TIMESTAMPTZ NULL | |
| `created_at` | TIMESTAMPTZ NOT NULL | |

Indexes: UNIQUE `(enrollment_id, decision_date)`, `(decision_date)`, `(selected_action)`, `(enrollment_id, created_at DESC)`, `(experiment_key)` partial where not null.
Retention: **indefinite** — this is the compliance and explainability record.

#### T3 — `explorer_score_snapshots` (append-only, one row per learner per day)

`enrollment_id UUID`, `as_of_date DATE`, `e_score/i_score/f_score SMALLINT`, `primary_state VARCHAR(32)`, `overlays TEXT[]`, `created_at`. UNIQUE `(enrollment_id, as_of_date)`.
Retention: 400 days rolling. Feeds trend charts and the §24 forecast's observed stage-conversion rates.

#### T4 — `explorer_experiment_assignments` (append-only, stable)

`id UUID PK`, `experiment_key VARCHAR(64)`, `enrollment_id UUID`, `variant VARCHAR(24)` (`treatment|control`), `assigned_at`, `assignment_hash VARCHAR(64)`. UNIQUE `(experiment_key, enrollment_id)`.
Assignment is a **deterministic hash** of `(experiment_key, enrollment_id)` so it is stable without a write, and the row is a record rather than a source of truth. Retention: indefinite.

#### T5 — `explorer_content_assets` (the registry INDEX)

Deliberately an **index over authoritative sources**, not a second source of truth. Two kinds of row:
- **Projected rows** (`source_system` ∈ `network_videos`, `blog_posts`, `podcasts`, `cohorts`, `live_sessions`, `open_house_events`, `community_rooms`, `curriculum_type_definitions`) — refreshed by a cron; `source_id` points at the real record; **facts are re-resolved at send time from the source, never read from this table.**
- **Native rows** (`source_system='manual'`) — for assets that have no queryable source today (case studies, internships, certifications, free tools). These are seeded and reviewed by a human.

| Column | Type |
|---|---|
| `id` UUID PK · `asset_type` VARCHAR(32) · `source_system` VARCHAR(48) · `source_id` VARCHAR(128) NULL |
| `title` TEXT · `summary` TEXT NULL · `url` TEXT NULL |
| `topic_tags` TEXT[] · `affinity_tags` TEXT[] · `journey_stage_tags` TEXT[] · `audience_tags` TEXT[] |
| `cta_type` VARCHAR(32) NULL · `priority` SMALLINT default 50 · `proof_type` VARCHAR(32) NULL |
| `allowed_channels` TEXT[] default `'{email}'` |
| `published_at` / `starts_at` / `expires_at` TIMESTAMPTZ NULL |
| `active` BOOLEAN default true · `metadata` JSONB · `synced_at` TIMESTAMPTZ · `created_at`/`updated_at` |

UNIQUE `(source_system, source_id)` where `source_id IS NOT NULL`. Indexes on `asset_type`, `active`, GIN on `affinity_tags` and `journey_stage_tags`.
Retention: rebuildable at any time; not a system of record.

### 5.5 Concepts deliberately NOT given tables

| Proposed concept | Decision | Why |
|---|---|---|
| `LearnerSignal` | **Reuse** `student_navigation_events` + `behavioral_signals` | Both exist; one has zero writers |
| `LearnerAffinity` | **JSONB on T1** | Small, always read as a set, no independent history need |
| `JourneyStateHistory` | **Derived from T2 + T3** | State at any date is in the snapshot; transitions are in decisions |
| `ContactPolicy` | **Service + `system_settings`** | Follows the existing DB-settings flag pattern |
| `CampaignSuppression` | **Column in T2 (`suppressed_actions`)** | Suppression is an attribute of a decision, not an entity |
| `LearnerScoreSnapshot` | Kept as T3 | Forecast genuinely needs the history |

Net: **5 new tables, 1 additive column on an existing table.**

---

## 6. SIGNAL CATALOG

Weights are the **initial deterministic proposal**. Every weight lives in one exported constant table (`explorerSignalDefinitions.ts`) so it is tunable without touching logic, mirroring `behavioralSignalService.SIGNAL_DEFINITIONS`.

Decay follows the house pattern from `intentScoringService`: `weight = 2^(-ageDays / halfLife)`.

### 6.1 Engagement signals (E-score, max 100)

| Signal | Source (verified) | Event | Weight | Half-life | Journey impact |
|---|---|---|---|---|---|
| Account created | `enrollments.created_at` | derived | 5 | none | enters `NEW_EXPLORER` |
| First card served | `today_feed_impressions.served_at` | derived | 5 | 21d | — |
| **First card interacted** | `today_feed_impressions.interacted_at` | derived | **12** | 21d | `NEW_EXPLORER → ACTIVATING` |
| **First card completed** | `timeline_card_progress.status='completed'` | derived | **15** | 21d | `ACTIVATING → ACTIVE_LEARNER` |
| Additional card completed | `timeline_card_progress` | derived | 6 each, cap 24 | 21d | — |
| Quiz / knowledge check passed | `timeline_card_progress.quiz_score` | derived | 5 | 21d | — |
| Points earned | `student_points_events` | row | 3 per event, cap 12 | 14d | — |
| Streak day claimed | `student_points_events event_type='daily_streak'` | row | 4 per day, cap 16 | 7d | — |
| Assignment submitted | `assignment_submissions` | row | 10 | 30d | → `ENGAGED_LEARNER` |
| Reflection completed | `reflection_entries` | row | 6 | 30d | — |
| Architecture skill evidence | `student_architecture_skill.last_evidence_at` | derived | 8 | 30d | — |
| Project / build activity | `projects`, `student_github_activity.commits_last_7d` | derived | 10 | 14d | → `ENGAGED_LEARNER` |
| Community post / comment | `community_contributions` | row | 8 | 21d | → `CONNECTED_TO_COMMUNITY` |
| Community presence | `community_members.last_active_at` | derived | 3 | 7d | — |
| Live session attended | `attendance_records.status='present'` | row | 12 | 30d | — |
| Podcast / video watched | `network_video_views`, `podcast_views` | row | 4 | 14d | — |
| Portal session | `student_navigation_events` (**new writer**) | row | 2, cap 10 | 7d | resets dormancy |

### 6.2 Intent signals (I-score, max 100) — *tiered by commitment, never conflated*

The brief is explicit that a page view must not be treated as readiness. Weights enforce four tiers.

| Tier | Signal | Source | Event | Weight | Half-life |
|---|---|---|---|---|---|
| **T1 view** | Accelerator page view | `page_events page_category='program'` | 1st | 5 | 14d |
| T1 | Pricing page view | `page_events page_category='pricing'` | each, cap 15 | 6 | 14d |
| T1 | Cohort / upcoming-class view | `page_events` | each, cap 12 | 6 | 14d |
| T1 | Testimonial / case-study view | `page_events`, `network_video_views` | each, cap 8 | 4 | 14d |
| T1 | Subscription page view | `page_events` | each, cap 10 | 5 | 14d |
| T1 | Internship page view | `page_events` (**route does not exist yet**) | each | 5 | 14d |
| **T2 click** | Enrollment CTA click | `page_events event_type='cta_click'` | each | 12 | 10d |
| T2 | Email link click (offer URL) | `interaction_outcomes outcome='clicked'` | each, cap 24 | 8 | 10d |
| T2 | Booking modal opened | `page_events 'booking_modal_opened'` | each | 10 | 10d |
| **T3 start** | Booking date/time selected | `page_events 'booking_date_selected'` | each | 18 | 10d |
| T3 | Enrollment form started | **NOT CAPTURED — must instrument** | each | 20 | 10d |
| T3 | Event/Open House registered | `student_points_events 'open_house_rsvp:*'` | each | 20 | 21d |
| T3 | Reply expressing interest | `interaction_outcomes outcome='replied'` + classifier | each | 22 | 21d |
| **T4 commit** | Strategy call booked | `strategy_calls` | each | 30 | 21d |
| T4 | Enrollment form completed | `enrollments` (unpaid) | each | 35 | 30d |
| T4 | Internship application started | **ABSENT** | each | 30 | 30d |
| T4 | Event **attended** | `student_points_events 'open_house_attended'` | each | 25 | 30d |

**Rule enforced in code:** `HIGH_INTENT` overlay requires **at least one T3-or-above signal**, never T1 accumulation alone. Twenty pricing-page views cannot manufacture readiness.

### 6.3 Friction signals (F-score, max 100 — high is BAD)

| Signal | Source | Weight | Half-life | Journey impact |
|---|---|---|---|---|
| Payment failed | `enrollments.payment_status='failed'` | 40 | 14d | `FRICTION` overlay |
| Payment attempted, no completion | **NOT CAPTURED — must instrument** | 30 | 7d | `FRICTION` |
| Booking selected but no `strategy_calls` row within 24h | derived join | 25 | 7d | `FRICTION` |
| Enrollment form started, not completed in 48h | requires instrumentation | 25 | 7d | `FRICTION` |
| Email hard bounce | `interaction_outcomes outcome='bounced'` | 30 | none | `NEEDS_SUPPORT` |
| Support/inbox case open for this person | `inbox_cases` | 35 | until closed | `NEEDS_SUPPORT` |
| Repeated same page ≥4× in 24h with no progression | `page_events` | 15 | 3d | `FRICTION` |
| Failed event registration | `open_house` ingest error path | 20 | 7d | `FRICTION` |
| Reply classified `NEEDS_HELP` | reply classifier | 30 | 14d | `NEEDS_SUPPORT` |

**Hard rule:** `F ≥ 25` suppresses every commercial action. Only recovery and support actions remain eligible. This is priority tier 2 in §9 and outranks all selling.

### 6.4 Contactability (deterministic, not scored)

| Field | Source | Deterministic |
|---|---|---|
| valid email | `enrollments.email` / `leads.email` | ✅ |
| unsubscribed | `leads.status`, any `unsubscribe_events` row | ✅ |
| consent per channel | `consentService.getCurrentConsent(subject, channel)` | ✅ |
| bounced | `interaction_outcomes outcome='bounced'` (**until D2 fixed**) | ✅ |
| valid phone | `leads.phone` E.164 check | ✅ |
| SMS / voice eligible | consent + flag + phone | ✅ |
| quiet hours | **campaign timezone only — no per-lead tz exists** | ⚠️ see §35 |
| recent contact | `communication_logs` + T1 `last_contacted_at` | ✅ |
| frequency caps | new policy service | ✅ |
| recent human interaction | `interaction_outcomes outcome='replied'`, inbox cases | ✅ |

### 6.5 Signals that require new instrumentation

| Signal | Needed for | Where | EPIC |
|---|---|---|---|
| Enrollment form **start** | I-score T3, abandonment friction | `frontend/src/pages/EnrollPage.tsx` → `trackEvent` | 2 |
| Payment **attempt/failure** | F-score | PaySimple checkout path + webhook | 2 |
| Portal login / session | E-score, dormancy | `student_navigation_events` writer | 2 |
| `page_events.lead_id` | **all** intent signals joinable to a learner | additive column + backfill (**D1**) | 1 |
| Internship interest | I-score, internship path | route does not exist — §22 | 7 |

---

## 7. SCORING MODEL

### 7.1 Shared form

```
score = clamp(0, 100, Σ  min(weight_i × Σ 2^(-age_days / halfLife_i), cap_i) )
```

Every score is computed from source tables at recompute time. **No score is ever incrementally mutated** — recomputation is idempotent and replayable, which is what makes shadow mode trustworthy and satisfies CLAUDE.md's replayability rule.

### 7.2 E-score — Engagement

Ali's proposed 35/35/30 split (badges / course progress / recent activity) is preserved as the **band structure**, mapped onto what this repo actually stores:

| Band | Cap | Composed of |
|---|---|---|
| Achievement | 35 | points events, streaks, architecture-skill evidence, level/rank |
| Progress | 35 | cards completed, quizzes, assignments, reflections, projects |
| Recency | 30 | feed interaction, portal sessions, community presence, attendance |

**Why this split survives:** badges do not exist in this repo (the nearest analogue is `builder_levels` rank), so "badges 35%" becomes "achievement 35%" with points/streaks/skills as the substrate. The intent of Ali's model — a third each for *what they earned*, *what they finished*, and *how recently* — is preserved exactly.

**Decay.** Ali proposed step decay (×1.00 / ×0.85 / ×0.65 / ×0.40 at 0-7 / 8-14 / 15-30 / 30+ days). This plan uses **continuous exponential decay per signal** instead, because (a) it is already the house pattern in `intentScoringService` (`DECAY_HALF_LIFE_DAYS=7`), (b) step functions create cliff artefacts where a learner's score drops 15 points overnight with no behaviour change, which pollutes trend analysis and holdout comparison. A 14-day half-life reproduces Ali's curve closely:

| Days | Ali's step | `2^(-d/14)` |
|---|---|---|
| 0-7 | 1.00 | 1.00 → 0.71 |
| 8-14 | 0.85 | 0.67 → 0.50 |
| 15-30 | 0.65 | 0.48 → 0.23 |
| 30+ | 0.40 | ≤0.23 |

Per-band half-lives: achievement 21d, progress 21d, recency 7d. **Flagged for Ali in §35 as a reversible modelling choice** — if step decay is preferred, it is a one-constant change.

### 7.3 I-score — Intent

Same form, tiered weights from §6.2. Two hard invariants in code:

1. `HIGH_INTENT` overlay requires ≥1 signal of tier T3 or T4. T1 views alone cap the contribution at 40.
2. Intent decays fastest (10-day half-life on T2/T3) — commercial intent is perishable, and a stale high I-score is worse than none.

### 7.4 F-score — Friction

No cap-and-sum subtleties: F is the max-weighted sum of active friction signals, and any single signal ≥25 sets the `FRICTION` overlay. Friction **does not decay while the underlying condition is unresolved** (an open inbox case keeps its weight until the case closes).

### 7.5 C — Contactability

Not a score. A resolved object, recomputed at decision time (never cached beyond the decision):

```ts
interface Contactability {
  email: { eligible: boolean; reason?: string };
  sms:   { eligible: boolean; reason?: string };
  voice: { eligible: boolean; reason?: string };
  in_app:{ eligible: boolean; reason?: string };
  quiet_hours_active: boolean;
  next_eligible_at: string | null;
}
```

Every `eligible:false` carries a machine-readable `reason` that lands in `suppressed_actions`. **Fail closed**: any error resolving a channel marks it ineligible.

### 7.6 Affinity

Blend of declared and observed, capped confidence, never permanent:

```
confidence(tag) = clamp(0, 1,  0.4 × declared(tag) + 0.6 × observed_decayed(tag) )
```

- **declared** — `user_curriculum_profiles.goal`, `.industry`, `.role`, `.identified_use_case`; `onboarding_profiles.resume_text` / `linkedin_url`; `resume_skill_claims`
- **observed** — curriculum types engaged with, content clicked, community rooms joined, pages viewed; 30-day half-life

Tags: `ai_career`, `ai_builder`, `ai_systems_architecture`, `leadership`, `career_change`, `data_analytics`, `automation`, `agentic_ai`, `ai_governance`, `entrepreneurship`, `community`, `certification`, `ai_internship`, `ai_consulting`, `enterprise_ai`, `ai_workforce`, `instructor`.

A tag needs `confidence ≥ 0.35` to influence content selection. Observed always outranks stale declared. **No learner is ever locked to a persona** — affinities are recomputed nightly from scratch.

---

## 8. JOURNEY STATE MACHINE

### 8.1 Primary states (mutually exclusive, exactly one)

| State | Entry | Exit |
|---|---|---|
| `NEW_EXPLORER` | Explorer enrollment created | any card interacted, OR 72h elapsed → `ACTIVATING` |
| `ACTIVATING` | first feed interaction, or 72h in NEW without one | first card completed → `ACTIVE_LEARNER`; 14d no activity → `DORMANT` overlay retained, state holds |
| `ACTIVE_LEARNER` | ≥1 card completed | E ≥ 45 AND ≥3 cards → `ENGAGED_LEARNER`; 21d inactive → holds with `DORMANT` |
| `ENGAGED_LEARNER` | E ≥ 45 and ≥3 cards completed | community contribution → `CONNECTED_TO_COMMUNITY`; I ≥ 45 → `CONSIDERING_NEXT_STEP` |
| `CONNECTED_TO_COMMUNITY` | ≥1 `community_contributions` row | I ≥ 45 → `CONSIDERING_NEXT_STEP` |
| `CONSIDERING_NEXT_STEP` | I ≥ 45 with ≥1 T2+ signal | I ≥ 70 with T3+ → `ENROLLMENT_READY`; I decays < 30 for 14d → back to prior learning state |
| `ENROLLMENT_READY` | I ≥ 70 **and** ≥1 T3/T4 signal **and** F < 25 | payment/subscription → `CONVERTED`; 30d no progression → `CONSIDERING_NEXT_STEP` |
| `CONVERTED` | `hasFullCurriculumAccess() === true`, or active non-comp `subscriptions` row, or internship acceptance | **terminal for acquisition.** All Explorer acquisition messaging stops immediately and permanently. |

**Progression is monotonic for learning states** (a learner never falls out of `ACTIVE_LEARNER` back to `NEW_EXPLORER`); dormancy is expressed as an overlay, not regression. `CONSIDERING_NEXT_STEP` and `ENROLLMENT_READY` *can* regress, because commercial intent genuinely decays.

### 8.2 Overlays (0..n, independent of primary state)

| Overlay | Entry | Exit |
|---|---|---|
| `DORMANT` | no E-signal in 14d | any E-signal |
| `HIGH_INTENT` | I ≥ 60 **and** ≥1 T3/T4 signal in 14d | I < 40, or 21d without T2+ |
| `FRICTION` | F ≥ 25 | F < 15 **and** underlying condition resolved |
| `NEEDS_SUPPORT` | open inbox case, hard bounce, or reply=NEEDS_HELP | case closed / bounce resolved |
| `EVENT_READY` | upcoming event exists, learner eligible, not registered | registers, or event passes |
| `EVENT_REGISTERED` | `open_house_rsvp:<id>` points row | event ends |
| `EVENT_ATTENDED` | `open_house_attended` | 30d |
| `EVENT_NO_SHOW` | registered **and** event ended **and** no attendance | 14d, or attends a later event |
| `INTERNSHIP_READY` | affinity `ai_internship` ≥ 0.5 **and** E ≥ 50 | applied / 60d |
| `SUBSCRIPTION_READY` | E ≥ 55, I 30-69, no cohort fit | converts / 60d |
| `REFERRAL_READY` | E ≥ 60 **and** ≥1 completed project or community contribution | 90d |
| `IN_CONVERSATION` | reply received in last 7d | 7d with no reply |

### 8.3 Transition auditing and staleness

- Every state change writes a decision row (§5.4 T2) even when the selected action is `WAIT`, so state history is fully reconstructible.
- `explorer_score_snapshots` records `(state, overlays)` daily — point-in-time truth for the forecast.
- **Staleness:** the recompute cron marks a profile stale when `scores_computed_at < now - 26h`. The Governor **refuses to decide on a stale profile** and instead enqueues a recompute — fail-closed, so a broken scorer produces silence, not wrong sends.
- `EVENT_NO_SHOW` is derived, not observed: **the repo has no no-show record for events.** It is computed as `EVENT_REGISTERED AND event.ends_at < now AND NOT EXISTS(open_house_attended)`.

---

## 9. JOURNEY GOVERNOR RULES

### 9.1 The priority hierarchy (validated and revised)

The brief's proposed hierarchy is sound. Two changes, both justified by what the code actually does:

| Tier | Category | Change vs brief |
|---|---|---|
| **0** | **Hard stop** — converted, unsubscribed, DNC, consent revoked, kill switch, campaign not active | *(new tier)* separated from tier 1 because these are **not actions** — they terminate the decision entirely |
| 1 | Legal / suppression / frequency-cap | as proposed |
| 2 | Active support & friction recovery | as proposed |
| 3 | Direct reply or application in progress | as proposed |
| 4 | Event logistics for an already-registered event | as proposed |
| 5 | High commercial intent (requires T3+) | as proposed |
| 6 | Activation rescue | as proposed |
| 7 | Personalised learning | as proposed |
| 8 | Community | as proposed |
| 9 | General nurture / weekly digest | as proposed |
| 10 | Referral / advocacy | as proposed |

**Why tier 0 is separate:** in the current engine, `evaluateSend` blocks these at send time — *after* a queue row exists, an AI generation has been paid for, and a campaign has been credited with a touch. Evaluating them first in the Governor means a converted learner never gets enqueued at all.

**Why tier 2 outranks tier 3:** a learner who replied *because* they hit a payment error must get recovery, not a sales reply. Friction wins.

### 9.2 Candidate generation

Roughly 20 pure functions, each `(profile, context) → Candidate | null`:

```ts
interface Candidate {
  action_type: ExplorerActionType;
  campaign_key: string | null;
  priority_tier: 0 | 1 | ... | 10;
  intra_tier_score: number;      // 0-100
  channel: 'email' | 'sms' | 'voice' | 'in_app' | 'none';
  required_assets: ContentAssetQuery[];
  rationale: string[];
}
```

Action types: `SEND_EMAIL`, `SEND_SMS`, `SCHEDULE_VOICE`, `SHOW_IN_APP_NUDGE`, `RECOMMEND_LESSON`, `INVITE_TO_EVENT`, `SEND_ALI_OUTREACH`, `ENTER_SUBCAMPAIGN`, `EXIT_SUBCAMPAIGN`, `CREATE_HUMAN_TASK`, `RECOVER_FRICTION`, `WAIT`, `SUPPRESS_CONTACT`.

### 9.3 Eligibility (fail-closed)

A candidate is dropped, with a recorded reason, if any of: learner is `CONVERTED`; `contactability[channel].eligible === false`; the required campaign is not `status='active'`; the channel's feature flag is off; a required content asset cannot be resolved (see §10 — **no asset, no send**); the learner is already mid-sequence in a mutually-exclusive campaign; profile is stale.

### 9.4 Ranking and tie-breaking

```
sort by priority_tier ASC
  then intra_tier_score DESC
    then days_in_current_state DESC       (older need attention first)
      then enrollment_id ASC              (fully deterministic — no randomness)
```

**AI ranking, when `EXPLORER_AI_RANKING_ENABLED=true`, may reorder candidates *within a single tier only*.** It cannot add a candidate, cannot cross a tier boundary, cannot override any suppression, and its output is validated against the input candidate set before use. If AI ranking fails or returns anything unexpected, the deterministic order stands and `ai_involved` is recorded as false. This is the concrete expression of CLAUDE.md's "AI ranks among approved options; deterministic logic decides eligibility."

### 9.5 The WAIT action

`WAIT` is a first-class outcome and by design the **most common** one. It is selected when: no candidate survives; every candidate is capped by contact policy; the learner is in a healthy state with no due action; or the learner is in a holdout control group.

A `WAIT` decision is still written to `explorer_journey_decisions` with its reason. This is what makes "why did nothing happen?" answerable — as important as explaining a send.

### 9.6 Worked collision example

The brief's scenario: a learner simultaneously qualifies for Day-14 nurture, Accelerator campaign, Ali outreach, Open House reminder, and Broken Link Recovery.

```
CANDIDATES                              TIER  SCORE
  Broken Link Recovery (friction)          2     78
  Open House prep (registered, T-36h)      4     71
  Ali Personal Outreach (I=81)             5     66
  Accelerator Overview (I=81)              5     54
  Day-14 learning checkpoint               7     40

TIER 0 CHECK   pass — not converted, not suppressed
CONTACT POLICY email eligible; 1 send/day cap applies

SUPPRESSED
  Day-14 checkpoint      → outranked, tier 7
  Accelerator Overview   → outranked within tier 5
  Ali Outreach           → DEFERRED to post-event (tier 5 < tier 2)
  Open House prep        → DEFERRED 1 day (tier 4 < tier 2)

WINNER  Broken Link Recovery
REASON  "Unresolved booking failure 2 days ago outranks all commercial
         and learning actions; selling into a broken experience damages trust."
DEFERRED  Open House prep → tomorrow; Ali Outreach → after the event.
```

Note what this produces: **one message**, and a record explaining the four that were withheld.

---

## 10. CONTENT INTELLIGENCE REGISTRY

### 10.1 The rule

**AI may SELECT an asset. AI may never INVENT one.** Enforced structurally: campaign copy contains no facts, only slots; slots resolve from `explorer_content_assets`; and if a slot cannot resolve, **the send is cancelled rather than degraded**.

### 10.2 Index, not a second source of truth

| Asset type | Source | Kind | Facts re-resolved at send from |
|---|---|---|---|
| `TESTIMONIAL` | `network_videos` | projected | `network_videos` |
| `BLOG` | `blog_posts` | projected | `blog_posts` |
| `PODCAST` / `VIDEO` | `podcasts`, `network_videos` | projected | source |
| `COHORT` / `CLASS` | `cohorts`, `live_sessions` | projected | **`cohorts` at send time** |
| `EVENT` / `OPEN_HOUSE` | CCPP `EventBrite_Events` via `publicEventsService`, PG fallback `open_house_events` | projected | **source at send time** |
| `COMMUNITY` | `community_rooms` | projected | source |
| `CURRICULUM` / `LESSON` | `curriculum_type_definitions`, `curriculum_blueprints`, `timeline_cards` | projected | source |
| `SUBSCRIPTION` | `subscriptionService.PLANS` (**code constant**) | projected from code | `PLANS` |
| `CASE_STUDY` | none — hardcoded in `CaseStudiesPage.tsx` | **native, human-seeded** | itself |
| `INTERNSHIP` | none | **native, human-seeded** | itself |
| `CERTIFICATION` | none | **native, human-seeded** | itself |
| `TOOL` / `RESOURCE` | none (AI Workforce Designer URL hardcoded in seeds) | **native, human-seeded** | itself |
| `PLATFORM_FEATURE` | `marketingBlueprint.ts` | **native, human-seeded** | itself |

The projected rows are a **searchable index** carrying tags, journey-stage fit, and validity windows. The moment a message is generated, every fact (date, seats, URL, price) is re-read from the authoritative source. The index answers *"which asset?"*; the source answers *"what is true about it?"*.

**Note on case studies:** `CaseStudiesPage.tsx` states in its own header that its content is *"realistic, specific placeholders pending client consent."* These must **not** be seeded as citable proof. §35 asks Ali which case studies are real and consented.

### 10.3 Sync and selection

`explorerContentSyncService.refreshProjectedAssets()` runs on a `0 */6 * * *` cron: upserts by `(source_system, source_id)`, marks vanished rows `active=false` (never deletes — a decision may reference them), and stamps `synced_at`.

`explorerContentSelector.select(query)` returns ranked assets or **an empty array**, filtering on: `active`, `starts_at <= now`, `expires_at IS NULL OR expires_at > now`, channel allowed, journey-stage tag match, affinity overlap, and not shown to this learner within a cooldown. Ranking: affinity overlap → journey-stage fit → priority → recency.

**Empty array is a valid, expected result and must cancel the action.** Test 12 and 13 in §31 enforce this.

---

## 11. RUNTIME VARIABLE CATALOG

### 11.1 The compatibility problem

The repo has **exactly six** campaign tokens, substituted by an inline `.replace()` chain duplicated at `sequenceService.ts:457-464` and `:565-572`:

```
{{name}} {{company}} {{title}} {{email}} {{phone}} {{referred_by}}
```

Plus four voice-only tokens at `schedulerService.ts:1244-1252`. **There is no shared renderer**, `{{first_name}}` is not supported, and **unknown tokens pass through to the recipient verbatim** — a silent, ugly failure mode.

A separate, unrelated `{{}}` system exists for curriculum (`services/variableService.ts:84`). These must not be conflated.

### 11.2 The chosen approach

**Do not extend the token substituter.** Instead, resolve variables into the **composite context** that already feeds the AI prompt, and let generation use them. Rationale:

1. The grounded prompt branch (`aiMessageService.ts:152-207`) already consumes `compositeContext` — it is the designed path.
2. Adding tokens to the fragile `.replace()` chain, duplicated in two places with no shared renderer, increases the surface for silent verbatim leaks.
3. Copy stays AI-generated (§33's requirement that business logic not depend on exact wording).

Implementation: a new `explorerContextService.buildExplorerContext(enrollmentId)` returning an `ExplorerContext`, merged into `CompositeContext` under a new `explorer` key. The prompt builder gains an Explorer block listing the resolved facts and an instruction that **only these facts may be stated**.

For the small set of cases needing deterministic fallback copy (§18), a **strict renderer** `renderExplorerTemplate(template, context)` is added that **throws on any unresolved token** rather than leaking it.

### 11.3 Catalog

| Variable | Authoritative source | Fails how |
|---|---|---|
| `learner.first_name` | `enrollments.full_name` split | falls back to "there" |
| `learner.completed_lessons` | `COUNT(timeline_card_progress status='completed')` | 0 |
| `learner.progress_percent` | completed / available for their access tier | omitted if 0 |
| `learner.points` | `SUM(student_points_events.points)` | 0 |
| `learner.current_streak` | `streakService.getStreak()` | 0 |
| `learner.level` | `student_level` + `builder_levels` | omitted |
| `recommended_lesson.title` / `.url` | `explorerContentSelector` over `timeline_cards` | **no asset ⇒ cancel** |
| `next_class.name` / `.start_date` / `.local_start_time` | **`cohorts` at send time** via `selectNextOpenCohort()` | **no cohort ⇒ cancel** |
| `next_class.seats_remaining` | `cohorts.max_seats - seats_taken` | omitted if null |
| `next_class.application_deadline` | ⚠️ **NO COLUMN EXISTS** — see §35 D-6 | **never stated until the column exists** |
| `next_class.url` | config | — |
| `next_event.title` / `.local_date` / `.local_time` / `.registration_url` | CCPP `EventBrite_Events` via `publicEventsService`, PG fallback | **no event ⇒ cancel** |
| `testimonial.*` | `network_videos` | **none ⇒ cancel** |
| `case_study.*` | native registry rows only | **none ⇒ cancel** |
| `latest_relevant_blog.*` | `blog_posts` | **none ⇒ cancel** |
| `internship.*` | native rows (**nothing exists today**) | **cancel** |
| `community.topic` / `.url` | `community_rooms` | cancel |
| `subscription.price_monthly` | `subscriptionService.PLANS` | cancel |

### 11.4 The April-14 rule

**No Explorer campaign copy may contain a literal date, price, seat count, or deadline.** Enforced three ways:

1. A **seed-time lint** (`scripts/lint-explorer-copy.js`, wired into the `guards` CI job alongside the existing `lint-route-auth.js`) that fails the build if any Explorer sequence step's `body_template`, `subject`, or `ai_instructions` matches a date, currency, or "seats left" pattern.
2. The AI system prompt states that only facts present in the Explorer context block may be asserted.
3. `messageValidatorService` gains an Explorer rule rejecting generated copy containing a date or price not present in the resolved context.

---

## 12. CAMPAIGN MATRIX

### 12.1 Modelling decision

The brief lists 18 required subcampaigns. Creating 18 `campaigns` rows would duplicate machinery. Mapping each to its right home:

| # | Requested | Implemented as | Why |
|---|---|---|---|
| 1 | Explorer Activation Rescue | **Campaign + sequence** | multi-step, own cadence |
| 2 | Explorer Learning Momentum | **Campaign + sequence** | recurring, own cadence |
| 3 | Explorer Dormant Re-entry | **Campaign + sequence** | distinct copy + suppression |
| 4 | Explorer Curriculum Affinity | **Journey action** (`RECOMMEND_LESSON`) inside #2 | one message, content-driven |
| 5 | Explorer Community Activation | **Campaign + sequence** (short) | own goal + exit |
| 6 | Explorer Event Discovery | **Journey action** inside #8-Digest / standalone send | one message, event-gated |
| 7 | Explorer Event RSVP / Preparation | **Reuse existing Open House campaigns** | already built and seeded |
| 8 | Explorer Event No-Show Recovery | **Reuse `Strategy Call No-Show Recovery` pattern**, new Explorer sequence | pattern exists |
| 9 | Explorer Event Attendee Follow-Up | **Journey action** | one message, branches on attendance |
| 10 | Explorer Accelerator Interest | **Campaign + sequence** | the commercial spine |
| 11 | Explorer High Intent | **Overlay**, not a campaign | routes to #10 / #12 at higher priority |
| 12 | Explorer Ali Personal Outreach | **Extend the EXISTING Ali campaign** — see §15 | do not duplicate |
| 13 | Explorer AI Voice High Intent | **Journey action** behind `EXPLORER_AUTO_DIAL_ENABLED` | not a campaign |
| 14 | Explorer Broken Journey Recovery | **Campaign + sequence** | friction, highest tier |
| 15 | Explorer Subscription Upgrade | **Journey action** inside #10 | one message |
| 16 | Explorer AI Internship Path | **Deferred — blocked**, no internship data exists | §22 |
| 17 | Explorer Referral / Ambassador | **Campaign + sequence** (short) | own goal |
| 18 | Explorer Weekly Intelligence Digest | **Campaign + 1-step recurring sequence** | recurring |

**Result: 8 new Campaign rows, 3 existing reused, 1 blocked, the rest are journey actions or overlays.**

### 12.2 The eight new campaigns

All ship `status='draft'`, `campaign_mode='standard'`, `settings.test_mode_enabled=true`, `approval_status='draft'`. Type is `warm_nurture` except where noted (`behavioral_trigger` is reserved for the existing visitor-trigger machinery; `executive_outreach` is Ali's).

| # | Name | Key | Type | Entry | Exit | Tier | Channels | Flag |
|---|---|---|---|---|---|---|---|---|
| C1 | Explorer Broken Journey Recovery | `explorer_friction_recovery` | `warm_nurture` | `FRICTION` or `NEEDS_SUPPORT` overlay | F < 15 and condition resolved | 2 | email (+ in-app) | `EXPLORER_GROWTH_OS_ENABLED` |
| C2 | Explorer Activation Rescue | `explorer_activation_rescue` | `warm_nurture` | `ACTIVATING` ≥ 72h with 0 completions | first completion → exit | 6 | email | as above |
| C3 | Explorer Learning Momentum | `explorer_learning_momentum` | `warm_nurture` | `ACTIVE_LEARNER`/`ENGAGED_LEARNER`, E ≥ 25 | E < 15, or `CONVERTED` | 7 | email, in-app | as above |
| C4 | Explorer Dormant Re-entry | `explorer_dormant_reentry` | `re_engagement` | `DORMANT` ≥ 14d | any E-signal | 6 | email | as above |
| C5 | Explorer Community Activation | `explorer_community_activation` | `warm_nurture` | E ≥ 30, no community contribution | first contribution | 8 | email, in-app | as above |
| C6 | Explorer Accelerator Interest | `explorer_accelerator_interest` | `warm_nurture` | `CONSIDERING_NEXT_STEP`/`ENROLLMENT_READY`, F < 25 | `CONVERTED`, or I < 30 for 14d | 5 | email (+ SMS/voice by flag) | + `EXPLORER_COMMERCIAL_ENABLED` |
| C7 | Explorer Referral / Ambassador | `explorer_referral` | `warm_nurture` | `REFERRAL_READY` | 90d or referral submitted | 10 | email | as above |
| C8 | Explorer Weekly Intelligence Digest | `explorer_weekly_digest` | `warm_nurture` | E ≥ 20, past day 21, not converted | unsubscribe / converted | 9 | email | as above |

**Universal suppression on every one:** `CONVERTED`; any unsubscribe; consent revoked; `F ≥ 25` (except C1); learner already has a live decision today; contact-policy cap reached; kill switch.

### 12.3 Existing campaigns reused

| Existing | Reuse |
|---|---|
| Open House campaigns (`seedOpenHouseCampaigns.ts`, 3 segment campaigns sharing 1 sequence) | Explorer event RSVP + preparation. Governor enrolls; no new campaign. |
| `Strategy Call No-Show Recovery` | Pattern reference; Explorer event no-show gets its own sequence on C1's campaign row (friction-adjacent). |
| **`Ali Personal Outreach`** (`executive_outreach`) | Extended, not duplicated — §15. |

---

## 13. THE 28-EXPERIENCE MATRIX

Experience = a *possible* message. The Governor picks at most one per learner per day. Columns: what deterministic logic decides vs. what AI decides.

| # | Experience | Trigger (deterministic) | Goal | Channels | AI decides | Deterministic decides | Dynamic content | CTA | Suppressed when |
|---|---|---|---|---|---|---|---|---|---|
| 01 | Signup Welcome | enrollment created | orient | email | wording | eligibility, timing | first lesson | Start learning | **already sent by `sendTrainingWelcome`** — Governor defers |
| 02 | First lesson recommendation | 24h, 0 interactions | first click | email, in-app | which lesson (ranked), wording | eligibility, cap | `recommended_lesson` | Open lesson | any completion |
| 03 | AI education concept | E 10-40, day 3-10 | value w/o ask | email | concept + wording | cadence | `latest_relevant_blog` | Read/watch | I ≥ 60 |
| 04 | Activation rescue | `ACTIVATING` 72h, 0 completions | first completion | email | angle | trigger | easiest lesson | 5-minute start | completion |
| 05 | Day-3 checkpoint | day 3 ± 12h | assess + nudge | email | branch copy | branch by E | lesson or event | varies | converted/unsub |
| 06 | Community intro | E ≥ 30, no contribution | first contribution | email, in-app | room choice | threshold | `community.topic/url` | Join the room | already contributed |
| 07 | Personalised learning | affinity conf ≥ 0.5 | depth | email | lesson selection | affinity calc | `recommended_lesson` | Continue path | dormant |
| 08 | Day-7 checkpoint | day 7 ± 12h | assess + branch | email | branch copy | branch by E/I | varies | varies | converted |
| 09 | Outcome proof | I ≥ 40 | credibility | email | testimonial choice | intent gate | `testimonial.*` | See the story | **no testimonial ⇒ cancel** |
| 10 | Educational resource | any active state, cadence slot | value | email | blog/podcast pick | cadence | `latest_relevant_blog` | Read | digest same week |
| 11 | Momentum / streak | streak ≥ 3 or points milestone | reinforce | email, in-app | wording | milestone calc | `learner.points/streak` | Keep going | dormant |
| 12 | Day-14 checkpoint | day 14 ± 12h | major branch | email | branch copy | **branch by E/I/F** | varies | varies | converted |
| 13 | Upcoming Accelerator | `CONSIDERING_NEXT_STEP`, cohort exists | introduce cohort | email | framing | **cohort resolved at send** | `next_class.*` | See the cohort | **no open cohort ⇒ cancel (§31 T13)** |
| 14 | Relevant event | event exists, `EVENT_READY` | registration | email | framing | event resolution | `next_event.*` | Register | already registered |
| 15 | Event preparation | `EVENT_REGISTERED`, T-48h/T-3h | attendance | email (+SMS by flag) | wording | T-minus timing | event details | Join link | not registered |
| 16 | Event follow-up | event ended | branch attended/no-show | email | branch copy | attendance lookup | recap / rebook | varies | never registered |
| 17 | Progress report | day 21, then monthly | reflect value | email | narrative | metrics | `learner.*` | Continue | E < 10 |
| 18 | Community story | community content exists | belonging | email | spotlight pick | availability | community asset | Read/join | no asset |
| 19 | Project showcase | project content exists | aspiration | email | selection | availability | project asset | See builds | no asset |
| 20 | Journey check-in | day 30, ambiguous state | learn preference | email | question framing | state ambiguity | 3 options | Reply | in conversation |
| 21 | Subscription | `SUBSCRIPTION_READY` | subscription | email | framing | eligibility | `subscription.price_monthly` | See plans | cohort fits better |
| 22 | AI Internship | `INTERNSHIP_READY` | internship path | email | framing | eligibility | `internship.*` | Learn more | **BLOCKED — no data (§22)** |
| 23 | Social proof | I ≥ 50 | de-risk | email | proof pick | intent gate | testimonial/case study | See outcomes | no consented asset |
| 24 | **Ali personal outreach** | `HIGH_INTENT` + T3 + F<25 | human connection | email | short personal note | **strict eligibility + daily cap** | minimal, natural | Reply | **`EXPLORER_ALI_OUTREACH_ENABLED=false`** |
| 25 | AI voice | §16 full gate | conversation | voice | script | **all gates** | cohort/event facts | — | **`EXPLORER_AUTO_DIAL_ENABLED=false`** |
| 26 | Accelerator deep dive | I ≥ 55, viewed program page | explain program | email | emphasis | intent gate | `next_class.*` | Full details | F ≥ 25 |
| 27 | Cohort decision | `ENROLLMENT_READY`, cohort within 21d | decide | email | framing | **legitimate deadline only** | `next_class.*` | Enroll | **no real deadline ⇒ no urgency language** |
| 28 | Free AI movement / referral | `REFERRAL_READY` | advocacy | email | framing | eligibility | share link | Invite | E < 40 |
| — | **Weekly digest** | E ≥ 20, past day 21 | sustained value | email | assembly + wording | cadence, caps | 1 learn + 1 opportunity + 1 action | varies | unsubscribed/converted |

**Experience 01 note:** `sendTrainingWelcome` already sends a branded welcome on Explorer signup and **deliberately omits `List-Unsubscribe`**. The Governor does not duplicate it. §35 flags the missing unsubscribe header as a compliance item.

---

## 14. CAMPAIGN SEQUENCES

Steps define **objective, constraints, tone, permitted facts, and CTA strategy** — not polished copy (§33). Copy is AI-generated at send time; `body_template` carries a deterministic safe fallback.

Timing must satisfy `validateSequenceSteps` (`sequenceService.ts:34-134`): ≤12 steps, ≤45 days, `delay_days` non-decreasing, ≥2-day gap cross-channel, ≥2 days around voice.

### C2 — Explorer Activation Rescue

| Step | Day | Ch | Goal | AI instructions (summary) | Runtime vars | CTA | Branch |
|---|---|---|---|---|---|---|---|
| 0 | 0 | email | one 5-minute win | Warm, zero guilt. Name the single easiest next lesson. No program pitch. | `recommended_lesson.*`, `learner.first_name` | Open lesson | exit on any completion |
| 1 | 3 | email | remove the blocker | Ask what got in the way; offer one alternative entry point. Invite a reply. | `recommended_lesson.*` | Reply or open | exit on completion/reply |
| 2 | 7 | email | reframe value | Teach one useful AI idea standalone. No CTA pressure. | `latest_relevant_blog.*` | Read | exit on any E-signal |
| 3 | 14 | email | graceful pause | Confirm free access is permanent; reduce cadence. **Explicitly states the free path continues.** | — | Stay subscribed | → `DORMANT` → C4 |

### C6 — Explorer Accelerator Interest

| Step | Day | Ch | Goal | AI instructions (summary) | Runtime vars | CTA | Branch |
|---|---|---|---|---|---|---|---|
| 0 | 0 | email | connect learning to program | Reference their actual progress naturally, never analytically. Introduce the cohort as the next step. | `learner.completed_lessons`, `next_class.*` | See the cohort | **cancel if no open cohort** |
| 1 | 3 | email | proof | One relevant testimonial matched to affinity. | `testimonial.*` | See the story | cancel if no asset |
| 2 | 7 | email | how it works | Explain structure: live builds, community, projects, certification. Framed as *added support*, never as free-tier deprivation. | `next_class.*` | Full details | — |
| 3 | 12 | email | handle the real objection | Address time/fit. Offer a conversation, not a close. | — | Reply or book | → tier 3 on reply |
| 4 | 18 | email | decision support | Only if a legitimate, source-backed date exists. **No manufactured scarcity.** | `next_class.start_date`, `.seats_remaining` | Enroll | **skip step entirely if no real date** |
| 5 | 25 | email | soft exit | Free path continues; door stays open. | — | Keep learning | → C3 |

### C8 — Weekly Intelligence Digest (1 recurring step)

One step, `delay_days: 7`, re-enrolled weekly by the Governor. Assembly is deterministic; wording is AI:

```
1 useful thing to learn      ← explorerContentSelector(affinity, journey_stage)
1 relevant opportunity       ← next_event | next_class | community | internship
1 suggested next action      ← the Governor's own next-best-action for this learner
```

**Guardrail:** if fewer than 2 of the 3 slots resolve, the digest is **not sent**. A one-item digest is a newsletter, and the brief explicitly rejects that.

*(C1, C3, C4, C5, C7 follow the same structure; full step tables are produced in EPIC 6 alongside the seed files, since they must be authored against the actual seed definitions.)*

---

## 15. ALI PERSONAL OUTREACH DESIGN

### 15.1 What exists

- `Ali Personal Outreach`, type `executive_outreach`, seeded by `seedAliOutreachCampaign.ts`, 710 leads attached, `daily_limit: 10`, `max_leads_per_cycle: 10`.
- `services/aliPersonalOutreachService.ts` provides `ALI_SIGNATURE`; `settings.ali_signature` triggers appending it (`schedulerService.ts:1044-1047`).
- **`executive_outreach` gets special treatment in two places:** Reply-To goes directly to `ali@colaberry.com` (`schedulerService.ts:1108-1111`) instead of the inbound-domain rewrite; and `contextGraphService.ts:164-174` re-queries the lead's most recent *other* campaign type so Ali's note inherits the correct framing.
- Replies to `ali_personal_outreach` additionally trigger a **Synthflow voice call to Ali** (`mandrillWebhookController.ts:451-480`).

### 15.2 Recommendation: option C — share the campaign, add an Explorer sequence, branch on context

| Option | Verdict |
|---|---|
| A. Extend existing campaign to accept Explorers | Insufficient alone — the existing sequence is written for cold B2B leads |
| B. New Explorer-specific Ali campaign | Rejected — duplicates the `executive_outreach` special-casing in two files, and splits Ali's daily cap across two campaigns where it would no longer be enforced |
| **C. Same campaign, Explorer sequence, prompt branches on context** | **Recommended** |
| D. Journey action with a bespoke sender | Rejected — bypasses `evaluateSend`, repeating the `emailService` bypass problem |

**Why C.** The campaign row carries the identity (sender, Reply-To routing, signature, `executive_outreach` type, the single shared daily cap). The *sequence* carries the audience-specific copy strategy. The Governor selects which sequence to enroll into — the existing cold sequence for CRM leads, a new `Ali Outreach — Explorer` sequence for learners. Both inherit the identity handling and the cap for free, and the `contextGraphService` special-case keeps working unchanged.

Implementation: one new `FollowUpSequence` named `Ali Outreach — Explorer`; the Governor passes its id to `enrollLeadInSequence(leadId, explorerSeqId, ALI_CAMPAIGN_ID)`.

### 15.3 Eligibility (deliberately strict)

All must hold: `HIGH_INTENT` overlay **with ≥1 T3/T4 signal**; `F < 25`; E ≥ 25 (they have actually engaged); not converted; email eligible; **no Ali outreach in the last 45 days**; within Ali's global daily cap of 10 **shared across leads and Explorers**; `EXPLORER_ALI_OUTREACH_ENABLED=true`.

Note the deliberate consequence: a moderate-engagement / very-high-intent learner **can** qualify ahead of a high-engagement / low-intent learner. That is the intended behaviour and is Scenario 3 in §31.

### 15.4 Tone

Detailed tracking is used **internally** and referenced **naturally**, never analytically.

> **Internal:** `I=81; pricing_view ×4 (14d); booking_modal_opened; cohort_page ×2`
> **External:** *"You've been exploring some of the deeper AI training options — I wanted to make sure you knew what's actually available next, and to answer anything directly."*

Prohibited in generated copy, enforced by a validator rule: any reference to counts of visits, tracking, scores, "our system noticed", or behavioural language. Target length ≤120 words. Signature via the existing `ALI_SIGNATURE`.

### 15.5 Reply triage

Inbound already lands via `mandrillWebhookController.handleMandrillInbound` → `InteractionOutcome{replied}`. New: `explorerReplyClassifier` (LLM classify + deterministic keyword override) writing to the decision record and driving tier 3.

Classes: `QUESTION`, `INTERESTED`, `READY_TO_ENROLL`, `NEEDS_HELP`, `SCHEDULING`, `PRICING`, `INTERNSHIP`, `COMMUNITY`, `NOT_INTERESTED`, `OPT_OUT`, `NEEDS_ALI`, `OTHER`.

Routing: `OPT_OUT` → **deterministic keyword match only, never LLM** → `processOptOut()` immediately. `READY_TO_ENROLL` / `NEEDS_ALI` / `NOT_INTERESTED` → human task, no automated reply. `QUESTION`/`PRICING`/`SCHEDULING` → draft for review (auto-reply only at a later stage, and only behind its own flag). Every reply sets `IN_CONVERSATION`, which suppresses all scheduled nurture for 7 days.

**The existing inbound auto-reply path (`mandrillWebhookController.ts:379-449`) creates its own nodemailer transport and bypasses `guardedSendMail` and every safety check.** Explorer replies must **not** use it. §35 flags it.

---

## 16. AI VOICE DESIGN

**Ships disabled. `EXPLORER_AUTO_DIAL_ENABLED=false`. Not enabled without the §35 compliance decisions.**

### 16.1 Integration

Reuse `synthflowService.triggerVoiceCall({name, phone, callType:'interest', prompt, context})` unchanged. The Governor produces a `SCHEDULE_VOICE` candidate; execution goes through the normal queue as a `channel='voice'` step so `evaluateSend` still gates it.

### 16.2 Eligibility — all must hold

`EXPLORER_AUTO_DIAL_ENABLED` ✓ · `env.enableVoiceCalls` ✓ · kill switch off ✓ · `HIGH_INTENT` with **≥1 T4 signal** ✓ · `F < 15` (stricter than email) ✓ · not converted ✓ · valid E.164 phone ✓ · **`consent_records` has a current `granted` voice record with basis `express_written` or `double_opt_in`** ✓ · not unsubscribed/DNC ✓ · **learner-local business hours** ✓ · ≤1 attempt per 14 days, ≤3 lifetime ✓ · no contact in 72h ✓ · no open support case ✓ · no unresolved friction ✓.

**This gate is fail-closed at every step.** Note it is emphatically *not* "E ≥ 70 ⇒ call".

### 16.3 Two blocking problems

1. **There is no per-lead timezone.** Call windows use the *campaign's* timezone (`schedulerService.ts:395-420`), defaulting to `America/Chicago`. Calling a learner at a locally-inappropriate hour is a TCPA exposure. **Mitigation:** derive timezone from `visitors.country`/`city` or area code, store on the profile, and **refuse to dial when timezone is unknown**. Governance item §35 D-3.
2. **There is no consent capture UI**, and `consent_enforcement` is `'shadow'`. Under fail-closed voice policy, **zero Explorers are voice-eligible today** — which is the correct and safe outcome. Voice cannot be enabled until capture exists.

### 16.4 Outcomes and loop closure

Webhook already writes `answered | voicemail | no_answer`. Extended Explorer outcomes are derived from the transcript/analysis and recorded on the decision: `connected`, `voicemail`, `no_answer`, `failed`, `declined`, `interested`, `callback_requested`, `question_requires_human`, `wrong_number`, `event_registered`, `application_started`, `enrolled`, `opted_out`.

**Fixing D5 (no reconciliation) is a prerequisite.** New `explorerVoiceReconciliationService` on a `*/30` cron: any `communication_logs` row with `provider='synthflow'`, `status='pending'`, older than 2 hours is marked `timed_out`, the decision outcome is set, and the learner is released from pending state. Without this, a lost webhook strands a learner forever.

`wrong_number` → clear phone, mark voice ineligible. `opted_out` → `processOptOut()`. `question_requires_human` → human task.

---

## 17. SMS DESIGN

**Ships disabled. `EXPLORER_SMS_ENABLED=false`. Yes — SMS needs its own flag, independent of voice**, because its consent basis, cost, and failure modes differ.

- **Twilio does not exist in this repo.** Two comments only. The `sms_provider`/`sms_from_number`/`sms_api_key` settings are dead code, never read. All SMS is GoHighLevel: `ghlService.sendSmsViaGhl(contactId, body)` writes a custom field `cory_sms_composed` that triggers a GHL Workflow. This requires `leads.ghl_contact_id`.
- **Explorer SMS blockers:** most Explorers have no `ghl_contact_id` (they arrive via Open House/portal signup, not GHL); TCPA requires prior express written consent, which we do not capture; no per-lead timezone; the STOP handler has two divergent implementations (D4) with the orphaned one unreachable; and the GHL webhook has **no signature verification** (D6).
- **Scope for SMS:** event reminders only (experience 15) for learners who registered *and* granted SMS consent, respecting `ghl_sms_level` ramp limits. Nothing commercial.
- Prerequisites before enabling: consent capture UI; unify STOP handling on `unsubscribeEnforcementService`; per-lead timezone; GHL contact provisioning for Explorers; webhook signature verification.

---

## 18. EMAIL DESIGN

The only channel enabled in the pilot.

- **Generation:** runtime AI via the existing path. `campaign.ai_system_prompt` becomes the system prompt verbatim; `step.ai_instructions` gates whether AI runs at all (`schedulerService.ts:191`). Model `gpt-4o-mini` via `getInstrumentedOpenAI`.
- **Sender:** per-campaign `settings.sender_email` / `sender_name` (`schedulerService.ts:1040-1041`) — no new transport. Proposal: `Colaberry AI Learning <training@colaberry.com>` for C2-C8 (matching the existing Explorer welcome sender), and Ali's identity for experience 24 via the existing `executive_outreach` campaign.
- **Reply routing:** existing inbound-domain rewrite; Explorer replies classified per §15.5. Explorer campaigns must **not** use the bypassing auto-reply path.
- **Unsubscribe:** campaign sends already emit RFC 8058 one-click headers. **`sendTrainingWelcome` does not** — §35 D-5.
- **Failure handling:** unchanged — AI failure falls back to `body_template` if non-empty (so every Explorer step ships a real deterministic fallback), else throws → retry +30 min → `fallback_channel` → `failed`. Explorer steps set `max_attempts: 2` and **no `fallback_channel`** while SMS/voice are off.

---

## 19. EVENT INTEGRATION

**Events are the strongest available conversion lever and the weakest available data.**

| Concern | Reality |
|---|---|
| Event catalog | CCPP SQL Server `EventBrite_Events` (primary, prod-network only) + PG `open_house_events` (fallback) |
| Registration | **No RSVP table.** An idempotent `student_points_events` row, `event_key='open_house_rsvp:<eventId>'` |
| Attendance | `openHouseIngestService` maps `registered|attended|paid` → **`leads.lead_temperature`** (`warm|hot|qualified`); plus `event_key='open_house_attended'` |
| No-show | **Not modelled at all** |
| Registration API | **Eventbrite API is read-only here** — we cannot register anyone; CTAs must link out |

**Approach:** derive rather than build. `explorerEventStateService` computes `EVENT_READY | EVENT_REGISTERED | EVENT_ATTENDED | EVENT_NO_SHOW` from those existing sources, and reads the event catalog through `publicEventsService` (with its PG fallback) so **no new CCPP path is created**.

`EVENT_NO_SHOW` = `registered AND event.ends_at < now AND NOT attended`, evaluated once, 24h after the event ends, to avoid racing the attendee ingest.

Governor behaviour: registration **immediately suppresses** event-discovery and starts preparation (tier 4). Attendance replaces no-show logic entirely (§31 scenario 6). Post-event, an attendee who returns to the Accelerator page is exactly scenario E.

---

## 20. CURRICULUM INTEGRATION

- **Activity → E-score** from `timeline_card_progress`, `today_feed_impressions`, `student_points_events`, `xp_events`, `assignment_submissions`, `reflection_entries`, `student_architecture_skill`.
- **Recommendation reuses CAPE.** `services/cape/capeLearningValueRanker` and `capeTodayPlanService` already rank learning value per learner. Explorer Growth OS **calls the existing ranker** rather than writing a second recommender, and falls back to `explorerContentSelector` over `timeline_cards` when CAPE returns nothing.
- **Explorers see a restricted curriculum.** `EXPLORER_WEEK0_ONLY` and `hasFullCurriculumAccess()` gate content. **Recommendations must be filtered through the same predicate** — recommending a locked lesson is a trust failure and a support ticket. Test T-CUR-1 covers it.
- Feedback (`today_plan_feedback`: `more_like_this`, `too_easy`, `not_interested`, …) feeds affinity.

---

## 21. COMMUNITY INTEGRATION

- **Detection:** `enrollments.id → community_members.enrollment_id`, then `EXISTS` in `community_contributions` (already enrollment-keyed — the cheapest join). Recency from `community_members.last_active_at`.
- **State:** first contribution → `CONNECTED_TO_COMMUNITY`. Community activity is a strong retention signal (E recency band) and raises the bar for dormancy.
- **Recommendation:** `community_rooms` matched on affinity tags. Rooms are real and seeded (`seedDefaultCommunityRooms.ts`).
- **Suppression:** a learner who contributed in the last 14 days does not receive community-activation messaging (C5 exits on first contribution).

---

## 22. INTERNSHIP INTEGRATION — BLOCKED

**Internships do not exist in this repository.** No model, no table, no route, no application flow. The only trace is the string `'internship'` in a `CurriculumBlueprint.scope` comment.

Consequently:
- Experience 22 and campaign #16 are **deferred**, not built.
- `INTERNSHIP_READY` is still computed (from affinity + E), so the audience is measurable before any build.
- The affinity tag `ai_internship` is still tracked.
- **No internship claim may appear in any Explorer message**, because there is no authoritative source and the "never invent" rule is absolute.

**Minimum to unblock** (§35 D-8, a separate scoped decision): an `internships` table (title, description, url, eligibility, opens_at, deadline, active), an application record, and a public route. Until then this is honestly reported as out of scope rather than quietly stubbed.

---

## 23. SUBSCRIPTION INTEGRATION

- `subscriptions`: `plan ∈ {annual, monthly, comp}`, `status ∈ {pending, active, canceled, failed}`, `payment_ref` UNIQUE as the idempotency anchor. Current subscription = newest non-failed row.
- **Pricing is a code constant** (`subscriptionService.PLANS`: annual $149/mo → $1,788/yr, monthly $199/mo, comp $0). The registry projects from `PLANS` so copy never hardcodes a price; if `PLANS` changes, copy follows.
- `SUBSCRIPTION_READY` when E ≥ 55, I between 30 and 69, and **no good cohort fit** (no open cohort within 45 days, or cohort timing conflicts). Subscription is the answer for "wants more, not ready for a cohort."
- An active `comp` subscription means **converted** for entitlement purposes (`hasFullCurriculumAccess`) and immediately stops acquisition messaging — comped staff and Free Access grantees must never be sold to.

---

## 24. CONVERSION / COHORT FORECAST

### 24.1 Principle

**Observed facts and projections are visually and structurally separate, and no benchmark is fabricated.** Where we lack data we say "insufficient data", not a plausible-looking number.

### 24.2 The model

```
Stage counts (OBSERVED — from explorer_score_snapshots, point-in-time)
  Explorer accounts           E0
  Activated (≥1 interaction)  E1
  Active (≥1 completion)      E2
  Engaged (E≥45)              E3
  High intent (T3+)           E4
  Application started         E5
  Application completed       E6
  Paid                        E7

Stage conversion (OBSERVED, only when n ≥ 30 and window ≥ 30 days)
  r(i) = E(i+1) / E(i)        else → "insufficient data"

Expected from current pipeline (PROJECTION)
  expected = Σ over stages  count(i) × Π r(j) for j ≥ i
  reported as a range using Wilson score intervals on each r(i)

Forecast total  = current_paid + expected
Forecast gap    = 125 − forecast_total

Required-to-close (PROJECTION, three levers, shown as alternatives not a plan)
  A. new Explorers needed        = gap / Π r(all)
  B. activation lift needed      = gap solved by moving r(0)
  C. intent/application lift     = gap solved by moving r(3), r(4)
```

### 24.3 Today's honest numbers

| Metric | Value | Basis |
|---|---|---|
| Active Explorers | **154** | observed |
| Explorers created in last 30d | **151** | observed |
| Ever interacted | 19 (12.3%) | observed |
| Ever completed a card | 13 (8.4%) | observed |
| Paid standard enrollments | 61 | observed (all-time, all sources) |
| Explorer → paid conversion | **insufficient data** | program is 4 weeks old; no Explorer cohort has completed a full cycle |
| Target | 125 | given |

**The arithmetic that matters:** if the eventual Explorer→paid rate were 5%, 154 Explorers yield ~8 students. Reaching 125 from Explorers alone needs roughly **2,500 Explorers** at that rate. The forecast UI must therefore present the 125 target as a **multi-source** goal (Explorer pool + 24,238 CRM leads + Open House funnel), and Explorer Growth OS's measurable contribution is the **lift** it creates in stage conversion — which §25's holdouts are designed to isolate.

**The most improvable number today is activation: 12% interaction and 8% completion.** That is where this system earns its keep first, and it is why C2 (Activation Rescue) is the first campaign to pilot.

---

## 25. EXPERIMENTATION

### 25.1 Assignment

Deterministic and stable without a write:

```ts
variant = sha256(`${experiment_key}:${enrollment_id}`) → first 8 hex → /0xFFFFFFFF
        < holdout_pct ? 'control' : 'treatment'
```

The `explorer_experiment_assignments` row is a *record* of what the hash produced, not the source of truth, so a lost row cannot flip anyone's assignment.

### 25.2 What may and may not be experimented on

| Intervention | Holdout? | Default |
|---|---|---|
| Ali personal outreach | ✅ yes | 10% control |
| AI voice | ✅ yes | 20% control |
| SMS vs email-only | ✅ yes | 20% control |
| Event invitation variants | ✅ yes | A/B |
| Lesson recommendation strategy | ✅ yes | A/B |
| Community intro timing | ✅ yes | day 7 vs day 14 |
| Weekly digest cadence | ✅ yes | weekly vs biweekly |
| **Friction recovery (C1)** | ❌ **never** | — |
| **Support/help responses** | ❌ **never** | — |
| **Opt-out / suppression handling** | ❌ **never** | — |
| **Event logistics for a registered attendee** | ❌ **never** | — |
| **Transactional/security email** | ❌ **never** | — |

**Rule: no learner is ever withheld from a message that helps them with a problem they are actually having.** Withholding a payment-failure recovery to measure lift is not an experiment, it is negligence. Only *promotional* interventions are eligible.

### 25.3 Measurement

Both arms get a `explorer_journey_decisions` row (control's `selected_action` becomes `WAIT`, `holdout_group='control'`), so treatment and control are measured on **identical eligibility** — the standard trap of comparing "people we messaged" against "everyone else" is structurally impossible here.

Lift = `conv(treatment) − conv(control)` with a Wilson interval; reported as **"insufficient data"** below n=100 per arm.

---

## 26. ADMIN UI

New page `/admin/explorer-growth`, composed entirely from the existing shell (`PageHeader`, `StatCard`, `StatusBadge`, `SectionCard`), Bootstrap 5 + RemixIcon, no new design system. `section: 'campaigns'` for RBAC so no new section key is needed.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Admin / Explorer Growth                                                    │
│ ⚙ Explorer Growth OS            [ SHADOW ▾ ]  [ Recalculate ] [ ⛔ PAUSE ] │
│ Trust: live · explorer_journey_profiles · updated 4m ago · 154 profiles    │
├────────────────────────────────────────────────────────────────────────────┤
│ ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐    │
│ │EXPLORER││ACTIVATED││ ACTIVE ││ENGAGED ││DORMANT ││HIGH INT││FRICTION│    │
│ │  154   ││   19   ││   13   ││    2   ││   87   ││    0   ││    3   │    │
│ └────────┘└────────┘└────────┘└────────┘└────────┘└────────┘└────────┘    │
├────────────────────────────────────────────────────────────────────────────┤
│ Overview │ Journey │ Decisions │ Shadow │ Content │ Forecast │ Experiments │
├────────────────────────────────────────────────────────────────────────────┤
│ ACTIONS TODAY (shadow — nothing sent)                                      │
│   Email 42 · SMS 0 · Voice 0 · In-app 8 · Waits 104 · Suppressed 31        │
│   Human escalations 2                                                      │
│                                                                            │
│ JOURNEY DISTRIBUTION      ████████░░░░░░░░  NEW 87 · ACTIVATING 32 ·       │
│                           ACTIVE 13 · ENGAGED 2 · CONSIDERING 0 ·          │
│                           READY 0 · CONVERTED 0                            │
│                                                                            │
│ CHANNEL HEALTH   Email ● healthy   SMS ○ disabled   Voice ○ disabled       │
│                                                                            │
│ RECENT DECISIONS                                             [ Why? ]      │
│  Sarah S.   CONSIDERING +HIGH_INTENT  E64 I81 F3  → Event Preparation  ▸   │
│  Marcus T.  ACTIVATING                E12 I5  F0  → Activation Rescue  ▸   │
│  Dana R.    ACTIVE_LEARNER +FRICTION  E48 I62 F31 → Friction Recovery  ▸   │
└────────────────────────────────────────────────────────────────────────────┘
```

**The "Why?" drilldown** — the single most important screen, rendering one `explorer_journey_decisions` row:

```
┌─ Why did Sarah Smith receive this? ───────────────────────────────────────┐
│ Decision 2026-08-12 · mode SHADOW · ruleset v1.0.0 · not executed         │
│                                                                           │
│ STATE  CONSIDERING_NEXT_STEP   OVERLAYS  HIGH_INTENT, EVENT_REGISTERED    │
│ SCORES E 64   I 81   F 3                                                  │
│                                                                           │
│ TRIGGERING SIGNALS          CANDIDATES (tier · score)                     │
│  Event RSVP          +22     ▸ 4 · 71  Event Preparation      ← WINNER    │
│  Accelerator page    +18     ▸ 5 · 66  Ali Outreach                       │
│  Class page          +14     ▸ 5 · 54  Accelerator Overview               │
│  Lesson completed     +6     ▸ 7 · 40  Learning Recommendation            │
│                                                                           │
│ SUPPRESSED                                                                │
│  Dormant Recovery         not dormant (activity 1d ago)                   │
│  Generic Curriculum       outranked by tier 4                             │
│                                                                           │
│ SELECTED  Event Preparation · email · Open House campaign step 1          │
│ REASON    Confirmed event occurs within 36 hours; logistics for a         │
│           registered attendee outranks commercial messaging.              │
│ ASSETS    open_house_events#f3a1 "AI Systems Architect Open House"        │
│ DEFERRED  Ali Outreach → after the event (2026-08-14)                     │
└───────────────────────────────────────────────────────────────────────────┘
```

Other tabs: **Journey** (filterable roster by state/overlay/score with drilldown), **Shadow** (what would have happened, per learner, with diff-vs-yesterday), **Content** (registry health, unresolvable slots, expired assets), **Forecast** (§24, observed vs projected clearly separated), **Experiments** (arms, n, lift with intervals or "insufficient data"), **Settings** (mode, flags, caps, thresholds).

Every interactive element carries a `data-testid` — the E2E harness (§31) depends on it.

---

## 27. API PLAN

New router `backend/src/routes/admin/explorerGrowthRoutes.ts`, registered with one `router.use()` line in `adminRoutes.ts`. **Path-scoped guard** — `router.use('/api/admin/explorer-growth', requireAdmin)` — never a bare `router.use(requireAdmin)`, which has caused two production outages in this repo. This also satisfies `scripts/lint-route-auth.js` in CI.

All input Zod-validated (`safeParse` inline, v4 `.issues`); all responses typed.

### Read

| Method | Path | Returns |
|---|---|---|
| GET | `/api/admin/explorer-growth/summary` | counts by state/overlay, actions today, channel health, mode |
| GET | `/api/admin/explorer-growth/distribution` | journey-state distribution + trend |
| GET | `/api/admin/explorer-growth/learners` | paginated roster; filters `state`, `overlay`, `e_min/max`, `i_min/max`, `f_min`, `search` |
| GET | `/api/admin/explorer-growth/learners/:enrollmentId` | full profile: scores, affinities, contactability, state history |
| GET | `/api/admin/explorer-growth/learners/:enrollmentId/signals` | signal timeline with weights + decay |
| GET | `/api/admin/explorer-growth/learners/:enrollmentId/decisions` | decision history |
| GET | `/api/admin/explorer-growth/learners/:enrollmentId/scores` | snapshot series |
| GET | `/api/admin/explorer-growth/decisions` | recent decisions; filters by action, date, executed |
| GET | `/api/admin/explorer-growth/decisions/:id` | the "Why?" payload |
| GET | `/api/admin/explorer-growth/shadow` | what *would* run today |
| GET | `/api/admin/explorer-growth/content` | registry + health |
| GET | `/api/admin/explorer-growth/forecast` | §24, observed vs projected flagged |
| GET | `/api/admin/explorer-growth/experiments` | arms, n, lift |
| GET | `/api/admin/explorer-growth/eligibility/:enrollmentId` | dry-run candidate evaluation |

### Control (all audited via `logEvent`; destructive ones require `requireAdmin` + confirmation)

| Method | Path | Effect |
|---|---|---|
| POST | `/api/admin/explorer-growth/mode` | set `off\|observe\|shadow\|test_users\|pilot\|limited\|full` |
| POST | `/api/admin/explorer-growth/pause` / `/resume` | Explorer-specific kill switch (independent of the global one) |
| POST | `/api/admin/explorer-growth/learners/:id/recalculate` | force recompute |
| POST | `/api/admin/explorer-growth/learners/:id/rerun-decision` | re-decide (**never sends outside pilot+**) |
| POST | `/api/admin/explorer-growth/learners/:id/suppress` | manual suppression with reason + expiry |
| DELETE | `/api/admin/explorer-growth/learners/:id/suppress` | release |
| POST | `/api/admin/explorer-growth/content/refresh` | force registry sync |

**Not exposed:** any endpoint that sends immediately, any bulk enrollment, any bulk state mutation. Sending is only ever a consequence of a governed decision.

---

## 28. FILE-BY-FILE IMPLEMENTATION MAP

Legend: **C** create · **M** modify. Every service file targets ≤300 lines (CLAUDE.md soft target).

### EPIC 1 — Foundation & prerequisite defect fixes

| | Path | Responsibility | Depends on | Tests |
|---|---|---|---|---|
| C | `backend/src/db/ensureExplorerGrowthSchema.ts` | Create all 5 tables + indexes, `ensureReeseOutreachSchema` pattern | — | `__tests__/db/ensureExplorerGrowthSchema.test.ts` |
| M | `backend/src/server.ts` | `await ensureExplorerGrowthSchema()` before line 2619 | above | boot smoke |
| C | `backend/src/models/ExplorerJourneyProfile.ts` | T1 | schema | model shape test |
| C | `backend/src/models/ExplorerJourneyDecision.ts` | T2 | schema | model shape test |
| C | `backend/src/models/ExplorerScoreSnapshot.ts` | T3 | schema | model shape test |
| C | `backend/src/models/ExplorerExperimentAssignment.ts` | T4 | schema | model shape test |
| C | `backend/src/models/ExplorerContentAsset.ts` | T5 | schema | model shape test |
| M | `backend/src/models/index.ts` | associations + exports | models | — |
| M | `backend/src/models/PageEvent.ts` | **add `lead_id`** (fixes D1) | — | `__tests__/models/pageEvent.test.ts` |
| C | `backend/src/db/ensurePageEventLeadId.ts` | `ALTER TABLE ADD COLUMN IF NOT EXISTS` + index + backfill from `visitor_sessions` | — | migration test |
| M | `backend/src/services/visitorTrackingService.ts` | `resolveIdentity()` backfills `page_events.lead_id` | above | extend existing test |
| C | `backend/src/services/explorerIdentityBridge.ts` | resolve+persist `enrollment ↔ lead`; nightly repair; `pickBestEnrollment` dedupe | — | `__tests__/services/explorerIdentityBridge.test.ts` |
| M | `backend/src/controllers/mandrillWebhookController.ts` | **set `Lead.status='bounced'` on hard bounce** (fixes D2) | — | `__tests__/controllers/mandrillBounce.test.ts` |
| C | `backend/src/config/explorerGrowthFlags.ts` | typed flag accessors (§34) | — | flag test |

### EPIC 2 — Signal engine

| | Path | Responsibility | Tests |
|---|---|---|---|
| C | `backend/src/services/explorerGrowth/explorerSignalDefinitions.ts` | the weight/decay/cap constant table (§6) | table integrity test |
| C | `backend/src/services/explorerGrowth/explorerSignalReader.ts` | unified read across learner + web sources | reader test w/ mocked models |
| C | `backend/src/services/explorerGrowth/explorerSignalWriter.ts` | **first writer** for `student_navigation_events` | idempotency test |
| M | `backend/src/routes/portalRoutes.ts` | portal activity ingest → signal writer | route test |
| M | `frontend/src/pages/EnrollPage.tsx` | emit `form_start` (**closes an I-score T3 gap**) | — |
| M | frontend checkout path | emit payment attempt/failure (**closes an F-score gap**) | — |

### EPIC 3 — Journey intelligence

| | Path | Responsibility | Tests |
|---|---|---|---|
| C | `.../explorerScoringService.ts` | E/I/F from signals + decay | **the largest test file** — per-band, decay, caps |
| C | `.../explorerAffinityService.ts` | declared + observed blend | affinity test |
| C | `.../explorerContactabilityService.ts` | per-channel eligibility, fail-closed | contactability test |
| C | `.../explorerStateMachine.ts` | pure `(profile, signals) → {state, overlays}` | **exhaustive transition test** |
| C | `.../explorerProfileService.ts` | orchestrate recompute; write T1 + T3 | idempotency test |
| M | `backend/src/services/schedulerService.ts` | register `ExplorerProfileRecompute` cron | — |
| M | `backend/src/services/agentRegistrySeed.ts` | register agent names for pause/enable | — |

### EPIC 4 — Journey Governor

| | Path | Responsibility | Tests |
|---|---|---|---|
| C | `.../explorerCandidateGenerators.ts` | ~20 pure candidate rules | one test per rule |
| C | `.../explorerContactPolicyService.ts` | caps, gaps, quiet hours, channel limits | **cap + collision tests** |
| C | `.../explorerJourneyGovernor.ts` | the 7-step pipeline (§4.4) | **collision, priority, WAIT, idempotency** |
| C | `.../explorerAiRanker.ts` | flag-gated intra-tier reorder; validates output ⊆ input | AI-failure fallback test |
| C | `.../explorerDecisionAuditService.ts` | write T2 in every mode | audit-completeness test |
| C | `.../explorerActionExecutor.ts` | **the only place that calls `enrollLeadInSequence`** | execution-gate test |
| M | `backend/src/services/schedulerService.ts` | register `ExplorerJourneyGovernor` cron | — |

### EPIC 5 — Content registry

| | Path | Responsibility | Tests |
|---|---|---|---|
| C | `.../explorerContentSyncService.ts` | project real sources into T5 | sync idempotency |
| C | `.../explorerContentSelector.ts` | ranked selection; **empty ⇒ cancel** | expiry + empty-set tests |
| C | `.../explorerContextService.ts` | build `ExplorerContext` for the prompt | resolution test |
| C | `.../explorerTemplateRenderer.ts` | strict renderer, **throws on unresolved token** | unresolved-token test |
| M | `backend/src/services/contextGraphService.ts` | merge `explorer` key into `CompositeContext` | extend existing |
| M | `backend/src/services/aiMessageService.ts` | Explorer prompt block + fact constraint | prompt test |
| M | `backend/src/services/messageValidatorService.ts` | reject dates/prices absent from context | **validator test** |
| C | `backend/src/seeds/explorerGrowth/seedExplorerContentAssets.ts` | native rows (case studies, tools) | seed idempotency |
| C | `scripts/lint-explorer-copy.js` | CI guard against hardcoded dates/prices | self-test |
| M | `.github/workflows/ci.yml` | add the lint to the `guards` job | — |

### EPIC 6 — Explorer campaign library

| | Path | Responsibility | Tests |
|---|---|---|---|
| C | `backend/src/seeds/explorerGrowth/explorerCampaignDefinitions.ts` | 8 campaign definitions (data only) | — |
| C | `backend/src/seeds/explorerGrowth/explorerSequenceDefinitions.ts` | sequence steps (data only) | `validateSequenceSteps` passes |
| C | `backend/src/seeds/explorerGrowth/seedExplorerGrowthCampaigns.ts` | **idempotent seed; NEVER writes `status` on update** | **seed idempotency + status-preservation test** |
| M | `backend/src/seeds/seedAllCampaigns.ts` | add one delegated call in its own try/catch | — |

### EPIC 7 — Event / learning / community integration

| | Path | Responsibility | Tests |
|---|---|---|---|
| C | `.../explorerEventStateService.ts` | derive event overlays incl. no-show | no-show derivation test |
| C | `.../explorerLearningRecommender.ts` | wrap CAPE ranker + entitlement filter | **locked-lesson test** |
| C | `.../explorerCommunityService.ts` | community state + room recommendation | — |

### EPIC 8 — Ali outreach

| | Path | Responsibility | Tests |
|---|---|---|---|
| C | `backend/src/seeds/explorerGrowth/seedAliExplorerSequence.ts` | `Ali Outreach — Explorer` sequence on the existing campaign | seed test |
| C | `.../explorerAliOutreachService.ts` | strict eligibility + shared daily cap | **eligibility + cap tests** |
| C | `.../explorerReplyClassifier.ts` | classify; **deterministic OPT_OUT override** | classifier test |
| M | `backend/src/controllers/mandrillWebhookController.ts` | route Explorer replies to the classifier, **not** the bypassing auto-reply | reply-routing test |

### EPIC 9 / 10 — SMS / Voice (flagged off)

| | Path | Responsibility | Tests |
|---|---|---|---|
| C | `.../explorerSmsEligibility.ts` | GHL contact + consent + ramp gate | eligibility test |
| C | `.../explorerVoiceEligibility.ts` | the full §16.2 gate | **fail-closed test per condition** |
| C | `.../explorerVoiceReconciliationService.ts` | **fixes D5** — 2h timeout sweep | **timeout test** |
| C | `.../explorerTimezoneService.ts` | derive learner tz; **refuse when unknown** | unknown-tz test |
| M | `backend/src/services/schedulerService.ts` | register reconciliation cron | — |

### EPIC 11 — Command Center

| | Path | Responsibility | Tests |
|---|---|---|---|
| C | `backend/src/routes/admin/explorerGrowthRoutes.ts` | §27, path-scoped `requireAdmin` | **401 → 200 → 400 → 404 per route** |
| C | `backend/src/schemas/explorerGrowthSchema.ts` | Zod contracts | schema tests |
| C | `backend/src/controllers/explorerGrowthController.ts` | thin handlers | controller tests |
| C | `frontend/src/services/explorerGrowthApi.ts` | typed axios client | — |
| C | `frontend/src/pages/admin/ExplorerGrowthPage.tsx` | shell page + tabs + trust signal | `renderToStaticMarkup` smoke |
| C | `frontend/src/components/explorerGrowth/*` | `OverviewTab`, `JourneyTab`, `DecisionsTab`, `ShadowTab`, `ContentTab`, `ForecastTab`, `ExperimentsTab`, `SettingsTab`, `DecisionWhyModal`, `LearnerDrawer`, `SignalTimeline` | pure-component smoke tests |
| M | `frontend/src/routes/adminRoutes.tsx` | add route | — |
| M | `frontend/src/components/Layout/adminNav.ts` | nav entry, `section:'campaigns'` | `adminNavRbac.test.ts` |

### EPIC 12 — Forecast & experiments

| | Path | Responsibility | Tests |
|---|---|---|---|
| C | `.../explorerForecastService.ts` | observed vs projected, Wilson intervals, "insufficient data" | **forecast math tests** |
| C | `.../explorerExperimentService.ts` | stable hash assignment, lift | **stability + lift tests** |
| C | `.../explorerOutcomeAttributionService.ts` | close the loop onto decisions | attribution test |

### EPIC 13 — Hardening & rollout

| | Path | Responsibility |
|---|---|---|
| C | `.../explorerGrowthHealthService.ts` | staleness, decision volume, suppression-rate anomalies |
| C | `tests/systemV2/explorerGrowthCommandCenter.e2e.js` | raw-Playwright, matching the existing two scripts |
| C | `docs/EXPLORER_GROWTH_OS_RUNBOOK.md` | operations + rollback |
| C | `directives/explorer-growth-os.md` | the SOP |
| M | `PROGRESS.md` | one entry per task, session-tagged |

---

## 29. MIGRATION PLAN

**No Sequelize migrations — this repo does not run them.** Schema is created by `ensure*Schema()` functions at boot, and production does **not** run `sequelize.sync` (`server.ts:2607`, `DB_BOOT_SYNC` off).

| Order | Change | Method | Rollback |
|---|---|---|---|
| M1 | 5 new tables + indexes | `ensureExplorerGrowthSchema.ts`, `CREATE ... IF NOT EXISTS`, each statement in its own try/catch | `DROP TABLE` — zero dependants |
| M2 | `page_events.lead_id` (**D1**) | `ALTER TABLE ADD COLUMN IF NOT EXISTS` + index | drop column; nullable and additive, so safe |
| M3 | backfill `page_events.lead_id` from `visitor_sessions.lead_id` | batched `UPDATE ... WHERE lead_id IS NULL LIMIT 5000`, resumable | idempotent; re-runnable |
| M4 | backfill `explorer_journey_profiles` for 154 Explorers | idempotent upsert script | truncate and re-run |
| M5 | seed content registry | idempotent seed | re-run |
| M6 | seed 8 campaigns + sequences, `status='draft'` | idempotent seed | set campaigns `status='draft'`; delete rows if never activated |

**Ordering constraint:** M2 and M3 must land and be verified **before** any Governor decision runs, because intent scoring depends on joinable page events.

**Backfill safety.** Production runs a shared Postgres that has previously OOM'd under concurrent load (known incident). M3 is batched at 5,000 rows with a pause between batches, run off-hours, and is fully resumable. `page_events` is cleaned to 90 days by an existing cron, bounding the volume.

**Rollback of the whole system:** set `EXPLORER_GROWTH_OS_ENABLED=false`. Every table becomes inert; no other subsystem reads them. The only cross-cutting change is `page_events.lead_id` (additive, and a genuine bug fix) and the bounce writer, which is reverted independently.

---

## 30. SEED PLAN

Follows the repo's idempotent philosophy exactly, including its asymmetry.

**The rule (from `seedAllCampaigns.ts:214-221`):**
> On the **update** path write **only** `sequence_id`. `status`, `settings`, `ai_system_prompt`, `channel_config`, `targeting_criteria` are written **only at CREATE time**, so an operator's manual pause survives every restart.

**The asymmetry to preserve (from `seedAliOutreachCampaign.ts:155-181`):** sequence **steps** and `ai_system_prompt` **are** force-synced on every boot (code owns copy); campaign **status** is never rewritten (the operator owns on/off).

```
backend/src/seeds/explorerGrowth/
├── explorerCampaignDefinitions.ts     ~180 lines — 8 campaign definitions, data only
├── explorerSequenceDefinitions.ts     ~280 lines — step arrays, data only
├── seedExplorerGrowthCampaigns.ts     ~140 lines — the idempotent upsert logic
├── seedExplorerContentAssets.ts       ~120 lines — native registry rows
└── seedAliExplorerSequence.ts          ~90 lines — Ali Explorer sequence only
```

No file exceeds the 300-line soft target; no 1,500-line seed.

Integration into `seedAllCampaigns.ts` — one delegated call in its own try/catch, matching the existing eight:

```ts
try {
  await seedExplorerGrowthCampaigns(createdBy);
} catch (err: any) {
  console.warn('[Seed] Explorer Growth campaign seed skipped:', err?.message);
}
```

**Ship-safe defaults for every new campaign:** `status: 'draft'` · `approval_status: 'draft'` · `campaign_mode: 'standard'` · `settings.test_mode_enabled: true` · `settings.sender_email/sender_name` set · `channel_config: { email:{enabled:true, daily_limit:25}, sms:{enabled:false}, voice:{enabled:false} }`.

**Nothing can send on boot.** Four independent reasons: campaigns are `draft` so `evaluateSend` step 2 blocks; test mode redirects; the Governor's mode is `off`; and no learner is enrolled until a decision executes.

**Seed order matters** — sequences before campaigns (the upsert skips a campaign whose sequence is missing rather than orphaning it), and content assets before campaigns (so slot resolution can be verified at seed time).

---

## 31. TEST PLAN

Target distribution matches CLAUDE.md's pyramid: ~70% unit, ~20% integration, ~10% E2E. Backend jest, colocated `__tests__/*.test.ts`, `isolatedModules: true`, mock the `models` barrel (never `sequelize`), real JWTs signed with `env.jwtSecret`.

### 31.1 Unit coverage (required, per the brief)

| Area | File | Key cases |
|---|---|---|
| E scoring | `explorerScoringService.test.ts` | per-band caps; 0 signals ⇒ 0; all signals ⇒ ≤100; band independence |
| I scoring | same | **tier gating: 20 T1 views never reach HIGH_INTENT**; T3 does |
| F scoring | same | single ≥25 signal sets FRICTION; unresolved friction does not decay |
| Decay | `explorerDecay.test.ts` | `2^(-d/h)` exactness; 0d ⇒ 1.0; boundary days |
| Affinity | `explorerAffinityService.test.ts` | declared/observed blend; confidence ceiling; **no permanent lock-in** |
| Journey transitions | `explorerStateMachine.test.ts` | every documented entry/exit; monotonicity of learning states; overlay independence |
| Contact eligibility | `explorerContactabilityService.test.ts` | each channel; **fail-closed on error** |
| Frequency caps | `explorerContactPolicyService.test.ts` | daily/weekly/channel; min gap |
| Suppression | `explorerJourneyGovernor.test.ts` | every suppression reason recorded |
| NBA ranking | same | tier ordering; intra-tier score; deterministic tie-break |
| Content eligibility | `explorerContentSelector.test.ts` | expired excluded; channel filter; **empty ⇒ cancel** |
| Runtime variables | `explorerTemplateRenderer.test.ts` | **unresolved token throws, never leaks** |
| Duplicate prevention | `explorerJourneyGovernor.test.ts` | UNIQUE `(enrollment_id, decision_date)` |
| Campaign collision | same | §9.6 worked example exactly |
| Converted suppression | same | all acquisition stops |
| Friction priority | same | tier 2 beats tier 5 |
| Event priority | same | tier 4 beats tier 5 |
| Ali qualification | `explorerAliOutreachService.test.ts` | full gate; 45-day cooldown; shared cap |
| Voice qualification | `explorerVoiceEligibility.test.ts` | **one test per gate, each failing closed** |
| Holdout assignment | `explorerExperimentService.test.ts` | stability across runs; distribution |
| Forecast | `explorerForecastService.test.ts` | observed ≠ projected; **"insufficient data" below n=30** |
| Seed idempotency | `seedExplorerGrowthCampaigns.test.ts` | **second run does not change `status`** |

### 31.2 The 17 critical scenarios (from the brief) — all become named tests

| # | Scenario | Expected | Test |
|---|---|---|---|
| 1 | Inactive Explorer | learning re-entry, **not** aggressive enrollment | `T-SCEN-01` |
| 2 | High E, low I | learning/depth; **no voice call** | `T-SCEN-02` |
| 3 | Moderate E, very high I | **may qualify for Ali ahead of a higher-E learner** | `T-SCEN-03` |
| 4 | High I + payment friction | recovery outranks selling | `T-SCEN-04` |
| 5 | Registered for Open House | preparation outranks generic invitation | `T-SCEN-05` |
| 6 | Attended event | attendee follow-up **replaces** no-show logic | `T-SCEN-06` |
| 7 | Enrolls / becomes paid | **all** Explorer acquisition stops immediately | `T-SCEN-07` |
| 8 | SMS opt-out | SMS never sends; email eligibility evaluated separately | `T-SCEN-08` |
| 9 | DNC | voice never sends | `T-SCEN-09` |
| 10 | Two campaigns qualify | only the Governor's winner executes | `T-SCEN-10` |
| 11 | Worker runs twice | **no duplicate communication** (unique constraint) | `T-SCEN-11` |
| 12 | Expired event in registry | cannot be selected | `T-SCEN-12` |
| 13 | **No upcoming cohort** | **AI does not fabricate one — action cancelled** | `T-SCEN-13` |
| 14 | Cohort date changes after queueing | send-time content uses current authoritative data | `T-SCEN-14` |
| 15 | Voice webhook never arrives | reconciliation prevents permanent pending | `T-SCEN-15` |
| 16 | AI generation fails | existing fallback behaves safely | `T-SCEN-16` |
| 17 | Shadow mode | decisions computed, **zero external communications dispatched** | `T-SCEN-17` |

**Scenario 8 note.** Today `processOptOut` suppresses *globally* regardless of channel (defect D3). So as the code stands, an SMS STOP **does** kill email. `T-SCEN-08` is written to assert the **desired** behaviour and will fail until D3 is fixed — this is deliberate, and D3 is listed in §35 as a governance decision because per-channel suppression is a compliance posture change, not a refactor.

**Scenario 14 note.** Content is re-resolved at send time, so a changed cohort date propagates. But a cohort that *closes* between queueing and sending must cancel rather than send stale facts — asserted explicitly.

### 31.3 Integration, E2E, shadow, smoke

- **Integration** (dev sandbox DB, opt-in flag, never production): full recompute → decide → audit over seeded fixtures; seed idempotency across two boots; content sync against real tables.
- **E2E** — `tests/systemV2/explorerGrowthCommandCenter.e2e.js`, raw Playwright matching the two existing scripts (no `@playwright/test`, no config file — `tests/CLAUDE.md` documents a harness that **does not exist**). Auth by `addInitScript` localStorage token injection. Covers: page loads with KPIs; journey/high-intent/friction filters; decision "Why?" drilldown; shadow tab; pause/resume; kill switch; cohort forecast; signal timeline; suppression reasoning. All selectors `data-testid`.
- **Shadow validation** (the real acceptance gate for Stage 1): run over all 154 Explorers for 7 consecutive days; assert zero rows in `communication_logs` attributable to Explorer campaigns; manually review 20 decisions for sensibility; confirm distribution matches operator intuition.
- **Production smoke** after each stage: `/api/admin/explorer-growth/summary` returns 200 with a fresh `scores_computed_at`; decisions written today > 0; sends attributable to Explorer campaigns == expected for the stage.

---

## 32. OBSERVABILITY

Follows CLAUDE.md's Observability Framework — structured JSON to stdout, `event`, `service`, `correlation_id`, `outcome`, `duration_ms`, `error_class`.

**Correlation.** A `decision_id` (UUID) is minted per decision and propagated into the `ScheduledEmail.metadata`, the communication log, and every downstream log line — so "why did this person get this?" is answerable from a single id, end to end. This is the correlation-ID requirement made concrete for this subsystem.

**Events:** `explorer.profile.recomputed`, `explorer.state.transitioned`, `explorer.decision.made`, `explorer.decision.suppressed`, `explorer.action.executed`, `explorer.content.unresolved`, `explorer.contact.blocked`, `explorer.voice.reconciled`, `explorer.experiment.assigned`.

**Metrics per run:** profiles recomputed, recompute p50/p95/p99, decisions made, action-type distribution, suppression-reason distribution, WAIT ratio, executions, content-resolution failure rate, stale-profile count.

**Health checks** (`explorerGrowthHealthService`, surfaced in the Overview tab and the existing agent registry):

| Check | Threshold | Action |
|---|---|---|
| Stale profiles | >10% older than 26h | warn; Governor already refuses stale |
| Decision volume anomaly | ±50% vs 7-day mean | warn |
| Suppression rate | >90% of decisions | warn — likely a policy bug |
| Content resolution failures | >5% | warn — registry drift |
| Zero decisions in 24h | any | **error** |
| Executions while mode ∈ {observe, shadow} | **any** | **critical — auto-pause** |

That last one is the safety net that makes shadow mode trustworthy: if anything ever sends while the system claims not to be sending, it halts itself.

**Reuse:** `instrumentCronJob` wraps every Explorer cron, so all jobs appear in `ai_agent_activity_logs` and inherit the per-agent pause switch from Admin → Agents with no redeploy. Registered in `agentRegistrySeed.ts`.

---

## 33. ROLLOUT

| Stage | What runs | Gate to advance |
|---|---|---|
| **0. Architecture & data** | Tables, models, bridge, D1/D2 fixes, signal writer. Nothing decides. | `tsc` clean both stacks; jest green; backfill verified; **`buildCompositeContext` confirmed working in prod for the first time** |
| **1. Shadow (OBSERVE)** | Full recompute + decisions for all 154. **Zero sends.** Admin inspects. | 7 days; zero attributable sends; 20 decisions manually reviewed; distribution sensible |
| **2. Test accounts** | Execution enabled for an allowlist of `@colaberry-test.local` accounts only | end-to-end verified on test accounts; test-domain guard proven |
| **3. Email pilot** | C2 (Activation Rescue) only, ~25 real Explorers, email only, 10% holdout | 14 days; unsubscribe <1%; bounce <3%; no complaints; activation lift measurable or explicitly "insufficient data" |
| **4. Learning + events** | C3, C4, C5, C8 + event integration | 14 days healthy; engagement metrics stable or improving |
| **5. Commercial + Ali** | C6, C7, experience 24 behind `EXPLORER_ALI_OUTREACH_ENABLED` | Ali reviews 10 generated messages **before** enabling; reply triage working |
| **6. SMS** | **Blocked** on §35 D-1, D-3, D-4 | consent capture live; STOP unified; timezone available; GHL contacts provisioned |
| **7. Voice** | **Blocked** on §35 D-1, D-2, D-3 | consent enforcement `'enforce'`; reconciliation shipped; timezone available; counsel sign-off |
| **8. Optimization** | `EXPLORER_AI_RANKING_ENABLED` | ≥90 days of outcome data; AI ranking beats deterministic in holdout |
| **9. Full autonomous** | All approved channels, full population | all prior gates green; 90 days stable |

**Each stage is independently reversible by a single flag.** No stage advances on schedule; each advances on evidence.

---

## 34. FEATURE FLAGS

Following the repo's dual convention: **env vars in `config/env.ts`** for capability (needs a restart, safe default OFF) and **DB `system_settings`** for operational state (instant, no restart).

### Env (`backend/src/config/env.ts`, `=== 'true'` ⇒ default OFF)

| Flag | Controls |
|---|---|
| `EXPLORER_GROWTH_OS_ENABLED` | master; off ⇒ no cron, no decisions, no reads |
| `EXPLORER_SIGNAL_INGEST_ENABLED` | signal writer (safe to enable first, alone) |
| `EXPLORER_JOURNEY_GOVERNOR_ENABLED` | decision engine |
| `EXPLORER_COMMERCIAL_ENABLED` | C6, C7, subscription messaging |
| `EXPLORER_ALI_OUTREACH_ENABLED` | experience 24 |
| `EXPLORER_SMS_ENABLED` | SMS — **independent of voice, as asked** |
| `EXPLORER_AUTO_DIAL_ENABLED` | voice — **required by the brief, default false** |
| `EXPLORER_IN_APP_NUDGE_ENABLED` | in-app |
| `EXPLORER_AI_RANKING_ENABLED` | AI intra-tier reordering |

### DB settings (`system_settings`, live-tunable)

| Key | Default | Purpose |
|---|---|---|
| `explorer_growth_mode` | `'off'` | `off\|observe\|shadow\|test_users\|pilot\|limited\|full` |
| `explorer_growth_paused` | `false` | Explorer-specific kill switch |
| `explorer_pilot_enrollment_ids` | `[]` | Stage 2/3 allowlist |
| `explorer_max_emails_per_week` | `2` | per-learner cap |
| `explorer_min_hours_between_sends` | `48` | minimum gap |
| `explorer_ali_daily_cap` | `10` | **shared with the existing Ali campaign** |
| `explorer_holdout_pct` | `10` | default control share |
| `explorer_ruleset_version` | `'1.0.0'` | stamped on every decision |

**Interaction with existing switches** (all respected, none bypassed): `system_kill_switch` halts everything; `scheduler_paused` stops the queue; `consent_enforcement` governs the consent gate; per-agent pause in `ai_agents` stops any individual Explorer cron.

---

## 35. RISKS / GOVERNANCE DECISIONS

### 35.1 ALI DECISIONS REQUIRED

Everything else in this plan proceeds without you. These change strategy, legal posture, or cost.

| # | Decision | Context | Recommendation |
|---|---|---|---|
| **D-1** | **Consent enforcement: stay `'shadow'` or move to `'enforce'`?** | `consent_enforcement` defaults to `'shadow'` — the gate computes verdicts and blocks nothing. §7 of `docs/ai-governance/consent-capture-design.md` has been awaiting your sign-off since 2026-06-22. **Voice and SMS cannot ship without this.** | Move voice+SMS to `'enforce'` (fail-closed); leave US B2B email on opt-out per CAN-SPAM. This blocks Stages 6-7 and nothing else. |
| **D-2** | **Automated voice to free learners at all?** | TCPA requires prior express written consent for AI voice. We capture none, and there is no consent UI. Penalties $500-$1,500/call. | **Do not enable voice for Explorers in this project.** Build the eligibility gate (fail-closed, so it correctly permits zero people today), ship it disabled, and revisit after consent capture exists. |
| **D-3** | **Per-learner timezone — collect or infer?** | No per-lead timezone exists; call/send windows use the *campaign's* timezone. Required for lawful voice/SMS timing. | Infer from `visitors.country`/`city` and area code; **refuse to dial when unknown**. Add an explicit field at signup later. |
| **D-4** | **Per-channel suppression?** (defect D3) | `processOptOut` accepts a channel then suppresses globally. An SMS STOP kills email. Fixing it means some people who are currently fully suppressed become email-eligible again. | Fix it — but **only for opt-outs recorded after the change**. Never retroactively un-suppress anyone. |
| **D-5** | **`sendTrainingWelcome` omits `List-Unsubscribe`.** | The Explorer welcome email deliberately ships without the unsubscribe header. Defensible as transactional; risky as the first message of a nurture programme. | Add the header. It costs nothing and removes ambiguity. |
| **D-6** | **Cohorts have no `application_deadline` column.** | Experience 27 (Cohort Decision) needs a legitimate deadline. Without one, any urgency language would be fabricated. | Add the column, or accept that experience 27 ships **without urgency framing**. Do not manufacture scarcity. |
| **D-7** | **Which case studies are real and consented?** | `CaseStudiesPage.tsx` says its content is *"realistic, specific placeholders pending client consent."* | Supply consented case studies, or experience 19/23 uses testimonials only. **Placeholders will not be cited as proof.** |
| **D-8** | **Build internships, or defer?** | Nothing exists — no table, route, or application flow. Experience 22 and campaign #16 are blocked. | Defer. Scope separately. Track `INTERNSHIP_READY` now so the audience is measurable when you decide. |
| **D-9** | **Is 125 an Explorer-only target?** | 154 Explorers cannot produce 125 paid students. | Treat 125 as multi-source; hold Explorer Growth OS accountable for **stage-conversion lift**, measured against holdouts, not for the absolute number. |
| **D-10** | **Continuous decay instead of your step decay?** | Your 1.00/0.85/0.65/0.40 steps vs `2^(-d/14)`. Steps create score cliffs that pollute trend and holdout analysis. | Use continuous; it is the house pattern (`intentScoringService`) and closely reproduces your curve. One-constant change if you disagree. |
| **D-11** | **AI cost.** | ~154 learners × ~2 sends/week ≈ 1,300 generations/month at Stage 4, `gpt-4o-mini`. Small today; scales linearly with the pool. | Proceed; revisit if the pool exceeds ~2,000. |
| **D-12** | **Fix the 9 pre-existing defects (§3.2) inside this project or separately?** | D1 and D2 are prerequisites and are already scoped into EPIC 1. D3-D9 are not. | Fix D1+D2 here. Track D3-D9 as separate work so this project's scope stays honest. |

### 35.2 Implementation decisions taken autonomously (logged, not escalated)

Per CLAUDE.md's Autonomy Model these are reversible, locally-scoped, and test-covered: reusing `student_navigation_events` rather than a new signal table; 5 new tables rather than the 10 suggested; 8 campaign rows rather than 18; extending the Ali campaign with a sequence rather than cloning it; resolving runtime variables through composite context rather than extending the token substituter; deriving event no-show rather than adding a table; deriving journey-state history from snapshots + decisions; `section: 'campaigns'` for RBAC.

### 35.3 Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Shadow mode leaks a real send | Low | **Critical** | 4 independent blocks; health check auto-pauses on any execution in observe/shadow; 7-day zero-send assertion |
| Governor over-suppresses; nobody hears anything | Medium | Medium | Suppression-rate health check; WAIT ratio on the dashboard; every suppression carries a reason |
| Backfill destabilises shared Postgres | Low | High | Batched 5k, off-hours, resumable; 90-day retention bounds volume |
| AI states a fact not in context | Medium | **High** | Copy lint in CI + prompt constraint + validator rejection; unresolved slot cancels the send |
| Email reputation damage | Low | High | Existing governance thresholds; ramp; 25-learner pilot; unsubscribe <1% gate |
| Identity bridge breaks for new signups | Medium | High | Nightly repair job; health check on unbridged Explorers (currently 0/154) |
| Explorer pool too small to measure anything | **High** | Medium | Honest "insufficient data"; §24 refuses to fabricate rates |
| Scope creep into the 9 defects | Medium | Medium | D-12 fixes the boundary explicitly |

---

## 36. ACCEPTANCE CRITERIA

The project is done when **all** of the following are objectively true:

**Functional**
1. Every active Explorer has a profile refreshed within 26 hours, with E/I/F scores and a journey state.
2. Every Explorer receives at most one governed decision per day, enforced by a unique constraint.
3. Every decision — including WAIT — has an audit row naming candidates, suppressions with reasons, the winner, and the reason.
4. The "Why did this learner receive this?" question is answerable in the admin UI for any learner, any day.
5. No Explorer message contains a date, price, seat count, or deadline not resolved at send time from an authoritative source.
6. When a required content asset is unavailable, the action is cancelled — never sent degraded.
7. A converted learner receives zero further acquisition messages, verified by test.
8. Shadow mode produces complete decisions and **zero** external communications, verified over 7 consecutive days.
9. The 8 campaigns seed idempotently; a second boot does not alter operator-set status.
10. All 17 critical scenarios pass as named tests.

**Quality**
11. `npx tsc --noEmit` clean in both `backend/` and `frontend/`.
12. `cd backend && npm test` green, including every new suite.
13. Every new service file ≤300 lines; every function ≤50 lines (CLAUDE.md soft targets).
14. Every new admin route has 401 / 200 / 400 / 404 coverage and passes `lint-route-auth.js`.
15. No `any` without a written justification comment; no secrets; no hardcoded URLs.
16. Playwright E2E covers the Command Center's core surfaces.

**Operational**
17. Every Explorer cron is registered in `agentRegistrySeed.ts` and pausable from Admin → Agents without a redeploy.
18. Health checks are live, including the auto-pause on any execution during observe/shadow.
19. `EXPLORER_GROWTH_OS_ENABLED=false` fully disables the system with no side effects.
20. Runbook and directive exist; rollback is documented and tested.

**Governance**
21. Every task has a `PROGRESS.md` entry tagged `CC-20260812-k4m9` with verification evidence.
22. §35.1 decisions are recorded with Ali's answers before the stages they gate.
23. Voice and SMS remain disabled unless D-1/D-2/D-3 are explicitly resolved.
24. `BuildManifest` telemetry emitted per the Telemetry Synchronization Contract.

**Business (measured, not asserted)**
25. Baseline captured before Stage 3: activation 12.3%, completion 8.4%.
26. Post-pilot, activation lift is reported **with a holdout comparison** — or honestly reported as "insufficient data".
27. The forecast view visually separates observed facts from projections and never displays a fabricated benchmark.

---

## 37. RECOMMENDED IMPLEMENTATION ORDER

Thirteen EPICs. Each is independently shippable, leaves the system working, and is gated by its own Definition of Done. `loop-architect` executes them one task at a time with an independent verifier per task.

### EPIC 1 — Foundation & prerequisite fixes
**Objective:** durable schema, the identity bridge, and the two defects that block everything else.
**Tasks:** `ensureExplorerGrowthSchema` (5 tables) · 5 Sequelize models + associations · **fix D1** (`page_events.lead_id` + backfill + `resolveIdentity` write) · **fix D2** (bounce writer) · `explorerIdentityBridge` · typed flag accessors.
**Files:** EPIC 1 block of §28. **Dependencies:** none.
**DoD:** tables exist in dev and prod; `tsc` clean; bridge resolves 154/154; **`buildCompositeContext()` returns a real object in production for the first time**; bounce sets `Lead.status`; jest green; `PROGRESS.md` entry.

### EPIC 2 — Signal engine
**Objective:** learner behaviour becomes queryable.
**Tasks:** signal definition table · unified reader · **first writer for `student_navigation_events`** · portal ingest route · enrollment-form-start instrumentation · payment-attempt instrumentation.
**Dependencies:** EPIC 1. **DoD:** signals written idempotently for real activity; reader returns weighted, decayed signals; new instrumentation verified in dev; unit tests green.

### EPIC 3 — Journey intelligence
**Objective:** every Explorer has scores, affinities, and a state.
**Tasks:** E/I/F scoring · affinity · contactability · state machine · profile orchestrator · recompute cron + agent registration.
**Dependencies:** EPIC 2. **DoD:** all 154 profiles computed within 26h; recompute is idempotent (running twice yields identical scores); exhaustive transition tests green; distribution reviewed and sensible.

### EPIC 4 — Journey Governor
**Objective:** one governed, audited decision per learner per day.
**Tasks:** candidate generators · contact policy · the 7-step pipeline · AI ranker (flagged off) · decision audit · action executor · governor cron.
**Dependencies:** EPIC 3. **DoD:** decisions written for all Explorers in `observe` mode; **zero executions**; unique constraint proven by running the cron twice; §9.6 collision test green; all suppressions carry reasons.

### EPIC 5 — Content registry
**Objective:** AI can select real assets and can never invent one.
**Tasks:** sync service · selector · Explorer context · strict renderer · composite-context merge · prompt block · validator rule · native asset seed · **CI copy lint**.
**Dependencies:** EPIC 1. **DoD:** registry populated from real sources; expired assets unselectable; unresolved token throws; CI lint fails on a planted hardcoded date; `T-SCEN-12` and `T-SCEN-13` green.

### EPIC 6 — Explorer campaign library
**Objective:** 8 campaigns exist, seeded idempotently, sending nothing.
**Tasks:** campaign definitions · sequence definitions · idempotent seed · wire into `seedAllCampaigns`.
**Dependencies:** EPICs 4, 5. **DoD:** campaigns seed as `draft` + test mode; **second boot does not change status**; `validateSequenceSteps` passes for every sequence; nothing enqueued.

### EPIC 7 — Event / learning / community integration
**Objective:** the three richest behavioural domains feed the Governor.
**Tasks:** event state (incl. derived no-show) · learning recommender wrapping CAPE **with the entitlement filter** · community state.
**Dependencies:** EPIC 4. **DoD:** event overlays correct against real data; **no locked lesson is ever recommended**; `T-SCEN-05`, `T-SCEN-06` green.

### EPIC 8 — Ali outreach
**Objective:** genuine personal outreach at high intent, tightly capped.
**Tasks:** Explorer sequence on the existing Ali campaign · eligibility service · reply classifier · reply routing away from the bypassing auto-reply path.
**Dependencies:** EPICs 4, 5. **DoD:** eligibility gate proven; shared 10/day cap enforced across leads and Explorers; `OPT_OUT` handled deterministically; **Ali reviews 10 generated messages before the flag is enabled**.

### EPIC 9 — SMS *(build, ship disabled)*
**Objective:** eligibility exists; nothing sends. **Dependencies:** EPIC 4.
**DoD:** gate correctly permits **zero** learners under current consent data; flag off; documented blockers (D-1, D-3, D-4).

### EPIC 10 — Voice *(build, ship disabled)*
**Objective:** eligibility, timezone, and **reconciliation (D5)**. **Dependencies:** EPIC 4.
**DoD:** every gate fails closed with its own test; reconciliation clears a simulated lost webhook within 2h; `refuse when timezone unknown` proven; `EXPLORER_AUTO_DIAL_ENABLED=false`; `T-SCEN-15` green.

### EPIC 11 — Command Center
**Objective:** the operator can see and control everything.
**Tasks:** routes + Zod schemas + controller · typed API client · page + 8 tabs + Why-modal + learner drawer + signal timeline · route + nav registration.
**Dependencies:** EPICs 3, 4. **DoD:** page renders with live data; **the "Why?" drilldown answers the question for any learner**; mode switch and kill switch work; 401/200/400/404 per route; `lint-route-auth` passes; `data-testid` everywhere; frontend `tsc` clean.

### EPIC 12 — Forecast & experiments
**Objective:** measure lift honestly. **Dependencies:** EPICs 4, 11.
**DoD:** forecast separates observed from projected and shows "insufficient data" below n=30; holdout assignment stable across runs; outcomes attributed back to `decision_id`.

### EPIC 13 — Hardening & rollout
**Objective:** operate it safely. **Dependencies:** all.
**Tasks:** health service (incl. **auto-pause on any send during observe/shadow**) · Playwright E2E · runbook · directive · `PROGRESS.md` audit · `BuildManifest` telemetry · staged flag enablement.
**DoD:** all §36 acceptance criteria met; 7-day shadow run with zero sends; rollback tested; Stage 3 pilot approved.

**Critical path:** 1 → 2 → 3 → 4 → {5, 7} → 6 → 11 → 13. EPICs 8, 9, 10, 12 branch off 4 and can run in parallel with 11.

---

## 38. CRITICAL SUCCESS TEST — six journeys through the architecture

### Person A — signs up, does nothing

| Day | State / overlays | E / I / F | Decision | Why |
|---|---|---|---|---|
| 0 | NEW_EXPLORER | 5/0/0 | **WAIT** | `sendTrainingWelcome` already sent; Governor does not duplicate |
| 1 | NEW_EXPLORER | 5/0/0 | **WAIT** | inside the 48h minimum gap |
| 3 | ACTIVATING (72h auto) | 4/0/0 | **C2 step 0** — one 5-minute lesson | activation rescue, tier 6; no commercial candidate exists at I=0 |
| 6 | ACTIVATING | 4/0/0 | **C2 step 1** — remove the blocker, invite a reply | still no completion |
| 10 | ACTIVATING | 3/0/0 | **C2 step 2** — teach one idea, no ask | value without pressure |
| 17 | ACTIVATING + DORMANT | 2/0/0 | **C2 step 3** — graceful pause, free access confirmed | cadence reduces |
| 31 | ACTIVATING + DORMANT | 1/0/0 | **C4 step 0** — dormant re-entry | monthly, not weekly |
| 60+ | DORMANT | ~0 | **WAIT** | cadence decays to monthly at most |

**Never receives:** any Accelerator, subscription, event-urgency, Ali, or voice contact. I never leaves 0, so tier 5 never generates a candidate. Person A is the guardrail case for §22 (Free Movement) — and the system's honest answer for them is mostly silence.

### Person B — signs up, completes many lessons, ignores paid programs

| Day | State | E / I / F | Decision |
|---|---|---|---|
| 1 | ACTIVATING | 17/0/0 | **WAIT** — interacted, no rescue needed |
| 2 | ACTIVE_LEARNER | 32/0/0 | **C3** — momentum, next lesson by affinity |
| 7 | ACTIVE_LEARNER | 48/0/0 | **Experience 08** — Day-7 checkpoint, learning branch |
| 12 | ENGAGED_LEARNER | 61/0/0 | **C5** — community activation (tier 8; nothing higher qualifies) |
| 14 | ENGAGED_LEARNER | 63/5/0 | **Experience 12** — Day-14, **learning branch** because I<45 |
| 21 | ENGAGED + CONNECTED | 68/8/0 | **Experience 17** — progress report |
| 28+ | CONNECTED_TO_COMMUNITY | ~70/10/0 | **C8 weekly digest** — 1 learn + 1 opportunity + 1 action |
| 45 | + REFERRAL_READY | 72/12/0 | **C7** — invite a friend to learn free |

**Critical:** Person B has E=70 and would trip a naive "E ≥ 70 ⇒ call" rule. They are never called and never hard-sold, because **voice and commercial candidates require I-tier signals, which they have never produced.** This is scenario `T-SCEN-02`, and it is the clearest demonstration that separating E from I was the right call.

### Person C — light learning, repeated cohort/pricing views, starts an application

| Day | State / overlays | E / I / F | Decision | Why |
|---|---|---|---|---|
| 3 | ACTIVATING | 9/11/0 | **C2 step 0** | I=11 is T1-only; activation still wins |
| 6 | ACTIVATING | 9/28/0 | **C2 step 1** | still T1 views only |
| 8 | ACTIVE_LEARNER | 18/46/0 | **C6 step 0** — connect learning to the cohort | CONSIDERING at I≥45; cohort resolved at send |
| 9 | CONSIDERING | 18/58/0 | **WAIT** | 48h minimum gap |
| 11 | CONSIDERING + HIGH_INTENT | 19/72/0 | **C6 step 1** — matched testimonial | CTA click (T2) + booking modal (T2) |
| 13 | **ENROLLMENT_READY** | 19/92/0 | **Experience 24 — Ali outreach** | **form started = T3**; I≥70; F<25; E≥25 ✓ |
| 14 | ENROLLMENT_READY | 19/92/0 | **WAIT** | Ali sent; 45-day cooldown; awaiting reply |
| 16 | + IN_CONVERSATION | — | **CREATE_HUMAN_TASK** | replied `READY_TO_ENROLL` → tier 3, human, no bot reply |

**This is scenario 3 made concrete:** Person C has E=19 — far below Person B's 70 — yet qualifies for Ali outreach, because intent, not engagement, is what commercial actions gate on.

### Person D — tries to enroll, hits a booking/payment error

| Hour | State / overlays | E / I / F | Decision | Why |
|---|---|---|---|---|
| T+0 | ENROLLMENT_READY | 22/88/0 | — | payment fails |
| T+1 | ENROLLMENT_READY + **FRICTION** | 22/88/**40** | **C1 step 0 — friction recovery** | F=40 ⇒ tier 2 outranks the tier-5 Accelerator candidate |
| T+1 | — | — | **SUPPRESSED:** C6, Ali, digest | *"unresolved payment failure — selling into a broken experience damages trust"* |
| T+24 | still FRICTION | 22/88/40 | **C1 step 1** + **human task** | unresolved after 24h escalates to a person |
| T+48 | resolved, F→12 | 22/90/12 | **C6 resumes** | FRICTION exits below 15 |

**Person D is never sold to while broken.** Note this journey is also **excluded from all holdouts** (§25.2) — we never withhold help to measure lift.

### Person E — registers for an Open House, attends, returns to the Accelerator page

| Day | State / overlays | E / I / F | Decision | Why |
|---|---|---|---|---|
| 5 | ACTIVE_LEARNER + EVENT_READY | 31/24/0 | **Experience 14** — event invitation | event resolved from CCPP/PG |
| 6 | + **EVENT_REGISTERED** | 31/44/0 | **WAIT** — event discovery **suppressed immediately** | RSVP = T3, +20 |
| 8 (T-48h) | EVENT_REGISTERED | 31/44/0 | **Experience 15** — preparation | tier 4 |
| 9 (T-3h) | EVENT_REGISTERED | 31/44/0 | **Experience 15** — join reminder | tier 4 beats everything commercial |
| 10 | + **EVENT_ATTENDED** | 33/69/0 | **Experience 16** — attendee follow-up | **no-show logic never evaluated** |
| 11 | CONSIDERING + HIGH_INTENT | 33/**81**/0 | **C6 step 0** | returned to Accelerator page post-attendance |
| 13 | ENROLLMENT_READY | 33/85/0 | **Experience 26** — deep dive | — |
| 16 | ENROLLMENT_READY | 33/87/0 | **Experience 24 — Ali** | attendance (T4) + repeat views |

This is scenarios 5 and 6 in one journey: registration suppresses discovery; attendance replaces no-show.

### Person F — highly active learner, internship interest, heavy community, no Accelerator signal

| Day | State / overlays | E / I / F | Decision | Why |
|---|---|---|---|---|
| 14 | ENGAGED + CONNECTED | 71/6/0 | **C3** — momentum | high E, near-zero I |
| 20 | + **INTERNSHIP_READY** | 76/9/0 | **C8 digest**, community-weighted | affinity `ai_internship` 0.58 + E≥50 |
| 21 | — | — | **SUPPRESSED: Experience 22 (internship)** | **`content_unavailable: no internship asset exists`** |
| 28 | + REFERRAL_READY | 79/9/0 | **C7** — ambassador | E≥60 + community contributions |
| 35 | CONNECTED_TO_COMMUNITY | 80/11/0 | **C8 digest** | — |
| 42 | — | 81/11/0 | **WAIT** | nothing due; caps respected |

**Person F is the test of institutional honesty.** They have the highest engagement of anyone here and an explicit internship affinity — and the system says nothing about internships, because **no internship data exists**. The suppression is recorded as `content_unavailable`, which surfaces on the Content tab as a real, countable gap. That is exactly how a "never invent" rule is supposed to feel: the absence becomes visible and measurable instead of being papered over with plausible copy.

They are also never pushed toward the Accelerator, because I never rises. The system's correct answer for Person F is to keep serving them well — and to tell Ali there is an internship-shaped hole in the product.

---

## Appendix A — Verification log

| Claim | Method | Result |
|---|---|---|
| Studied the current codebase | worktree at `C:/Users/ali_m/explorer-growth-wt` off `origin/main` @ `1bf1a782` | OneDrive tree was 1,922 commits behind; **not used** |
| Kes's Explorer nurture work | content + filename grep across all 823 remote refs | **does not exist** |
| `explorerVoiceLeadIsolation` | filename glob + content grep, whole repo | **does not exist** |
| `page_events.lead_id` | live `information_schema` query on `accelerator_prod` | **absent** — confirms defect D1 |
| Explorer population | live query | 154 active, 154 distinct emails, **151 created in last 30 days** |
| Explorer↔Lead bridge | live query | **154/154 currently resolve by email** |
| Explorer activity | live query | 67 served, 19 interacted, 13 completed, 22 with points, 72 community members |
| Paid students | live query | 61 standard paid |
| CRM scale | live query | 24,238 leads; 285 suppressed; 302 unsubscribe events; 355 consent records |
| Campaigns | live query | 36 total, 8 active |
| No global `sequelize.sync` | `server.ts:2607` | confirmed, `DB_BOOT_SYNC` off by default |
| Seed status-preservation rule | `seedAllCampaigns.ts:214-221` | confirmed with its explanatory comment |
| Cross-campaign 1/day cap | `schedulerService.ts:799-817` | confirmed |
| 6 template tokens only | `sequenceService.ts:457-464`, `:565-572` | confirmed; no shared renderer |
| Consent shadow mode | `settingsService.ts:54`, `consentService.ts:75` | confirmed |

---

**End of plan.** Nothing in this document has been implemented. On approval, the build runs through `loop-architect` — one EPIC at a time, each task independently verified against fresh evidence before the next begins.

