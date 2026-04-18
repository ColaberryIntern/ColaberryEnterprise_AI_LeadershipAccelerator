import crypto from 'crypto';

/**
 * Regression test: after refactoring `verifySignature` to the shared
 * `verifyHmacSignature` in utils/hmac.ts, the advisory webhook must
 * still reject requests with an invalid signature while accepting
 * requests with a valid one.
 *
 * The handler is deeply coupled to the DB for the happy path (loads
 * services lazily, writes leads + activities), so we assert only the
 * signature-gate behavior here. Deeper integration is covered by the
 * manual e2e checklist in the plan.
 */

jest.mock('../../services/activityService', () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const SECRET = 'test-advisory-secret';
process.env.ADVISORY_WEBHOOK_SECRET = SECRET;

import { handleAdvisoryWebhook } from '../../controllers/advisorySyncController';

function buildReq(body: any, signature?: string) {
  const rawBody = JSON.stringify(body);
  return {
    headers: {
      'x-webhook-signature': signature || '',
      'x-webhook-event': body.event || '',
    },
    body,
    _rawBody: rawBody,
  } as any;
}

function buildRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function sign(payload: string, secret: string) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

describe('advisorySyncController signature verification regression', () => {
  it('rejects invalid signature with 403', async () => {
    const body = { event: 'recommendation.created', data: {} };
    const req = buildReq(body, 'sha256=deadbeef');
    const res = buildRes();

    await handleAdvisoryWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid signature' }));
  });

  it('accepts a correctly signed request for an unknown event', async () => {
    const body = { event: 'some.event.not.handled', data: {} };
    const req = buildReq(body, sign(JSON.stringify(body), SECRET));
    const res = buildRes();

    await handleAdvisoryWebhook(req, res);

    // Unknown events short-circuit to 200 + "not handled" — proves we passed
    // through the signature gate without hitting an error.
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
