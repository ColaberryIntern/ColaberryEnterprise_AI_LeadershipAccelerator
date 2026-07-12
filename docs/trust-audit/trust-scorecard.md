# Phase 5 — Trust Scorecard

**Audit:** TBI compliance · Scores 0–100, each grounded in Phase 1–4 evidence. Lower = higher risk.

## Scores

| # | Area | Score | Band | Basis (evidence) |
|---|---|---:|---|---|
| 1 | **Security** | **30** | 🔴 High risk | 15 unauth admin routes incl. `production-activate`; `JWT_SECRET` default; non-blocking Mandrill sig; kill switch not wired to actions. Offsets: helmet/cors/rate-limit/JWT present. (`governance-audit.md` §5) |
| 2 | **Privacy** | **20** | 🔴 High risk | No PII redaction before LLM/voice; no consent capture; PII in logs; no retention. Offsets: unsubscribe/suppression. (§6) |
| 3 | **Observability** | **38** | 🔴 High risk | Composite of 7 dims (User 25 / Workflow 40 / Agent 70 / Tool 15 / Retrieval 20 / Decision 75 / Cost 30). No metrics backend, no trace propagation. (`observability-audit.md`) |
| 4 | **Governance** | **25** | 🔴 High risk | Autonomy broad; HITL enforced for campaigns only; OpenClaw auto-approves; kill switch/safe mode don't gate actions; no ABAC. (`governance-audit.md`) |
| 5 | **Auditability** | **40** | 🟠 Elevated | Good schemas (`AgentWriteAudit`, `IntelligenceDecision`, `ContentGenerationLog`) but partial coverage, no unified model, admin actor null, wrapper bypassed by 50+ sites. |
| 6 | **Explainability** | **40** | 🟠 Elevated | `IntelligenceDecision` reasoning/confidence is strong but autonomous-engine only; **no citations/provenance persisted** (RAG "sources" = table names). |
| 7 | **Reliability** | **45** | 🟠 Elevated | Wrapper retry/timeout/safe-mode; circuit breaker (OpenClaw only); rate limits; health checks. But no metrics/alerting, no queue durability, fire-and-forget jobs, no CI. |
| 8 | **Business Impact (measurability)** | **35** | 🔴 High risk | `KPISnapshot`/`OpsMetricsDaily` exist but `agent_total_cost_usd=0`; **no revenue/time-saved attribution to AI**; cost dimension absent. |
| | **Composite Trust Score** | **34 / 100** | 🔴 | Unweighted mean. Below TBI's 80 "failure-prone" line and far below the 86 production gate. |

## Heat map

```
Area                     0    10   20   30   40   50   60   70   80   90  100
Security            (30) ██████████████▌                 │ pass=80
Privacy             (20) █████████▌                       │
Observability       (38) ██████████████████               │
Governance          (25) ███████████▌                     │
Auditability        (40) ███████████████████              │
Explainability      (40) ███████████████████              │
Reliability         (45) █████████████████████▌           │
Business Impact     (35) ████████████████▌                │
                         └──── 🔴 RED ZONE (<50) ────┘   🟠      🟢(≥80)
```

**Every dimension is below 50.** No area meets the TBI production threshold.

## Highest-risk areas (ranked)

1. **🔴 Privacy (20)** — PII to OpenAI/Synthflow unredacted + zero consent on outbound voice/email = direct TCPA/GDPR/CCPA exposure on *autonomous* sends. Legal + reputational.
2. **🔴 Governance (25)** — kill switch and safe mode are **decorative** for the actions that matter; AI can email/call/post with no enforceable stop. Operational + brand risk.
3. **🔴 Security (30)** — `production-activate` and OpenClaw posting reachable **unauthenticated**; predictable JWT default. Direct compromise path.
4. **🔴 Business Impact (35)** — you cannot prove ROI or cost of AI (cost = 0/null everywhere); executives can't trust numbers that don't exist.
5. **🔴 Observability (38)** — no cost, no cross-service trace, no metrics backend; you can't see what AI is doing in aggregate.

## Risk concentration

The four **CRITICAL** AI capabilities ([ai-inventory.md](ai-inventory.md): Maya, voice, social posting, outbound email) sit at the intersection of the five worst scores — they are **public/irreversible external actions** running on the **weakest governance, privacy, and observability**. They are the priority blast radius for [gap-analysis.md](gap-analysis.md) P0 items.

## TBI translation
- **INPACT** (estimate, evidence-based, conservative): I~3 N~4 **P~2** A~3 C~3 **T~2** → ~17/36 ≈ **47% — "Low Trust, not for production"** (TBI band 33–50%).
- **GOALS** (estimate): **G2 O2** A3 L3 **S3** → ~13/25 ≈ **"Emerging — pilot only."**
- **Net:** below the production gate (INPACT 86% / GOALS 21) on every blocker dimension. See [TRUST_COMPLIANCE_REPORT.md](TRUST_COMPLIANCE_REPORT.md).

*Scores are evidence-grounded desk assessments per TBI's conservative-scoring rule ("when uncertain, choose the lower"). They are not a substitute for the formal cross-functional INPACT assessment, which requires each score to cite a live dashboard metric.*
