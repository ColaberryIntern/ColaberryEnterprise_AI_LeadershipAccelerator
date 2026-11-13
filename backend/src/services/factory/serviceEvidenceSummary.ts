/**
 * serviceEvidenceSummary - the ONE read that feeds the Our Services evidence page and its Decide Now strip
 * (package spec 1F, SV2.1). READ-ONLY and tenant-scoped.
 *
 * Order matters for tenancy: the tenant's services are resolved first, links are read only INTO that set, and only
 * then are the case studies those links point at loaded (see serviceEvidenceLoad). Another tenant's link through a
 * shared case study is never read, so it can neither raise a count here nor leak a service name.
 *
 * Failure modes:
 *   - catalog / link / case-study reads fail -> throw (the route answers 500 with a fixed sentence). Without them
 *     there is no honest page to show.
 *   - opportunity feed fails or is the snapshot fallback -> openOpportunityMatches null (never 0-as-a-guess).
 *   - vetting read fails -> decideNow.openFitGaps.count null.
 *   - intake read fails -> throws (it is the same tables as above; a partial failure there means the DB is down).
 * Retries: none here; the route is a GET the page can re-request. The feed client has its own timeout + retry.
 * Idempotent by construction: it writes nothing.
 */
import { listIntakeCaseStudies } from '../caseStudy/caseStudyIntakeQueue';
import type { GovOpportunityFeed } from './opportunities/govOpportunity';
import { loadCaseStudyFacts, loadHeadlineMetrics, loadLinksInto, loadTenantServices } from './serviceEvidenceLoad';
import { loadOpenFitGaps, loadOpportunityDemand } from './serviceEvidenceDemand';
import { buildEvidenceSummary } from './serviceEvidenceSummaryBuild';
import type { EvidenceSummary, FitGap, IntakeSummaryItem, SummaryStatus } from './serviceEvidenceSummaryTypes';

/** Intake suggestions shown per card. */
export const INTAKE_SUGGESTIONS_SHOWN = 3;

export interface EvidenceSummaryDeps {
  fetchOpportunities?: () => Promise<GovOpportunityFeed>;
  loadFitGaps?: (tenantId: string, today: string) => Promise<FitGap[] | null>;
  listIntake?: (input: { tenantId: string }) => Promise<IntakeSummaryItem[]>;
  now?: () => Date;
}

async function defaultFetchOpportunities(): Promise<GovOpportunityFeed> {
  const { fetchBestFitOpportunities } = await import('./opportunities/oppPulseClient');
  return fetchBestFitOpportunities();
}

export async function getServiceEvidenceSummary(
  input: { tenantId: string; status?: SummaryStatus },
  deps: EvidenceSummaryDeps = {},
): Promise<EvidenceSummary> {
  const status = input.status ?? 'active';
  const now = (deps.now ?? (() => new Date()))();
  const today = now.toISOString().slice(0, 10);

  const services = await loadTenantServices(input.tenantId, status);
  const links = await loadLinksInto(services.map((s) => s.id), ['confirmed', 'suggested']);
  const caseStudies = await loadCaseStudyFacts([...new Set(links.map((l) => l.caseStudyId))], now.getUTCFullYear());
  const confirmedIds = [...new Set(links.filter((l) => l.state === 'confirmed' && caseStudies.has(l.caseStudyId)).map((l) => l.caseStudyId))];
  const headlines = await loadHeadlineMetrics(confirmedIds);

  const intakeRaw = await (deps.listIntake ?? listIntakeCaseStudies)({ tenantId: input.tenantId });
  const intake: IntakeSummaryItem[] = intakeRaw.map((i) => ({
    id: i.id, title: i.title, slug: i.slug ?? null, status: i.status, sourceKind: i.sourceKind, industry: i.industry ?? null,
    createdAt: i.createdAt ?? null, keywords: i.keywords, analysisError: i.analysisError ?? null,
    suggestions: i.suggestions.slice(0, INTAKE_SUGGESTIONS_SHOWN),
  }));

  const demand = await loadOpportunityDemand(
    services.map((s) => ({ id: s.id, name: s.name, category: s.category, keywords: s.keywords, naicsCodes: s.naicsCodes })),
    today, deps.fetchOpportunities ?? defaultFetchOpportunities,
  );
  const fitGaps = await (deps.loadFitGaps ?? loadOpenFitGaps)(input.tenantId, today);

  return buildEvidenceSummary({
    status, services, links, caseStudies, headlines, intake,
    opportunityFeed: demand.feed, openMatches: demand.byService, fitGaps, now,
  });
}
