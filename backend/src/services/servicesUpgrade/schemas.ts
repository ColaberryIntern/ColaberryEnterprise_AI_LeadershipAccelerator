/**
 * Services Upgrade (Basecamp list 10506775132) - the contracts every SV0 artifact is validated against.
 *
 * These files are the evidence chain the later tickets build on (SV1 schema, SV2 import, SV4 Gov AI prompt), so each
 * one is Zod-validated before it is written and again by a test that loads the committed file. A malformed artifact
 * fails the build instead of quietly seeding a wrong catalog.
 */
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const strList = z.array(z.string().max(200));

// ---------------------------------------------------------------- SV0.1 catalog snapshot
export const CatalogServiceRow = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  category: z.string().nullable(),
  keywords: strList,
  naicsCodes: strList,
  pscCodes: strList,
  pastPerformance: z.string().nullable(),
  status: z.enum(['active', 'growth', 'retired']),
  updatedAt: z.string().nullable(),
});
export type CatalogServiceRow = z.infer<typeof CatalogServiceRow>;

export const CatalogSnapshot = z.object({
  kind: z.literal('service_catalog_snapshot'),
  takenOn: isoDate,
  tenantId: z.string().uuid(),
  rowCount: z.number().int().min(0),
  rows: z.array(CatalogServiceRow),
}).refine((s) => s.rowCount === s.rows.length, { message: 'rowCount must equal rows.length' });
export type CatalogSnapshot = z.infer<typeof CatalogSnapshot>;

// ---------------------------------------------------------------- SV0.1 capability-fit baseline
export const FitCapability = z.object({
  id: z.string(),
  name: z.string(),
  assessment: z.enum(['have', 'partial', 'new']),
  matchedServiceId: z.string().nullable(),
  rationale: z.string(),
});

export const PursuitBaseline = z.object({
  canonicalOpportunityId: z.string().min(1),
  /** stored_vetting = what the live Gov AI already said (gov_ai_vettings.fit_json); fresh_run = this script's call. */
  source: z.enum(['stored_vetting', 'fresh_run']),
  title: z.string().nullable(),
  requirementCount: z.number().int().min(1).nullable(),
  verdict: z.string().nullable(),
  coveragePct: z.number().nullable(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
  capabilities: z.array(FitCapability),
});
export type PursuitBaseline = z.infer<typeof PursuitBaseline>;

export const CapabilityFitBaseline = z.object({
  kind: z.literal('capability_fit_baseline'),
  takenOn: isoDate,
  activeServiceCount: z.number().int().min(0),
  selectionRule: z.string(),
  pursuits: z.array(PursuitBaseline),
});
export type CapabilityFitBaseline = z.infer<typeof CapabilityFitBaseline>;

// ---------------------------------------------------------------- SV0.2 whitepaper manifest
export const ManifestOutcome = z.object({
  text: z.string().min(1),
  numbers: z.array(z.string()),
  page: z.number().int().min(1),
});

export const ManifestRecord = z.object({
  sourceFile: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  basecampUploadId: z.number().int().nullable(),
  title: z.string().min(1),
  industry: z.string().min(1),
  clientDescriptor: z.string(),
  problem: z.string(),
  solution: z.string(),
  capabilities: z.array(z.string()).min(1),
  techStack: z.array(z.string()),
  outcomes: z.array(ManifestOutcome),
  pageCount: z.number().int().min(1),
  gaps: z.array(z.string()),
  extractedBy: z.literal('deterministic'),
});
export type ManifestRecord = z.infer<typeof ManifestRecord>;

export const Manifest = z.object({
  kind: z.literal('whitepaper_manifest'),
  version: z.literal(1),
  recordCount: z.number().int(),
  records: z.array(ManifestRecord),
}).refine((m) => m.recordCount === m.records.length, { message: 'recordCount must equal records.length' })
  .refine((m) => new Set(m.records.map((r) => r.sourceFile)).size === m.records.length, { message: 'sourceFile must be unique' });
export type Manifest = z.infer<typeof Manifest>;

// ---------------------------------------------------------------- SV0.3 taxonomy v2
export const TaxonomyService = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/),
  action: z.enum(['UPDATE', 'NEW', 'MERGE']),
  existingIds: z.array(z.string().uuid()),
  name: z.string().min(3).max(120),
  category: z.string().min(2).max(80),
  description: z.string().min(20),
  keywords: z.array(z.string().min(2).max(60)),
  naics: z.array(z.object({ code: z.string(), title: z.string() })),
  psc: z.array(z.object({ code: z.string(), title: z.string() })),
  industries: z.array(z.string()),
  capabilities: z.array(z.string()),
  caseStudies: z.array(z.string()),
  thinEvidence: z.boolean(),
  rationale: z.string().min(10),
});
export type TaxonomyService = z.infer<typeof TaxonomyService>;

export const TaxonomyV2 = z.object({
  kind: z.literal('services_taxonomy_v2'),
  proposedOn: isoDate,
  status: z.enum(['proposed', 'approved']),
  basedOnSnapshot: z.string(),
  basedOnManifest: z.string(),
  services: z.array(TaxonomyService),
  untouchedExistingIds: z.array(z.string().uuid()),
  noHome: z.array(z.object({ sourceFile: z.string(), reason: z.string().min(5) })),
});
export type TaxonomyV2 = z.infer<typeof TaxonomyV2>;
