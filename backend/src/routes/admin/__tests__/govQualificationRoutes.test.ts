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
jest.mock('../../../services/factory/govQualification', () => {
  const actual = jest.requireActual('../../../services/factory/govQualification');
  return { ...actual, createQualification: (...a: any[]) => createQualification(...a), recordDecision: (...a: any[]) => recordDecision(...a), approveGovQualification: (...a: any[]) => approveGovQualification(...a) };
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

import express from 'express';
import request from 'supertest';
import govQualificationRoutes from '../govQualificationRoutes';
import {
  ChangedSourceError, QualificationBlockedError, SourceUnavailableError, SelfApprovalError, QualificationConflictError,
  SourceNotApprovableError, EvidenceInsufficientError,
} from '../../../services/factory/govQualification';
import { BuildNotAuthorizedError } from '../../../services/factory/buildAuthorization';
import { AliasConflictError } from '../../../services/factory/opportunities/govOpportunityAlias';
import { CLEAN_CANONICAL, BLOCKING_CANONICAL, UNAVAILABLE_CANONICAL } from '../../../services/factory/opportunities/govOpportunityFixtures';

const app = express();
app.use(express.json());
app.use(govQualificationRoutes);

const CONTAINER = { tenant: { id: 'ten-1' }, org: { id: 'org-1' } };
beforeEach(() => { jest.clearAllMocks(); lookupGovContractsContainer.mockResolvedValue(CONTAINER); });

describe('the section gate + tenant scoping', () => {
  it('mounts every route behind requireSection("program") (source-level, route-auth lint)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'govQualificationRoutes.ts'), 'utf8');
    const routeLines = src.split('\n').filter((l) => /router\.(get|post)\(/.test(l));
    expect(routeLines.length).toBe(7);
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

  it('400s an empty build authorization (BuildNotAuthorizedError from validate-before-write)', async () => {
    authorizeBuild.mockRejectedValue(new BuildNotAuthorizedError('missing_resource_limit'));
    const res = await request(app).post(`/api/admin/factory/qualification/${CLEAN_CANONICAL}/authorize-build`)
      .send({ deliveryProjectId: PID, scope: 's', resourceLimit: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('missing_resource_limit');
  });
});
