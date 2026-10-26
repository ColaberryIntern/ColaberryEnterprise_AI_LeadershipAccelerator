import type { CertDomain, CertReadiness } from '../../../services/certPrepApi';

/**
 * Cert Prep's single recommended action, derived from the weakest sampled domain. One source for the Cert Prep page and the campus
 * room's board (v6 D1), so the two can never disagree. It is always the baseline diagnostic or practice: Cert Prep has nothing to
 * do with the weekly knowledge checks (Ali, 2026-10-24).
 */
export interface CertNextAction { label: string; mode: 'diagnostic' | 'practice'; domainIds?: string[] }

export function certPrepNextAction(readiness: CertReadiness | null, domains: CertDomain[]): CertNextAction {
  if (!readiness || readiness.overall_state === 'not_measured') {
    return { label: 'Take the baseline diagnostic', mode: 'diagnostic', domainIds: undefined };
  }
  const sampled = readiness.domain_breakdown.filter((d) => d.answered > 0 && d.knowledge_pct !== null);
  const unsampled = readiness.domain_breakdown.find((d) => d.answered === 0);
  // An untouched domain outranks a merely weak one: breadth is what moves
  // confidence, and confidence is what gates the badge.
  if (unsampled) {
    const label = domains.find((d) => d.domain_id === unsampled.domain_id)?.label ?? unsampled.domain_id;
    return { label: `Practise ${label}`, mode: 'practice', domainIds: [unsampled.domain_id] };
  }
  if (sampled.length > 0) {
    const weakest = sampled.reduce((a, b) => ((a.knowledge_pct ?? 1) <= (b.knowledge_pct ?? 1) ? a : b));
    const label = domains.find((d) => d.domain_id === weakest.domain_id)?.label ?? weakest.domain_id;
    return { label: `Drill ${label}`, mode: 'practice', domainIds: [weakest.domain_id] };
  }
  return { label: 'Start a practice set', mode: 'practice', domainIds: undefined };
}
