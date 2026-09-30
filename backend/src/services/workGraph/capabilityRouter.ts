// ─── Capability Router ────────────────────────────────────────────────────────
// ProofDesk Work Graph (Milestone 3). Replaces ticketAgentDispatcher.ts's old
// `AGENT_MAPPINGS.find(...)` first-match-wins lookup with a scored selection over
// the capability registry (spec §6.2): 30% capability fit / 20% verified success /
// 15% workload / 10% cost / 10% duration / 10% domain familiarity / 5% recent-
// failure penalty.
//
// Hard gates run BEFORE scoring — an ineligible agent can never win on score alone:
//   1. capability match (entry.match(ticket))
//   2. enabled === true
//   3. risk-tier ceiling (ticket.risk_tier, if set, must be <= entry.maxRiskTier)
//   4. resource-scope match (only applies when the caller passes an explicit
//      resourceScope — ticket-level dispatch doesn't set one, so this gate is a
//      no-op for the current dispatcher call site; it exists for future
//      work-unit-level dispatch, per the execution contract's scope)
//
// `selectAgent()` returns null when zero candidates survive the hard gates —
// this is the exact same shape as the old AGENT_MAPPINGS.find() returning
// undefined, so ticketAgentDispatcher.ts's existing "no agent mapping found"
// fallback path needs no behavioral change (see T009).

import { Op } from 'sequelize';
import { AgentRun } from '../../models';
import { CAPABILITY_REGISTRY, type CapabilityEntry } from './capabilityRegistry';

const RISK_TIER_ORDER = ['R0', 'R1', 'R2', 'R3', 'R4'] as const;

function riskTierIndex(tier: string): number {
  const idx = RISK_TIER_ORDER.indexOf(tier as any);
  return idx === -1 ? 0 : idx;
}

function riskTierAllowed(ticketRiskTier: string | null | undefined, maxRiskTier: string): boolean {
  if (!ticketRiskTier) return true; // no risk tier set on the ticket = unrestricted
  return riskTierIndex(ticketRiskTier) <= riskTierIndex(maxRiskTier);
}

/** Minimal glob match: '*' anywhere matches unrestricted; a single trailing '*'
 * matches a prefix. No other wildcard forms are needed by any current seed entry. */
function matchesResourceScope(pattern: string, resourceKey: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) return resourceKey.startsWith(pattern.slice(0, -1));
  return pattern === resourceKey;
}

const WEIGHTS = {
  capabilityFit: 0.3,
  verifiedSuccess: 0.2,
  workload: 0.15,
  cost: 0.1,
  duration: 0.1,
  domainFamiliarity: 0.1,
  recentFailurePenalty: 0.05,
};

// Neutral defaults for an agent with zero run history — a brand-new capability
// entry should be scoreable, not zeroed out just because nothing has run yet.
const NEUTRAL_SUCCESS_RATE = 0.7;
const NEUTRAL_DURATION_SCORE = 0.7;
const NEUTRAL_DOMAIN_FAMILIARITY = 0.5;
const SUCCESS_RATE_WINDOW = 50;
const DURATION_WINDOW = 20;
const WORKLOAD_SATURATION = 5;
const DURATION_REFERENCE_MS = 60_000; // 1 minute reference point for normalization

async function computeVerifiedSuccessScore(agentName: string): Promise<number> {
  const recentRuns = await AgentRun.findAll({
    where: { agent_name: agentName, status: { [Op.in]: ['success', 'failed'] } },
    order: [['created_at', 'DESC']],
    limit: SUCCESS_RATE_WINDOW,
  });
  if (recentRuns.length === 0) return NEUTRAL_SUCCESS_RATE;
  const successCount = recentRuns.filter((r: any) => r.status === 'success').length;
  return successCount / recentRuns.length;
}

async function computeWorkloadScore(agentName: string): Promise<number> {
  const runningCount = await AgentRun.count({ where: { agent_name: agentName, status: 'running' } });
  return 1 - Math.min(runningCount / WORKLOAD_SATURATION, 1);
}

function computeCostScore(entry: CapabilityEntry): number {
  return 1 / Math.max(entry.costTier, 0.001);
}

async function computeDurationScore(agentName: string): Promise<number> {
  const recentRuns = await AgentRun.findAll({
    where: { agent_name: agentName, status: 'success', duration_ms: { [Op.ne]: null } },
    order: [['created_at', 'DESC']],
    limit: DURATION_WINDOW,
  });
  if (recentRuns.length === 0) return NEUTRAL_DURATION_SCORE;
  const avgMs =
    recentRuns.reduce((sum: number, r: any) => sum + (r.duration_ms || 0), 0) / recentRuns.length;
  return 1 / (1 + avgMs / DURATION_REFERENCE_MS);
}

async function computeDomainFamiliarityScore(agentName: string, ticketType?: string | null): Promise<number> {
  if (!ticketType) return NEUTRAL_DOMAIN_FAMILIARITY;
  const count = await AgentRun.count({
    where: { agent_name: agentName, status: 'success' },
    include: [{ association: 'ticket', where: { type: ticketType }, attributes: [] }],
  });
  if (count === 0) return NEUTRAL_DOMAIN_FAMILIARITY;
  return Math.min(count / 10, 1);
}

async function computeRecentFailurePenalty(agentName: string, ticketType?: string | null): Promise<number> {
  if (!ticketType) return 0;
  const mostRecent = await AgentRun.findOne({
    where: { agent_name: agentName },
    include: [{ association: 'ticket', where: { type: ticketType }, attributes: [] }],
    order: [['created_at', 'DESC']],
  });
  return mostRecent && (mostRecent as any).status === 'failed' ? 1 : 0;
}

export interface CapabilitySelectionOptions {
  /** Agent names to exclude from consideration (e.g. the agent whose failed run
   * is being retried, when the caller wants a different agent to try next). */
  excludeAgents?: string[];
  /** Resource key the caller intends to act on. Only entries whose
   * resourceScopePattern matches survive the scope gate when this is provided. */
  resourceScope?: string;
}

export interface AgentMapping {
  match: (ticket: any) => boolean;
  agent_name: string;
  execute: (ticket: any) => Promise<any>;
}

export interface CapabilitySelectionResult {
  mapping: AgentMapping;
  agentName: string;
  score: number;
  breakdown: Record<string, number>;
}

/**
 * Selects the best-scored eligible agent capability for a ticket. Returns null
 * when no registry entry survives the hard gates (capability match, enabled,
 * risk-tier ceiling, resource scope) — mirrors the old AGENT_MAPPINGS.find()
 * returning undefined, so callers' existing "no agent mapping found" handling
 * needs no change.
 */
export async function selectAgent(
  ticket: any,
  opts?: CapabilitySelectionOptions
): Promise<CapabilitySelectionResult | null> {
  const excluded = new Set(opts?.excludeAgents || []);

  const eligible = CAPABILITY_REGISTRY.filter((entry) => {
    if (!entry.enabled) return false;
    if (excluded.has(entry.agent_name)) return false;
    if (!entry.match(ticket)) return false;
    if (!riskTierAllowed(ticket?.risk_tier, entry.maxRiskTier)) return false;
    if (opts?.resourceScope && !matchesResourceScope(entry.resourceScopePattern, opts.resourceScope)) {
      return false;
    }
    return true;
  });

  if (eligible.length === 0) return null;

  let best: { entry: CapabilityEntry; score: number; breakdown: Record<string, number> } | null = null;

  for (const entry of eligible) {
    const [verifiedSuccess, workload, duration, domainFamiliarity, recentFailurePenalty] = await Promise.all([
      computeVerifiedSuccessScore(entry.agent_name),
      computeWorkloadScore(entry.agent_name),
      computeDurationScore(entry.agent_name),
      computeDomainFamiliarityScore(entry.agent_name, ticket?.type),
      computeRecentFailurePenalty(entry.agent_name, ticket?.type),
    ]);
    const cost = computeCostScore(entry);
    const capabilityFit = entry.specificity;

    const score =
      WEIGHTS.capabilityFit * capabilityFit +
      WEIGHTS.verifiedSuccess * verifiedSuccess +
      WEIGHTS.workload * workload +
      WEIGHTS.cost * cost +
      WEIGHTS.duration * duration +
      WEIGHTS.domainFamiliarity * domainFamiliarity -
      WEIGHTS.recentFailurePenalty * recentFailurePenalty;

    const breakdown = {
      capabilityFit,
      verifiedSuccess,
      workload,
      cost,
      duration,
      domainFamiliarity,
      recentFailurePenalty,
    };

    if (!best || score > best.score) {
      best = { entry, score, breakdown };
    }
  }

  const winner = best!;
  return {
    mapping: {
      match: winner.entry.match,
      agent_name: winner.entry.agent_name,
      execute: winner.entry.execute,
    },
    agentName: winner.entry.agent_name,
    score: winner.score,
    breakdown: winner.breakdown,
  };
}
