/**
 * serviceEvidenceSummaryBuild - PURE assembly of the evidence summary (package spec 1F) from already-loaded facts.
 * No DB, no clock (the caller passes `now`), no IO, so every number here is unit-testable.
 *
 *   services[]      per service: confirmed inside/outside counts, suggested count, newest proof year, industries,
 *                   evidenceScore/tier (serviceEvidenceScore), open-opportunity matches (null = unknown), and the
 *                   confirmed case-study cards.
 *   industryMatrix  service x industry counts of confirmed proof.
 *   growthSeries    per calendar quarter (UTC), services added (created_at) and links confirmed (decided_at), plus
 *                   running totals. Built ONLY from real timestamps: no quarter before the first real event, at most
 *                   the last GROWTH_QUARTERS quarters (earlier history is folded into the running totals).
 *   decideNow       blocked case studies (= Intake: no confirmed link here, so the must-link rule blocks publishing),
 *                   demand without proof (matched by open opportunities, score 0; null when matches are unknown),
 *                   stale services (has proof, none from this year or last), open Fit gaps with deadlines.
 *
 * Only facts the caller already scoped to the tenant arrive here (see serviceEvidenceLoad's tenancy note).
 */
import { scoreServiceEvidence } from './serviceEvidenceScore';
import type { CaseStudyFact, HeadlineMetric, LinkFact, ServiceFact } from './serviceEvidenceLoad';
import {
  DECIDE_NOW_ID_CAP, EvidenceCaseStudy, EvidenceService, EvidenceSummary, FitGap, GrowthPoint, IntakeSummaryItem,
  OpportunityFeedInfo, SummaryStatus,
} from './serviceEvidenceSummaryTypes';

export const GROWTH_QUARTERS = 12;

export interface SummaryFacts {
  status: SummaryStatus;
  services: ServiceFact[];
  links: LinkFact[];
  caseStudies: Map<string, CaseStudyFact>;
  headlines: Map<string, HeadlineMetric>;
  intake: IntakeSummaryItem[];
  opportunityFeed: OpportunityFeedInfo;
  openMatches: Map<string, number> | null;
  fitGaps: FitGap[] | null;
  now: Date;
}

const quarterOf = (d: Date): { y: number; q: number } => ({ y: d.getUTCFullYear(), q: Math.floor(d.getUTCMonth() / 3) + 1 });
const qIndex = (x: { y: number; q: number }): number => x.y * 4 + (x.q - 1);
const qLabel = (i: number): string => `${Math.floor(i / 4)}-Q${(i % 4) + 1}`;

/** PURE: quarterly series from real timestamps only. Empty when there is no dated event at all. */
export function buildGrowthSeries(serviceDates: Array<Date | null>, linkDates: Array<Date | null>, now: Date): GrowthPoint[] {
  const valid = (ds: Array<Date | null>): number[] => ds.filter((d): d is Date => !!d && Number.isFinite(d.getTime())).map((d) => qIndex(quarterOf(d)));
  const sq = valid(serviceDates);
  const lq = valid(linkDates);
  if (!sq.length && !lq.length) return [];
  const last = qIndex(quarterOf(now));
  const first = Math.max(Math.min(...sq, ...lq), last - GROWTH_QUARTERS + 1);
  const out: GrowthPoint[] = [];
  for (let i = first; i <= last; i++) {
    out.push({
      quarter: qLabel(i),
      servicesAdded: sq.filter((x) => x === i).length, servicesTotal: sq.filter((x) => x <= i).length,
      linksConfirmed: lq.filter((x) => x === i).length, linksTotal: lq.filter((x) => x <= i).length,
    });
  }
  return out;
}

function caseStudyCard(cs: CaseStudyFact, headline: HeadlineMetric | undefined): EvidenceCaseStudy {
  return { id: cs.id, title: cs.title, slug: cs.slug, sourceKind: cs.sourceKind, industry: cs.industry, year: cs.year, status: cs.status, headlineMetric: headline ?? null };
}

function serviceRow(s: ServiceFact, f: SummaryFacts, currentYear: number): EvidenceService {
  const mine = f.links.filter((l) => l.serviceId === s.id && f.caseStudies.has(l.caseStudyId));
  const confirmedIds = [...new Set(mine.filter((l) => l.state === 'confirmed').map((l) => l.caseStudyId))];
  const confirmedSet = new Set(confirmedIds);
  const suggestedCount = new Set(mine.filter((l) => l.state === 'suggested' && !confirmedSet.has(l.caseStudyId)).map((l) => l.caseStudyId)).size;
  const proofs = confirmedIds.map((id) => f.caseStudies.get(id) as CaseStudyFact);
  const insideCount = proofs.filter((p) => p.sourceKind === 'inside').length;
  const outsideCount = proofs.length - insideCount;
  const years = proofs.map((p) => p.year).filter((y): y is number => typeof y === 'number');
  const newestEvidenceYear = years.length ? Math.max(...years) : null;
  const industryCounts = new Map<string, number>();
  for (const p of proofs) if (p.industry) industryCounts.set(p.industry, (industryCounts.get(p.industry) ?? 0) + 1);
  const industries = [...industryCounts.entries()].map(([industry, count]) => ({ industry, count }))
    .sort((a, b) => b.count - a.count || a.industry.localeCompare(b.industry));
  const sc = scoreServiceEvidence({ insideCount, outsideCount, newestEvidenceYear, distinctIndustries: industries.length, currentYear });
  return {
    id: s.id, name: s.name, category: s.category, status: s.status, naicsCodes: s.naicsCodes, keywords: s.keywords,
    insideCount, outsideCount, suggestedCount, newestEvidenceYear, industries,
    evidenceScore: sc.score, evidenceTier: sc.tier, freshness: sc.freshness,
    openOpportunityMatches: f.openMatches ? (f.openMatches.get(s.id) ?? 0) : null,
    caseStudies: proofs.map((p) => caseStudyCard(p, f.headlines.get(p.id)))
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title)),
  };
}

const capIds = (ids: string[]): string[] => ids.slice(0, DECIDE_NOW_ID_CAP);

export function buildEvidenceSummary(f: SummaryFacts): EvidenceSummary {
  const currentYear = f.now.getUTCFullYear();
  const services = f.services.map((s) => serviceRow(s, f, currentYear));

  const industries = [...new Set(services.flatMap((s) => s.industries.map((i) => i.industry)))].sort((a, b) => a.localeCompare(b));
  const cells = services.flatMap((s) => s.industries.map((i) => ({ serviceId: s.id, industry: i.industry, count: i.count })));

  const serviceIds = new Set(f.services.map((s) => s.id));
  const confirmedDates = f.links
    .filter((l) => l.state === 'confirmed' && serviceIds.has(l.serviceId) && f.caseStudies.has(l.caseStudyId))
    .map((l) => l.decidedAt);
  const growthSeries = buildGrowthSeries(f.services.map((s) => s.createdAt), confirmedDates, f.now);

  const demand = f.openMatches
    ? services.filter((s) => (s.openOpportunityMatches ?? 0) > 0 && s.evidenceScore === 0).map((s) => s.id)
    : null;
  const stale = services.filter((s) => s.insideCount + s.outsideCount > 0 && s.freshness < 20).map((s) => s.id);
  const blocked = f.intake.map((i) => i.id);

  return {
    status: f.status,
    generatedAt: f.now.toISOString(),
    services,
    intake: f.intake,
    industryMatrix: { industries, cells },
    growthSeries,
    decideNow: {
      blockedCaseStudies: { count: blocked.length, ids: capIds(blocked) },
      demandWithoutProof: demand ? { count: demand.length, ids: capIds(demand) } : { count: null, ids: [] },
      staleServices: { count: stale.length, ids: capIds(stale) },
      openFitGaps: f.fitGaps ? { count: f.fitGaps.length, items: f.fitGaps.slice(0, DECIDE_NOW_ID_CAP) } : { count: null, items: [] },
    },
    opportunityFeed: f.opportunityFeed,
  };
}
