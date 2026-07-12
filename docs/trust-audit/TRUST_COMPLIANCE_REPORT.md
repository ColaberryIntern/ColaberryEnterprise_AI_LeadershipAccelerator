# Trust Before Intelligence — Compliance Report

**Repo:** `accel-repo` (Colaberry AI Accelerator) · **Audit date:** 2026-06-20 · **Method:** static code inspection, evidence-cited `file:line`, conservative scoring (TBI rule: when uncertain, score lower).
**Standard:** *Trust Before Intelligence* — INPACT™, GOALS™, 7-Layer Architecture.
**Supporting docs:** [repository-map](repository-map.md) · [ai-inventory](ai-inventory.md) · [observability-audit](observability-audit.md) · [governance-audit](governance-audit.md) · [trust-scorecard](trust-scorecard.md) · [event-model](event-model.md) · [dashboard-design](dashboard-design.md) · [gap-analysis](gap-analysis.md)

---

## Executive Summary

The Accelerator runs **24+ distinct AI capabilities** (including 4 CRITICAL public/irreversible ones: Maya chatbot, Synthflow voice, OpenClaw social posting, outbound email automation) on a single provider (OpenAI `gpt-4o-mini`). The engineering is substantial and several **well-shaped audit tables already exist** (`AgentWriteAudit`, `IntelligenceDecision`, `ContentGenerationLog`). **But the system cannot currently be trusted, governed, or observed to a production standard:**

- You **cannot see** what AI costs (cost is `null`/`0` everywhere), **cannot trace** a workflow across services (no propagated trace ID), and **cannot attribute** an AI action to a human (no `user_id` on AI-action logs).
- You **cannot reliably stop** autonomous AI — the kill switch and safe mode flip DB flags the email/voice/social functions never read.
- You have **active exposures**: 15 admin route files (incl. `production-activate` and social posting) are **unauthenticated**; PII is sent to OpenAI/Synthflow unredacted with **no consent capture** on autonomous outbound voice/email.

These are mostly **foundational, fixable gaps** — many P0 items are <1 day of work. The path to trust is clear and matches TBI's own ordering (Observability → Governance → the rest).

## Scores

| Score | Value | Band |
|---|---:|---|
| **Repository Trust Score** | **34 / 100** | 🔴 Below TBI's 80 "failure-prone" line |
| **Governance Score** | **25 / 100** | 🔴 Maturity **LEVEL 1 — BASIC** |
| **Observability Score** | **38 / 100** | 🔴 (User 25 / Workflow 40 / Agent 70 / Tool 15 / Retrieval 20 / Decision 75 / Cost 30) |
| **Auditability Score** | **40 / 100** | 🟠 Good schemas, partial coverage |
| **Compliance Score** | **30 / 100** | 🔴 No ABAC/consent/retention; unauth routes |
| **INPACT™ (estimate)** | **~47%** (I3 N4 **P2** A3 C3 **T2**) | 🔴 "Low Trust — not for production" |
| **GOALS™ (estimate)** | **~13/25** (**G2 O2** A3 L3 S3) | 🔴 "Emerging — pilot only" |

## Critical findings

1. **Control is illusory.** Kill switch / safe mode do not gate the actual action functions (`governance-audit.md` §3). *Evidence:* `launchSafety.ts:121-169` consumers list excludes `emailService.sendMail`/`synthflowService`/`openclawPlatformPostingService`.
2. **Open admin surface.** 15 route files with zero auth, incl. `productionActivationRoute.ts:40` (`?mode=execute` clears kill switch + enables agents).
3. **Privacy exposure on autonomous channels.** No PII redaction + no consent on outbound voice/email; PII also logged (`emailService.ts:110,505`).
4. **Blind to cost.** Dollar cost never computed (`priorityEngineService.ts:350` null, `metricsDailyService.ts:85` zero).
5. **Audit coverage is partial & unattributed.** Only 8/60 LLM services log; admin audit actor always `null` (`auditMiddleware.ts:69`).
6. **No unified event model / no trace propagation** (`event-model.md`).
7. **AI "human review" auto-approves** public social content (`openclawQualityGateAgent.ts:262`).
8. **No drift detection, no accuracy validation, no metrics backend** (`observability-audit.md`).

## Top 10 risks

| # | Risk | Sev | Ref |
|---|---|---|---|
| 1 | Anonymous caller can run `production-activate` / post socially | 🔴 Critical | P0-1 |
| 2 | Autonomous voice/email with no consent → regulatory liability | 🔴 Critical | P0-3 |
| 3 | Kill switch cannot actually stop AI actions | 🔴 Critical | P0-2 |
| 4 | PII leaked to third-party LLM/voice + logs | 🔴 Critical | P0-3 |
| 5 | Predictable `JWT_SECRET` default → auth bypass | 🔴 Critical | P0-5 |
| 6 | Unreviewed AI content posted publicly (auto-approve) | 🟠 High | P0-4 |
| 7 | No cost visibility → uncontrolled spend, no ROI proof | 🟠 High | P1-3 |
| 8 | Cannot trace/debug a failing AI workflow across services | 🟠 High | P1-1/4 |
| 9 | No idempotency → duplicate sends to customers | 🟠 High | P2-2 |
| 10 | Model/data drift undetected (91% of models degrade) | 🟠 High | P2-4 |

## Top 10 quick wins (high value, ≤1–3 days)

1. Add `requireAdmin` to the 15 unauth route files (P0-1).
2. Wire kill switch + safe mode into `sendMail`/voice/social (P0-2).
3. Fail-fast on missing `JWT_SECRET` in prod (P0-5).
4. Fix `req.admin` actor + capture `old_values` in audit middleware (P0-6).
5. Reject Mandrill webhooks on signature mismatch (P0-7).
6. Flip OpenClaw to human-approve until scored (P0-4).
7. Add `MODEL_PRICING` + compute `costUsd` in `llmCallWrapper` (P1-3).
8. Add a per-request `x-trace-id` middleware (P1-4 start).
9. Basic PII masking helper applied at LLM/voice boundaries (P0-3 start).
10. Stand up `/admin/trust` read-only dashboard over existing tables (P1-7 / Phase 10).

## Recommended roadmap

### 30-day plan — "Stop the bleeding + start seeing"
- Complete **all P0** (security, control, privacy quick wins).
- P1-1 `ai_events` table + `emitAiEvent()`; P1-3 cost; P1-2 begin routing call sites through the wrapper; P1-7 ship `/admin/trust` (LIVE tiles).
- **Exit:** no unauth admin routes; kill switch verified to stop a test send; cost + activity visible on the dashboard.

### 60-day plan — "Observability + governance to Functional"
- Finish P1-2 (all LLM calls audited), P1-4 (trace propagation), P1-6 (citations).
- P2-2 idempotency + rollback; P2-6 HITL escalation metering; P0-3 full redaction + consent.
- **Exit:** GOALS **O ≥ 4/5**, **G ≥ 3/5**; INPACT **T ≥ 4/6**, **P ≥ 3/6** on the 4 CRITICAL capabilities.

### 90-day plan — "Production trust bar on critical capabilities"
- P2-1 ABAC on AI actions (track of its own); P2-3 prompt versioning; P2-4 drift + weekly accuracy validation; P2-5 retention.
- First **quarterly INPACT/GOALS re-score** with evidence (replace the estimates here with dashboard-cited numbers).
- **Exit:** 4 CRITICAL capabilities at **INPACT ≥ 86%, GOALS ≥ 21/25**; cadence (daily/weekly/monthly/quarterly) running.

## Executive recommendation

### Current state vs TBI production bar: **NO GO**
Against the TBI production gate (INPACT ≥ 86%, GOALS ≥ 21/25, 100% audit, enforceable HITL), the autonomous external-facing AI **does not pass** — Permitted and Transparent are critical-gap, and the kill switch is not effective.

### Pragmatic operating decision: **GO WITH CONDITIONS**
The systems are already in production; a hard stop isn't the proportionate move. **Continue operating under these mandatory conditions, in order:**
1. **Within 7 days:** complete P0-1, P0-2, P0-5, P0-7 (close unauth routes, wire the kill switch, fix JWT default, enforce webhook sig). *Until then, set `enableAutoEmail=false` and `enableVoiceCalls=false` and require human approval for OpenClaw posting.*
2. **Within 30 days:** P0-3 (PII redaction + consent) and the cost/trace/dashboard foundation (P1-1/3/7).
3. **No expansion of AI autonomy** (new autonomous external actions) until the 60-day exit criteria are met.

This is a **GO WITH CONDITIONS** because the gaps are foundational and fixable, the engineering base is strong, and a clear 90-day path reaches the bar — but the P0 conditions are non-negotiable given the live legal/security exposure.

## Trust Before Intelligence Maturity Level

**Level 2 of 5 — "Emerging / Pilot."** (TBI GOALS bands: 5–10 Early-Stage; **11–15 Emerging — pilot only**; 16–20 Adoption-ready; 21–25 Production-grade.) The Accelerator is a capable pilot-grade AI system operating at production scale without production-grade trust controls. The 90-day roadmap moves it to **Adoption-ready → Production-grade** for its critical capabilities.

---

*All scores are evidence-grounded desk assessments and a starting baseline. TBI requires the formal cross-functional INPACT/GOALS assessment where each score cites a live dashboard metric — the `/admin/trust` dashboard (Phase 10) plus the `ai_events` instrumentation (P1-1) are what make that possible at the next quarterly re-score.*
