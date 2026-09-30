/**
 * Pure progression math — no I/O, exhaustively unit-testable. This is the
 * highest-risk logic in the system (it decides promotions), so it lives here
 * as pure functions and the engines just persist the results.
 */

/** Half-saturation constant for the confidence curve (evidence weight at 0.5). */
export const CONFIDENCE_HALF_SATURATION = 3;

/**
 * Confidence in a competency domain from accumulated evidence weight.
 * Saturating (Michaelis-Menten) curve: 0 at no evidence, 0.5 at weight=K,
 * asymptotic to 1. Monotonic + bounded — more evidence never lowers
 * confidence, and it can never exceed 1. Watching content contributes tiny
 * weight; validated evidence contributes real weight.
 */
export function computeConfidence(totalWeight: number, k: number = CONFIDENCE_HALF_SATURATION): number {
  if (!(totalWeight > 0)) return 0;
  const c = totalWeight / (totalWeight + k);
  return Math.min(1, Math.max(0, c));
}

export interface DomainConfidence {
  domain_id: string;
  confidence: number;   // 0..1
  weight: number;       // domain weight toward readiness
}

/** Architect Readiness = weight-normalized mean of domain confidences (0..1). */
export function computeReadiness(domains: DomainConfidence[]): number {
  const totalWeight = domains.reduce((s, d) => s + (d.weight || 0), 0);
  if (totalWeight <= 0) return 0;
  const weighted = domains.reduce((s, d) => s + d.confidence * (d.weight || 0), 0);
  return Math.min(1, Math.max(0, weighted / totalWeight));
}

export interface XpTotals { learning: number; builder: number; community: number; }

/** Sum an append-only XP event log into per-stream totals. */
export function aggregateXp(events: Array<{ stream: string; amount: number }>): XpTotals {
  const totals: XpTotals = { learning: 0, builder: 0, community: 0 };
  for (const e of events) {
    if (e.stream === 'learning') totals.learning += e.amount;
    else if (e.stream === 'builder') totals.builder += e.amount;
    else if (e.stream === 'community') totals.community += e.amount;
  }
  return totals;
}

export interface PromotionInput {
  competencies: Array<{ domain_id: string; confidence: number }>;
  evidence_count: number;
  artifact_count: number;
  github_count: number;
  evaluation_count: number;
  implementation_count: number;
  attendance_count: number;
  ai_approved: boolean;
}

export interface LevelGate {
  slug: string;
  required_competencies: Array<{ domain_id: string; min_confidence: number }>;
  min_evidence: number;
  min_artifacts: number;
  min_github: number;
  min_evaluations: number;
  min_implementation: number;
  min_attendance: number;
  requires_ai_approval: boolean;
}

export interface PromotionVerdict {
  eligible: boolean;
  gaps: string[];
}

/**
 * Promotion gate — NEVER passes on XP alone. Returns eligibility + the exact
 * gaps that block it, so the UI can show a student what's left. Every gate
 * that fails adds a gap; eligible === (gaps.length === 0).
 */
export function evaluatePromotion(input: PromotionInput, gate: LevelGate): PromotionVerdict {
  const gaps: string[] = [];

  for (const req of gate.required_competencies || []) {
    const have = input.competencies.find((c) => c.domain_id === req.domain_id)?.confidence ?? 0;
    if (have < req.min_confidence) {
      gaps.push(`competency ${req.domain_id}: ${have.toFixed(2)} < ${req.min_confidence}`);
    }
  }
  const checks: Array<[number, number, string]> = [
    [input.evidence_count, gate.min_evidence, 'evidence'],
    [input.artifact_count, gate.min_artifacts, 'artifacts'],
    [input.github_count, gate.min_github, 'github'],
    [input.evaluation_count, gate.min_evaluations, 'evaluations'],
    [input.implementation_count, gate.min_implementation, 'implementation'],
    [input.attendance_count, gate.min_attendance, 'attendance'],
  ];
  for (const [have, min, label] of checks) {
    if (have < min) gaps.push(`${label}: ${have} < ${min}`);
  }
  if (gate.requires_ai_approval && !input.ai_approved) {
    gaps.push('ai_approval: pending');
  }

  return { eligible: gaps.length === 0, gaps };
}
