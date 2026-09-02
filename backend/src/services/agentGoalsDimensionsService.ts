import AiAgent from '../models/AiAgent';
import AiAgentActivityLog from '../models/AiAgentActivityLog';
import { getAgentPermission } from './agentPermissionService';

// AI Workforce Management, Checkpoint E — Trust Before Intelligence
// Workspace. The live 5-dimension GOALS score (governance, observability,
// availability, lexicon, solid — TBI's own "GOALS" acronym) already exists
// and is real, but only for the 12 agents mapped into the synthetic
// Workforce OS roster: trustMetricsService.ts::getAgentDetail(slug) reads
// its "governance"/"lexicon" evidence from that roster's employee record
// (ops_domain/department), which the earlier Checkpoint A research flagged
// as unsafe to reuse directly for real-agent data outside that roster.
//
// This is the same PATTERN (TARGET_ARCHITECTURE.md's own guiding
// constraint: reuse the pattern, not the rows), reimplemented generically
// against any real AiAgent — governance from the real, agent_name-keyed
// getAgentPermission() (safe default for an unlisted agent, not a
// roster-only lookup), lexicon from AiAgent.category (a real persisted
// field on every agent, not a synthetic-roster property), and
// observability/availability/solid from the same real, already
// agent_id-generic AiAgentActivityLog query the roster-keyed version
// itself uses. The roster-keyed function is untouched — this is an
// additive, parallel implementation, not a refactor of it.

export interface AgentGoalsDimension {
  key: 'governance' | 'observability' | 'availability' | 'lexicon' | 'solid';
  label: string;
  score: number;
  source: 'live' | 'fixed';
  evidence: string;
}

export interface AgentGoalsResult {
  goals: AgentGoalsDimension[];
  goalsOverall: number;
}

const RECENT_LOG_LIMIT = 20;

export async function computeAgentGoalsDimensions(agent: AiAgent): Promise<AgentGoalsResult> {
  const permission = getAgentPermission(agent.agent_name);
  const recent = await AiAgentActivityLog.findAll({
    where: { agent_id: agent.id },
    order: [['created_at', 'DESC']],
    limit: RECENT_LOG_LIMIT,
  });

  const withTrace = recent.filter((r) => r.trace_id).length;
  const failed = recent.filter((r) => r.result === 'failed').length;
  const observabilityScore = recent.length ? Math.max(1, Math.round((withTrace / recent.length) * 5)) : 3;
  const solidScore = recent.length ? Math.max(1, 5 - Math.round((failed / recent.length) * 4)) : 5;
  const availabilityScore = !agent.enabled ? 1 : agent.trigger_type === 'on_demand' ? 5 : recent.length > 0 ? 5 : 2;

  const goals: AgentGoalsDimension[] = [
    {
      key: 'governance',
      label: 'Governance',
      score: 5,
      source: 'fixed',
      evidence: `Tier ${permission.tier}, scoped to ${permission.allowedTables.join(', ') || '(no direct write tables)'}. Evaluated through the real ABAC chokepoint (agentAuthorizationService.ts), currently shadow-mode repo-wide — see this agent's own authorization_summary for the real verdict counts, never assumed enforced from the tier alone.`,
    },
    {
      key: 'observability',
      label: 'Observability',
      score: observabilityScore,
      source: 'live',
      evidence: `${withTrace}/${recent.length} of the last ${recent.length} logged actions carry a trace_id.`,
    },
    {
      key: 'availability',
      label: 'Availability',
      score: availabilityScore,
      source: 'live',
      evidence: agent.enabled
        ? `Enabled · trigger ${agent.trigger_type || 'unknown'}${agent.schedule ? ` (${agent.schedule})` : ''}.`
        : 'Disabled — will not run until enabled.',
    },
    {
      key: 'lexicon',
      label: 'Lexicon',
      score: 4,
      source: 'fixed',
      evidence: `Domain category: "${agent.category || 'uncategorized'}" (AiAgent.category, a real persisted field — not a synthetic-roster lookup).`,
    },
    {
      key: 'solid',
      label: 'Solid',
      score: solidScore,
      source: 'live',
      evidence: `${failed}/${recent.length} of the last ${recent.length} logged actions failed.`,
    },
  ];

  const goalsOverall = Math.round((goals.reduce((sum, g) => sum + g.score, 0) / goals.length) * 10) / 10;
  return { goals, goalsOverall };
}
