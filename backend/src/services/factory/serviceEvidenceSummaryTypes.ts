/**
 * serviceEvidenceSummaryTypes - the CONTRACT of `GET /api/admin/factory/services/evidence-summary` (package spec 1F).
 *
 * One Zod schema, and the TypeScript types are inferred from it, so the route validates exactly the shape the
 * service builds and the frontend (SV3) reads. A field added here without the builder filling it fails the route's
 * boundary check in dev/test, which is the point.
 *
 * NULL MEANS "UNKNOWN", NEVER ZERO. `openOpportunityMatches` is null when the live opportunity feed could not be
 * read; `decideNow.demandWithoutProof.count` and `decideNow.openFitGaps.count` are null when their inputs could not
 * be read. A 0 always means "we looked and found none".
 */
import { z } from 'zod';

export const SUMMARY_STATUS = ['active', 'growth', 'all'] as const;
export type SummaryStatus = typeof SUMMARY_STATUS[number];

/** Ids lists inside decideNow are capped so the payload stays bounded; `count` is always the full number. */
export const DECIDE_NOW_ID_CAP = 50;

const sourceKind = z.enum(['inside', 'outside']);

export const HeadlineMetricSchema = z.object({ label: z.string(), value: z.string().nullable(), verified: z.boolean() });

export const EvidenceCaseStudySchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string().nullable(),
  sourceKind,
  industry: z.string().nullable(),
  year: z.number().int().nullable(),
  status: z.string().nullable(),
  headlineMetric: HeadlineMetricSchema.nullable(),
});
export type EvidenceCaseStudy = z.infer<typeof EvidenceCaseStudySchema>;

export const EvidenceServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  status: z.enum(['active', 'growth', 'retired']),
  naicsCodes: z.array(z.string()),
  keywords: z.array(z.string()),
  insideCount: z.number().int().min(0),
  outsideCount: z.number().int().min(0),
  suggestedCount: z.number().int().min(0),
  newestEvidenceYear: z.number().int().nullable(),
  industries: z.array(z.object({ industry: z.string(), count: z.number().int().min(1) })),
  evidenceScore: z.number().int().min(0).max(100),
  evidenceTier: z.enum(['proven', 'emerging', 'thin', 'none']),
  freshness: z.number().int().min(0),
  openOpportunityMatches: z.number().int().min(0).nullable(),
  caseStudies: z.array(EvidenceCaseStudySchema),
});
export type EvidenceService = z.infer<typeof EvidenceServiceSchema>;

export const IntakeSummaryItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string().nullable(),
  status: z.string(),
  sourceKind,
  industry: z.string().nullable(),
  createdAt: z.union([z.date(), z.string()]).nullable(),
  keywords: z.array(z.string()),
  analysisError: z.string().nullable(),
  suggestions: z.array(z.object({
    linkId: z.string(), serviceId: z.string(), serviceName: z.string(), matchScore: z.number().nullable(), rationale: z.string().nullable(),
  })),
});
export type IntakeSummaryItem = z.infer<typeof IntakeSummaryItemSchema>;

export const GrowthPointSchema = z.object({
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/),
  servicesAdded: z.number().int().min(0),
  servicesTotal: z.number().int().min(0),
  linksConfirmed: z.number().int().min(0),
  linksTotal: z.number().int().min(0),
});
export type GrowthPoint = z.infer<typeof GrowthPointSchema>;

const bucket = z.object({ count: z.number().int().min(0), ids: z.array(z.string()) });
const nullableBucket = z.object({ count: z.number().int().min(0).nullable(), ids: z.array(z.string()) });

export const FitGapSchema = z.object({
  qualificationKey: z.string(),
  title: z.string().nullable(),
  buyer: z.string().nullable(),
  closeDate: z.string(),
  capabilityId: z.string(),
  name: z.string(),
  assessment: z.enum(['partial', 'new']),
  matchedServiceId: z.string().nullable(),
});
export type FitGap = z.infer<typeof FitGapSchema>;

export const DecideNowSchema = z.object({
  blockedCaseStudies: bucket,
  demandWithoutProof: nullableBucket,
  staleServices: bucket,
  openFitGaps: z.object({ count: z.number().int().min(0).nullable(), items: z.array(FitGapSchema) }),
});
export type DecideNow = z.infer<typeof DecideNowSchema>;

export const OpportunityFeedSchema = z.object({
  /** live = Opportunity Pulse answered; snapshot = only the curated fallback was available; unavailable = it threw. */
  source: z.enum(['live', 'snapshot', 'unavailable']),
  openCount: z.number().int().min(0).nullable(),
});
export type OpportunityFeedInfo = z.infer<typeof OpportunityFeedSchema>;

export const EvidenceSummarySchema = z.object({
  status: z.enum(SUMMARY_STATUS),
  generatedAt: z.string(),
  services: z.array(EvidenceServiceSchema),
  intake: z.array(IntakeSummaryItemSchema),
  industryMatrix: z.object({
    industries: z.array(z.string()),
    cells: z.array(z.object({ serviceId: z.string(), industry: z.string(), count: z.number().int().min(1) })),
  }),
  growthSeries: z.array(GrowthPointSchema),
  decideNow: DecideNowSchema,
  opportunityFeed: OpportunityFeedSchema,
});
export type EvidenceSummary = z.infer<typeof EvidenceSummarySchema>;
