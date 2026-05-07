/**
 * uxPressureEscalation — produce a single `UXPressureEscalationReport`
 * the dashboard / live badges read.
 *
 * Combines:
 *   - the adaptive weight factor (from adaptivePriorityWeighting)
 *   - persistent friction trends
 *   - regression severity
 *   - drop-off increases
 *
 * Output: an integer pressure 0-100 + a list of escalation reasons + the
 * recommended action.
 *
 * Phase 7 §7.
 */
import type { BehavioralPressureInputs } from './adaptivePriorityWeighting';

export interface UXPressureEscalationReport {
  /** 0-100. 0 = calm; 100 = critical. */
  readonly pressure_level: number;
  readonly tier: 'calm' | 'elevated' | 'urgent' | 'critical';
  readonly reasons: ReadonlyArray<string>;
  readonly recommended_action: string;
  readonly applied_weight_factor: number;
}

export function computeUXPressure(
  inputs: BehavioralPressureInputs,
  weightFactor: number,
): UXPressureEscalationReport {
  let pressure = 0;
  const reasons: string[] = [];

  const friction = inputs.friction_pressure ?? 0;
  if (friction >= 60) {
    pressure += 35;
    reasons.push(`Project friction at ${friction}/100 — sustained struggle across sessions.`);
  } else if (friction >= 40) {
    pressure += 20;
    reasons.push(`Project friction at ${friction}/100 — early signs of struggle.`);
  } else if (friction >= 20) {
    pressure += 8;
    reasons.push(`Project friction at ${friction}/100.`);
  }

  const worst = inputs.worst_cognition_score ?? 100;
  if (worst < 40) {
    pressure += 25;
    reasons.push(`Worst-route cognition score is ${worst}/100 — at least one page is failing.`);
  } else if (worst < 60) {
    pressure += 12;
    reasons.push(`Worst-route cognition score is ${worst}/100.`);
  }

  if (inputs.has_recent_regression) {
    pressure += 20;
    reasons.push('UX regression detected on at least one route since last snapshot.');
  }

  if ((inputs.unresolved_high_contradictions ?? 0) >= 3) {
    pressure += 15;
    reasons.push(`${inputs.unresolved_high_contradictions} unresolved high-severity contradictions outstanding.`);
  } else if ((inputs.unresolved_high_contradictions ?? 0) > 0) {
    pressure += 8;
    reasons.push(`${inputs.unresolved_high_contradictions} unresolved high-severity contradiction(s) outstanding.`);
  }

  if ((inputs.rage_routes ?? 0) >= 3) {
    pressure += 12;
    reasons.push(`${inputs.rage_routes} routes show rage_clicks — users repeatedly retrying actions.`);
  }
  if ((inputs.loop_routes ?? 0) >= 2) {
    pressure += 10;
    reasons.push(`${inputs.loop_routes} routes show navigation loops — users can't progress.`);
  }
  if ((inputs.abandon_routes ?? 0) >= 3) {
    pressure += 15;
    reasons.push(`${inputs.abandon_routes} routes show form abandonment — workflows dying mid-flight.`);
  }

  pressure = Math.min(100, Math.round(pressure));

  let tier: UXPressureEscalationReport['tier'];
  let recommended_action: string;
  if (pressure < 20) {
    tier = 'calm';
    recommended_action = 'No escalation. Continue normal queue processing.';
  } else if (pressure < 50) {
    tier = 'elevated';
    recommended_action = 'Visual / UX queue priority shifted earlier. Run a visual review session on the worst route.';
  } else if (pressure < 80) {
    tier = 'urgent';
    recommended_action = 'Block non-UX deployments until top-pressure UX tasks are addressed. Generate prompt for the worst-route critique session.';
  } else {
    tier = 'critical';
    recommended_action = 'Halt feature work. Triage the regression / friction sources. Add a moratorium until pressure drops below 50.';
  }

  return {
    pressure_level: pressure,
    tier,
    reasons,
    recommended_action,
    applied_weight_factor: weightFactor,
  };
}
