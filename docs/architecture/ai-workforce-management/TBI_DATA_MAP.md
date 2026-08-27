# TBI (Trust Before Intelligence) Data Map (Checkpoint A)

Maps what real, evidence-backed data exists to feed the mission's INPACT™/GOALS™ Trust Workspace (Checkpoint E), and what's genuinely missing — so missing data can render `UNASSESSED`/`INSUFFICIENT EVIDENCE`, never a fabricated green.

## Governing documents (both confirmed current, not stale)

- `docs/ai-governance/TBI_COMPLIANCE_PROGRAM.md` — 350 lines, "Draft v1.0," last updated 2026-06-20, actively cited from live code (`trustInpactGoalsService.ts:1-9`, `AiAgent.ts:251-257`).
- `docs/ai-governance/ai-systems-registry.csv` — 28 real system rows, 14 columns (System, Area, Tier, User-Facing, HITL Level, Data Sensitivity, Owner, Provisional/Target INPACT, Provisional/Target GOALS, Remediation Phase, Key Gaps, Logging Today), parsed **at runtime** by `trustInpactGoalsService.ts:61-108`.

## What's real and computed live

- `trustMetricsService.ts:46-47` — production gate constants: `INPACT_PRODUCTION_GATE_PCT = 86`, `GOALS_PRODUCTION_GATE = 21`. Code constants, not editable rows.
- `trustMetricsService.ts::getAgentDetail()` (`:552-600`) — computes a live `AgentGoalsDimension[]` (governance, observability, availability, lexicon, solid — TBI's "GOALS" acronym), 1–5 scored per agent from real activity-log queries. **Computed on every read, never persisted.**
- `trustInpactGoalsService.ts::getInpactGoalsEstimate()` — parses `ai-systems-registry.csv` for a per-system desk estimate. Real data, but a desk estimate (human-entered provisional scores), not a live-measured score.
- Real cost data: `ai_events.cost_usd`, correctly agent-attributed for Reese as of this session's PR #1868.
- Real authorization-shadow-mode summary and persona-version history: shipped this session (PR #1858/#1861), already rendered on `AgentDetailPage.tsx` via `AgentTrustSummaryCard`.

## What's confirmed missing (must render UNASSESSED, never fabricated)

- **No persisted historical trust-score table (`trust_scores`).** Confirmed via `Glob *TrustScore*.ts` (no files) and a repo-wide grep for the literal string `trust_scores` (the only hit is an unrelated in-memory variable in `federatedTrustProfiles.ts:43-67`, not a DB table). Listed as an open gap in `docs/trust-audit/gap-analysis.md:50` (item P3-5) and explicitly described as optional/future in `docs/trust-audit/dashboard-design.md:108`. **Any "Trust trend over time" UI in Checkpoint E has no real data source today** — either build one (extending `KPISnapshot`, which already has a `scope_type: 'agent'` option per `KPISnapshot.ts:4-18` but no target/threshold column) or the UI must show a single current snapshot with an explicit "no history available yet" state, never a fabricated trend line.
- **No per-agent goal/target object** — see `DOMAIN_REUSE_MAP.md`. Without it, any "progress toward INPACT/GOALS target" framing beyond the two hardcoded global gate constants has no real backing.
- Full-agent INPACT/GOALS scoring (beyond the CSV desk-estimate) requires, per `TBI_COMPLIANCE_PROGRAM.md §4.1`, a cross-functional per-system scoring SOP that has not been run for most of the 23 registered agents — the CSV only has 28 rows total and is not 1:1 with every `AiAgent`. Any per-agent INPACT/GOALS badge Checkpoint E renders must check whether that specific agent has a real CSV row before showing a number; agents without one render `UNASSESSED`.

## Real event types available for future explainability grounding (Checkpoint F)

Not exhaustively re-catalogued in Checkpoint A (would require a full `AiEvent`/`ai_events` schema pass, deferred to Checkpoint F kickoff), but confirmed real and queryable today: authorization-shadow verdicts (`would_allow`/`would_require_approval`/`would_block` + `reason_code`, via `ApprovalRequest`/`agentAuthorizationService`), `ai_events` cost/token/call records, `ProposedAgentAction.reason`/`before_state`/`proposed_changes`, ticket activity (`AgentTicketActivityTable`'s existing source). These are real, recorded facts an "Ask Agent About This" feature can cite — never a hidden reasoning trace, satisfying non-negotiable #3.
