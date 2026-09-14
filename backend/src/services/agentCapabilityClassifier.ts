import { AutonomyLevel } from './workforce/agentReactivationService';

// Fleet-wide autonomy-level auto-classification, Phase 1 (2026-09-13) — Ali,
// on Reese's page: "The autonomy level should be set based on the agent's
// capabilities. Can you build a process to detect and categorize the
// agents." Confirmed: auto-set directly, whole fleet.
//
// There is no closed, structured tool taxonomy to classify from — the real
// per-agent capability signal, `AiAgent.tools_granted`, is a free-text array
// of hand-written capability-name strings (one engineer's description of
// what that agent's code actually does), with no shared enum enforcing it.
// Most of the 232 real registered agents (backend/src/services/
// agentRegistrySeed.ts) have no `tools_granted` at all.
//
// Design: a keyword-based classifier takes the HIGHEST-capability signal
// found across an agent's own tools — the same honesty principle Ali
// already endorsed for Reese's R3 risk-tier label (see the real-enforcement
// plan): the level should reflect the most consequential thing an agent can
// actually do, never be softened to dodge review. An agent with no
// `tools_granted` data gets the safe, honest default (`observe`) — never a
// guess from nothing.
//
// Pure and dependency-free by design (no DB, no services) so it's fully
// unit-testable before anything wires it to real data (Phase 2+ of the
// scoped plan: a schema column to distinguish auto vs. manual, a one-time
// backfill, and ongoing re-classification on tools_granted changes).

export interface AgentCapabilityClassification {
  level: AutonomyLevel;
  reason: string;
  matchedTool: string | null;
}

interface KeywordTier {
  level: AutonomyLevel;
  /** Substring match against the tool name, lowercased. Order within a tier
   * doesn't matter; tier order below (highest first) does. */
  keywords: string[];
}

// Highest capability first — the classifier takes the FIRST tier (in this
// order) that matches any tool the agent has, i.e. the max across all tools.
const KEYWORD_TIERS: KeywordTier[] = [
  {
    level: 'communicate',
    keywords: ['send_', 'respond_to_dm', '_sms', '_email', '_call', '_dm', 'post_'],
  },
  {
    level: 'act_audited',
    keywords: [
      'create_', 'update_', 'delete_', 'cancel_', 'resolve_', 'flag_',
      'auto_execute_', 'auto_repair', 'retry_', 'apply_',
    ],
  },
  {
    level: 'suggest',
    keywords: ['propose_', 'identify_', 'generate_'],
  },
  {
    level: 'observe',
    keywords: [
      'read_', 'detect_', 'query_', 'evaluate_', 'assess_', 'analyze_',
      'monitor_', 'scan_',
    ],
  },
];

const DEFAULT_CLASSIFICATION: AgentCapabilityClassification = {
  level: 'observe',
  reason: 'No tools_granted recorded for this agent — the safe, honest default, not a guess.',
  matchedTool: null,
};

function matchTier(tool: string): KeywordTier | null {
  const lower = tool.toLowerCase();
  for (const tier of KEYWORD_TIERS) {
    if (tier.keywords.some((kw) => lower.includes(kw))) return tier;
  }
  return null;
}

const LEVEL_RANK: Record<AutonomyLevel, number> = {
  observe: 0,
  suggest: 1,
  act_audited: 2,
  communicate: 3,
};

/**
 * Classifies one agent's autonomy level from its real, hand-written
 * `tools_granted` list — the highest-capability tier matched by ANY tool in
 * the list. A tool that matches no known keyword is treated as unclassified
 * evidence, not silently ignored evidence toward `observe` — if it's the
 * ONLY tool and it's unrecognized, the agent still gets the safe `observe`
 * default, but the reason says so honestly rather than implying a match.
 */
export function classifyAgentAutonomyLevel(toolsGranted: string[] | null | undefined): AgentCapabilityClassification {
  if (!toolsGranted || toolsGranted.length === 0) return DEFAULT_CLASSIFICATION;

  let best: { tier: KeywordTier; tool: string } | null = null;
  const unmatched: string[] = [];

  for (const tool of toolsGranted) {
    const tier = matchTier(tool);
    if (!tier) {
      unmatched.push(tool);
      continue;
    }
    if (!best || LEVEL_RANK[tier.level] > LEVEL_RANK[best.tier.level]) {
      best = { tier, tool };
    }
  }

  if (best) {
    return {
      level: best.tier.level,
      reason: `Matched "${best.tool}" — highest-capability tool among ${toolsGranted.length} granted.`,
      matchedTool: best.tool,
    };
  }

  return {
    level: 'observe',
    reason: `None of this agent's ${toolsGranted.length} granted tool(s) matched a known capability keyword (${unmatched.join(', ')}) — defaulting to the safe floor, not guessing.`,
    matchedTool: null,
  };
}
