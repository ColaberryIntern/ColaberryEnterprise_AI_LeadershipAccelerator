import { TicketWorkUnit } from '../../models';

// ProofDesk Outcomes & Learning — Milestone 5. Agent trust by capability (spec
// 20.10): "Do not give an agent one global trust score. Track trust separately for
// capabilities and risk tiers." `TicketWorkUnit` (Milestone 3) is the only table
// where `assigned_agent_name`, `required_capability`, and `risk_tier` co-locate per
// row — confirmed in DISCOVER (workGraphService.ts's own header: "Work units are
// opt-in: nothing auto-creates them for a ticket, so most tickets have zero"). That
// means `insufficient_data` is the honest, common answer in production today, not an
// edge case this calculator merely tolerates.
//
// Failure-First Design:
// 1. What happens if this fails? A read-only aggregation; a DB failure propagates to
//    the caller (an admin-panel route), which is expected to surface a clear error
//    rather than a fabricated empty/zero result.
// 2. Retry? None — a stateless read, safe to re-run/re-request at will.
// 3. Recovery if exhausted? N/A — no write side effect to recover.
// 4. Explicit failure modes handled: zero work units for a triple (insufficient_data,
//    never a fabricated rate); empty table (returns []). Not handled: DB unavailable.

export type AgentTrustDataStatus = 'sufficient_data' | 'insufficient_data';

export interface AgentTrustEntry {
  agent_name: string;
  capability: string;
  risk_tier: string;
  total: number;
  succeeded: number;
  failed: number;
  success_rate: number | null;
  status: AgentTrustDataStatus;
}

/**
 * Per-(agent, capability, risk_tier) success rate. Groups ALL assigned
 * `TicketWorkUnit` rows (any status) by (agent, capability, risk_tier) — not just
 * concluded ones — so a triple whose only work units are `pending`/`in_progress`/
 * etc. still surfaces in the result with `status: 'insufficient_data'` rather than
 * being silently omitted entirely (the plan's explicit boundary requirement: a triple
 * with zero `done`/`failed` rows must be reported, not dropped). Within each group,
 * only `done` (succeeded) and `failed` counts contribute to `total`/`success_rate` —
 * `pending`/`ready`/`in_progress`/`blocked`/`cancelled` rows don't count toward
 * either, since they haven't concluded.
 */
export async function computeAgentTrustByCapability(): Promise<AgentTrustEntry[]> {
  const rows = await (TicketWorkUnit as any).findAll({
    attributes: ['assigned_agent_name', 'required_capability', 'risk_tier', 'status'],
  });

  const groups = new Map<string, { agent_name: string; capability: string; risk_tier: string; succeeded: number; failed: number }>();

  for (const row of rows as any[]) {
    const agentName = row.assigned_agent_name;
    if (!agentName) continue; // an unassigned work unit can't be attributed to any agent's trust
    const capability = row.required_capability;
    const riskTier = row.risk_tier;
    const key = `${agentName}::${capability}::${riskTier}`;

    if (!groups.has(key)) {
      groups.set(key, { agent_name: agentName, capability, risk_tier: riskTier, succeeded: 0, failed: 0 });
    }
    const group = groups.get(key)!;
    if (row.status === 'done') group.succeeded += 1;
    else if (row.status === 'failed') group.failed += 1;
    // any other status (pending/ready/in_progress/blocked/cancelled) still creates
    // the group entry above (so the triple is surfaced), but doesn't move the rate
  }

  return Array.from(groups.values()).map((g) => {
    const total = g.succeeded + g.failed;
    return {
      agent_name: g.agent_name,
      capability: g.capability,
      risk_tier: g.risk_tier,
      total,
      succeeded: g.succeeded,
      failed: g.failed,
      success_rate: total > 0 ? g.succeeded / total : null,
      status: total > 0 ? 'sufficient_data' : 'insufficient_data',
    };
  });
}
