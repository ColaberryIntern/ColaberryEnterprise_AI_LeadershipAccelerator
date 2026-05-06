/**
 * coverageScorer — unified completion percentage across all cap sources.
 *
 * Replaces the three scattered formulas in the legacy code:
 *   - reqCoverage = matchedR / totalR * 100         (greenfield)
 *   - pageVisualCompletionPct = verified / 5 * 100  (Page BP)
 *   - evidence_completion_pct                        (brownfield)
 *
 * The legacy code picks one based on cap type. This scorer fuses them
 * into a single output AND tells consumers which source produced the value.
 *
 * Ordering of preference:
 *   1. user_status === 'verified' → 100 (user assertion always wins)
 *   2. is_page_bp                  → page visual review %
 *   3. has requirements (totalR>0) → requirements coverage %
 *   4. has evidence_completion_pct → evidence-based %
 *   5. otherwise                   → 0
 */
import type { EngineCapabilityInput, Score0to100 } from '../types/systemState.types';

export type CoverageSource =
  | 'user_verified'
  | 'page_visual_review'
  | 'requirements_coverage'
  | 'evidence_based'
  | 'no_signal';

export interface CoverageBreakdown {
  readonly value: Score0to100;
  readonly source: CoverageSource;
  readonly reasoning: string;
}

const PAGE_CATEGORIES = ['layout', 'accessibility', 'responsiveness', 'interaction', 'content'] as const;

export function scoreCoverage(cap: EngineCapabilityInput): CoverageBreakdown {
  if (cap.user_status === 'verified') {
    return {
      value: 100,
      source: 'user_verified',
      reasoning: 'User explicitly marked this capability as verified.',
    };
  }

  if (cap.is_page_bp) {
    const scores = cap.ui_element_map?.category_scores || {};
    const verifiedCount = PAGE_CATEGORIES.filter(k => scores[k]?.verified).length;
    const value = Math.round((verifiedCount / PAGE_CATEGORIES.length) * 100);
    return {
      value,
      source: 'page_visual_review',
      reasoning: `${verifiedCount} of ${PAGE_CATEGORIES.length} visual review categories verified.`,
    };
  }

  if (cap.total_requirements > 0) {
    const value = Math.round((cap.matched_requirements / cap.total_requirements) * 100);
    return {
      value,
      source: 'requirements_coverage',
      reasoning: `${cap.matched_requirements} of ${cap.total_requirements} requirements matched.`,
    };
  }

  const evidence = cap.last_execution?.evidence_completion_pct;
  if (typeof evidence === 'number' && evidence > 0) {
    const mentions = cap.last_execution?.progress_md_mentions;
    return {
      value: clamp(evidence),
      source: 'evidence_based',
      reasoning: `Evidence-based completion: ${evidence}% (${mentions ?? 0} PROGRESS.md mentions, ${countLinkedFiles(cap)} linked files).`,
    };
  }

  return {
    value: 0,
    source: 'no_signal',
    reasoning: 'No coverage signals available — capability needs requirements, visual review, or evidence.',
  };
}

function countLinkedFiles(cap: EngineCapabilityInput): number {
  return (cap.linked_backend_services || []).length
    + (cap.linked_frontend_components || []).length
    + (cap.linked_agents || []).length;
}

function clamp(n: number): Score0to100 {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
