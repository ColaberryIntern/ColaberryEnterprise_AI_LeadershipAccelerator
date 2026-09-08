import { PendingGoalChangeConfirmation } from '../models/AgentManagerConversation';
import { AgentGoalMetricKey, AgentGoalComparison } from '../models/AgentGoal';
import { createGoal } from './agentGoalService';

/**
 * managerGoalIntentService — Reese Agentic AI Employee mission, Capability 8,
 * first real slice of the mission's 12-intent manager classifier
 * (ASK/INSTRUCT/CORRECT/APPROVE/REJECT/COACH/SCHEDULE/ASSIGN_WORK/
 * CHANGE_GOAL/CHANGE_STATE/REPORT_DATA_ISSUE/QUARANTINE_METRIC/
 * RESTORE_METRIC) — QUARANTINE_METRIC/RESTORE_METRIC already real via
 * managerReliabilityIntentService.ts; this adds CHANGE_GOAL, following that
 * module's exact shape (deterministic keyword detection -> confirmation
 * card -> confirmed-reply-gated write) but riding the new generic
 * `pending_intent_confirmation` column instead of a dedicated one, per the
 * Checkpoint B header comment's own deferred-scope note.
 *
 * Deliberately keyword-based, not an LLM classifier, for the same reason as
 * managerReliabilityIntentService.ts: a false positive here only ever
 * produces a confirmation CARD, never a write (the manager declines or
 * ignores it) — so a loose, fast, fully deterministic and unit-testable
 * heuristic is the right tradeoff. A false negative just falls through to
 * the normal conversational LLM reply, same as today.
 *
 * Deliberately conservative: requires BOTH a real goal-change trigger
 * phrase AND a metric this system actually knows how to track (cost or
 * ticket count) AND a clearly parseable numeric target. If any of those is
 * missing, this returns null rather than guessing at a number or a
 * metric — never fabricates a target value.
 */

const GOAL_TRIGGER_PHRASES = [
  'set a goal', 'set the goal', 'set your goal', 'change the goal', 'change your goal',
  'update the goal', 'update your goal', 'goal should be', 'goal to be', 'new goal',
];

const AT_LEAST_PHRASES = ['at least', 'or more', 'or above', 'minimum of', 'no less than'];

export interface DetectedGoalChangeIntent {
  metricKey: AgentGoalMetricKey;
  comparison: AgentGoalComparison;
  targetValue: number;
  reason: string;
}

function parseDollarAmount(lower: string): number | null {
  const match = lower.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const value = parseFloat(match[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

function parseWholeNumber(lower: string): number | null {
  const match = lower.match(/(\d+)/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

/** Pure, deterministic. Returns null unless a goal-change trigger phrase, a
 * known metric keyword, and a real parseable numeric target all appear. */
export function detectChangeGoalIntent(messageText: string): DetectedGoalChangeIntent | null {
  const lower = messageText.toLowerCase();
  if (!GOAL_TRIGGER_PHRASES.some((p) => lower.includes(p))) return null;

  const comparison: AgentGoalComparison = AT_LEAST_PHRASES.some((p) => lower.includes(p)) ? 'at_least' : 'at_most';

  if (lower.includes('cost') || lower.includes('spend') || lower.includes('budget')) {
    const targetValue = parseDollarAmount(lower);
    if (targetValue === null) return null;
    return { metricKey: 'monthly_cost_usd', comparison, targetValue, reason: messageText.trim() };
  }

  if (lower.includes('ticket')) {
    const targetValue = parseWholeNumber(lower);
    if (targetValue === null) return null;
    return { metricKey: 'open_ticket_count', comparison, targetValue, reason: messageText.trim() };
  }

  // A real goal-change trigger fired but no known metric was named — don't
  // guess which metric the manager meant.
  return null;
}

function metricLabel(metricKey: AgentGoalMetricKey): string {
  return metricKey === 'monthly_cost_usd' ? 'monthly cost' : 'open ticket count';
}

function targetLabel(metricKey: AgentGoalMetricKey, targetValue: number): string {
  return metricKey === 'monthly_cost_usd' ? `$${targetValue.toLocaleString()}` : `${targetValue}`;
}

/** Restates what was understood, states the real effect (a real, tracked,
 * visible target — matches the mission's "durable-state-changing intent
 * gets a preview before it takes effect" requirement), before anything is
 * written. */
export function buildGoalConfirmationCardText(detected: DetectedGoalChangeIntent): string {
  const comparisonLabel = detected.comparison === 'at_most' ? 'at most' : 'at least';
  return (
    `I understood: you want to set a new goal — you said "${detected.reason}"\n\n` +
    `Here's what I'd do: set my ${metricLabel(detected.metricKey)} goal to ${comparisonLabel} ` +
    `${targetLabel(detected.metricKey, detected.targetValue)}. This becomes a real, tracked target on my profile, ` +
    `visible to you and anyone else reviewing my performance.\n\n` +
    `Reply "confirm" to set it, or tell me the right numbers and I'll ask again.`
  );
}

export function toPendingGoalConfirmation(detected: DetectedGoalChangeIntent): PendingGoalChangeConfirmation {
  return {
    intentType: 'CHANGE_GOAL',
    metricKey: detected.metricKey,
    comparison: detected.comparison,
    targetValue: detected.targetValue,
    reason: detected.reason,
    detectedAt: new Date().toISOString(),
  };
}

/**
 * Executes a confirmed pending goal change for real — the one place this
 * flow actually writes durable state. Reuses agentGoalService.createGoal()
 * wholesale (Checkpoint D infrastructure) rather than a second, drifting
 * write path.
 */
export async function applyConfirmedGoalChange(
  agentId: string,
  pending: PendingGoalChangeConfirmation,
  confirmedByEmail: string,
  confirmedByOrgMemberId: string | null,
): Promise<{ summary: string }> {
  const metricKey = pending.metricKey as AgentGoalMetricKey;
  await createGoal(agentId, confirmedByOrgMemberId, confirmedByEmail, metricKey, pending.comparison, pending.targetValue);
  const comparisonLabel = pending.comparison === 'at_most' ? 'at most' : 'at least';
  return {
    summary: `Done. New goal set: ${metricLabel(metricKey)} ${comparisonLabel} ${targetLabel(metricKey, pending.targetValue)}. I'll track it from here.`,
  };
}
