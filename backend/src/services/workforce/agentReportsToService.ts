import AiAgent from '../../models/AiAgent';
import OrgMember from '../../models/OrgMember';
import { resolveReportsToChainWithTrail } from '../ticketCreatorReportsToResolver';
import { buildReportsToView } from '../reese/agentDetailService';
import type { AgentDetailResult } from '../reese/agentDetailEmployeeFacts';

// Reports-to editor (2026-09-30) — Dhee, on the Agent Detail dashboard: "I should be able to
// change who Reese reports to. The functionality already exists - it's just not on this
// dashboard." Verified that belief was wrong (no real, HTTP-reachable write path existed
// anywhere — only boot-time self-heal and disposable one-off scripts ever touched these
// columns). setAgentReportsTo() is the real, deliberate mechanism, mirroring
// agentAbacOverrideService.ts's setAgentAbacOverride() shape exactly: the new value and its
// real audit-trail fields (reports_to_set_at/_set_by) always land in the SAME update.
//
// Validated BEFORE persisting, not after: a candidate value is dry-run through the same
// resolveReportsToChainWithTrail() the real ticket-creation gate uses, and rejected if it
// doesn't resolve to a real human — moving "verify the chain actually resolves" from this
// skill's own documentation into real enforced code.
//
// THAT PARAGRAPH WAS TRUE OF THE 'agent' BRANCH AND FALSE OF THE 'human' ONE, until AF6.4.
// `resolveReportsToChainWithTrail` handles the two asymmetrically: for `type: 'agent'` it does an
// `AiAgent.findByPk` and returns null on a dangling target, but for `type: 'human'` it RETURNS THE
// ID IT WAS HANDED with no `org_members` lookup at all. So `resolvedHumanId` was truthy for any
// non-empty string, the guard below passed, and an agent could be given an accountable human who
// does not exist. T16 hit this and worked around it with a caller-side pre-flight check, which
// protects one caller and no others.
//
// The existence check is therefore added HERE, on the write path, and deliberately NOT in the
// resolver: the resolver is also the read path for `enforceReportsToGate`, the live
// ticket-creation gate. Adding a lookup there would start rejecting ticket creation for any agent
// whose chain already ends at a missing human — changing live behaviour to fix a latent defect.
// Validating on write stops new bad rows without touching what already reads.
//
// Measured in production 2026-10-15 before the change: of 10 agents with a human target, ALL 10
// resolve to a real org_members row and ZERO dangle. So this closes a latent hole rather than
// repairing existing damage, and it matters now because Release Zero (AF3.1) is about to set
// reports_to on ten new agents.

export type ReportsToType = 'human' | 'agent';

export interface AgentReportsToResult {
  agentId: string;
  agentName: string;
  found: boolean;
  updated: boolean;
  reportsTo: AgentDetailResult['reports_to'];
  setAt: Date | null;
  setBy: string | null;
  error: string | null;
}

function notUpdated(agentId: string, agentName: string, error: string, found = true): AgentReportsToResult {
  return { agentId, agentName, found, updated: false, reportsTo: null, setAt: null, setBy: null, error };
}

export async function setAgentReportsTo(
  agentId: string,
  reportsToType: ReportsToType,
  reportsToId: string,
  setByEmail: string,
): Promise<AgentReportsToResult> {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) {
    return notUpdated(agentId, agentId, 'Agent not found', false);
  }

  if (reportsToType === 'agent' && reportsToId === agent.id) {
    return notUpdated(agent.id, agent.agent_name, 'An agent cannot report to itself');
  }

  // A HUMAN TARGET MUST EXIST. The resolver below cannot tell us this: its 'human' branch echoes
  // the id back, so it would accept any non-empty string. Checked against org_members, which is
  // what `reports_to_id` means for type 'human' (see ticketCreatorReportsToResolver's own header).
  if (reportsToType === 'human') {
    const human = await OrgMember.findByPk(reportsToId);
    if (!human) {
      return notUpdated(
        agent.id,
        agent.agent_name,
        'That human target does not exist — no org_members row has that id',
      );
    }
  }

  // Dry-run the proposed chain through the real resolver before writing anything — the
  // same shape resolveReportsToChainWithTrail()'s own existing test suite already proves
  // it accepts (a plain object, not a persisted model instance).
  const candidate = {
    agent_name: agent.agent_name,
    reports_to_type: reportsToType,
    reports_to_id: reportsToId,
  } as AiAgent;
  const { resolvedHumanId } = await resolveReportsToChainWithTrail(candidate);
  if (!resolvedHumanId) {
    return notUpdated(
      agent.id,
      agent.agent_name,
      reportsToType === 'human'
        ? 'That target does not resolve to a real human record'
        : 'That agent\'s own reports-to chain does not resolve to a real human — fix its chain first, or pick a different manager',
    );
  }

  const setAt = new Date();
  try {
    await agent.update({
      reports_to_type: reportsToType,
      reports_to_id: reportsToId,
      reports_to_set_at: setAt,
      reports_to_set_by: setByEmail,
    });
  } catch (err: any) {
    return notUpdated(agent.id, agent.agent_name, err?.message || 'Failed to update reports-to');
  }

  const reportsTo = await buildReportsToView(agent);
  return {
    agentId: agent.id,
    agentName: agent.agent_name,
    found: true,
    updated: true,
    reportsTo,
    setAt,
    setBy: setByEmail,
    error: null,
  };
}
