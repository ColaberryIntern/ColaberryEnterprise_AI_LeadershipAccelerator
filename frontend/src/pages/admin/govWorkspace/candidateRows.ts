import type { ExtractedRequirementCandidate, ReqItemCategory, RequirementItem } from '../../../services/factoryApi';

export interface CandidateRowDefaults { checked: boolean; applicability: 'always'; dueStage: 'submission' | 'award' | 'delivery' | 'unknown' }

/**
 * Default each candidate's due stage from its item category when the taxonomy is present (scope to delivery, submit or
 * rule to submission, after_award to award), so a confirmed scope item lands as a build-stage obligation. PURE. Shared by
 * a fresh upload and by the candidates restored from the saved extraction.
 */
export function buildCandidateRows(
  candidates: readonly ExtractedRequirementCandidate[],
  items: readonly RequirementItem[] | null | undefined,
  dueStageForCategory: (c: ReqItemCategory) => CandidateRowDefaults['dueStage'],
): Record<string, CandidateRowDefaults> {
  const catByCand = new Map<string, ReqItemCategory>();
  for (const it of items ?? []) catByCand.set(it.sourceFragments[0]?.reqId ?? it.id, it.category);
  const rows: Record<string, CandidateRowDefaults> = {};
  for (const c of candidates) {
    const cat = catByCand.get(c.id);
    rows[c.id] = { checked: true, applicability: 'always', dueStage: cat ? dueStageForCategory(cat) : 'submission' };
  }
  return rows;
}
