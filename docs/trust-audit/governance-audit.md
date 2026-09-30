# Phase 4 — Governance Audit

**Audit:** TBI compliance · evidence cited `file:line`.

**Maturity scale:** L0 None · L1 Basic · L2 Controlled · L3 Managed · L4 Trusted · L5 Enterprise.

> **Overall governance maturity: LEVEL 1 — BASIC**, with isolated islands of L2 (campaign approval state machine; agent-write permission service). The two defining failures: (1) **kill switch and safe mode do not gate the actual email/voice/social action functions** — they only flip DB flags those functions never read; (2) **15 admin route files (incl. social-posting triggers and `production-activate`) have zero authentication.** AI "human review" for social content is a deterministic score that **auto-approves**.

---

## 1. Where AI takes action — and whether it's governed

| Action area | Action site (file:line) | Autonomous? | Human review enforced? | Bypassable? | Rollback? | Audited? | Maturity |
|---|---|---|---|---|---|---|---|
| **Send email (Mandrill)** | `services/emailService.ts:100` `transporter.sendMail` | Yes — `enableAutoEmail` defaults ON (`env.ts:63`) | No | Transport ungated by flag/kill-switch | No (irreversible, no recall) | Yes — `AutomationLog` (`automationService.ts:61`) | **L1** |
| **Initiate voice call (Synthflow)** | `services/synthflowService.ts:102` | Yes when `enableVoiceCalls`+phone | No | Not gated by kill-switch | No | Yes — lead `Activity` | **L1** |
| **Post to social** | `openclawPlatformPostingService.ts:34,98` | Yes for API_POSTING platforms | **No — AI self-approves** (`openclawQualityGateAgent.ts:262`) | Platforms not in `gated_platforms` skip the gate (`:212`) | No | Partial — `OpenclawTask` | **L1** |
| **Modify DB records (kill campaigns/agents)** | `services/launchSafety.ts:143-156` raw `UPDATE` | Via admin route | Admin only | `production-activate` route is **unauth** | Manual only | Partial | **L1** |
| **Create tickets / dispatch agents** | quality gate `OpenclawTask.create` (`:268`); Cory dispatch | Agent-autonomous | No | — | No | `ai_agent_activity_logs` | **L1–L2** |
| **Agent DB writes via permission service** | `services/agentPermissionService.ts:342` | Tiered by permission | Permission tier check | Only if routed through service | No | **Yes — `AgentWriteAudit`** (good) | **L2** |
| **Pipeline stage advance** | `services/automationService.ts:154,228` | Yes, fire-and-forget | No | — | No | Partial | **L1** |
| **Generate content (LLM)** | `services/llmCallWrapper.ts:162` | Yes | `isSafeModeActive()` gate (`:92`) | Only the 8 wrapper services are gated | n/a | **Yes — `content_generation_logs`** | **L2** |
| **Campaign go-live** | `services/campaignApprovalService.ts:107` | No | **Yes — enforced state machine** | Hard block (`:15,42,107`) | n/a | `approved_by/at` | **L2 (best)** |

## 2. Human-in-the-loop / approval gates

- **ENFORCED (hard block) — campaigns only:** `campaignApprovalService.ts:15-19` (submit requires `draft`), `:42-44` (approve requires `pending_approval`), `:107-110` (go-live runs `validateCampaignForPublish`), records `approved_by/approved_at` (`:46-50`). This is the one genuine human gate.
- **ADVISORY / AUTO-APPROVE — replaces human review:** `openclawQualityGateAgent.ts:14-16` (doc: *"Replaces manual human review… while maintaining quality control"*); `:130` `approved = score >= 70 && reasons.length === 0` (a deterministic score, **no human**); `:262` auto-sets `post_status:'approved'`, `:268` creates a posting task. Any platform not flagged `API_POSTING` skips the gate entirely (`:212`).
- **Manual approve endpoints exist but are UNAUTHENTICATED:** `routes/admin/openclawRoutes.ts:330` `/responses/:id/approve`, `:356` `/reject`, `:1663` `/authority-content/:id/approve` — in a file with **zero auth middleware** (see §5). The "human approval" can be invoked anonymously.
- **Cory governance (enforced, narrow):** `routes/admin/coryRoutes.ts:209,286,109,130` gated by `requireCoryAuthorized` (`authMiddleware.ts:86`), predicate hardcoded to `email==='ali@colaberry.com' || role==='super_admin'` (`:102-103`).

## 3. Autonomy controls / kill switches

- **Feature flags** (`config/env.ts:60-73`): `enableVoiceCalls`(61), `enableAutoEmail`(63, **default ON**), `enableChat`(68), `enableFollowUpScheduler`, etc.; plus `config/featureFlags.ts:6-9`.
  - `enableVoiceCalls` **does** gate execution (`synthflowService.ts:33`, `automationService.ts:180`).
  - `enableAutoEmail` gates only `automationService.ts:50,140` — the raw transport `emailService.sendMail` (`:100`) is **not** flag-gated; digests/alerts/scripts bypass it.
- **Global kill switch** (`services/launchSafety.ts:121-169`, reads `system_kill_switch`): referenced only by `aiOpsRoutes.ts:148`, `productionActivationRoute.ts:75`, `launchTelemetry.ts:163`. **NOT checked inside `synthflowService.triggerVoiceCall`, `emailService.sendMail`, or `openclawPlatformPostingService`** — the switch flips DB flags the action functions never consult. **The kill switch does not stop AI from acting.**
- **Safe mode** (`systemControlService.ts:6-13`, reads `llm_safe_mode`): checked only at `llmCallWrapper.ts:92` (content gen), `aiOpsRoutes.ts:217`, `systemAutoResponseService.ts:32`. Does **not** gate email/voice/social.
- **Rate limiting / circuit breaker:** agent storm cap 50/min in-memory (`launchSafety.ts:19,66-90`); public chat 30/60 per min (`trackingRoutes.ts:51-65`); OpenClaw circuit breaker (`openclaw/openclawCircuitBreaker.ts`) — scoped to OpenClaw only.

## 4. Rollback / reversibility

- **AI actions (email/voice/social): NOT FOUND** — no recall/undo/compensating action. Sends are irreversible once the call returns.
- **Email idempotency: NOT FOUND** — `CLAUDE.md` mandates a dedup table keyed on `(recipient, subject, business_event_id)`, but `models/ScheduledEmail.ts` has no `idempotency_key`/unique constraint/`ON CONFLICT` (grep "No matches"). Only lead-ingest is idempotent (`v1LeadController.ts:29-31`).
- **Kill-switch reversal is manual:** `launchSafety.ts:175-183` — *"Does NOT automatically re-enable campaigns or agents."*
- **Artifact versioning (partial):** `artifactVersionService.ts:9,64,107` (create/history/diff) — but **no `rollback`/`restore`** function (grep none).
- **Prompt/model versioning: NOT FOUND** (`grep promptVersion|model_version` empty).

## 5. Auth & security boundaries (CRITICAL)

**`adminRoutes.ts:72` applies only `auditMiddleware` router-wide — NOT auth.** Auth is per-line inside each sub-router. **15 admin sub-router files have zero auth references:**

```
openclawRoutes.ts (65 routes)            ← incl. flush-all, post-via-browser, config writes
openclawRoutes-Ali-AI.ts (41)
reportingRoutes.ts (27)
companyRoutes.ts (16)
departmentIntelligenceRoutes.ts (15)
alertRoutes.ts (10)
ticketRoutes.ts (10)
strategicIntelligenceRoutes.ts (9)
autonomyRoutes.ts (7)
executiveAwarenessRoutes.ts (7)
automationRoutes.ts (6)                  ← header LIES: "All admin-authenticated" (line 5)
previewRoutes.ts (5)
testSetupRoutes.ts (4)
productionActivationRoute.ts (2)         ← POST /api/admin/production-activate?mode=execute (clears kill switch, enables agents)
productionCleanupRoute.ts (1)
```

- `productionActivationRoute.ts:40` — no auth; `?mode=execute` (`:42`) clears kill switch/test mode and activates campaigns + agents.
- **Audit actor is always null:** `auditMiddleware.ts:69` reads `(req as any).adminUser`, but `authMiddleware` populates `req.admin` (`:36,109`) → `admin_user_id: null`; also `old_values: null` (`:73`, no pre-fetch). Admin writes are logged without actor or before-state.
- **Webhook signatures weak:** Mandrill (triggers AI voice) `mandrillWebhookController.ts:79-87` — *"log mismatch but don't block"* (just `console.warn`). Synthflow/GHL/Apollo webhooks have no signature/auth at the route layer (`webhookRoutes.ts:24-30`).
- **Public Maya chat:** open + rate-limited only (`trackingRoutes.ts:67-72`); guarded by `enableChat` + 2000-char cap.
- **RBAC/ABAC:** scaffolding exists (`rbacMiddleware.ts`, `roleService`) but **not applied** on the unauth AI routes. **No resource-ownership (ABAC) checks** on AI action routes.
- **`JWT_SECRET` insecure default:** `env.ts:19` `process.env.JWT_SECRET || 'dev-secret-change-me'` — predictable fallback if env unset (auth-bypass risk).

## 6. Privacy / PII

- **No PII redaction before LLM/voice: NOT FOUND.** `llmCallWrapper.ts:151-157` sends prompts verbatim; `chatService.ts:57-60` injects visitor name/email; `emailService.ts:485-505` and `synthflowService.ts:74-83` pass lead PII into LLM/voice context. PII also logged (`emailService.ts:110,505`; `synthflowService.ts:124`).
- **No consent capture (TCPA/GDPR/CCPA): NOT FOUND** in the messaging path (grep `consent|opt.in|gdpr|ccpa|tcpa` → only internal federation aggregates). Only unsubscribe header + suppression services (`emailService.ts:76`, `unsubscribeEnforcementService.ts`, `smsOptOutProcessor.ts`).
- **No data-retention policy: NOT FOUND** (no TTL/purge on chat/call transcripts or leads).

## 7. Secrets
- All AI/API keys referenced by env var **name** only (`config/env.ts`): `OPENAI_API_KEY`(38), `SYNTHFLOW_API_KEY`(30), `MANDRILL_API_KEY`(48), `APOLLO_API_KEY`(43), `JWT_SECRET`(19), `GOOGLE_PRIVATE_KEY`(54). **No real hardcoded secrets found** (matches were test fixtures + the `secretDetectionAgent.ts:10-18` patterns). Build-time secret scanning files tickets. **No secrets logged** (matches are token *counts*).

---

## Governance scorecard (per the 5 governance questions, all areas)

| Question | Answer | Evidence |
|---|---|---|
| Can AI act autonomously? | **Yes**, broadly — email/voice/social/content all run without human approval | §1 |
| Can human review be enforced? | **Only for campaigns** (state machine); OpenClaw "review" auto-approves | §2 |
| Can approvals be bypassed? | **Yes** — quality gate skips non-`API_POSTING`; approve routes unauth | §2, §5 |
| Can actions be rolled back? | **No** for email/voice/social; partial for artifacts (no restore) | §4 |
| Can actions be audited? | **Partially** — good schemas, narrow coverage, actor null on admin audit | §1, §5; [observability-audit.md](observability-audit.md) |

**TBI mapping:** GOALS **Governance** pillar requires ABAC + enforced HITL + tested rollback (<15 min) + change-approval. Current state ≈ **G 2/5**. TBI **Permitted** dimension (INPACT) ≈ **2/6** (static gates, kill switch not wired, no ABAC). These are TBI's #1 "compliance blocker."

## Evidence gaps
1. The 15 zero-auth files confirmed by grep (0 auth refs) + spot-reads; an nginx-layer auth in front was not found in `nginx/nginx.conf`.
2. `-Ali-AI` route variants' mounting not traced.
3. `selfHealingOrchestrator.ts` / `remediationOrchestrationListener.ts` (autonomous infra remediation) referenced but not deep-audited — recommended next target.
