/**
 * Stale Strategic Initiative Resolution — pure classification rules
 *
 * `strategic_initiatives` rows created before PR #1491 shipped a real path to
 * `completed`/`cancelled` accumulated at `status='proposed'` forever (see
 * ../resolveStaleStrategicInitiatives.ts's header for the full production
 * background). Most of those rows describe an agent's error state/rate, and the
 * agent has since recovered — but nothing ever re-checked. This module is the pure
 * decision logic (no I/O, no DB, no side effects) that classifies one
 * `strategic_initiatives` row into exactly one outcome, given the live agent-health
 * data and retired-agent map the caller already fetched.
 *
 * The health threshold is NOT re-derived here — it is imported directly from
 * `workforceTicketAutoResolver.ts` (PR #1482), which already re-checks the identical
 * condition `workforceIntelligenceEngine.ts` uses to open a ticket in the first
 * place (`errorRate > 20 && error_count >= 10` means unhealthy). Reusing the same
 * constants (not re-declaring the numbers a third time) is deliberate — see
 * CLAUDE.md's "extract reusable logic" rule and this repo's own precedent of a
 * dedicated sync-guard test in workforceTicketAutoResolverThresholdSync.test.ts for
 * why re-declaring the same magic numbers in a second place is a drift risk this repo
 * has already paid for once.
 */

import {
  WORKFORCE_HIGH_ERROR_RATE_THRESHOLD_PCT,
  WORKFORCE_HIGH_ERROR_RATE_MIN_COUNT,
} from '../../services/company/workforceTicketAutoResolver';

export { WORKFORCE_HIGH_ERROR_RATE_THRESHOLD_PCT, WORKFORCE_HIGH_ERROR_RATE_MIN_COUNT };

/** Minimal live `ai_agents` shape this module needs — callers project down to this. */
export interface AgentHealthSnapshot {
  status: string;
  enabled: boolean;
  run_count: number;
  error_count: number;
}

export type ResolutionOutcome =
  | 'healthy_completed'
  | 'retired_completed'
  | 'dept_alert_cancelled'
  | 'still_unhealthy'
  | 'explicitly_excluded'
  | 'ambiguous_skipped';

/** Outcomes that leave the row untouched — no target status is ever set for these. */
const UNTOUCHED_OUTCOMES: ReadonlySet<ResolutionOutcome> = new Set([
  'still_unhealthy',
  'explicitly_excluded',
  'ambiguous_skipped',
]);

export function isUntouchedOutcome(outcome: ResolutionOutcome): boolean {
  return UNTOUCHED_OUTCOMES.has(outcome);
}

export interface ClassificationResult {
  outcome: ResolutionOutcome;
  /** null for every untouched outcome — never set opportunistically. */
  target_initiative_status: 'completed' | 'cancelled' | null;
  target_ticket_status: 'done' | 'cancelled' | null;
  /** Parsed agent name, when the title matched an agent-shaped pattern; else null. */
  agent_name: string | null;
  /**
   * Human-readable evidence. For resolved outcomes this is exactly the text that
   * gets appended to the initiative's `description` and used to build the ticket
   * comment (see staleInitiativeResolutionArtifacts.ts). For untouched outcomes it
   * is a diagnostic-only string for the dry-run report — never written to the DB.
   */
  evidence_note: string;
}

export interface InitiativeTitleRow {
  id: string;
  title: string;
}

const DEPT_ALERT_RE = /^(.+) department triggered \d+ alerts in 24h$/;
const AGENT_ERROR_STATE_RE = /^(.+) is in error state$/;
const AGENT_ERROR_RATE_RE = /^(.+) has \d+% error rate$/;

/**
 * The one row the operator explicitly flagged as a still-open design question
 * ("does a confirmed-fixed agent's lifetime-cumulative error-rate metric ever
 * reset?") — matched by agent name + title SHAPE, not by the literal percentage in
 * the title, because that number is a stale snapshot (the title says 84%, the live
 * rate at classification time may already read differently — confirmed live this
 * run: 83.45%). Matching on the literal percentage would silently stop excluding the
 * row the moment its rate ticks to a different integer.
 */
const EXCLUDED_AGENT_NAME = 'OpenclawLearningOptimizationAgent';

export function computeErrorRatePct(runCount: number, errorCount: number): number {
  return runCount > 0 ? (errorCount / runCount) * 100 : 0;
}

/** Mirrors workforceTicketAutoResolver.ts's isStillHighError() exactly (not exported there — re-implemented as the identical one-line comparison over the shared imported constants). */
export function isUnhealthy(runCount: number, errorCount: number): boolean {
  const rate = computeErrorRatePct(runCount, errorCount);
  return rate > WORKFORCE_HIGH_ERROR_RATE_THRESHOLD_PCT && errorCount >= WORKFORCE_HIGH_ERROR_RATE_MIN_COUNT;
}

function classifyAgentByHealth(
  agentName: string,
  agentHealthByName: Map<string, AgentHealthSnapshot>,
  retiredAgents: Record<string, string>,
): ClassificationResult {
  if (Object.prototype.hasOwnProperty.call(retiredAgents, agentName)) {
    const health = agentHealthByName.get(agentName);
    const reason = retiredAgents[agentName];
    const liveNote = health
      ? `ai_agents.status='${health.status}', enabled=${health.enabled}`
      : 'no matching ai_agents row found live (retired rows are kept, not deleted, per agentRegistrySeed.ts\'s enforceRetiredAgents() — flagging the mismatch rather than assuming)';
    return {
      outcome: 'retired_completed',
      target_initiative_status: 'completed',
      target_ticket_status: 'done',
      agent_name: agentName,
      evidence_note:
        `Agent '${agentName}' was retired (agentRegistrySeed.ts RETIRED_AGENTS: "${reason}"). ` +
        `Confirmed live: ${liveNote}. Resolved as completed rather than left open against an ` +
        `agent no longer in service — not treated as a "healthy" resolution, per the retirement ` +
        `being the actual reason, not a recovered error rate.`,
    };
  }

  const health = agentHealthByName.get(agentName);
  if (!health) {
    return {
      outcome: 'ambiguous_skipped',
      target_initiative_status: null,
      target_ticket_status: null,
      agent_name: agentName,
      evidence_note: `Agent name '${agentName}' not found in ai_agents and is not a known retired agent — left untouched, ambiguous.`,
    };
  }

  const rate = computeErrorRatePct(health.run_count, health.error_count);
  if (isUnhealthy(health.run_count, health.error_count)) {
    return {
      outcome: 'still_unhealthy',
      target_initiative_status: null,
      target_ticket_status: null,
      agent_name: agentName,
      evidence_note:
        `Agent '${agentName}' still unhealthy: run_count=${health.run_count}, ` +
        `error_count=${health.error_count}, error_rate=${rate.toFixed(2)}% ` +
        `(threshold: >${WORKFORCE_HIGH_ERROR_RATE_THRESHOLD_PCT}% AND error_count>=${WORKFORCE_HIGH_ERROR_RATE_MIN_COUNT}) ` +
        `— left proposed, genuinely still an open finding.`,
    };
  }

  return {
    outcome: 'healthy_completed',
    target_initiative_status: 'completed',
    target_ticket_status: 'done',
    agent_name: agentName,
    evidence_note:
      `Agent '${agentName}' current health checked against the same real-time threshold ` +
      `workforceIntelligenceEngine.ts / workforceTicketAutoResolver.ts (PR #1482) use ` +
      `(unhealthy = error rate > ${WORKFORCE_HIGH_ERROR_RATE_THRESHOLD_PCT}% AND error_count >= ${WORKFORCE_HIGH_ERROR_RATE_MIN_COUNT}): ` +
      `run_count=${health.run_count}, error_count=${health.error_count}, ` +
      `error_rate=${rate.toFixed(2)}%, status='${health.status}' — below threshold, resolved. ` +
      `This reflects the metric observed at resolution time, not a verified root-cause fix — ` +
      `matching workforceTicketAutoResolver.ts's own honesty boundary.`,
  };
}

/**
 * Classifies one `proposed` strategic_initiatives row. Pure function: given the
 * row's title, a map of live agent health (already fetched by the caller, keyed by
 * agent_name), and the retired-agents map (agentRegistrySeed.ts's RETIRED_AGENTS,
 * passed in rather than imported at call time so this stays fully unit-testable with
 * synthetic fixtures), returns exactly one outcome. Every branch is total — every
 * title either matches a recognized pattern or falls through to `ambiguous_skipped`,
 * never throws.
 */
export function classifyInitiative(
  row: InitiativeTitleRow,
  agentHealthByName: Map<string, AgentHealthSnapshot>,
  retiredAgents: Record<string, string>,
): ClassificationResult {
  const deptMatch = row.title.match(DEPT_ALERT_RE);
  if (deptMatch) {
    return {
      outcome: 'dept_alert_cancelled',
      target_initiative_status: 'cancelled',
      target_ticket_status: 'cancelled',
      agent_name: null,
      evidence_note:
        `24-hour observation window expired, no longer actionable — historical record only. ` +
        `This finding described a specific past 24h alert count for "${deptMatch[1]}"; no live ` +
        `re-check applies the way an agent's current error rate does.`,
    };
  }

  const errorRateMatch = row.title.match(AGENT_ERROR_RATE_RE);
  if (errorRateMatch) {
    const agentName = errorRateMatch[1];
    if (agentName === EXCLUDED_AGENT_NAME) {
      return {
        outcome: 'explicitly_excluded',
        target_initiative_status: null,
        target_ticket_status: null,
        agent_name: agentName,
        evidence_note:
          `Explicitly excluded per operator instruction: whether a confirmed-fixed agent's ` +
          `lifetime-cumulative error-rate metric ever resets (vs. a rolling window) is an open ` +
          `design question not yet answered. Left untouched on purpose — not swept up by the ` +
          `general health check even though it shares this agent's name with other rows.`,
      };
    }
    return classifyAgentByHealth(agentName, agentHealthByName, retiredAgents);
  }

  const errorStateMatch = row.title.match(AGENT_ERROR_STATE_RE);
  if (errorStateMatch) {
    return classifyAgentByHealth(errorStateMatch[1], agentHealthByName, retiredAgents);
  }

  return {
    outcome: 'ambiguous_skipped',
    target_initiative_status: null,
    target_ticket_status: null,
    agent_name: null,
    evidence_note:
      `Title "${row.title}" does not match any recognized agent-health-check or ` +
      `department-alert-window pattern — left untouched, ambiguous.`,
  };
}
