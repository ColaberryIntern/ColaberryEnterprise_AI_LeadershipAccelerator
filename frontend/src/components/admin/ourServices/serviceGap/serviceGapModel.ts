import type { ExpansionDraft, GapCounters, GapDecision, Maturity } from '../../../../services/serviceGapApi';

/**
 * serviceGapModel - PURE helpers for the AI service recommendation UI. Labels, tones and the expansion diff live here
 * so they can be tested without rendering. Tones are restrained on purpose: red/amber only for an actionable gap
 * (a proposed new service, a needed expansion); a match is calm; "insufficient" is neutral, not alarming.
 */
export const DECISION_META: Record<GapDecision, { label: string; icon: string; badge: string }> = {
  MATCH_EXISTING: { label: 'Use existing service', icon: 'ri-links-line', badge: 'bg-success-subtle text-success-emphasis' },
  LINK_GROWTH: { label: 'Growth service covers this', icon: 'ri-seedling-line', badge: 'bg-info-subtle text-info-emphasis' },
  EXPAND_EXISTING: { label: 'Expand an existing service', icon: 'ri-expand-diagonal-line', badge: 'bg-warning-subtle text-warning-emphasis' },
  PROPOSE_NEW: { label: 'New service candidate', icon: 'ri-lightbulb-flash-line', badge: 'bg-danger-subtle text-danger-emphasis' },
  INSUFFICIENT_EVIDENCE: { label: 'Needs more detail', icon: 'ri-question-line', badge: 'bg-secondary-subtle text-secondary-emphasis' },
};

export const MATURITY_LABEL: Record<Maturity, string> = {
  research_concept: 'Research concept', implemented_demo: 'Implemented demo', internally_validated: 'Internally validated',
  client_deployed: 'Client deployed', unknown: 'Maturity unknown',
};

/** What each index measures. Shown as the tooltip/visually-hidden text next to the number: indexes, not probabilities. */
export const SCORE_HELP = {
  existingFit: 'Existing fit: best weighted overlap with a current service (capability, buyer problem, deliverables). A heuristic index, not a probability.',
  novelty: 'Novelty: how different the capability is from every listed service. A heuristic index.',
  readiness: 'Evidence readiness: how solid the source is (maturity and stated outcomes). Not proof of delivery.',
  duplicateRisk: 'Duplicate risk: how close the proposed name is to an existing or retired service.',
} as const;

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * PURE: the service fields after an expansion is applied. The description gets the addition appended once (never
 * twice: applying again is a no-op), keywords are merged case-insensitively. `changed` is false when there is nothing
 * new to write, so the UI can disable "Apply".
 */
export function mergeExpansion(current: { description: string | null; keywords: string[] }, ex: ExpansionDraft): { description: string; keywords: string[]; changed: boolean } {
  const base = (current.description ?? '').trim();
  const add = [ex.descriptionAddition, ex.scopeChange].filter((x): x is string => !!x && !!x.trim()).map((x) => x.trim());
  const missing = add.filter((a) => !base.toLowerCase().includes(a.toLowerCase()));
  const description = [base, ...missing].filter(Boolean).join(' ');
  const have = new Set(current.keywords.map(norm));
  const extra = ex.keywordsToAdd.filter((k) => k.trim() && !have.has(norm(k)));
  const keywords = [...current.keywords, ...extra];
  return { description, keywords, changed: missing.length > 0 || extra.length > 0 };
}

/** PURE: the counter tiles for the opportunities section, in display order. */
export function counterTiles(c: GapCounters, intakeCount: number): Array<{ key: string; label: string; value: number; tone: string }> {
  return [
    { key: 'new', label: 'New service proposals', value: c.newServiceProposals, tone: c.newServiceProposals ? 'text-danger-emphasis' : 'text-secondary' },
    { key: 'expand', label: 'Expand existing', value: c.expandExisting, tone: c.expandExisting ? 'text-warning-emphasis' : 'text-secondary' },
    { key: 'match', label: 'Match existing', value: c.matchExisting + c.linkGrowth, tone: 'text-success-emphasis' },
    { key: 'review', label: 'Needs review', value: c.needsReview, tone: c.needsReview ? 'text-body' : 'text-secondary' },
    { key: 'analyzed', label: `Analyzed of ${intakeCount}`, value: c.analyzed, tone: 'text-body' },
  ];
}
