# Phase 7 — Trust Command Center: Dashboard Design

**Audit:** TBI compliance · **Route:** `/admin/trust` · Derives from real repo data; placeholders explicitly marked.

> **Principle (TBI + the audit):** do not fabricate metrics. Each tile is labeled **LIVE** (queryable from existing tables today), **PARTIAL** (some data exists, coverage incomplete), or **PLACEHOLDER** (requires the `ai_events` instrumentation in [event-model.md](event-model.md) before it shows real numbers). Phase 10 implements the LIVE/PARTIAL tiles and renders PLACEHOLDER tiles with an explicit "not yet instrumented" state.

## Architecture fit (from the admin-frontend scout)

- **Frontend:** React 18 (CRA), react-router 6, **recharts 3.7 already installed** (`frontend/package.json:23`), Bootstrap 5 utilities. Pages under `frontend/src/pages/admin/`, routes in `frontend/src/routes/adminRoutes.tsx`, shell `components/Layout/AdminLayout.tsx`, guard `components/ProtectedRoute.tsx`, axios client auto-injects bearer token (`frontend/src/utils/api.ts:18-24`).
- **Backend:** new admin endpoints follow `routes/admin/*.ts` + `requireAdmin` (`middlewares/authMiddleware.ts:22`), registered in `routes/adminRoutes.ts`. Template: `routes/admin/aiOpsRoutes.ts`.
- **Verdict:** architecture permits `/admin/trust` with no structural changes.

## The five views

### 1. Executive View
| Tile | State | Source |
|---|---|---|
| Composite Trust Score (gauge, 34/100) | LIVE (computed) | `trust-scorecard.md` formula over live sub-scores |
| AI activity (24h): conversations, generations, agent runs | LIVE | `chat_conversations`, `content_generation_logs`, `ai_agent_activity_logs` |
| AI cost (24h / 30d) | PLACEHOLDER | needs `ai_events.costUsd` (cost is null/0 today — `observability-audit.md` Cost) |
| Revenue influenced | PLACEHOLDER | needs AI→conversion attribution (not modeled) |
| Compliance status (GO/CONDITIONS/NO-GO + cert calendar) | PARTIAL | derived from this audit; calendar manual |

### 2. Operations View
| Tile | State | Source |
|---|---|---|
| Active workflows / running agents | PARTIAL | `ai_agent_activity_logs` recent, `agent_tasks.status` |
| Errors (24h) + error classes | LIVE | `content_generation_logs.success=false`, `error_message` |
| Throughput (gen/min, msgs/min) | LIVE | count over `created_at` buckets |
| Latency p50/p95 | PARTIAL | `content_generation_logs.duration_ms` (only for audited services) |
| System health | LIVE | existing `GET /health/full` (`healthRoutes.ts:18`) |

### 3. Governance View
| Tile | State | Source |
|---|---|---|
| Approval queue | PARTIAL | `OpenclawTask` pending, campaign `pending_approval` |
| Policy violations / unauth-route alerts | PLACEHOLDER | needs `ai_events.killSwitchHonored`, route-auth scan |
| Overrides / HITL escalations | PARTIAL | `agent_write_audits.was_allowed=false`, `blocked_reason` |
| Kill-switch & safe-mode status | LIVE | `system_kill_switch`, `llm_safe_mode` settings |
| Autonomy map (per capability HITL level) | PARTIAL | from `ai-inventory.md` register |

### 4. Observability View
| Tile | State | Source |
|---|---|---|
| Workflow traces (timeline) | PLACEHOLDER | needs `ai_events.traceId` propagation |
| Agent traces | PARTIAL | `ai_agent_activity_logs` by `trace_id` |
| Tool / external-system usage | PLACEHOLDER | needs `tool.invoke` events |
| Decision history (reasoning + confidence) | PARTIAL | `intelligence_decisions` |
| Retrieval & citations | PLACEHOLDER | citations not persisted (`observability-audit.md` Retrieval) |

### 5. Business Impact View
| Tile | State | Source |
|---|---|---|
| Time saved | PLACEHOLDER | needs task-time model |
| Opportunities generated | LIVE | `intent_scores`, leads created by Maya |
| Revenue influenced | PLACEHOLDER | attribution model |
| Customer impact (CSAT/outcomes) | PARTIAL | `chat_conversations.outcome`, `interaction_outcomes` |

## Wireframe — Executive View

```
┌────────────────────────────────────────────────────────────────────────────┐
│  TRUST COMMAND CENTER                         Exec ▾  Ops  Gov  Obs  Impact  │
├───────────────┬───────────────┬───────────────┬────────────────────────────┤
│ TRUST SCORE   │ AI ACTIVITY   │ AI COST (24h)  │ COMPLIANCE                 │
│   ┌───────┐   │ Convos   142  │   $ —          │  Status: 🔴 NO-GO          │
│   │  34   │   │ Gens     318  │  ⚠ not yet     │  (autonomous external AI)  │
│   │ /100  │   │ AgentRun  77  │   instrumented │  Blockers: P,T  Certs: 0   │
│   └───────┘   │ Errors    11  │  [enable cost] │  Next audit: —             │
│   🔴 RED      │               │                │                            │
├───────────────┴───────────────┴───────────────┴────────────────────────────┤
│ TRUST BY DIMENSION (heat bar)                                               │
│ Security ▓▓▓░░░░░░░ 30   Privacy ▓▓░░░░░░░░ 20   Observ ▓▓▓▓░░░░░░ 38       │
│ Govern  ▓▓▓░░░░░░░ 25   Audit  ▓▓▓▓░░░░░░ 40   Explain ▓▓▓▓░░░░░░ 40        │
│ Reliab  ▓▓▓▓▓░░░░░ 45   BizImpact ▓▓▓▓░░░░░ 35                              │
├────────────────────────────────────────────────────────────────────────────┤
│ AI ACTIVITY (7-day line, recharts)        │ TOP RISKS (from gap-analysis)  │
│   ╱╲    ╱╲                                 │ 1. Unauth admin routes   P0    │
│  ╱  ╲__╱  ╲___                             │ 2. PII to LLM, no consent P0   │
│ generations · conversations · errors      │ 3. Kill switch not wired  P0   │
└───────────────────────────────────────────┴────────────────────────────────┘
```

## Component architecture

```
frontend/src/pages/admin/AdminTrustCenterPage.tsx        // shell + view tabs
  components/admin/trust/
    TrustScoreGauge.tsx        // composite gauge (recharts RadialBar)
    DimensionHeatBar.tsx       // 8 dimension bars
    ActivityTrendChart.tsx     // recharts LineChart over /trust/activity
    TileCard.tsx               // generic stat card w/ LIVE|PARTIAL|PLACEHOLDER badge
    RiskList.tsx               // top risks
  fetch → frontend/src/utils/api.ts (bearer auto-injected)

backend/src/routes/admin/trustRoutes.ts        // GET endpoints, all requireAdmin
backend/src/controllers/trustController.ts      // thin handlers
backend/src/services/trustMetricsService.ts     // Sequelize aggregations over REAL tables
```

Data flow: `AdminTrustCenterPage` → `Promise.all([...api.get('/api/admin/trust/*')])` → `trustController` → `trustMetricsService` (Sequelize `count/findAll` over `content_generation_logs`, `chat_conversations`, `ai_agent_activity_logs`, `agent_write_audits`, settings) → typed JSON. Every response field tags `state: 'live'|'partial'|'placeholder'`.

## Database design

**No schema change needed for the LIVE/PARTIAL tiles** — they read existing tables. Two additions unlock the PLACEHOLDER tiles (see [event-model.md](event-model.md)):

1. **`ai_events`** — the unified event table (canonical schema in event-model.md). Unlocks cost, traces, tool usage, retrieval, killSwitch proof.
2. **`trust_scores`** (optional, for history) — `{ id, captured_at, area, score, inpact_json, goals_json, notes }` so the gauge can trend over time (mirrors the GOALS health dashboard cadence). Until populated, the gauge computes live from sub-queries + this audit's baseline.

Both follow the repo's boot-time `CREATE TABLE IF NOT EXISTS` + `sequelize.sync` pattern (`server.ts:115,531`).

## Refresh & auth
- **Auth:** `requireAdmin` on every endpoint (backend) + `ProtectedRoute` (frontend). Read-only — no mutations.
- **Refresh:** REST poll on mount + 30s `setInterval` (no WebSocket infra exists — `repository-map.md` §5).

## Assumptions
1. Trust sub-scores are seeded from this audit's baseline and recomputed live where queryable; the composite is their mean (transparent, in `trustMetricsService`).
2. Cost/trace/citation tiles render an explicit "not yet instrumented — enable `ai_events`" state rather than a fabricated number.
3. The dashboard is additive and read-only; it changes no existing behavior.
