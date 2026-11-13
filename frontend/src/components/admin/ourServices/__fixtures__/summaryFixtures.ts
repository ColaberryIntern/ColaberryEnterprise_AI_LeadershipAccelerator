/**
 * Synthetic evidence-summary fixtures for the Our Services tests. Every name is invented ("Service A",
 * "Case Study 1"); the repository is public, so no real client, buyer or bid appears here.
 */
import type { EvidenceService, EvidenceSummary, IntakeSummaryItem } from '../../../../services/ourServicesApi';

export const svc = (over: Partial<EvidenceService> = {}): EvidenceService => ({
  id: 'svc-a', name: 'Service A', category: 'Data', status: 'active', naicsCodes: ['541511'], keywords: ['dashboards'],
  insideCount: 1, outsideCount: 1, suggestedCount: 0, newestEvidenceYear: 2026,
  industries: [{ industry: 'Industry One', count: 2 }], evidenceScore: 75, evidenceTier: 'proven', freshness: 20,
  openOpportunityMatches: 4,
  caseStudies: [
    { id: 'cs-1', title: 'Case Study 1', slug: null, sourceKind: 'inside', industry: 'Industry One', year: 2026, status: 'approved', headlineMetric: { label: 'Cycle time', value: 'faster', verified: true } },
    { id: 'cs-2', title: 'Case Study 2', slug: null, sourceKind: 'outside', industry: 'Industry One', year: 2025, status: 'draft', headlineMetric: null },
  ],
  ...over,
});

export const intakeItem = (over: Partial<IntakeSummaryItem> = {}): IntakeSummaryItem => ({
  id: 'cs-9', title: 'Case Study 9', slug: null, status: 'draft', sourceKind: 'outside', industry: 'Industry Two', createdAt: null,
  keywords: ['monitoring', 'alerting'], analysisError: null,
  suggestions: [
    { linkId: 'link-strong', serviceId: 'svc-a', serviceName: 'Service A', matchScore: 6, rationale: 'category + keywords' },
    { linkId: 'link-weak', serviceId: 'svc-b', serviceName: 'Service B', matchScore: 1, rationale: 'one keyword' },
  ],
  ...over,
});

export const summary = (over: Partial<EvidenceSummary> = {}): EvidenceSummary => ({
  status: 'all', generatedAt: '2026-11-13T15:00:00.000Z',
  services: [
    svc(),
    svc({ id: 'svc-b', name: 'Service B', category: 'Build', insideCount: 0, outsideCount: 0, newestEvidenceYear: null, industries: [], evidenceScore: 0, evidenceTier: 'none', freshness: 0, openOpportunityMatches: 9, caseStudies: [] }),
    svc({ id: 'svc-c', name: 'Service C', status: 'growth', category: 'Build', insideCount: 0, outsideCount: 0, newestEvidenceYear: null, industries: [], evidenceScore: 0, evidenceTier: 'none', freshness: 0, openOpportunityMatches: 2, caseStudies: [] }),
  ],
  intake: [intakeItem()],
  industryMatrix: { industries: ['Industry One'], cells: [{ serviceId: 'svc-a', industry: 'Industry One', count: 2 }] },
  growthSeries: [{ quarter: '2026-Q3', servicesAdded: 2, servicesTotal: 2, linksConfirmed: 1, linksTotal: 1 }, { quarter: '2026-Q4', servicesAdded: 1, servicesTotal: 3, linksConfirmed: 1, linksTotal: 2 }],
  decideNow: {
    blockedCaseStudies: { count: 1, ids: ['cs-9'] },
    demandWithoutProof: { count: 1, ids: ['svc-b'] },
    staleServices: { count: 0, ids: [] },
    openFitGaps: { count: 1, items: [{ qualificationKey: 'op-1', title: 'Pursuit One', buyer: 'Buyer One', closeDate: '2026-11-23', capabilityId: 'CAP-01', name: 'Performance Monitoring', assessment: 'new', matchedServiceId: 'svc-b' }] },
  },
  opportunityFeed: { source: 'live', openCount: 12 },
  ...over,
});

/** The honest empty state: a tenant with no services, no links and no pursuits. */
export const emptySummary = (): EvidenceSummary => summary({
  services: [], intake: [], industryMatrix: { industries: [], cells: [] }, growthSeries: [],
  decideNow: { blockedCaseStudies: { count: 0, ids: [] }, demandWithoutProof: { count: 0, ids: [] }, staleServices: { count: 0, ids: [] }, openFitGaps: { count: 0, items: [] } },
  opportunityFeed: { source: 'snapshot', openCount: null },
});
