/**
 * The Gov Qualification Workspace API. Every route is section-gated and tenant-scoped through the READ-ONLY gov
 * container (fail-closed 503 when unconfigured). The source is server-authoritative (re-fetched by canonical id,
 * never browser-supplied). Error mapping is exact: stale/changed-source → 409, blocking → 422, source-unavailable
 * → 503, self-approval → 403. The section guard is asserted behaviorally AND at the source (route-auth lint).
 */
import fs from 'fs';
import path from 'path';

const requireSection = jest.fn(() => (req: any, _res: any, next: any) => { req.admin = { email: 'reviewer@test' }; next(); });
jest.mock('../../../middlewares/authMiddleware', () => ({ requireSection: (...a: any[]) => requireSection(...a) }));

const lookupGovContractsContainer = jest.fn();
jest.mock('../../../scripts/lib/factoryDemoContainer', () => ({ lookupGovContractsContainer: (...a: any[]) => lookupGovContractsContainer(...a) }));

const govQualFindOne = jest.fn();
jest.mock('../../../models/GovQualification', () => ({ __esModule: true, default: { findOne: (...a: any[]) => govQualFindOne(...a) } }));

// Keep the REAL error classes + the pure evaluateRequirements; override the async service functions.
const createQualification = jest.fn();
const recordDecision = jest.fn();
const approveGovQualification = jest.fn();
const recordDocumentReview = jest.fn();
const createDecoupledQualification = jest.fn();
const getDecoupledWorkspace = jest.fn();
const recordZipAttestation = jest.fn();
const approveDecoupledQualification = jest.fn();
const resolveDecoupledDeliveryProjectId = jest.fn();
jest.mock('../../../services/factory/govQualification', () => {
  const actual = jest.requireActual('../../../services/factory/govQualification');
  return { ...actual, createQualification: (...a: any[]) => createQualification(...a), recordDecision: (...a: any[]) => recordDecision(...a), approveGovQualification: (...a: any[]) => approveGovQualification(...a), recordDocumentReview: (...a: any[]) => recordDocumentReview(...a), createDecoupledQualification: (...a: any[]) => createDecoupledQualification(...a), getDecoupledWorkspace: (...a: any[]) => getDecoupledWorkspace(...a), recordZipAttestation: (...a: any[]) => recordZipAttestation(...a), approveDecoupledQualification: (...a: any[]) => approveDecoupledQualification(...a), resolveDecoupledDeliveryProjectId: (...a: any[]) => resolveDecoupledDeliveryProjectId(...a) };
});
// P3-T2 build-story assignment — service mocked (its own unit test proves the assignee rail); keep AssignmentError real.
const assignBuildStory = jest.fn();
const unassignBuildStory = jest.fn();
jest.mock('../../../services/factory/govBuildAssignment', () => {
  const actual = jest.requireActual('../../../services/factory/govBuildAssignment');
  return { ...actual, assignBuildStory: (...a: any[]) => assignBuildStory(...a), unassignBuildStory: (...a: any[]) => unassignBuildStory(...a) };
});
const resolveGovProjectActor = jest.fn();
jest.mock('../../../middlewares/govProjectAccess', () => ({ resolveGovProjectActor: (...a: any[]) => resolveGovProjectActor(...a), requireGovProjectAccess: () => (_r: any, _s: any, n: any) => n() }));
// P4 proposal-production services — mocked (their own unit tests prove the lifecycle + invalidation rails); keep the real error classes.
const saveProposalResponse = jest.fn();
const reviewProposalResponse = jest.fn();
const addProposalFigure = jest.fn();
const removeProposalFigure = jest.fn();
jest.mock('../../../services/factory/govProposalResponse', () => {
  const actual = jest.requireActual('../../../services/factory/govProposalResponse');
  return { ...actual, saveProposalResponse: (...a: any[]) => saveProposalResponse(...a), reviewProposalResponse: (...a: any[]) => reviewProposalResponse(...a), addProposalFigure: (...a: any[]) => addProposalFigure(...a), removeProposalFigure: (...a: any[]) => removeProposalFigure(...a) };
});
const recordProposalAmendment = jest.fn();
jest.mock('../../../services/factory/govProposalAmendment', () => {
  const actual = jest.requireActual('../../../services/factory/govProposalAmendment');
  return { ...actual, recordProposalAmendment: (...a: any[]) => recordProposalAmendment(...a) };
});
// P5 submission services — mocked (unit tests prove the rails); keep SubmissionError + the pure package helpers real.
const exportSubmission = jest.fn();
const recordSubmissionReceipt = jest.fn();
const recordOutcome = jest.fn();
jest.mock('../../../services/factory/govSubmission', () => {
  const actual = jest.requireActual('../../../services/factory/govSubmission');
  return { ...actual, exportSubmission: (...a: any[]) => exportSubmission(...a), recordSubmissionReceipt: (...a: any[]) => recordSubmissionReceipt(...a), recordOutcome: (...a: any[]) => recordOutcome(...a) };
});
const authorizeBuild = jest.fn();
jest.mock('../../../services/factory/buildAuthorization', () => {
  const actual = jest.requireActual('../../../services/factory/buildAuthorization');
  return { ...actual, authorizeBuild: (...a: any[]) => authorizeBuild(...a) };
});
const linkGovOpportunity = jest.fn();
jest.mock('../../../services/factory/opportunities/govOpportunityAlias', () => {
  const actual = jest.requireActual('../../../services/factory/opportunities/govOpportunityAlias');
  return { ...actual, linkGovOpportunity: (...a: any[]) => linkGovOpportunity(...a) };
});
const extractProposal = jest.fn();
jest.mock('../../../services/factory/proposal/proposalExtractor', () => ({ extractProposal: (...a: any[]) => extractProposal(...a) }));
// Phase 2 private byte-store — mocked so attest-zip / download tests don't touch the DB or the uploads volume.
const storeGovSourceBundle = jest.fn();
const loadGovSourceBundleScoped = jest.fn();
jest.mock('../../../services/factory/proposal/govSourceBundleStore', () => ({
  storeGovSourceBundle: (...a: any[]) => storeGovSourceBundle(...a),
  loadGovSourceBundleScoped: (...a: any[]) => loadGovSourceBundleScoped(...a),
}));
// Step 6 — the two-track project creator, mocked so the flag-on tests don't touch the DB.
const ensureGovTwoTrackProject = jest.fn();
jest.mock('../../../services/factory/govDeliveryProject', () => ({ ensureGovTwoTrackProject: (...a: any[]) => ensureGovTwoTrackProject(...a) }));

import express from 'express';
import request from 'supertest';
import govQualificationRoutes from '../govQualificationRoutes';
import {
  ChangedSourceError, QualificationBlockedError, SourceUnavailableError, SelfApprovalError, QualificationConflictError,
  SourceNotApprovableError, EvidenceInsufficientError,
} from '../../../services/factory/govQualification';
import { DocumentNotListedError } from '../../../services/factory/govQualification';
import { BuildNotAuthorizedError } from '../../../services/factory/buildAuthorization';
import { AssignmentError } from '../../../services/factory/govBuildAssignment';
import { ResponseError } from '../../../services/factory/govProposalResponse';
import { SubmissionError } from '../../../services/factory/govSubmission';
import { AliasConflictError } from '../../../services/factory/opportunities/govOpportunityAlias';
import { CLEAN_CANONICAL, BLOCKING_CANONICAL, UNAVAILABLE_CANONICAL } from '../../../services/factory/opportunities/govOpportunityFixtures';
import { FLAGS } from '../../../config/featureFlags';

const app = express();
app.use(express.json());
app.use(govQualificationRoutes);

const CONTAINER = { tenant: { id: 'ten-1' }, org: { id: 'org-1' } };
beforeEach(() => {
  jest.clearAllMocks();
  lookupGovContractsContainer.mockResolvedValue(CONTAINER);
  storeGovSourceBundle.mockResolvedValue({ id: 'bundle-default', filename: 'solicitation.zip', mime: 'application/zip', byte_size: 9, sha256: 'a'.repeat(64), deduped: false });
});

describe('the section gate + tenant scoping', () => {
  it('mounts every route behind requireSection("program") (source-level, route-auth lint)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'govQualificationRoutes.ts'), 'utf8');
    const routeLines = src.split('\n').filter((l) => /router\.(get|post|put|patch|delete)\(/.test(l));
    expect(routeLines.length).toBe(28); // +2 P3 assign; +5 P4 responses/amendments; +6 P5 submission export/package(GET)/receipt/acknowledge/reopen + outcome; +2 AI advisory (risk-narrative, proposal-summary); +1 P1 build-spec; +1 P2 build-plan-ai
    // Each route DEFINITION line must carry the section guard (not just somewhere in the file).
    const unguarded = routeLines.filter((l) => !l.includes("requireSection('program')"));
    expect(unguarded).toEqual([]);
  });

  it('fails CLOSED with 503 when the gov container is not configured', async () => {
    lookupGovContractsContainer.mockResolvedValue(null);
    const res = await request(app).get(`/api/admin/factory/qualification/${CLEAN_CANONICAL}`);
    expect(res.status).toBe(503);
  });

  it('400s an invalid canonical opportunity id', async () => {
    const res = await request(app).get('/api/admin/factory/qualification/not-a-canonical');
    expect(res.status).toBe(400);
    expect(lookupGovContractsContainer).not.toHaveBeenCalled();
  });
});

describe('GET workspace view (server-authoritative source)', () => {
  it('returns the server-fetched source, a real evaluation, and canApprove for a clean opportunity', async () => {
    govQualFindOne.mockResolvedValue(null);
    const res = await request(app).get(`/api/admin/factory/qualification/${CLEAN_CANONICAL}?biddingEntity=colaberry`);
    expect(res.status).toBe(200);
    expect(res.body.source.canonicalOpportunityId).toBe(CLEAN_CANONICAL);
    expect(res.body.sourceLive).toBe(false);          // fixtures, not live OP
    expect(res.body.evaluation.canApproveBid).toBe(true);
    expect(res.body.canApprove).toBe(true);
    expect(res.body.qualification).toBeNull();
  });

  it('reports canApprove:false for a blocking opportunity (missing evidence blocks)', async () => {
    govQualFindOne.mockResolvedValue(null);
    const res = await request(app).get(`/api/admin/factory/qualification/${BLOCKING_CANONICAL}`);
    expect(res.status).toBe(200);
    expect(res.body.evaluation.canApproveBid).toBe(false);
    expect(res.body.canApprove).toBe(false);
  });

  it('flags changedSource when the stored record was bound to an older source version', async () => {
    govQualFindOne.mockResolvedValue({ get: () => ({ source_snapshot_version: 2 }), source_snapshot_version: 2 });
    const res = await request(app).get(`/api/admin/factory/qualification/${CLEAN_CANONICAL}?biddingEntity=colaberry`);
    expect(res.body.changedSource).toBe(true);   // fixture is v3, record bound v2
    expect(res.body.canApprove).toBe(false);
  });
});

describe('POST create (source bound, fail-closed)', () => {
  it('creates a pending_review record bound to the SERVER-fetched snapshot', async () => {
    createQualification.mockResolvedValue({ id: 'q1', version: 1, decision: 'pending_review' });
    const res = await request(app).post(`/api/admin/factory/qualification/${CLEAN_CANONICAL}`).send({ biddingEntity: 'colaberry' });
    expect(res.status).toBe(201);
    // reviewer identity comes from the request, source snapshot from the server fetch (not the body)
    const arg = createQualification.mock.calls[0][0];
    expect(arg.reviewerIdentityId).toBe('reviewer@test');
    expect(arg.tenantId).toBe('ten-1');
    expect(arg.sourceSnapshotVersion).toBe(3);
    expect(arg.sourceSnapshot.canonicalOpportunityId).toBe(CLEAN_CANONICAL);
  });

  it('fails CLOSED (503) when the opportunity source is unavailable — never creates an unbound record', async () => {
    const res = await request(app).post(`/api/admin/factory/qualification/${UNAVAILABLE_CANONICAL}`).send({ biddingEntity: 'colaberry' });
    expect(res.status).toBe(503);
    expect(createQualification).not.toHaveBeenCalled();
  });
});

describe('POST approve — exact error mapping', () => {
  const url = `/api/admin/factory/qualification/${CLEAN_CANONICAL}/approve`;
  const body = { biddingEntity: 'colaberry', expectedVersion: 1, decision: 'approved_bid_pursuit' };

  it('409 on a changed source (renewed review required)', async () => {
    approveGovQualification.mockRejectedValue(new ChangedSourceError(2, 3));
    const res = await request(app).post(url).send(body);
    expect(res.status).toBe(409);
    expect(res.body.changedSource).toBe(true);
  });

  it('422 when a requirement blocks', async () => {
    approveGovQualification.mockRejectedValue(new QualificationBlockedError(['R1:applicability_unknown']));
    const res = await request(app).post(url).send(body);
    expect(res.status).toBe(422);
    expect(res.body.blocking).toContain('R1:applicability_unknown');
  });

  it('503 when the source is unavailable (fail closed)', async () => {
    approveGovQualification.mockRejectedValue(new SourceUnavailableError());
    const res = await request(app).post(url).send(body);
    expect(res.status).toBe(503);
  });

  it('403 on self-approval (reviewer != approver)', async () => {
    approveGovQualification.mockRejectedValue(new SelfApprovalError());
    const res = await request(app).post(url).send(body);
    expect(res.status).toBe(403);
  });

  it('409 on a stale expected version', async () => {
    approveGovQualification.mockRejectedValue(new QualificationConflictError(5));
    const res = await request(app).post(url).send(body);
    expect(res.status).toBe(409);
    expect(res.body.currentVersion).toBe(5);
  });

  it('passes the request identity as the approver', async () => {
    approveGovQualification.mockResolvedValue({ id: 'q2', version: 2, decision: 'approved_bid_pursuit' });
    await request(app).post(url).send(body);
    expect(approveGovQualification.mock.calls[0][0].approverIdentityId).toBe('reviewer@test');
  });

  it('409 on a degraded/unrecorded source (SourceNotApprovableError) with a recoverable reason', async () => {
    approveGovQualification.mockRejectedValue(new SourceNotApprovableError('degraded'));
    const res = await request(app).post(url).send(body);
    expect(res.status).toBe(409);
    expect(res.body.sourceNotApprovable).toBe(true);
    expect(res.body.reason).toBe('degraded');
  });

  it('422 when evidence coverage is insufficient (EvidenceInsufficientError) with reasons', async () => {
    approveGovQualification.mockRejectedValue(new EvidenceInsufficientError(['no_requirements_established']));
    const res = await request(app).post(url).send(body);
    expect(res.status).toBe(422);
    expect(res.body.evidenceInsufficient).toBe(true);
    expect(res.body.reasons).toContain('no_requirements_established');
  });
});

describe('GET workspace source-state + POST decision established requirements', () => {
  it('reports the honest sourceState/snapshotRecorded from the resolver', async () => {
    govQualFindOne.mockResolvedValue(null);
    const res = await request(app).get(`/api/admin/factory/qualification/${CLEAN_CANONICAL}?biddingEntity=colaberry`);
    expect(res.status).toBe(200);
    expect(res.body.sourceState).toBe('available');
    expect(res.body.snapshotRecorded).toBe(true);
    expect(res.body.coverage.sufficient).toBe(true);
  });

  it('passes reviewer-established requirements through to recordDecision', async () => {
    recordDecision.mockResolvedValue({ id: 'q2', version: 2, decision: 'needs_evidence' });
    const established = [{ id: 'RE1', text: 'SAM registration', applicability: 'always', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement', evidenceRef: { docId: 'D1' } }];
    const res = await request(app).post(`/api/admin/factory/qualification/${CLEAN_CANONICAL}/decision`)
      .send({ biddingEntity: 'colaberry', expectedVersion: 1, decision: 'needs_evidence', establishedRequirements: established });
    expect(res.status).toBe(200);
    expect(recordDecision.mock.calls[0][0].establishedRequirements).toEqual(established);
  });

  it('400s a malformed established requirement (bad applicability enum)', async () => {
    const res = await request(app).post(`/api/admin/factory/qualification/${CLEAN_CANONICAL}/decision`)
      .send({ biddingEntity: 'colaberry', expectedVersion: 1, decision: 'needs_evidence', establishedRequirements: [{ id: 'x', text: 't', applicability: 'maybe', dueStage: 'submission', bindingStatus: 'b' }] });
    expect(res.status).toBe(400);
    expect(recordDecision).not.toHaveBeenCalled();
  });
});

describe('POST review-documents (manual Bonfire-ZIP attestation)', () => {
  const url = `/api/admin/factory/qualification/${CLEAN_CANONICAL}/review-documents`;

  it('add: 201, computes a server sha256, passes mode/coveredDocIds/reviewer to the service', async () => {
    recordDocumentReview.mockResolvedValue({ id: 'q2', version: 2 });
    const res = await request(app).post(url)
      .field('biddingEntity', 'colaberry').field('expectedVersion', '1').field('mode', 'add')
      .field('coveredDocIds', JSON.stringify(['DS1', 'DA1']))
      .attach('document', Buffer.from('pretend-zip-bytes'), 'pkg.zip');
    expect(res.status).toBe(201);
    const arg = recordDocumentReview.mock.calls[0][0];
    expect(arg.mode).toBe('add');
    expect(arg.coveredDocIds).toEqual(['DS1', 'DA1']);
    expect(arg.reviewerIdentityId).toBe('reviewer@test');
    expect(arg.sha256).toMatch(/^[0-9a-f]{64}$/); // server-computed, not client-asserted
    expect(arg.filename).toBe('pkg.zip');
  });

  it('add: 400 when no file is attached', async () => {
    const res = await request(app).post(url)
      .field('biddingEntity', 'colaberry').field('expectedVersion', '1').field('mode', 'add')
      .field('coveredDocIds', JSON.stringify(['DS1']));
    expect(res.status).toBe(400);
    expect(recordDocumentReview).not.toHaveBeenCalled();
  });

  it('revoke: 200 with no file required', async () => {
    recordDocumentReview.mockResolvedValue({ id: 'q2', version: 2 });
    const res = await request(app).post(url)
      .field('biddingEntity', 'colaberry').field('expectedVersion', '1').field('mode', 'revoke')
      .field('coveredDocIds', JSON.stringify(['DA1']));
    expect(res.status).toBe(200);
    expect(recordDocumentReview.mock.calls[0][0].mode).toBe('revoke');
  });

  it('422 when the service rejects an unlisted docId (DocumentNotListedError)', async () => {
    recordDocumentReview.mockRejectedValue(new DocumentNotListedError(['NOPE']));
    const res = await request(app).post(url)
      .field('biddingEntity', 'colaberry').field('expectedVersion', '1').field('mode', 'add')
      .field('coveredDocIds', JSON.stringify(['NOPE'])).attach('document', Buffer.from('z'), 'p.zip');
    expect(res.status).toBe(422);
    expect(res.body.documentNotListed).toBe(true);
    expect(res.body.docIds).toContain('NOPE');
  });

  it('400 on a bad body (coveredDocIds not a JSON array)', async () => {
    const res = await request(app).post(url)
      .field('biddingEntity', 'colaberry').field('expectedVersion', '1').field('mode', 'add')
      .field('coveredDocIds', 'not-json').attach('document', Buffer.from('z'), 'p.zip');
    expect(res.status).toBe(400);
    expect(recordDocumentReview).not.toHaveBeenCalled();
  });

  it('candidates endpoint surfaces the canonical-mapping GAP when v2 is not configured (no fabricated ids)', async () => {
    const prev = process.env.OPPORTUNITY_PULSE_V2_BASE; delete process.env.OPPORTUNITY_PULSE_V2_BASE;
    try {
      const res = await request(app).get('/api/admin/factory/qualification-candidates');
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
      expect(res.body.reason).toBe('not_configured');
      expect(res.body.candidates).toEqual([]);
    } finally {
      if (prev === undefined) delete process.env.OPPORTUNITY_PULSE_V2_BASE; else process.env.OPPORTUNITY_PULSE_V2_BASE = prev;
    }
  });
});

describe('POST extract-requirements (read-only: extract candidates from the solicitation ZIP)', () => {
  const url = `/api/admin/factory/qualification/${CLEAN_CANONICAL}/extract-requirements`;

  it('200: runs extractProposal on the uploaded ZIP, returns mapped candidates + fileCount, and persists NOTHING', async () => {
    extractProposal.mockResolvedValue({
      blocks: [],
      fileCount: 3,
      files: [
        { name: 'rfp.pdf', status: 'extracted', chars: 1200, truncated: false, warning: null },
        { name: 'scan.pdf', status: 'image_only_pdf', chars: 0, truncated: false, warning: 'No extractable text (likely a scanned / image-only PDF) — review it manually or run OCR.' },
      ],
      requirements: [
        { canonicalReqId: 'RQ1', statement: 'Offeror shall be registered in SAM.', extractedText: '...SAM registration...', sourceDocument: 'rfp.pdf', section: 'L.3', kind: 'eligibility', priority: 'must' },
        { canonicalReqId: 'RQ2', statement: 'Submit three past-performance references.', extractedText: '...past performance...', sourceDocument: 'rfp.pdf', section: 'M.2', kind: 'submission', priority: 'should' },
      ],
    });
    const res = await request(app).post(url)
      .field('biddingEntity', 'colaberry')
      .attach('document', Buffer.from('pretend-zip-bytes'), 'solicitation.zip');
    expect(res.status).toBe(200);
    expect(res.body.fileCount).toBe(3);
    // The per-file outcomes are surfaced so the reviewer sees the scanned-PDF (nothing silently dropped).
    expect(res.body.files).toHaveLength(2);
    expect(res.body.files.find((f: any) => f.name === 'scan.pdf').status).toBe('image_only_pdf');
    expect(res.body.candidates).toHaveLength(2);
    expect(res.body.candidates[0]).toEqual({ id: 'RQ1', text: 'Offeror shall be registered in SAM.', extractedText: '...SAM registration...', sourceDocument: 'rfp.pdf', section: 'L.3', kind: 'eligibility', priority: 'must' });
    // read-only: the extractor got the uploaded bytes; no qualification record was read or written
    expect(extractProposal).toHaveBeenCalledTimes(1);
    expect(Buffer.isBuffer(extractProposal.mock.calls[0][0])).toBe(true);
    expect(govQualFindOne).not.toHaveBeenCalled();
    expect(recordDecision).not.toHaveBeenCalled();
    expect(createQualification).not.toHaveBeenCalled();
  });

  it('200: an empty extraction returns no candidates (honest empty-state, not an error)', async () => {
    extractProposal.mockResolvedValue({ blocks: [], fileCount: 1, requirements: [] });
    const res = await request(app).post(url)
      .field('biddingEntity', 'colaberry')
      .attach('document', Buffer.from('z'), 'empty.zip');
    expect(res.status).toBe(200);
    expect(res.body.candidates).toEqual([]);
    expect(res.body.fileCount).toBe(1);
  });

  it('400 when no file is attached (never calls the extractor)', async () => {
    const res = await request(app).post(url).field('biddingEntity', 'colaberry');
    expect(res.status).toBe(400);
    expect(extractProposal).not.toHaveBeenCalled();
  });

  it('400 on a non-canonical opportunity id (never calls the extractor)', async () => {
    const res = await request(app).post('/api/admin/factory/qualification/not-a-canonical/extract-requirements')
      .attach('document', Buffer.from('z'), 'p.zip');
    expect(res.status).toBe(400);
    expect(extractProposal).not.toHaveBeenCalled();
  });

  it('500 when the extractor throws (mapped, never an unhandled crash)', async () => {
    extractProposal.mockRejectedValue(new Error('boom'));
    const res = await request(app).post(url)
      .field('biddingEntity', 'colaberry')
      .attach('document', Buffer.from('z'), 'p.zip');
    expect(res.status).toBe(500);
  });

  it('413 on a zip-bomb upload (rejected at the upload boundary, extractor never called)', async () => {
    const AdmZip = require('adm-zip');
    const bomb = new AdmZip();
    bomb.addFile('zeros.bin', Buffer.alloc(2 * 1024 * 1024, 0)); // ~2 MB of zeros -> tiny compressed, huge ratio
    const res = await request(app).post(url)
      .field('biddingEntity', 'colaberry')
      .attach('document', bomb.toBuffer(), 'bomb.zip');
    expect(res.status).toBe(413);
    expect(res.body.reason).toBe('ratio_too_high');
    expect(extractProposal).not.toHaveBeenCalled(); // refused before the route body opened it
  });
});

describe('DECOUPLED (discovery-ZIP) workspace — gws keys', () => {
  const GWS = 'gws:11111111-1111-4111-a111-111111111111';

  it('create: a gws key routes to createDecoupledQualification (bound to NO OP snapshot) with provenance; canonical create NOT called', async () => {
    createDecoupledQualification.mockResolvedValue({ id: 'q1', version: 1, decision: 'pending_review', canonical_opportunity_id: GWS });
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}`).send({ biddingEntity: 'colaberry', from: 'RFP AI-based IVR Solution', agency: 'City of Fort Worth' });
    expect(res.status).toBe(201);
    const arg = createDecoupledQualification.mock.calls[0][0];
    expect(arg.gwsKey).toBe(GWS);
    expect(arg.sourceSnapshot).toBeUndefined();          // decoupled: bound to NO OP source snapshot
    expect(arg.provenance).toEqual({ uuid: '11111111-1111-4111-a111-111111111111', title: 'RFP AI-based IVR Solution', agency: 'City of Fort Worth' });
    expect(createQualification).not.toHaveBeenCalled();  // not the canonical (snapshot-bound) create
  });

  it('GET: a gws key routes to getDecoupledWorkspace (source:null, zip_workspace, canApprove:false) — no OP re-fetch', async () => {
    getDecoupledWorkspace.mockResolvedValue({ canonicalOpportunityId: GWS, source: null, sourceState: 'zip_workspace', sourceAvailable: false, canApprove: false, evaluation: { evals: [], blocking: [], byDueStage: {}, canApproveBid: true }, coverage: { sufficient: false, reasons: ['pursuit_approval_not_enabled_on_this_path'] }, qualification: null, provenance: null });
    const res = await request(app).get(`/api/admin/factory/qualification/${GWS}?biddingEntity=colaberry`);
    expect(res.status).toBe(200);
    expect(res.body.source).toBeNull();
    expect(res.body.sourceState).toBe('zip_workspace');
    expect(res.body.canApprove).toBe(false);
    expect(getDecoupledWorkspace).toHaveBeenCalledWith('ten-1', GWS, 'colaberry');
  });

  it('400 on a key matching NEITHER the canonical nor the gws namespace', async () => {
    const res = await request(app).get('/api/admin/factory/qualification/not-a-valid-key');
    expect(res.status).toBe(400);
    expect(getDecoupledWorkspace).not.toHaveBeenCalled();
  });

  it('approve on a gws key runs the DECOUPLED approval (200), not the canonical OP approval', async () => {
    approveDecoupledQualification.mockResolvedValue({ id: 'q2', version: 2, decision: 'approved_bid_pursuit' });
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/approve`).send({ biddingEntity: 'colaberry', expectedVersion: 1, decision: 'approved_bid_pursuit' });
    expect(res.status).toBe(200);
    expect(approveDecoupledQualification.mock.calls[0][0].approverIdentityId).toBe('reviewer@test');
    expect(approveDecoupledQualification.mock.calls[0][0].gwsKey).toBe(GWS);
    expect(approveGovQualification).not.toHaveBeenCalled(); // canonical OP approval never runs for a gws key
  });

  it('decoupled approve maps the gate errors (422 evidence-insufficient, 403 self-approval)', async () => {
    approveDecoupledQualification.mockRejectedValueOnce(new EvidenceInsufficientError(['no_zip_attested']));
    let res = await request(app).post(`/api/admin/factory/qualification/${GWS}/approve`).send({ biddingEntity: 'colaberry', expectedVersion: 1, decision: 'approved_bid_pursuit' });
    expect(res.status).toBe(422);
    expect(res.body.evidenceInsufficient).toBe(true);
    approveDecoupledQualification.mockRejectedValueOnce(new SelfApprovalError());
    res = await request(app).post(`/api/admin/factory/qualification/${GWS}/approve`).send({ biddingEntity: 'colaberry', expectedVersion: 1, decision: 'approved_bid_pursuit' });
    expect(res.status).toBe(403);
  });

  it('extract-requirements accepts a gws key (proposal capture works on the decoupled path)', async () => {
    extractProposal.mockResolvedValue({ blocks: [], fileCount: 1, requirements: [{ canonicalReqId: 'RQ1', statement: 'Offeror shall be registered in SAM.', extractedText: '...', sourceDocument: 'rfp.pdf', section: 'L.1', kind: 'eligibility', priority: 'must' }] });
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/extract-requirements`).attach('document', Buffer.from('zip'), 'rfp.zip');
    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(1);
  });

  it('decision (establish) accepts a gws key (confirm requirements into the Proposal)', async () => {
    recordDecision.mockResolvedValue({ id: 'q2', version: 2, decision: 'needs_evidence' });
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/decision`)
      .send({ biddingEntity: 'colaberry', expectedVersion: 1, decision: 'needs_evidence', establishedRequirements: [{ id: 'RQ1', text: 'Offeror shall be registered in SAM.', applicability: 'always', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement' }] });
    expect(res.status).toBe(200);
    expect(recordDecision.mock.calls[0][0].canonicalOpportunityId).toBe(GWS);
  });

  it('a gws key is REJECTED (400) on the canonical-only /review-documents route (decoupled attestation is a later slice)', async () => {
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/review-documents`)
      .field('biddingEntity', 'colaberry').field('expectedVersion', '1').field('mode', 'add').field('coveredDocIds', JSON.stringify(['DS1']))
      .attach('document', Buffer.from('z'), 'p.zip');
    expect(res.status).toBe(400);
    expect(recordDocumentReview).not.toHaveBeenCalled();
  });

  it('attest-zip: a gws key records the ZIP attestation (201) with a SERVER-computed sha256', async () => {
    recordZipAttestation.mockResolvedValue({ id: 'q2', version: 2 });
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/attest-zip`)
      .field('biddingEntity', 'colaberry').field('expectedVersion', '1').field('mode', 'add')
      .attach('document', Buffer.from('zip-bytes'), 'solicitation.zip');
    expect(res.status).toBe(201);
    const arg = recordZipAttestation.mock.calls[0][0];
    expect(arg.gwsKey).toBe(GWS);
    expect(arg.sha256).toMatch(/^[0-9a-f]{64}$/); // server-computed, not client-asserted
    expect(arg.mode).toBe('add');
    expect(arg.filename).toBe('solicitation.zip');
    expect(arg.reviewerIdentityId).toBe('reviewer@test');
  });

  it('attest-zip add: RETAINS the solicitation ZIP (private byte-store) keyed to the tenant + gws key, and surfaces the bundle', async () => {
    recordZipAttestation.mockResolvedValue({ id: 'q2', version: 2 });
    storeGovSourceBundle.mockResolvedValue({ id: 'bundle-xyz', filename: 'solicitation.zip', mime: 'application/zip', byte_size: 9, sha256: 'b'.repeat(64), deduped: false });
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/attest-zip`)
      .field('biddingEntity', 'colaberry').field('expectedVersion', '1').field('mode', 'add')
      .attach('document', Buffer.from('zip-bytes'), 'solicitation.zip');
    expect(res.status).toBe(201);
    expect(storeGovSourceBundle).toHaveBeenCalledTimes(1);
    expect(storeGovSourceBundle.mock.calls[0][0]).toBe('ten-1'); // scope.tenantId
    expect(storeGovSourceBundle.mock.calls[0][1]).toBe(GWS);     // qualification key
    expect(Buffer.isBuffer(storeGovSourceBundle.mock.calls[0][2].buffer)).toBe(true);
    expect(res.body.sourceBundle).toMatchObject({ id: 'bundle-xyz', stored: true, deduped: false });
  });

  it('attest-zip add: a byte-store FAILURE is non-fatal but SURFACED — the attestation gate still records (201), sourceBundle.stored=false', async () => {
    recordZipAttestation.mockResolvedValue({ id: 'q2', version: 2 });
    storeGovSourceBundle.mockRejectedValue(new Error('disk full'));
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/attest-zip`)
      .field('biddingEntity', 'colaberry').field('expectedVersion', '1').field('mode', 'add')
      .attach('document', Buffer.from('zip-bytes'), 'solicitation.zip');
    expect(res.status).toBe(201);
    expect(recordZipAttestation).toHaveBeenCalledTimes(1); // the gate recorded regardless
    expect(res.body.sourceBundle).toEqual({ stored: false, reason: 'storage_failed' });
  });

  it('attest-zip: revoke needs no file (200), retains nothing (never calls the byte-store), sourceBundle null', async () => {
    recordZipAttestation.mockResolvedValue({ id: 'q2', version: 2 });
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/attest-zip`)
      .field('biddingEntity', 'colaberry').field('expectedVersion', '1').field('mode', 'revoke');
    expect(res.status).toBe(200);
    expect(recordZipAttestation.mock.calls[0][0].mode).toBe('revoke');
    expect(storeGovSourceBundle).not.toHaveBeenCalled();
    expect(res.body.sourceBundle).toBeNull();
  });

  it('attest-zip: 400 when add has no file', async () => {
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/attest-zip`)
      .field('biddingEntity', 'colaberry').field('expectedVersion', '1').field('mode', 'add');
    expect(res.status).toBe(400);
    expect(recordZipAttestation).not.toHaveBeenCalled();
  });

  it('attest-zip: a CANONICAL key is rejected 400 (attestation is gws-only; canonical uses review-documents)', async () => {
    const res = await request(app).post(`/api/admin/factory/qualification/${CLEAN_CANONICAL}/attest-zip`)
      .field('biddingEntity', 'colaberry').field('expectedVersion', '1').field('mode', 'add')
      .attach('document', Buffer.from('z'), 's.zip');
    expect(res.status).toBe(400);
    expect(recordZipAttestation).not.toHaveBeenCalled();
  });
});

describe('GET source-bundle/:bundleId (download the retained evidence-of-record ZIP)', () => {
  const nodeFs = require('fs');
  const nodeOs = require('os');
  const nodePath = require('path');
  const GWS = 'gws:11111111-1111-4111-a111-111111111111';
  const BUNDLE_ID = '22222222-2222-4222-a222-222222222222';
  const url = `/api/admin/factory/qualification/${GWS}/source-bundle/${BUNDLE_ID}`;
  let tmpFile = '';

  beforeAll(() => {
    tmpFile = nodePath.join(nodeOs.tmpdir(), `gov-bundle-test-${Date.now()}.zip`);
    nodeFs.writeFileSync(tmpFile, Buffer.from('PK pretend-zip-bytes'));
  });
  afterAll(() => { try { nodeFs.unlinkSync(tmpFile); } catch { /* best effort */ } });

  it('200: streams the retained bundle, scoped to this tenant + qualification, as an attachment', async () => {
    loadGovSourceBundleScoped.mockResolvedValue({ path: tmpFile, mime: 'application/zip', filename: 'solicitation.zip' });
    const res = await request(app).get(url);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('solicitation.zip');
    // scoped on all three — tenant from scopeOrFail, the gws key from the path, the bundle id from the path
    expect(loadGovSourceBundleScoped).toHaveBeenCalledWith('ten-1', GWS, BUNDLE_ID);
  });

  it('404 when the bundle is not this tenant/qualification (loader returns null — enumeration-safe)', async () => {
    loadGovSourceBundleScoped.mockResolvedValue(null);
    const res = await request(app).get(url);
    expect(res.status).toBe(404);
  });

  it('400 on a malformed bundle id (never calls the loader)', async () => {
    const res = await request(app).get(`/api/admin/factory/qualification/${GWS}/source-bundle/not-a-uuid`);
    expect(res.status).toBe(400);
    expect(loadGovSourceBundleScoped).not.toHaveBeenCalled();
  });
});

describe('POST link + authorize-build', () => {
  const PID = '11111111-1111-4111-a111-111111111111';

  it('409s an alias conflict (opportunity already linked elsewhere)', async () => {
    linkGovOpportunity.mockRejectedValue(new AliasConflictError('other-dp'));
    const res = await request(app).post(`/api/admin/factory/qualification/${CLEAN_CANONICAL}/link`).send({ deliveryProjectId: PID, linkReason: 'match' });
    expect(res.status).toBe(409);
    expect(res.body.existingDeliveryProjectId).toBe('other-dp');
  });

  it('records a separate build authorization with the request identity as approver', async () => {
    authorizeBuild.mockResolvedValue({ id: 'ba-1' });
    const res = await request(app).post(`/api/admin/factory/qualification/${CLEAN_CANONICAL}/authorize-build`)
      .send({ deliveryProjectId: PID, scope: 'proposal-solution', resourceLimit: '2 agents / 8h' });
    expect(res.status).toBe(201);
    expect(authorizeBuild.mock.calls[0][0].approverIdentityId).toBe('reviewer@test');
  });

  it('T7: ACCEPTS a gws (decoupled) key for authorize-build — keyed on the body deliveryProjectId, not the path key', async () => {
    // Previously a gws key hit canonicalParam and 400'd, so a decoupled pursuit (what step 6 creates projects for)
    // could never be build-authorized. authorize-build never consults the OP snapshot, so it safely accepts gws.
    authorizeBuild.mockResolvedValue({ id: 'ba-gws' });
    const res = await request(app).post('/api/admin/factory/qualification/gws:04ac1711-c3f6-418a-9d9b-c5e6211295ec/authorize-build')
      .send({ deliveryProjectId: PID, scope: 'proposal-solution', resourceLimit: '2 agents / 8h' });
    expect(res.status).toBe(201);
    expect(authorizeBuild.mock.calls[0][0].deliveryProjectId).toBe(PID);       // the body project, not the path key
    expect(authorizeBuild.mock.calls[0][0].approverIdentityId).toBe('reviewer@test');
  });

  it('T7: the gate is unchanged for gws — a missing scope/resourceLimit is still a 400', async () => {
    const res = await request(app).post('/api/admin/factory/qualification/gws:04ac1711-c3f6-418a-9d9b-c5e6211295ec/authorize-build')
      .send({ deliveryProjectId: PID }); // no scope, no resourceLimit
    expect(res.status).toBe(400);
    expect(authorizeBuild).not.toHaveBeenCalled(); // rejected at the body schema, before the service
  });

  it('400s an empty build authorization (BuildNotAuthorizedError from validate-before-write)', async () => {
    authorizeBuild.mockRejectedValue(new BuildNotAuthorizedError('missing_resource_limit'));
    const res = await request(app).post(`/api/admin/factory/qualification/${CLEAN_CANONICAL}/authorize-build`)
      .send({ deliveryProjectId: PID, scope: 's', resourceLimit: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('missing_resource_limit');
  });
});

describe('step 6 — two-track project creation on approval (behind FLAGS.govIngestion, ships dark)', () => {
  const GWS = 'gws:04ac1711-c3f6-418a-9d9b-c5e6211295ec';
  const approvedQ = { id: 'q-approved', requirements_json: { established: [{ id: 'REQ-1', text: 't' }], provenance: { title: 'RFP IVR' } } };
  const approve = () => request(app)
    .post(`/api/admin/factory/qualification/${encodeURIComponent(GWS)}/approve`)
    .send({ biddingEntity: 'colaberry', expectedVersion: 2, decision: 'approved_bid_pursuit' });
  afterEach(() => { (FLAGS as any).govIngestion = false; });

  it('flag OFF (default): approval does NOT create a project', async () => {
    approveDecoupledQualification.mockResolvedValue(approvedQ);
    const r = await approve();
    expect(r.status).toBe(200);
    expect(ensureGovTwoTrackProject).not.toHaveBeenCalled();
    expect(r.body.projectWarning).toBeUndefined();
  });

  it('flag ON: approval creates the two-track project from the established requirements', async () => {
    (FLAGS as any).govIngestion = true;
    approveDecoupledQualification.mockResolvedValue(approvedQ);
    ensureGovTwoTrackProject.mockResolvedValue({ deliveryProjectId: 'dp-1', created: true, tracks: 2, requirements: 1 });
    const r = await approve();
    expect(r.status).toBe(200);
    expect(ensureGovTwoTrackProject).toHaveBeenCalledTimes(1);
    expect(ensureGovTwoTrackProject.mock.calls[0][0]).toMatchObject({ qualificationId: 'q-approved', canonicalOpportunityId: GWS, established: [{ id: 'REQ-1', text: 't' }] });
    expect(r.body.qualification).toMatchObject({ id: 'q-approved' });
    expect(r.body.projectWarning).toBeUndefined();
  });

  it('flag ON but project creation fails: the approval STILL succeeds (best-effort) with a non-fatal warning', async () => {
    (FLAGS as any).govIngestion = true;
    approveDecoupledQualification.mockResolvedValue(approvedQ);
    ensureGovTwoTrackProject.mockRejectedValue(new Error('boom'));
    const r = await approve();
    expect(r.status).toBe(200);
    expect(r.body.qualification).toMatchObject({ id: 'q-approved' });
    expect(r.body.projectWarning).toContain('will be retried');
  });
});

describe('POST/DELETE build-stories/:storyId/assign (P3-T2 assignment)', () => {
  const GWS = 'gws:4d14fa10-5752-4ad3-bbea-061453ac6341';
  const STORY = 'STORY-REQ-1';
  const ASSIGNEE = '11111111-1111-4111-8111-111111111111'; // a real v4 UUID (DataTypes.UUIDV4 shape)
  const assignUrl = `/api/admin/factory/qualification/${GWS}/build-stories/${STORY}/assign`;

  it('assigns: resolves the gws→project, derives the canonical req id, and records the operator as assigner', async () => {
    resolveDecoupledDeliveryProjectId.mockResolvedValue('dp-1');
    resolveGovProjectActor.mockResolvedValue({ platformIdentityId: 'op-id', email: 'reviewer@test' });
    assignBuildStory.mockResolvedValue({ id: 'as-1', storyId: STORY, canonicalReqId: 'REQ-1', assigneeIdentityId: ASSIGNEE, assignedByIdentityId: 'op-id', assignedAt: null });
    const res = await request(app).post(assignUrl).send({ assigneeIdentityId: ASSIGNEE });
    expect(res.status).toBe(200);
    expect(assignBuildStory).toHaveBeenCalledWith(expect.objectContaining({
      deliveryProjectId: 'dp-1', storyId: STORY, canonicalReqId: 'REQ-1', assigneeIdentityId: ASSIGNEE, assignedByIdentityId: 'op-id',
    }));
    expect(res.body.assigneeIdentityId).toBe(ASSIGNEE);
  });

  it('404s when the opportunity has no delivery project yet (not approved)', async () => {
    resolveDecoupledDeliveryProjectId.mockResolvedValue(null);
    const res = await request(app).post(assignUrl).send({ assigneeIdentityId: ASSIGNEE });
    expect(res.status).toBe(404);
    expect(assignBuildStory).not.toHaveBeenCalled();
  });

  it('422s with the reason when the assignee is not a builder (the service rail)', async () => {
    resolveDecoupledDeliveryProjectId.mockResolvedValue('dp-1');
    resolveGovProjectActor.mockResolvedValue({ platformIdentityId: 'op-id', email: 'reviewer@test' });
    assignBuildStory.mockRejectedValue(new AssignmentError('The assignee is not a builder on this project.', 'assignee_not_builder'));
    const res = await request(app).post(assignUrl).send({ assigneeIdentityId: ASSIGNEE });
    expect(res.status).toBe(422);
    expect(res.body.reason).toBe('assignee_not_builder');
  });

  it('400s a non-uuid assignee and a non-STORY story id, without calling the service', async () => {
    const bad = await request(app).post(assignUrl).send({ assigneeIdentityId: 'not-a-uuid' });
    expect(bad.status).toBe(400);
    const badStory = await request(app).post(`/api/admin/factory/qualification/${GWS}/build-stories/REQ-1/assign`).send({ assigneeIdentityId: ASSIGNEE });
    expect(badStory.status).toBe(400);
    expect(assignBuildStory).not.toHaveBeenCalled();
  });

  it('DELETE removes the assignment (back to unassigned) via the resolved project', async () => {
    resolveDecoupledDeliveryProjectId.mockResolvedValue('dp-1');
    unassignBuildStory.mockResolvedValue({ ok: true, removed: 1 });
    const res = await request(app).delete(assignUrl);
    expect(res.status).toBe(200);
    expect(unassignBuildStory).toHaveBeenCalledWith('dp-1', STORY);
    expect(res.body).toMatchObject({ ok: true, removed: 1 });
  });
});

describe('P4 proposal-production routes', () => {
  const GWS = 'gws:4d14fa10-5752-4ad3-bbea-061453ac6341';
  const REQ = 'R1';
  beforeEach(() => {
    resolveDecoupledDeliveryProjectId.mockResolvedValue('dp-1');
    resolveGovProjectActor.mockResolvedValue({ platformIdentityId: 'op-id', email: 'reviewer@test' });
  });

  it('POST responses/:req saves the authored response and records the operator as author', async () => {
    saveProposalResponse.mockResolvedValue({ requirementId: REQ, status: 'draft', content: 'We comply.', figures: [], authoredByIdentityId: 'op-id', reviewedByIdentityId: null, updatedAt: null });
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/responses/${REQ}`).send({ content: 'We comply.' });
    expect(res.status).toBe(200);
    expect(saveProposalResponse).toHaveBeenCalledWith(expect.objectContaining({ deliveryProjectId: 'dp-1', requirementId: REQ, content: 'We comply.', authoredByIdentityId: 'op-id' }));
  });

  it('POST responses/:req/review maps a lifecycle violation (draft→approved) to 409 with the reason', async () => {
    reviewProposalResponse.mockRejectedValue(new ResponseError('A response must be reviewed before it can be approved.', 'not_reviewed'));
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/responses/${REQ}/review`).send({ decision: 'approved' });
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('not_reviewed');
  });

  it('POST responses/:req/figures maps an unbound figure to 422', async () => {
    addProposalFigure.mockRejectedValue(new ResponseError('A figure must be bound to a commit.', 'figure_not_commit_bound'));
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/responses/${REQ}/figures`).send({ ref: 'docs/x.png' });
    expect(res.status).toBe(422);
    expect(res.body.reason).toBe('figure_not_commit_bound');
  });

  it('404s a response write before the opportunity has a delivery project', async () => {
    resolveDecoupledDeliveryProjectId.mockResolvedValue(null);
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/responses/${REQ}`).send({ content: 'x' });
    expect(res.status).toBe(404);
    expect(saveProposalResponse).not.toHaveBeenCalled();
  });

  it('POST amendments records an inbox entry (the service runs the invalidation)', async () => {
    recordProposalAmendment.mockResolvedValue({ id: 'am-1', amendmentKey: 'ADD-2', kind: 'amendment', summary: 's', affects: ['R1'], provenance: null, observedAt: null, invalidatedCount: 1, createdAt: null });
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/amendments`).send({ amendmentKey: 'ADD-2', summary: 's', affects: ['R1'] });
    expect(res.status).toBe(200);
    expect(recordProposalAmendment).toHaveBeenCalledWith(expect.objectContaining({ deliveryProjectId: 'dp-1', amendmentKey: 'ADD-2', affects: ['R1'] }));
    expect(res.body.invalidatedCount).toBe(1);
  });
});

describe('P5 submission + outcome routes', () => {
  const GWS = 'gws:4d14fa10-5752-4ad3-bbea-061453ac6341';
  const ws = (over: any = {}) => ({
    responseSlots: [{ requirementId: 'R1', statement: 'x', sourceRef: null, status: 'approved', content: 'c', figures: [] }],
    coverage: { sufficient: true, reasons: [] }, evaluation: { canApproveBid: true }, provenance: { title: 'TxDOT' }, ...over,
  });
  beforeEach(() => { resolveDecoupledDeliveryProjectId.mockResolvedValue('dp-1'); getDecoupledWorkspace.mockResolvedValue(ws()); });

  it('export: 409 not_ready + blocking when a response is not approved', async () => {
    exportSubmission.mockRejectedValue(new SubmissionError('not ready', 'not_ready', ['responses_not_approved:R1']));
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/submission/export`).send({});
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('not_ready');
    expect(res.body.blocking).toContain('responses_not_approved:R1');
  });

  it('export: 200 passes the workspace readiness signals to the service', async () => {
    exportSubmission.mockResolvedValue({ status: 'exported', outcome: 'pending', exportManifest: { responseCount: 1 } });
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/submission/export`).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('exported');
    expect(exportSubmission).toHaveBeenCalledWith(expect.objectContaining({ deliveryProjectId: 'dp-1', projectName: 'TxDOT', coverageSufficient: true, canApproveBid: true }));
  });

  it('package: downloads a REAL zip (application/zip attachment, non-empty) when the current responses are ready', async () => {
    const res = await request(app).get(`/api/admin/factory/qualification/${GWS}/submission/package`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(Number(res.headers['content-length'])).toBeGreaterThan(0);
  });

  it('package: 409 not_ready when a material amendment reopened a response (current responses not all approved)', async () => {
    getDecoupledWorkspace.mockResolvedValue(ws({ responseSlots: [{ requirementId: 'R1', statement: 'x', sourceRef: null, status: 'revision_required', content: 'c', figures: [] }] }));
    const res = await request(app).get(`/api/admin/factory/qualification/${GWS}/submission/package`);
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('not_ready');
  });

  it('receipt: 409 not_exported maps through (exported ≠ submitted)', async () => {
    recordSubmissionReceipt.mockRejectedValue(new SubmissionError('export first', 'not_exported'));
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/submission/receipt`).send({ externalRef: 'CONF-9' });
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('not_exported');
  });

  it('outcome: 200 records won (the service generates the private candidates)', async () => {
    recordOutcome.mockResolvedValue({ status: 'preparing', outcome: 'won', caseStudyCandidate: { published: false } });
    const res = await request(app).post(`/api/admin/factory/qualification/${GWS}/outcome`).send({ outcome: 'won' });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('won');
    expect(recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ deliveryProjectId: 'dp-1', projectName: 'TxDOT', outcome: 'won' }));
  });
});
