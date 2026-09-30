/**
 * The Enterprise-owned qualification: requirement evaluation never lets missing evidence pass, a decision forks
 * a new version under CAS, and a server-side approval binds to the RE-FETCHED source snapshot + version
 * (fail-closed when the source is unavailable, rejected when the source changed under the reviewer, and browser
 * facts are never consulted). The detail client is the REAL fixture-backed one — this proves the service reads
 * OP through opDetailClient, not through anything the caller supplied.
 */
const findOne = jest.fn();
const create = jest.fn();
jest.mock('../../../models/GovQualification', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => findOne(...a), create: (...a: any[]) => create(...a) },
}));

import {
  evaluateRequirements, evaluateEvidenceCoverage, createQualification, recordDecision, approveGovQualification,
  recordDocumentReview,
  QualificationConflictError, QualificationBlockedError, ChangedSourceError, SourceUnavailableError,
  QualificationNotFoundError, SelfApprovalError, SourceNotApprovableError, EvidenceInsufficientError,
  DocumentNotListedError,
} from '../govQualification';
import {
  CLEAN_CANONICAL, BLOCKING_CANONICAL, UNAVAILABLE_CANONICAL, DEGRADED_CANONICAL, UNRECORDED_CANONICAL,
  BONFIRE_GATED_CANONICAL, GOV_OPPORTUNITY_FIXTURES,
} from '../opportunities/govOpportunityFixtures';

beforeEach(() => jest.clearAllMocks());

// A requirement builder so each case shows only the fields it exercises.
const req = (o: Partial<Record<string, any>> = {}) => ({
  id: 'R', text: 't', category: 'c', applicability: 'always', responsibleParty: 'bidder',
  dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement', evidenceRef: { docId: 'D1' }, ...o,
});

describe('evaluateRequirements (PURE) — missing evidence never silently passes', () => {
  it('applicability "unknown" is blocking (never treated as false/not-applicable)', () => {
    const e = evaluateRequirements([req({ applicability: 'unknown' })]);
    expect(e.canApproveBid).toBe(false);
    expect(e.blocking[0].reason).toBe('applicability_unknown');
  });

  it('a "not_applicable" with no applicabilityEvidenceRef is blocking', () => {
    const e = evaluateRequirements([req({ applicability: 'not_applicable', evidenceRef: null })]);
    expect(e.canApproveBid).toBe(false);
    expect(e.blocking[0].reason).toBe('not_applicable_unevidenced');
  });

  it('a "not_applicable" WITH applicabilityEvidenceRef passes (evidenced dismissal is allowed)', () => {
    const e = evaluateRequirements([req({ applicability: 'not_applicable', evidenceRef: null, applicabilityEvidenceRef: { docId: 'D9' } })]);
    expect(e.canApproveBid).toBe(true);
  });

  it('an applicable binding submission requirement with NO evidenceRef is a blocking prerequisite', () => {
    const e = evaluateRequirements([req({ evidenceRef: null })]);
    expect(e.canApproveBid).toBe(false);
    expect(e.blocking[0].reason).toBe('submission_prerequisite_no_evidence');
  });

  it('mandatory_response_instruction counts as binding for the submission-evidence rule', () => {
    const e = evaluateRequirements([req({ bindingStatus: 'mandatory_response_instruction', evidenceRef: null })]);
    expect(e.canApproveBid).toBe(false);
  });

  it('a binding submission requirement WITH evidence passes', () => {
    expect(evaluateRequirements([req()]).canApproveBid).toBe(true);
  });

  it('a delivery-stage obligation with no evidence is FLAGGED but does NOT block a bid pursuit', () => {
    const e = evaluateRequirements([req({ dueStage: 'delivery', bindingStatus: 'draft_future_obligation', evidenceRef: null })]);
    expect(e.canApproveBid).toBe(true);
    expect(e.deliveryObligations).toHaveLength(1);
    expect(e.byDueStage.delivery).toHaveLength(1);
  });

  it('the CLEAN fixture is approvable; the BLOCKING fixture is not', () => {
    expect(evaluateRequirements(GOV_OPPORTUNITY_FIXTURES[CLEAN_CANONICAL].requirements).canApproveBid).toBe(true);
    expect(evaluateRequirements(GOV_OPPORTUNITY_FIXTURES[BLOCKING_CANONICAL].requirements).canApproveBid).toBe(false);
  });
});

describe('evaluateEvidenceCoverage (PURE) — missing evidence never silently passes', () => {
  const sol = (status: string) => ({ docId: 'D1', filename: 's.pdf', role: 'solicitation', retrieval: { status } });
  const amd = (status: string) => ({ docId: 'D2', filename: 'a.pdf', role: 'amendment', retrieval: { status } });
  const someReq = [{ id: 'R1', applicability: 'always', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement', evidenceRef: { docId: 'D1' } }];

  it('empty established requirements is insufficient (empty list is NOT "no requirements")', () => {
    const c = evaluateEvidenceCoverage({ documents: { coverage: 'complete', items: [sol('downloaded')] } }, []);
    expect(c.sufficient).toBe(false);
    expect(c.reasons).toContain('no_requirements_established');
  });

  it('none_published → no_authoritative_source', () => {
    expect(evaluateEvidenceCoverage({ documents: { coverage: 'none_published', items: [] } }, someReq).reasons).toContain('no_authoritative_source');
  });

  it('unknown/inaccessible coverage → document_coverage_unknown', () => {
    expect(evaluateEvidenceCoverage({ documents: { coverage: 'unknown', items: [] } }, someReq).reasons).toContain('document_coverage_unknown');
    expect(evaluateEvidenceCoverage({ documents: { coverage: 'inaccessible', items: [] } }, someReq).reasons).toContain('document_coverage_unknown');
  });

  it('complete coverage with the solicitation downloaded is sufficient', () => {
    expect(evaluateEvidenceCoverage({ documents: { coverage: 'complete', items: [sol('downloaded')] } }, someReq).sufficient).toBe(true);
  });

  it('PARTIAL is sufficient when the authoritative solicitation + every amendment are downloaded (only non-authoritative attachments inaccessible)', () => {
    const items = [sol('downloaded'), amd('downloaded'), { docId: 'D3', filename: 'x.pdf', role: 'attachment', retrieval: { status: 'failed' } }];
    expect(evaluateEvidenceCoverage({ documents: { coverage: 'partial', items } }, someReq).sufficient).toBe(true);
  });

  it('PARTIAL with an un-downloaded amendment → authoritative_package_unreviewed', () => {
    const items = [sol('downloaded'), amd('listed_only')];
    const c = evaluateEvidenceCoverage({ documents: { coverage: 'partial', items } }, someReq);
    expect(c.sufficient).toBe(false);
    expect(c.reasons).toContain('authoritative_package_unreviewed');
  });

  it('coverage claimed complete but NO authoritative item present → no_authoritative_source (fail closed on missing items)', () => {
    expect(evaluateEvidenceCoverage({ documents: { coverage: 'complete', items: [] } }, someReq).reasons).toContain('no_authoritative_source');
  });
});

describe('createQualification (idempotent, version 1, pending_review)', () => {
  const input = {
    tenantId: 'ten-1', biddingEntity: 'colaberry', canonicalOpportunityId: CLEAN_CANONICAL,
    reviewerIdentityId: 'rev-1', sourceSnapshot: GOV_OPPORTUNITY_FIXTURES[CLEAN_CANONICAL],
    sourceSnapshotVersion: 3, sourceAvailable: true, requirements: GOV_OPPORTUNITY_FIXTURES[CLEAN_CANONICAL].requirements,
  };

  it('creates a version-1 pending_review record with a content hash and the bound snapshot version', async () => {
    findOne.mockResolvedValue(null);
    create.mockImplementation(async (row: any) => ({ ...row, id: 'q1', get: () => ({ ...row, id: 'q1' }) }));
    const q = await createQualification(input);
    expect(create).toHaveBeenCalledTimes(1);
    expect(q.version).toBe(1);
    expect(q.decision).toBe('pending_review');
    expect(q.bidding_entity).toBe('colaberry');
    expect(q.source_snapshot_version).toBe(3);
    expect(q.content_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is idempotent: an existing active record is returned instead of a second row', async () => {
    findOne.mockResolvedValue({ id: 'q1', version: 1, get: () => ({ id: 'q1', version: 1 }) });
    const q = await createQualification(input);
    expect(create).not.toHaveBeenCalled();
    expect(q.id).toBe('q1');
  });
});

describe('recordDecision (CAS + fork-on-edit, non-approval states)', () => {
  it('refuses a stale expectedVersion with a QualificationConflictError', async () => {
    findOne.mockResolvedValue({ version: 3, save: jest.fn() });
    await expect(recordDecision({
      canonicalOpportunityId: CLEAN_CANONICAL, biddingEntity: 'colaberry', expectedVersion: 1,
      decision: 'needs_evidence', reviewerIdentityId: 'rev-1',
    })).rejects.toBeInstanceOf(QualificationConflictError);
    expect(create).not.toHaveBeenCalled();
  });

  it('forks a new version and supersedes the prior (never mutates in place)', async () => {
    const current: any = { version: 1, status: 'active', tenant_id: 't', bidding_entity: 'colaberry', canonical_opportunity_id: CLEAN_CANONICAL, source_snapshot: {}, save: jest.fn().mockResolvedValue(undefined) };
    findOne.mockResolvedValue(current);
    create.mockImplementation(async (row: any) => ({ ...row, id: 'q2', get: () => ({ ...row, id: 'q2' }) }));
    const q = await recordDecision({
      canonicalOpportunityId: CLEAN_CANONICAL, biddingEntity: 'colaberry', expectedVersion: 1,
      decision: 'no_bid', rationale: 'out of scope', reviewerIdentityId: 'rev-1',
    });
    expect(q.version).toBe(2);
    expect(q.decision).toBe('no_bid');
    expect(current.status).toBe('superseded');
    expect(current.save).toHaveBeenCalled();
  });

  it('refuses an approval decision (those must go through approveGovQualification)', async () => {
    findOne.mockResolvedValue({ version: 1, save: jest.fn() });
    await expect(recordDecision({
      canonicalOpportunityId: CLEAN_CANONICAL, biddingEntity: 'colaberry', expectedVersion: 1,
      decision: 'approved_bid_pursuit', reviewerIdentityId: 'rev-1',
    })).rejects.toThrow(/approveGovQualification/);
  });

  it('throws QualificationNotFoundError when no active record exists', async () => {
    findOne.mockResolvedValue(null);
    await expect(recordDecision({
      canonicalOpportunityId: CLEAN_CANONICAL, biddingEntity: 'colaberry', expectedVersion: 1,
      decision: 'needs_evidence', reviewerIdentityId: 'rev-1',
    })).rejects.toBeInstanceOf(QualificationNotFoundError);
  });
});

describe('approveGovQualification (server-side, source-snapshot bound)', () => {
  const base = (over: Partial<Record<string, any>> = {}) => ({
    version: 1, status: 'active', tenant_id: 't', bidding_entity: 'colaberry',
    canonical_opportunity_id: CLEAN_CANONICAL, source_snapshot_version: 3, reviewer_identity_id: 'rev-1',
    source_snapshot: { stale: 'browser-supplied-and-ignored' }, save: jest.fn().mockResolvedValue(undefined), ...over,
  });
  const approveInput = (over: Partial<Record<string, any>> = {}) => ({
    canonicalOpportunityId: CLEAN_CANONICAL, biddingEntity: 'colaberry', expectedVersion: 1,
    decision: 'approved_bid_pursuit' as const, approverIdentityId: 'app-2', ...over,
  });

  it('binds the approval to the RE-FETCHED snapshot/version, not to the stored (browser) snapshot', async () => {
    findOne.mockResolvedValue(base());
    create.mockImplementation(async (row: any) => ({ ...row, id: 'q2', get: () => ({ ...row, id: 'q2' }) }));
    const q = await approveGovQualification(approveInput());
    expect(q.decision).toBe('approved_bid_pursuit');
    expect(q.version).toBe(2);
    expect(q.source_snapshot).toEqual(GOV_OPPORTUNITY_FIXTURES[CLEAN_CANONICAL]); // server-fetched, not the stored stale one
    expect(q.source_snapshot_version).toBe(3);
    expect(q.source_available).toBe(true);
  });

  it('fails CLOSED when the source is unavailable (SourceUnavailableError, no write)', async () => {
    findOne.mockResolvedValue(base({ canonical_opportunity_id: UNAVAILABLE_CANONICAL }));
    await expect(approveGovQualification(approveInput({ canonicalOpportunityId: UNAVAILABLE_CANONICAL })))
      .rejects.toBeInstanceOf(SourceUnavailableError);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a changed-source approval (reviewed v2, source now v3) pending renewed review', async () => {
    findOne.mockResolvedValue(base({ source_snapshot_version: 2 }));
    await expect(approveGovQualification(approveInput())).rejects.toBeInstanceOf(ChangedSourceError);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an approval with a blocking requirement (BLOCKING fixture -> QualificationBlockedError)', async () => {
    findOne.mockResolvedValue(base({ canonical_opportunity_id: BLOCKING_CANONICAL, source_snapshot_version: 1 }));
    await expect(approveGovQualification(approveInput({ canonicalOpportunityId: BLOCKING_CANONICAL })))
      .rejects.toBeInstanceOf(QualificationBlockedError);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a stale expectedVersion before ever touching the source', async () => {
    findOne.mockResolvedValue(base({ version: 4 }));
    await expect(approveGovQualification(approveInput({ expectedVersion: 1 })))
      .rejects.toBeInstanceOf(QualificationConflictError);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses self-approval: the reviewer may not approve their own pursuit (SelfApprovalError)', async () => {
    findOne.mockResolvedValue(base({ reviewer_identity_id: 'rev-1' }));
    await expect(approveGovQualification(approveInput({ approverIdentityId: 'rev-1' })))
      .rejects.toBeInstanceOf(SelfApprovalError);
    expect(create).not.toHaveBeenCalled();
  });

  it('records the approver in the immutable evidence, distinct from the reviewer', async () => {
    findOne.mockResolvedValue(base());
    create.mockImplementation(async (row: any) => ({ ...row, id: 'q2', get: () => ({ ...row, id: 'q2' }) }));
    const q = await approveGovQualification(approveInput({ approverIdentityId: 'app-2' }));
    expect(q.reviewer_identity_id).toBe('rev-1');
    expect(q.evidence_json.approvedBy).toBe('app-2');
  });

  // ── coordinator item #6: server-side source-state gate (UI-bypass, direct-service calls) ──
  it('refuses a DEGRADED source server-side (SourceNotApprovableError, reason degraded) — even called directly', async () => {
    findOne.mockResolvedValue(base({ canonical_opportunity_id: DEGRADED_CANONICAL, source_snapshot_version: 2 }));
    await expect(approveGovQualification(approveInput({ canonicalOpportunityId: DEGRADED_CANONICAL })))
      .rejects.toMatchObject({ name: 'SourceNotApprovableError', reason: 'degraded' });
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an UNRECORDED snapshot server-side (SourceNotApprovableError, reason snapshot_unrecorded)', async () => {
    findOne.mockResolvedValue(base({ canonical_opportunity_id: UNRECORDED_CANONICAL, source_snapshot_version: 1 }));
    await expect(approveGovQualification(approveInput({ canonicalOpportunityId: UNRECORDED_CANONICAL })))
      .rejects.toBeInstanceOf(SourceNotApprovableError);
    expect(create).not.toHaveBeenCalled();
  });

  it('blocks approval when the reviewer established ZERO requirements despite a clean source (EvidenceInsufficientError 422)', async () => {
    findOne.mockResolvedValue(base({ requirements_json: { established: [] } }));
    await expect(approveGovQualification(approveInput()))
      .rejects.toMatchObject({ name: 'EvidenceInsufficientError' });
    expect(create).not.toHaveBeenCalled();
  });

  it('APPROVES when the reviewer established a satisfied requirement + coverage is sufficient (uses the established set, not OP\'s)', async () => {
    const established = [{ id: 'RE1', text: 'SAM registration', category: 'registration', applicability: 'always', responsibleParty: 'bidder', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement', evidenceRef: { docId: 'D1' } }];
    findOne.mockResolvedValue(base({ requirements_json: { established } }));
    create.mockImplementation(async (row: any) => ({ ...row, id: 'q2', get: () => ({ ...row, id: 'q2' }) }));
    const q = await approveGovQualification(approveInput());
    expect(q.decision).toBe('approved_bid_pursuit');
    expect(q.requirements_json.established).toEqual(established);
    expect(q.requirements_json.coverage.sufficient).toBe(true);
  });

  it('PRODUCTION cannot approve from fixture data — resolver never fixture-falls-back (SourceUnavailableError), even via a direct call', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevBase = process.env.OPPORTUNITY_PULSE_V2_BASE;
    (process.env as any).NODE_ENV = 'production';
    delete process.env.OPPORTUNITY_PULSE_V2_BASE; // not configured live
    try {
      findOne.mockResolvedValue(base());
      await expect(approveGovQualification(approveInput())).rejects.toBeInstanceOf(SourceUnavailableError);
      expect(create).not.toHaveBeenCalled();
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
      if (prevBase === undefined) delete process.env.OPPORTUNITY_PULSE_V2_BASE; else process.env.OPPORTUNITY_PULSE_V2_BASE = prevBase;
    }
  });
});

// ── Manual Bonfire-ZIP document review (MDR) ──────────────────────────────────
const BF = GOV_OPPORTUNITY_FIXTURES[BONFIRE_GATED_CANONICAL];
const someReq = [{ id: 'R1', applicability: 'always', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement', evidenceRef: { docId: 'X' } }];

describe('evaluateEvidenceCoverage — manual review of Bonfire-gated (listed-but-not-downloaded) docs', () => {
  it('listed authoritative docs that are NOT downloaded → authoritative_package_unreviewed (not no_authoritative_source)', () => {
    const c = evaluateEvidenceCoverage(BF, someReq);
    expect(c.sufficient).toBe(false);
    expect(c.reasons).toContain('authoritative_package_unreviewed');
    expect(c.reasons).not.toContain('no_authoritative_source');
  });
  it('manual review of the listed solicitation + amendment clears coverage', () => {
    expect(evaluateEvidenceCoverage(BF, someReq, new Set(['DS1', 'DA1'])).sufficient).toBe(true);
  });
  it('covering only some authoritative docs is not enough (amendment still unreviewed)', () => {
    const c = evaluateEvidenceCoverage(BF, someReq, ['DS1']);
    expect(c.sufficient).toBe(false);
    expect(c.reasons).toContain('authoritative_package_unreviewed');
  });
  it('a reviewedDocId that is not an authoritative item does not help', () => {
    expect(evaluateEvidenceCoverage(BF, someReq, ['NOPE']).sufficient).toBe(false);
  });
});

describe('recordDocumentReview (attestation, non-weakening + revoke recovery)', () => {
  const rec = (over: any = {}) => ({ version: 1, status: 'active', tenant_id: 't', bidding_entity: 'colaberry', canonical_opportunity_id: BONFIRE_GATED_CANONICAL, source_snapshot: BF, requirements_json: {}, save: jest.fn().mockResolvedValue(undefined), ...over });
  const input = (over: any = {}) => ({ canonicalOpportunityId: BONFIRE_GATED_CANONICAL, biddingEntity: 'colaberry', expectedVersion: 1, reviewerIdentityId: 'rev-1', mode: 'add' as const, coveredDocIds: ['DS1', 'DA1'], filename: 'pkg.zip', sha256: 'abc123', sizeBytes: 4096, ...over });

  it('add stores reviewedDocuments (fork) for listed authoritative docIds with sha256 + reviewer + method', async () => {
    findOne.mockResolvedValue(rec());
    create.mockImplementation(async (row: any) => ({ ...row, id: 'q2', get: () => ({ ...row, id: 'q2' }) }));
    const q = await recordDocumentReview(input());
    const rd = q.requirements_json.reviewedDocuments;
    expect(rd.map((e: any) => e.docId).sort()).toEqual(['DA1', 'DS1']);
    expect(rd[0].method).toBe('manual_upload');
    expect(rd[0].reviewedBy).toBe('rev-1');
    expect(rd[0].sha256).toBe('abc123');
  });
  it('rejects a docId the source did NOT list as authoritative (DocumentNotListedError, no write)', async () => {
    findOne.mockResolvedValue(rec());
    await expect(recordDocumentReview(input({ coveredDocIds: ['DS1', 'NOPE'] }))).rejects.toBeInstanceOf(DocumentNotListedError);
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects a non-authoritative attachment docId even if the source listed it', async () => {
    // BF lists only authoritative docs; use CLEAN's non-authoritative delivery doc via a spliced snapshot.
    const snap = { ...BF, documents: { ...BF.documents, items: [...BF.documents.items, { docId: 'ATT1', filename: 'a.pdf', role: 'attachment', retrieval: { status: 'failed' } }] } };
    findOne.mockResolvedValue(rec({ source_snapshot: snap }));
    await expect(recordDocumentReview(input({ coveredDocIds: ['ATT1'] }))).rejects.toBeInstanceOf(DocumentNotListedError);
    expect(create).not.toHaveBeenCalled();
  });
  it('CAS conflict on a stale expectedVersion', async () => {
    findOne.mockResolvedValue(rec({ version: 3 }));
    await expect(recordDocumentReview(input({ expectedVersion: 1 }))).rejects.toBeInstanceOf(QualificationConflictError);
  });
  it('revoke removes an attestation (recovery), keeping the others', async () => {
    findOne.mockResolvedValue(rec({ requirements_json: { reviewedDocuments: [{ docId: 'DS1', role: 'solicitation' }, { docId: 'DA1', role: 'amendment' }] } }));
    create.mockImplementation(async (row: any) => ({ ...row, id: 'q2', get: () => ({ ...row, id: 'q2' }) }));
    const q = await recordDocumentReview(input({ mode: 'revoke', coveredDocIds: ['DA1'] }));
    expect(q.requirements_json.reviewedDocuments.map((e: any) => e.docId)).toEqual(['DS1']);
  });
});

describe('approveGovQualification — Bonfire-gated end-to-end (manual review unblocks; non-weakening)', () => {
  const bfReq = [{ id: 'RE1', text: 'SAM', category: 'registration', applicability: 'always', responsibleParty: 'bidder', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement', evidenceRef: { docId: 'DS1' } }];
  const base = (over: any = {}) => ({ version: 1, status: 'active', tenant_id: 't', bidding_entity: 'colaberry', canonical_opportunity_id: BONFIRE_GATED_CANONICAL, source_snapshot_version: 2, reviewer_identity_id: 'rev-1', source_snapshot: BF, requirements_json: { established: bfReq }, save: jest.fn().mockResolvedValue(undefined), ...over });
  const input = (over: any = {}) => ({ canonicalOpportunityId: BONFIRE_GATED_CANONICAL, biddingEntity: 'colaberry', expectedVersion: 1, decision: 'approved_bid_pursuit' as const, approverIdentityId: 'app-2', ...over });

  it('BLOCKS (EvidenceInsufficientError) when the authoritative docs are only LISTED, not reviewed', async () => {
    findOne.mockResolvedValue(base());
    await expect(approveGovQualification(input())).rejects.toBeInstanceOf(EvidenceInsufficientError);
    expect(create).not.toHaveBeenCalled();
  });
  it('SUCCEEDS after manual review of the listed solicitation + amendment (through the real resolver)', async () => {
    findOne.mockResolvedValue(base({ requirements_json: { established: bfReq, reviewedDocuments: [{ docId: 'DS1' }, { docId: 'DA1' }] } }));
    create.mockImplementation(async (row: any) => ({ ...row, id: 'q2', get: () => ({ ...row, id: 'q2' }) }));
    const q = await approveGovQualification(input());
    expect(q.decision).toBe('approved_bid_pursuit');
  });
  it('empty established still blocks even with the documents reviewed (non-weakening)', async () => {
    findOne.mockResolvedValue(base({ requirements_json: { established: [], reviewedDocuments: [{ docId: 'DS1' }, { docId: 'DA1' }] } }));
    await expect(approveGovQualification(input())).rejects.toBeInstanceOf(EvidenceInsufficientError);
    expect(create).not.toHaveBeenCalled();
  });
});
