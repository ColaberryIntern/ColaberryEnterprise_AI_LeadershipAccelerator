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
 * Layer presence is STRICT (2026-05-21):
 *   - hasBackend: linked_backend_services has ≥1 file
 *   - hasFrontend: cap owns its own page (frontend_route set, source='frontend_page',
 *     or is_page_bp=true). linked_frontend_components alone is NOT enough — those
 *     are often keyword-attributed shared utility components.
 *   - hasAgents: ≥1 confirmed capability_agent_maps row, or cap.kind='agent', or
 *     source='agent_explicit'. linked_agents alone is keyword-attribution noise.
 * This matches the per-request usability rule in projectRoutes.ts enrichCapability()
 * so the BP-row dots and the L badge always agree.
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
  // Strict layer-presence rules — must match the per-request usability
  // signal in projectRoutes.ts enrichCapability(). The previous lenient
  // rule counted any linked_* file, which let keyword-attribution noise
  // promote caps to L3/L4 they hadn't actually built. Operator caught
  // this 2026-05-21: Prompt Generation was L3 with 12 keyword-attributed
  // frontend components but no actual page route.
  //   hasFrontend: cap must own a route OR be explicitly a page BP
  //   hasAgents:   confirmed capability_agent_maps row OR explicit kind
  // linked_frontend_components / linked_agents alone are insufficient.
  const hasFrontend = !!cap.frontend_route
    || cap.source === 'frontend_page'
    || !!cap.is_page_bp;
  const hasAgents = (cap._confirmed_agent_count || 0) > 0
    || cap.kind === 'agent'
    || cap.source === 'agent_explicit';

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
      if (!hasFrontend) return 'Add a frontend route or page BP for this cap to reach L3 (linked components alone are not enough).';
      if (coverage < 70) return `Coverage at ${coverage}% — reach 70% to advance to L3.`;
      return 'Frontend and coverage thresholds met — should be at L3 already.';
    case 3:
      if (!hasAgents) return 'Confirm at least one agent via capability_agent_maps to reach L4 (keyword-linked agents alone are not enough).';
      if (coverage < 85) return `Coverage at ${coverage}% — reach 85% to advance to L4.`;
      return 'All thresholds met — should be at L4 already.';
    default:
      return '';
  }
}

function levelToScore(level: MaturityLevel): Score0to100 {
  return [0, 25, 50, 75, 100][level] as Score0to100;
}
