/**
 * Labeled gov-opportunity.v1 fixtures for development + tests. These are NOT live Opportunity Pulse data — they
 * are fixed, clearly-labeled samples shaped to the pinned contract (contracts/gov-opportunity.v1/schema.json,
 * LF sha256 26ff667e…, OP PR #3 head a530b982 — UNDEPLOYED). The detail client reads these ONLY outside
 * production (env.nodeEnv !== 'production'); in production the client uses the live v2 HTTP adapter and NEVER
 * falls back to fixtures, so production can never approve from fixture data.
 *
 * `sourceSnapshotVersion` is what a qualification binds its approval to (bumping it simulates a changed source).
 * `metaSnapshotVersion` mirrors the producer's HONEST `meta.sourceSnapshotVersion` (null == snapshot unrecorded);
 * when omitted it equals `sourceSnapshotVersion` (recorded). `documents.items[]` mirrors the schema's per-document
 * breakdown (role + retrieval.status), which is what the evidence-coverage gate uses to decide whether the
 * authoritative solicitation + every amendment were actually reviewed.
 */
export type DocumentRole =
  | 'rfi' | 'draft_pws' | 'final_pws_sow' | 'solicitation' | 'amendment' | 'attachment' | 'pricing_sheet' | 'terms' | 'other';
export type RetrievalStatus = 'downloaded' | 'listed_only' | 'failed' | 'not_attempted';

export interface GovDocumentItem {
  docId: string; filename: string; role: DocumentRole;
  retrieval: { status: RetrievalStatus; method?: string };
}

export interface GovOpportunityV1 {
  canonicalOpportunityId: string;
  sourceSnapshotVersion: number;
  /** Honest producer meta.sourceSnapshotVersion; null == snapshot unrecorded. Omitted => equals sourceSnapshotVersion. */
  metaSnapshotVersion?: number | null;
  isFixture: true;
  notice: { noticeType: { value: string; isBindingSolicitation: boolean }; procurementType: { value: string }; contractVehicle: string | null };
  publisher: { leadBuyer: { name: string; jurisdiction: string }; officialSourceUrl: string | null; submissionPortal: { url: string | null } | null };
  deadline: { originalText: string | null; utc: string | null; utcConfidence: 'high' | 'low' | 'unknown'; conflicts: Array<{ originalText: string; utc: string | null; source: string }> };
  value: { published: { amountMinorUnits: number | null; currency: string; valueType: string; provenance: string } | null; modelEstimate: { amountMinorUnits: number | null; currency: string; notForRevenuePlanning: true } | null };
  documents: {
    coverage: 'complete' | 'complete_for_this_notice' | 'partial' | 'none_published' | 'inaccessible' | 'unknown';
    accessBarrier?: string | null;
    counts: { listed: number; downloaded: number; parsed: number; inaccessible: number };
    items: GovDocumentItem[];
  };
  requirements: Array<{
    id: string; text: string; category: string;
    applicability: 'always' | 'conditional' | 'not_applicable' | 'unknown';
    applicabilityEvidenceRef?: { docId: string } | null;
    responsibleParty: string; dueStage: 'submission' | 'award' | 'delivery' | 'unknown';
    bindingStatus: string; evidenceRef?: { docId: string } | null;
  }>;
  sourceAssessment: { legacyVerdict: { status: string | null; method: string | null; evidence: string | null } | null };
  legacy: { fitScore: number | null; priorityScore: number | null; pursuitStatus: string | null };
  sourceAvailability: { status: 'available' | 'degraded' | 'unavailable'; servingLastKnownSnapshot?: boolean } | null;
}

export const CLEAN_CANONICAL = 'op:gov:0000000000000000000000000000aaaa';
export const BLOCKING_CANONICAL = 'op:gov:0000000000000000000000000000bbbb';
/** A source served as a degraded last-known snapshot — present but NOT approvable (evidence not current). */
export const DEGRADED_CANONICAL = 'op:gov:0000000000000000000000000000cccc';
/** A source with NO recorded snapshot (meta.sourceSnapshotVersion null) — cannot bind an approval to it. */
export const UNRECORDED_CANONICAL = 'op:gov:0000000000000000000000000000eeee';
/** Any canonical id the client does not know is treated as an UNAVAILABLE source (fail closed on approval). */
export const UNAVAILABLE_CANONICAL = 'op:gov:0000000000000000000000000000dead';

export const GOV_OPPORTUNITY_FIXTURES: Readonly<Record<string, GovOpportunityV1>> = {
  [CLEAN_CANONICAL]: {
    canonicalOpportunityId: CLEAN_CANONICAL, sourceSnapshotVersion: 3, isFixture: true,
    notice: { noticeType: { value: 'solicitation', isBindingSolicitation: true }, procurementType: { value: 'custom_development' }, contractVehicle: null },
    publisher: { leadBuyer: { name: 'City of Dallas', jurisdiction: 'US-TX' }, officialSourceUrl: 'https://dallascityhall.bonfirehub.com/opportunities/1', submissionPortal: { url: null } },
    deadline: { originalText: 'Oct 23 2026 1:00 PM CDT', utc: '2026-10-23T18:00:00.000Z', utcConfidence: 'high', conflicts: [] },
    value: { published: { amountMinorUnits: 100000000, currency: 'USD', valueType: 'ceiling', provenance: 'buyer_stated' }, modelEstimate: null },
    documents: {
      coverage: 'complete', counts: { listed: 4, downloaded: 4, parsed: 4, inaccessible: 0 },
      items: [
        { docId: 'D1', filename: 'solicitation.pdf', role: 'solicitation', retrieval: { status: 'downloaded', method: 'direct_download' } },
        { docId: 'D2', filename: 'amendment-1.pdf', role: 'amendment', retrieval: { status: 'downloaded', method: 'direct_download' } },
      ],
    },
    requirements: [
      { id: 'R1', text: 'Vendor shall be registered in SAM.gov', category: 'registration', applicability: 'always', responsibleParty: 'bidder', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement', evidenceRef: { docId: 'D1' } },
      { id: 'R2', text: 'Data hosting must meet TX-RAMP at delivery', category: 'hosting', applicability: 'conditional', responsibleParty: 'bidder', dueStage: 'delivery', bindingStatus: 'draft_future_obligation', evidenceRef: null },
    ],
    sourceAssessment: { legacyVerdict: null },
    legacy: { fitScore: 80, priorityScore: 79, pursuitStatus: 'none' },
    sourceAvailability: { status: 'available' },
  },
  [BLOCKING_CANONICAL]: {
    canonicalOpportunityId: BLOCKING_CANONICAL, sourceSnapshotVersion: 1, isFixture: true,
    notice: { noticeType: { value: 'solicitation', isBindingSolicitation: true }, procurementType: { value: 'licensed_profession' }, contractVehicle: null },
    publisher: { leadBuyer: { name: 'County Facilities', jurisdiction: 'US-TX' }, officialSourceUrl: 'https://x.bonfirehub.com/2', submissionPortal: null },
    deadline: { originalText: 'Nov 1 2026 1:30 AM Eastern', utc: null, utcConfidence: 'unknown', conflicts: [{ originalText: '10am EST', utc: '2026-11-01T15:00:00.000Z', source: 'portal' }, { originalText: '10am UTC-04:00', utc: '2026-11-01T14:00:00.000Z', source: 'attachment' }] },
    value: { published: null, modelEstimate: { amountMinorUnits: 50000000, currency: 'USD', notForRevenuePlanning: true } },
    // Authoritative solicitation IS downloaded (coverage sufficient); the 2 inaccessible are non-authoritative
    // attachments. So this fixture is blocked by a REQUIREMENT (unknown applicability), not by coverage.
    documents: {
      coverage: 'partial', counts: { listed: 3, downloaded: 1, parsed: 1, inaccessible: 2 },
      items: [
        { docId: 'D1', filename: 'solicitation.pdf', role: 'solicitation', retrieval: { status: 'downloaded', method: 'direct_download' } },
        { docId: 'D2', filename: 'exhibit-a.pdf', role: 'attachment', retrieval: { status: 'failed', method: 'none' } },
        { docId: 'D3', filename: 'exhibit-b.pdf', role: 'attachment', retrieval: { status: 'failed', method: 'none' } },
      ],
    },
    requirements: [
      { id: 'R1', text: 'Bidder must hold a state architecture license', category: 'certification', applicability: 'unknown', responsibleParty: 'bidder', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement', evidenceRef: null },
      { id: 'R2', text: 'Submit a bid bond with the response', category: 'insurance', applicability: 'always', responsibleParty: 'bidder', dueStage: 'submission', bindingStatus: 'mandatory_response_instruction', evidenceRef: null },
    ],
    sourceAssessment: { legacyVerdict: { status: 'no_bid', method: 'title_regex', evidence: null } },
    legacy: { fitScore: 70, priorityScore: 62, pursuitStatus: 'none' },
    sourceAvailability: { status: 'available' },
  },
  [DEGRADED_CANONICAL]: {
    canonicalOpportunityId: DEGRADED_CANONICAL, sourceSnapshotVersion: 2, isFixture: true,
    notice: { noticeType: { value: 'solicitation', isBindingSolicitation: true }, procurementType: { value: 'custom_development' }, contractVehicle: null },
    publisher: { leadBuyer: { name: 'State Agency', jurisdiction: 'US-TX' }, officialSourceUrl: 'https://x.bonfirehub.com/3', submissionPortal: { url: null } },
    deadline: { originalText: 'Dec 1 2026', utc: null, utcConfidence: 'low', conflicts: [] },
    value: { published: null, modelEstimate: null },
    documents: {
      coverage: 'complete', counts: { listed: 1, downloaded: 1, parsed: 1, inaccessible: 0 },
      items: [{ docId: 'D1', filename: 'solicitation.pdf', role: 'solicitation', retrieval: { status: 'downloaded', method: 'direct_download' } }],
    },
    requirements: [],
    sourceAssessment: { legacyVerdict: null },
    legacy: { fitScore: null, priorityScore: null, pursuitStatus: 'none' },
    // Served as a last-known snapshot while the source is down — present, but approval must NOT bind to it.
    sourceAvailability: { status: 'degraded', servingLastKnownSnapshot: true },
  },
  [UNRECORDED_CANONICAL]: {
    canonicalOpportunityId: UNRECORDED_CANONICAL, sourceSnapshotVersion: 1, metaSnapshotVersion: null, isFixture: true,
    notice: { noticeType: { value: 'solicitation', isBindingSolicitation: true }, procurementType: { value: 'custom_development' }, contractVehicle: null },
    publisher: { leadBuyer: { name: 'City Agency', jurisdiction: 'US-TX' }, officialSourceUrl: 'https://x.bonfirehub.com/4', submissionPortal: { url: null } },
    deadline: { originalText: 'Dec 15 2026', utc: null, utcConfidence: 'low', conflicts: [] },
    value: { published: null, modelEstimate: null },
    documents: {
      coverage: 'complete', counts: { listed: 1, downloaded: 1, parsed: 1, inaccessible: 0 },
      items: [{ docId: 'D1', filename: 'solicitation.pdf', role: 'solicitation', retrieval: { status: 'downloaded', method: 'direct_download' } }],
    },
    requirements: [],
    sourceAssessment: { legacyVerdict: null },
    legacy: { fitScore: null, priorityScore: null, pursuitStatus: 'none' },
    sourceAvailability: { status: 'available' },
  },
};
