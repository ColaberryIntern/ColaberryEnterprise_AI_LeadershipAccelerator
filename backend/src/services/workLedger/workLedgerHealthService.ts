import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

// ProofDesk Work Ledger — Milestone 1 (Foundation). Computes ingestion health for
// the read-only admin panel: what fraction of recent wrapped ticket actions
// (created / status_changed / agent_output activities) actually produced a
// matching work_ledger_events row, and how many are "orphans" (the wrap point ran
// but no ledger row landed — e.g. a swallowed emitEvent() failure).
//
// Match rule differs by action, because the two bridge functions key their
// source_record_type/source_record_id differently:
//   - 'created'                    -> source_record_type='ticket',          source_record_id=<ticket_id>
//   - 'status_changed'/'agent_output' -> source_record_type='ticket_activity', source_record_id=<activity_id>
// (see ticketService.ts's emitLedgerEventSafe() call sites).

export interface WorkLedgerHealthBreakdownRow {
  action: string;
  total: number;
  matched: number;
  orphan: number;
}

export interface WorkLedgerHealthResult {
  window_hours: number;
  total_actions: number;
  matched_actions: number;
  orphan_count: number;
  completeness_pct: number;
  breakdown: WorkLedgerHealthBreakdownRow[];
}

export async function getWorkLedgerHealth(windowHours = 24): Promise<WorkLedgerHealthResult> {
  const safeWindowHours = Number.isFinite(windowHours) && windowHours > 0 ? Number(windowHours) : 24;

  const rows = await sequelize.query<{ action: string; total: string; matched: string }>(
    `WITH windowed_activities AS (
       SELECT id, ticket_id, action
       FROM ticket_activities
       WHERE action IN ('created', 'status_changed', 'agent_output')
         AND created_at >= NOW() - INTERVAL '${safeWindowHours} hours'
     )
     SELECT
       wa.action,
       COUNT(*)::text AS total,
       SUM(
         CASE WHEN EXISTS (
           SELECT 1 FROM work_ledger_events wle
           WHERE
             (wa.action = 'created'
               AND wle.source_record_type = 'ticket'
               AND wle.source_record_id = wa.ticket_id::text)
             OR
             (wa.action IN ('status_changed', 'agent_output')
               AND wle.source_record_type = 'ticket_activity'
               AND wle.source_record_id = wa.id::text)
         ) THEN 1 ELSE 0 END
       )::text AS matched
     FROM windowed_activities wa
     GROUP BY wa.action
     ORDER BY wa.action`,
    { type: QueryTypes.SELECT },
  );

  const breakdown: WorkLedgerHealthBreakdownRow[] = rows.map((r) => {
    const total = Number(r.total);
    const matched = Number(r.matched);
    return { action: r.action, total, matched, orphan: total - matched };
  });

  const total_actions = breakdown.reduce((sum, r) => sum + r.total, 0);
  const matched_actions = breakdown.reduce((sum, r) => sum + r.matched, 0);
  const orphan_count = total_actions - matched_actions;
  const completeness_pct = total_actions > 0 ? Math.round((matched_actions / total_actions) * 10000) / 100 : 0;

  return {
    window_hours: safeWindowHours,
    total_actions,
    matched_actions,
    orphan_count,
    completeness_pct,
    breakdown,
  };
}

// ProofDesk Governance — Milestone 4 (Governance Enforcement, SHADOW MODE ONLY).
//
// Read-only: how many ticket-dispatch actions in the window WOULD have been
// blocked/required-approval under R3/R4 (or any other authorizeAgentAction() denial)
// if abac_enforcement were 'enforce', broken down by action/risk tier — this is the
// concrete evidence for this milestone's handoff "before/after" requirement (T014).
// Nothing here reads this data to gate anything; it is purely descriptive.
//
// approval_requests only ever gets a row when the decision was NOT would_allow (see
// agentActionAuthorizationBridge.ts) — so "would_allow" here is inferred as the
// complement: a dispatch ledger event with no matching approval_requests row.

export interface GovernanceShadowBreakdownRow {
  action: string;
  risk_tier: string;
  verdict: 'would_allow' | 'would_require_approval' | 'would_block';
  count: number;
}

export interface GovernanceShadowSummary {
  window_hours: number;
  total_decisions: number;
  would_allow: number;
  would_require_approval: number;
  would_block: number;
  breakdown: GovernanceShadowBreakdownRow[];
}

export async function getGovernanceShadowSummary(windowHours = 24): Promise<GovernanceShadowSummary> {
  const safeWindowHours = Number.isFinite(windowHours) && windowHours > 0 ? Number(windowHours) : 24;

  const rows = await sequelize.query<{ action: string; risk_tier: string; verdict: string; count: string }>(
    `WITH windowed_dispatches AS (
       SELECT event_id, action_class, risk_tier, authorization_decision_id
       FROM work_ledger_events
       WHERE action_class = 'ticket_dispatch'
         AND occurred_at >= NOW() - INTERVAL '${safeWindowHours} hours'
     )
     SELECT
       wd.action_class AS action,
       wd.risk_tier,
       COALESCE(ar.verdict, 'would_allow') AS verdict,
       COUNT(*)::text AS count
     FROM windowed_dispatches wd
     LEFT JOIN approval_requests ar ON ar.event_id = wd.event_id
     GROUP BY wd.action_class, wd.risk_tier, COALESCE(ar.verdict, 'would_allow')
     ORDER BY wd.action_class, wd.risk_tier, verdict`,
    { type: QueryTypes.SELECT },
  );

  const breakdown: GovernanceShadowBreakdownRow[] = rows.map((r) => ({
    action: r.action,
    risk_tier: r.risk_tier,
    verdict: r.verdict as GovernanceShadowBreakdownRow['verdict'],
    count: Number(r.count),
  }));

  const sumByVerdict = (verdict: GovernanceShadowBreakdownRow['verdict']) =>
    breakdown.filter((r) => r.verdict === verdict).reduce((sum, r) => sum + r.count, 0);

  const would_allow = sumByVerdict('would_allow');
  const would_require_approval = sumByVerdict('would_require_approval');
  const would_block = sumByVerdict('would_block');

  return {
    window_hours: safeWindowHours,
    total_decisions: would_allow + would_require_approval + would_block,
    would_allow,
    would_require_approval,
    would_block,
    breakdown,
  };
}
