# Trust Before Intelligence — Compliance Audit

Evidence-based TBI audit of `accel-repo`, 2026-06-20. Every finding cites `file:line`. Static code inspection; absence ("NOT FOUND") is treated as a finding.

**Standard:** [Trust Before Intelligence](https://github.com/colaberry/trust-before-intelligence-book) — INPACT™, GOALS™, 7-Layer Architecture.
**Companion program** (org-level governance plan): [`../ai-governance/`](../ai-governance/).

## Read in this order

| Phase | Doc | What it answers |
|---|---|---|
| — | [TRUST_COMPLIANCE_REPORT.md](TRUST_COMPLIANCE_REPORT.md) | **Start here.** Scores, critical findings, top 10 risks, 30/60/90 roadmap, GO decision. |
| 1 | [repository-map.md](repository-map.md) | Architecture, services, agents, data, workflows, deps + diagrams |
| 2 | [ai-inventory.md](ai-inventory.md) | Every AI capability + LOW/MED/HIGH/CRITICAL risk |
| 3 | [observability-audit.md](observability-audit.md) | 7 observability dimensions scored 0–100 |
| 4 | [governance-audit.md](governance-audit.md) | Action areas, HITL, autonomy, security boundaries, maturity L0–L5 |
| 5 | [trust-scorecard.md](trust-scorecard.md) | 8 trust scores + heat map |
| 6 | [event-model.md](event-model.md) | Current vs missing; canonical `ai_events` schema |
| 7 | [dashboard-design.md](dashboard-design.md) | Trust Command Center — 5 views, wireframes, component + DB design |
| 8 | [gap-analysis.md](gap-analysis.md) | P0–P3 prioritized remediation |

## Headline

| | |
|---|---|
| Repository Trust Score | **34 / 100** 🔴 |
| Governance | **25 / 100** — Level 1 (Basic) |
| Observability | **38 / 100** |
| Auditability | **40 / 100** |
| Compliance | **30 / 100** |
| TBI maturity | **Level 2 / 5 — Emerging (pilot)** |
| Recommendation | **GO WITH CONDITIONS** (NO GO vs the TBI production bar) |

## Phase 10 — the dashboard is built

A read-only **Trust Command Center** ships at **`/admin/trust`** (admin-gated), deriving from existing tables. Code:
- Backend: `backend/src/services/trustMetricsService.ts`, `backend/src/controllers/trustController.ts`, `backend/src/routes/admin/trustRoutes.ts`
- Frontend: `frontend/src/pages/admin/AdminTrustCenterPage.tsx`

Tiles are tagged **live / baseline / placeholder** — placeholders (cost, cross-service traces, citations) light up after the `ai_events` instrumentation in [gap-analysis.md](gap-analysis.md) (P1). Typechecks clean on both backend and frontend. Not committed/deployed — for review.
