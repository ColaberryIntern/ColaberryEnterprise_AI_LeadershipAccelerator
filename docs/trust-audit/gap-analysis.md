# Phase 8 — Implementation Gap Analysis

**Audit:** TBI compliance · Priority: **P0** (must-fix now / blocks trust & creates legal/security exposure) · **P1** (foundation for compliance) · **P2** (needed for production bar) · **P3** (optimization).

Effort: S (<1d) · M (1–3d) · L (1–2w) · XL (>2w). Complexity / Risk: Low/Med/High. Business value: ★–★★★★★.

## P0 — Stop the bleeding (security, privacy, control)

| # | Gap | Current → Target | Evidence | Effort | Cplx | Risk if ignored | BV |
|---|---|---|---|---|---|---|---|
| P0-1 | **15 admin route files unauthenticated** (incl. `production-activate`, OpenClaw posting) | none → `requireAdmin` on every admin route; router-wide guard | `governance-audit.md` §5 | M | Low | Anonymous prod takeover / brand-damaging posts | ★★★★★ |
| P0-2 | **Kill switch & safe mode don't gate actions** | flags flip DB only → check `isKillSwitchActive()`/`isSafeModeActive()` inside `emailService.sendMail`, `synthflowService.triggerVoiceCall`, `openclawPlatformPostingService` | §3 | S | Low | No real "stop" for autonomous AI | ★★★★★ |
| P0-3 | **No PII redaction before LLM/voice + no consent** | verbatim PII → redact/minimize before send; add consent gate on outbound voice/email | §6 | M | Med | TCPA/GDPR/CCPA liability | ★★★★★ |
| P0-4 | **OpenClaw auto-approves social posts** | deterministic auto-approve → enforce human approval (HITL L3) until scored | §2 | S | Low | Unreviewed public content | ★★★★ |
| P0-5 | **`JWT_SECRET` insecure default** | `'dev-secret-change-me'` fallback → fail-fast if unset in prod | `env.ts:19` | S | Low | Auth bypass | ★★★★★ |
| P0-6 | **Admin audit logs no actor** (`req.adminUser` vs `req.admin`) | `admin_user_id: null` → fix field; capture `old_values` | `auditMiddleware.ts:69,73` | S | Low | Unattributable admin actions | ★★★ |
| P0-7 | **Mandrill webhook signature non-blocking** (triggers AI voice) | warn-only → reject on mismatch | `mandrillWebhookController.ts:79-87` | S | Low | Spoofed inbound → AI calls | ★★★ |

## P1 — Observability & audit foundation (TBI: "fix Observability first")

| # | Gap | Current → Target | Evidence | Effort | Cplx | BV |
|---|---|---|---|---|---|---|
| P1-1 | **No unified event model** | 15+ disjoint tables → `ai_events` + `emitAiEvent()` | `event-model.md` | L | Med | ★★★★★ |
| P1-2 | **Audit wrapper bypassed by 50+ call sites** | 8/60 audited → route all LLM calls through `callLLMWithAudit` | `ai-inventory.md`; `llmCallWrapper.ts` | L | Med | ★★★★★ |
| P1-3 | **No dollar cost anywhere** | null/0 → `MODEL_PRICING` table, compute `costUsd` at emit | `observability-audit.md` Cost | S | Low | ★★★★ |
| P1-4 | **No cross-service trace ID** | engine-local only → `x-trace-id` middleware + job-payload propagation | Workflow dim | M | Med | ★★★★ |
| P1-5 | **No metrics backend** | DB tables only → minimal: derive p50/p95 + error-rate views from `ai_events`; (optional) add OpenTelemetry/Langfuse | `observability-audit.md` | L | Med | ★★★★ |
| P1-6 | **Citations/retrieval not persisted** | "sources"=table names → store retrieved doc IDs + citations on the answer event | Retrieval dim | M | Med | ★★★ |
| P1-7 | **Trust dashboard** | none → `/admin/trust` (Phase 10) | `dashboard-design.md` | M | Low | ★★★★ |

## P2 — Reach the production trust bar

| # | Gap | Current → Target | Evidence | Effort | BV |
|---|---|---|---|---|---|
| P2-1 | **No ABAC on AI actions** | RBAC scaffold unapplied → ABAC "Five W's" on data/action access | §5 | XL | ★★★★ |
| P2-2 | **No rollback/idempotency on sends** | none → idempotency key `(recipient,subject,event_id)` + compensating actions | §4 | M | ★★★ |
| P2-3 | **No prompt/model versioning in path** | hardcoded prompts → version + log `promptTemplateId/version` | `ai-inventory.md` | M | ★★★ |
| P2-4 | **No drift / accuracy validation** | none → weekly golden-set eval (extend `promptLabService`) + KS/PSI drift | TBI GOALS-O | L | ★★★ |
| P2-5 | **No data-retention policy** | none → TTL/purge for chat/call transcripts + leads | §6 | M | ★★ |
| P2-6 | **HITL escalation not metered** | ad hoc → track escalation rate, human-review SLA | TBI Permitted | M | ★★★ |

## P3 — Optimization / maturity

| # | Gap | Target | BV |
|---|---|---|---|
| P3-1 | CI pipeline (none today) | GitHub Actions: typecheck + tests + secret scan + route-auth lint | ★★★ |
| P3-2 | Consolidate `-Ali-AI` duplicate files | remove dead variants | ★★ |
| P3-3 | Real-time dashboard (WebSocket) | live agent/incident stream | ★★ |
| P3-4 | Per-user/per-workflow cost analytics | group `ai_events` by dims | ★★★ |
| P3-5 | Automated compliance reporting | scheduled trust-score snapshot to `trust_scores` | ★★ |

## Sequencing logic

P0 first — these are **active security/legal exposures on already-live systems** and most are S/M effort. P1 builds the **measurement layer** TBI insists comes first (you can't improve what you can't see) and is the precondition for honest dashboard numbers and quarterly re-scoring. P2 lifts the four CRITICAL capabilities to the production bar. P3 hardens.

**Dependency notes:** P1-3/P1-4/P1-6 depend on P1-1 (`ai_events`). The dashboard PLACEHOLDER tiles ([dashboard-design.md](dashboard-design.md)) light up only after P1-1/P1-2/P1-3. P2-1 (ABAC) is the largest single item — treat as its own track.
