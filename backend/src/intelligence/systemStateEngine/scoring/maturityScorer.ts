/**
 * maturityScorer — unified L0-L4 maturity ladder.
 *
 * Replaces the legacy `enrichCapability` maturity logic that requires
 * reqCoverage > 70 for L3 — which brownfield caps can never reach.
 *
 * NEW LADDER (works for greenfield + brownfield + Page BPs):
 *   L0 Not Started     — no evidence, no files, no review
 *   L1 Prototype       — any layer present OR any coverage > 0
 *   L2 Functional      — backend + (coverage >= 50% OR evidence >= 50%)
 *   L3 Production      — backend + frontend + (coverage >= 70% OR evidence >= 70%)
 *   L4 Autonomous      — backend + frontend + agents + (coverage >= 85% OR evidence >= 85%)
 *
 * Page BPs follow a parallel ladder based on visual review category count:
 *   L0 0 verified
 *   L1 1 verified
 *   L2 2-3 verified
 *   L3 4 verified
 *   L4 5 verified
 */
import type { EngineCapabilityInput, Score0to100 } from '../types/systemState.types';
import { scoreCoverage } from './coverageScorer';

export type MaturityLevel = 0 | 1 | 2 | 3 | 4;

export interface MaturityBreakdown {
  readonly level: MaturityLevel;
  readonly score: Score0to100;     // 0, 25, 50, 75, 100
  readonly label: 'Not Started' | 'Prototype' | 'Functional' | 'Production' | 'Autonomous';
  readonly reasons: ReadonlyArray<string>;
  readonly next_level_gap?: string;
}

const LABELS = ['Not Started', 'Prototype', 'Functional', 'Production', 'Autonomous'] as const;

export function scoreMaturity(cap: EngineCapabilityInput): MaturityBreakdown {
  const reasons: string[] = [];

  if (cap.is_page_bp) {
    return scorePageBPMaturity(cap, reasons);
  }

  const coverage = scoreCoverage(cap).value;
  const hasBackend = (cap.linked_backend_services || []).length > 0;
  const hasFrontend = (cap.linked_frontend_components || []).length > 0 || !!cap.frontend_route;
  const hasAgents = (cap.linked_agents || []).length > 0;

  let level: MaturityLevel = 0;
  let nextGap: string | undefined;

  if (coverage > 0 || hasBackend || hasFrontend || hasAgents) {
    level = 1;
    reasons.push('At least one signal present (files or coverage)');
  }
  if (hasBackend && coverage >= 50) {
    level = 2;
    reasons.push(`Backend present with coverage ${coverage}% >= 50%`);
  }
  if (hasBackend && hasFrontend && coverage >= 70) {
    level = 3;
    reasons.push(`Full-stack with coverage ${coverage}% >= 70%`);
  }
  if (hasBackend && hasFrontend && hasAgents && coverage >= 85) {
    level = 4;
    reasons.push(`Autonomous-tier: all layers with coverage ${coverage}% >= 85%`);
  }

  if (level < 4) {
    nextGap = describeNextLevelGap(level, hasBackend, hasFrontend, hasAgents, coverage);
  }

  return {
    level,
    score: levelToScore(level),
    label: LABELS[level],
    reasons,
    next_level_gap: nextGap,
  };
}

function scorePageBPMaturity(cap: EngineCapabilityInput, reasons: string[]): MaturityBreakdown {
  const scores = cap.ui_element_map?.category_scores || {};
  const verifiedCount = ['layout', 'accessibility', 'responsiveness', 'interaction', 'content']
    .filter(k => scores[k]?.verified).length;

  let level: MaturityLevel = 0;
  if (verifiedCount >= 1) level = 1;
  if (verifiedCount >= 3) level = 2;
  if (verifiedCount >= 4) level = 3;
  if (verifiedCount >= 5) level = 4;

  reasons.push(`Page BP with ${verifiedCount}/5 visual review categories verified`);

  return {
    level,
    score: levelToScore(level),
    label: LABELS[level],
    reasons,
    next_level_gap: verifiedCount < 5
      ? `Verify ${5 - verifiedCount} more visual review categories to reach L${Math.min(4, level + 1)}`
      : undefined,
  };
}

function describeNextLevelGap(
  level: MaturityLevel,
  hasBackend: boolean,
  hasFrontend: boolean,
  hasAgents: boolean,
  coverage: number,
): string {
  switch (level) {
    case 0: return 'Add any backend, frontend, or agent files (or improve coverage above 0%) to reach L1.';
    case 1:
      if (!hasBackend) return 'Add backend services to reach L2.';
      if (coverage < 50) return `Coverage at ${coverage}% — reach 50% to advance to L2.`;
      return 'Coverage and backend present — should be at L2 already (check inputs).';
    case 2:
      if (!hasFrontend) return 'Add frontend pages/components to reach L3.';
      if (coverage < 70) return `Coverage at ${coverage}% — reach 70% to advance to L3.`;
      return 'Frontend and coverage thresholds met — should be at L3 already.';
    case 3:
      if (!hasAgents) return 'Add intelligent agents/automation to reach L4 Autonomous.';
      if (coverage < 85) return `Coverage at ${coverage}% — reach 85% to advance to L4.`;
      return 'All thresholds met — should be at L4 already.';
    default:
      return '';
  }
}

function levelToScore(level: MaturityLevel): Score0to100 {
  return [0, 25, 50, 75, 100][level] as Score0to100;
}
