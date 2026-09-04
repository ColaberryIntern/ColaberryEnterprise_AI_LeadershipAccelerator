/**
 * The receiving end of a journey link.
 *
 * `jx` tokens have been minted correctly onto every campaign link since the rewriter
 * shipped, and every one of them was thrown away on arrival: `handleIdentify` demanded
 * an `email`, and the SDK's identify call deliberately sends no email — carrying the
 * address in the URL is the exact thing the token exists to avoid. The endpoint answered
 * 400 to the whole mechanism, `verifyJourneyToken` had no callers, and nothing anywhere
 * threw. Confirmed against production before it was fixed:
 *
 *   POST /api/t/identify {fingerprint, jx}  ->  400 {"error":"valid email is required"}
 *
 * Three properties are worth pinning, and they fail in different directions.
 *
 * IT MUST WORK AT ALL. A valid token binds the browser to the lead it names. This is the
 * only reason the token exists, so a regression here silently returns the system to
 * counting one person as two whenever they cross between brands.
 *
 * IT MUST NOT MANUFACTURE LEADS. The token path never creates a Lead. The email path
 * does, legitimately, because a human typed the address in. A token is a claim about
 * someone who already exists; if it could create, then anyone able to mint one could
 * populate the CRM, and a stale token would resurrect a deleted lead as a side effect of
 * someone clicking an old email.
 *
 * IT MUST NOT BECOME AN ORACLE. Every outcome on the token path answers 204 — verified,
 * tampered, expired, and valid-but-no-such-lead alike. A distinguishable response would
 * let anyone enumerate which lead ids exist and which tokens are still live, using
 * nothing but an unauthenticated endpoint.
 */
import { Request, Response } from 'express';

jest.mock('../../models', () => ({
  Lead: { findByPk: jest.fn(), findOrCreate: jest.fn() },
  Visitor: { findByPk: jest.fn() },
  VisitorSession: { findOne: jest.fn() },
}));
jest.mock('../../services/visitorTrackingService', () => ({
  findOrCreateVisitor: jest.fn(),
  resolveIdentity: jest.fn(),
  getOrCreateSession: jest.fn(),
  recordPageEvent: jest.fn(),
  categorizePagePath: jest.fn(),
  updateHeartbeat: jest.fn(),
}));
jest.mock('../../services/behavioralSignalService', () => ({ detectSessionSignals: jest.fn() }));
jest.mock('../../services/intentScoringService', () => ({ computeIntentScore: jest.fn() }));
jest.mock('../../services/behavioralTriggerService', () => ({ evaluateVisitorForTriggers: jest.fn() }));
jest.mock('../../services/governanceService', () => ({ logAgentExecution: jest.fn() }));

import { Lead } from '../../models';
import { findOrCreateVisitor, resolveIdentity } from '../../services/visitorTrackingService';
import { createJourneyToken } from '../../modules/attribution/journeyLinkService';
import { env } from '../../config/env';
import { handleIdentify } from '../trackingController';

const FP = 'b'.repeat(40);
const VISITOR = 'visitor-uuid-1';
const LEAD_ID = 4242;

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res as Response & { status: jest.Mock; json: jest.Mock; end: jest.Mock };
}

function reqWith(body: Record<string, unknown>): Request {
  return { body, headers: {}, ip: '203.0.113.9' } as unknown as Request;
}

describe('handleIdentify — journey token path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (env as any).enableVisitorTracking = true;
    (findOrCreateVisitor as jest.Mock).mockResolvedValue(VISITOR);
    (resolveIdentity as jest.Mock).mockResolvedValue(undefined);
  });

  it('binds the browser to the lead the token names, with no email in the request', async () => {
    (Lead.findByPk as jest.Mock).mockResolvedValue({ id: LEAD_ID });
    const token = createJourneyToken({ leadId: LEAD_ID });

    const res = mockRes();
    await handleIdentify(reqWith({ fingerprint: FP, jx: token }), res);

    // The binding is the whole feature. Asserting only the status code would pass even
    // if the handler returned 204 without ever linking anything.
    expect(resolveIdentity).toHaveBeenCalledWith(VISITOR, LEAD_ID);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('never creates a lead from a token', async () => {
    (Lead.findByPk as jest.Mock).mockResolvedValue({ id: LEAD_ID });
    const token = createJourneyToken({ leadId: LEAD_ID });

    await handleIdentify(reqWith({ fingerprint: FP, jx: token }), mockRes());

    expect(Lead.findOrCreate).not.toHaveBeenCalled();
  });

  it('answers 204 and binds nothing when the token names a lead that does not exist', async () => {
    (Lead.findByPk as jest.Mock).mockResolvedValue(null);
    const token = createJourneyToken({ leadId: 999999 });

    const res = mockRes();
    await handleIdentify(reqWith({ fingerprint: FP, jx: token }), res);

    expect(resolveIdentity).not.toHaveBeenCalled();
    expect(Lead.findOrCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('rejects a tampered token without binding, and without saying why', async () => {
    (Lead.findByPk as jest.Mock).mockResolvedValue({ id: LEAD_ID });
    const good = createJourneyToken({ leadId: LEAD_ID });
    // Flip the payload but keep the original signature — the classic forgery attempt.
    const forged = Buffer.from(JSON.stringify({ l: 1, exp: 99999999999 }))
      .toString('base64url') + '.' + good.split('.')[1];

    const res = mockRes();
    await handleIdentify(reqWith({ fingerprint: FP, jx: forged }), res);

    expect(resolveIdentity).not.toHaveBeenCalled();
    expect(Lead.findByPk).not.toHaveBeenCalled();
    // Identical to the success response, so the two cannot be told apart from outside.
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('rejects an expired token', async () => {
    (Lead.findByPk as jest.Mock).mockResolvedValue({ id: LEAD_ID });
    const token = createJourneyToken({ leadId: LEAD_ID, ttlSeconds: 1 });

    // Fake timers, not a Date.now spy: verifyJourneyToken defaults its clock to
    // `new Date()`, which a Date.now spy does not move. The first draft of this test
    // mocked Date.now, saw the token accepted, and looked like an expiry bug in the
    // product. It was a bug in the test.
    jest.useFakeTimers().setSystemTime(new Date(Date.now() + 2000));
    try {
      const res = mockRes();
      await handleIdentify(reqWith({ fingerprint: FP, jx: token }), res);
      expect(resolveIdentity).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
    } finally {
      jest.useRealTimers();
    }
  });

  it('is idempotent: the same token twice produces the same binding, not two leads', async () => {
    (Lead.findByPk as jest.Mock).mockResolvedValue({ id: LEAD_ID });
    const token = createJourneyToken({ leadId: LEAD_ID });

    await handleIdentify(reqWith({ fingerprint: FP, jx: token }), mockRes());
    await handleIdentify(reqWith({ fingerprint: FP, jx: token }), mockRes());

    expect(resolveIdentity).toHaveBeenNthCalledWith(1, VISITOR, LEAD_ID);
    expect(resolveIdentity).toHaveBeenNthCalledWith(2, VISITOR, LEAD_ID);
    expect(Lead.findOrCreate).not.toHaveBeenCalled();
  });

  it('still requires a fingerprint, token or not', async () => {
    const res = mockRes();
    await handleIdentify(reqWith({ jx: createJourneyToken({ leadId: LEAD_ID }) }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(resolveIdentity).not.toHaveBeenCalled();
  });

  it('leaves the email path exactly as it was when no token is present', async () => {
    const res = mockRes();
    await handleIdentify(reqWith({ fingerprint: FP }), res);

    // The regression this guards against is a fix that makes email optional for
    // everyone, which would let any caller bind a browser to a lead of their choosing.
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'valid email is required' });
  });
});
