/**
 * Labeled gov-opportunity.v1 fixtures for Phase-2 development. These are NOT live Opportunity Pulse data — they
 * are fixed, clearly-labeled samples shaped to the pinned contract (OP b9b89054 contracts/gov-opportunity.v1/
 * schema.json, LF sha256 26ff667e…). The live /api/v2/gov-opportunities/:id endpoint is not yet available; the
 * detail client reads these until it ships. `sourceSnapshotVersion` is what an Enterprise qualification binds
 * its approval to; bumping it here simulates a changed source that must force a renewed review.
 */
export interface GovOpportunityV1 {
  canonicalOpportunityId: string;
  sourceSnapshotVersion: number;
  isFixture: true;
  notice: { noticeType: { value: string; isBindingSolicitation: boolean }; procurementType: { value: string }; contractVehicle: string | null };
  publisher: { leadBuyer: { name: string; jurisdiction: string }; officialSourceUrl: string | null; submissionPortal: { url: string | null } | null };
  deadline: { originalText: string | null; utc: string | null; utcConfidence: 'high' | 'low' | 'unknown'; conflicts: Array<{ originalText: string; utc: string | null; source: string }> };
  value: { published: { amountMinorUnits: number | null; currency: string; valueType: string; provenance: string } | null; modelEstimate: { amountMinorUnits: number | null; currency: string; notForRevenuePlanning: true } | null };
  documents: { coverage: string; counts: { listed: number; downloaded: number; parsed: number; inaccessible: number } };
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
/** Any canonical id the client does not know is treated as an UNAVAILABLE source (fail closed on approval). */
export const UNAVAILABLE_CANONICAL = 'op:gov:0000000000000000000000000000dead';

export const GOV_OPPORTUNITY_FIXTURES: Readonly<Record<string, GovOpportunityV1>> = {
  [CLEAN_CANONICAL]: {
    canonicalOpportunityId: CLEAN_CANONICAL, sourceSnapshotVersion: 3, isFixture: true,
    notice: { noticeType: { value: 'solicitation', isBindingSolicitation: true }, procurementType: { value: 'custom_development' }, contractVehicle: null },
    publisher: { leadBuyer: { name: 'City of Dallas', jurisdiction: 'US-TX' }, officialSourceUrl: 'https://dallascityhall.bonfirehub.com/opportunities/1', submissionPortal: { url: null } },
    deadline: { originalText: 'Oct 23 2026 1:00 PM CDT', utc: '2026-10-23T18:00:00.000Z', utcConfidence: 'high', conflicts: [] },
    value: { published: { amountMinorUnits: 100000000, currency: 'USD', valueType: 'ceiling', provenance: 'buyer_stated' }, modelEstimate: null },
    documents: { coverage: 'complete', counts: { listed: 4, downloaded: 4, parsed: 4, inaccessible: 0 } },
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
    documents: { coverage: 'partial', counts: { listed: 3, downloaded: 1, parsed: 1, inaccessible: 2 } },
    requirements: [
      { id: 'R1', text: 'Bidder must hold a state architecture license', category: 'certification', applicability: 'unknown', responsibleParty: 'bidder', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement', evidenceRef: null },
      { id: 'R2', text: 'Submit a bid bond with the response', category: 'insurance', applicability: 'always', responsibleParty: 'bidder', dueStage: 'submission', bindingStatus: 'mandatory_response_instruction', evidenceRef: null },
    ],
    sourceAssessment: { legacyVerdict: { status: 'no_bid', method: 'title_regex', evidence: null } },
    legacy: { fitScore: 70, priorityScore: 62, pursuitStatus: 'none' },
    sourceAvailability: { status: 'available' },
  },
};
