/**
 * govOpportunityV1.zod — the BOUNDARY validator for Opportunity Pulse's `GET /api/v2/gov-opportunities/:id`
 * response `.data`. The pinned JSON Schema (govOpportunityV1.schema.json, LF sha256 26ff667e…) is the contract
 * of record; this Zod schema validates the fields the Enterprise qualification/approval actually BIND to, so a
 * malformed or shape-drifted payload is rejected (→ 'malformed' source state) before it can back a decision.
 *
 * It deliberately requires the load-bearing fields — canonicalOpportunityId, sourceSnapshotVersion, and the
 * documents block INCLUDING items[] (role + retrieval.status), which the evidence-coverage gate reads — and is
 * lenient about fields we do not consume. On success the RAW `.data` is bound to the snapshot (not the parsed
 * output), so no producer field is silently dropped from the stored evidence.
 */
import { z } from 'zod';

export const CANONICAL_ID_RE = /^op:gov:[0-9a-f]{32}$/;

const evidenceRefOrNull = z
  .object({ docId: z.string() })
  .partial()
  .nullable()
  .optional();

const documentItem = z.object({
  docId: z.string(),
  filename: z.string(),
  role: z.enum(['rfi', 'draft_pws', 'final_pws_sow', 'solicitation', 'amendment', 'attachment', 'pricing_sheet', 'terms', 'other']),
  retrieval: z.object({
    status: z.enum(['downloaded', 'listed_only', 'failed', 'not_attempted']),
    method: z.string().optional(),
    retrievedAt: z.string().nullable().optional(),
    failureReason: z.string().nullable().optional(),
  }),
});

const requirement = z.object({
  id: z.string(),
  text: z.string(),
  category: z.string(),
  applicability: z.enum(['always', 'conditional', 'not_applicable', 'unknown']),
  applicabilityEvidenceRef: evidenceRefOrNull,
  responsibleParty: z.string(),
  dueStage: z.enum(['submission', 'award', 'delivery', 'unknown']),
  bindingStatus: z.string(),
  evidenceRef: evidenceRefOrNull,
});

/** The subset of gov-opportunity.v1 the adapter validates. Unmodeled fields are ignored (Zod strips on parse; the
 *  adapter binds the RAW data, so nothing is lost). */
export const govOpportunityV1Schema = z.object({
  schemaVersion: z.literal('gov-opportunity.v1'),
  canonicalOpportunityId: z.string().regex(CANONICAL_ID_RE),
  sourceSnapshotVersion: z.number(),
  notice: z.object({}).loose(),
  publisher: z.object({}).loose(),
  deadline: z.object({}).loose(),
  value: z.object({}).loose(),
  documents: z.object({
    coverage: z.enum(['complete', 'complete_for_this_notice', 'partial', 'none_published', 'inaccessible', 'unknown']),
    accessBarrier: z.string().nullable().optional(),
    counts: z.object({
      listed: z.number(), downloaded: z.number(), parsed: z.number(), inaccessible: z.number(),
    }),
    items: z.array(documentItem),
  }),
  requirements: z.array(requirement),
  sourceAssessment: z.object({}).loose(),
  companyQualification: z.null(),
  legacy: z.object({}).loose().optional(),
  sourceAvailability: z
    .object({ status: z.enum(['available', 'degraded', 'unavailable']) })
    .loose()
    .nullable()
    .optional(),
}).loose();

export type GovOpportunityV1Parsed = z.infer<typeof govOpportunityV1Schema>;

/** The load-bearing keys this validator REQUIRES — asserted (in the schema pin test) to be a subset of the
 *  vendored JSON Schema's top-level required[], so the boundary validator and the pinned contract agree. */
export const ZOD_REQUIRED_TOP_LEVEL: readonly string[] = [
  'schemaVersion', 'canonicalOpportunityId', 'sourceSnapshotVersion',
  'notice', 'publisher', 'deadline', 'value', 'documents', 'requirements',
  'sourceAssessment', 'companyQualification',
];
