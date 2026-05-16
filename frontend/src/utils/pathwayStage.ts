/**
 * pathwayStage — calm qualitative tag classifying each domain into one
 * of four canonical operational-pathway stages.
 *
 * Operational Pathways + Cory Priority Embedding Sprint, 2026-05-16.
 *
 * Why this exists: with the horizontal flow strip removed (Operational
 * Priority Topology Sprint, 2026-05-15), the operator gained dynamic
 * priority-first ordering but lost the canonical-sequence anchor — they
 * could see "what's most urgent" but not "where this sits in the flow".
 * This helper surfaces that anchor as a small editorial tag in each
 * domain row's title bar, without bringing the strip back.
 *
 * Four stages, mapped from the existing DomainKey union (no new data):
 *
 *   Entry        — public_pages, intake
 *   Coordination — lead_intelligence, marketing, ai_intelligence
 *   Execution    — execution, student_lifecycle
 *   Reporting    — reporting, project_admin
 *
 * The catch-all 'other' domain has no meaningful pathway position and
 * the helper returns null — honest silence rather than an "Other" tag.
 */
import type { DomainKey } from './bpDomainClassifier';

export type PathwayStage = 'Entry' | 'Coordination' | 'Execution' | 'Reporting';

const STAGE_BY_DOMAIN: Record<DomainKey, PathwayStage | null> = {
  public_pages: 'Entry',
  intake: 'Entry',
  lead_intelligence: 'Coordination',
  marketing: 'Coordination',
  ai_intelligence: 'Coordination',
  execution: 'Execution',
  student_lifecycle: 'Execution',
  reporting: 'Reporting',
  project_admin: 'Reporting',
  other: null,
};

export function pathwayStageLabel(domainKey: DomainKey): PathwayStage | null {
  return STAGE_BY_DOMAIN[domainKey] ?? null;
}
