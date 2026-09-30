/**
 * Pure helper: derive per-domain competency weights for a card. A card may
 * carry explicit `[{domain_id, weight}]`; otherwise the type registry's
 * competency list is used at unit weight. Kept pure + testable.
 */
import { resolve as resolveType } from '../timeline/typeRegistry';

export interface DomainWeight { domain_id: string; weight: number; }

export function deriveCompetencyWeights(card: { type: string; competencies?: unknown }): DomainWeight[] {
  const c = card.competencies;
  if (Array.isArray(c) && c.length > 0 && typeof c[0] === 'object' && c[0] !== null && 'domain_id' in (c[0] as object)) {
    return (c as Array<{ domain_id: string; weight?: number }>).map((x) => ({
      domain_id: x.domain_id,
      weight: Number(x.weight) || 1,
    }));
  }
  const def = resolveType(card.type);
  return (def?.competencies || []).map((d) => ({ domain_id: d, weight: 1 }));
}
