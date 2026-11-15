import fs from 'fs';
import path from 'path';
import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

/**
 * T13 - the boundary over the outbound approval queue.
 *
 * The queue's own decisions are covered in `services/maya/__tests__/mayaOutboundQueue.test.ts`
 * and the service is mocked here, so this file is about four things the route owns and the
 * service cannot defend on its own:
 *
 *   1. WHO MAY DECIDE. Approving is Ali's; rejecting is any admin's.
 *   2. WHOSE NAME GOES ON THE DECISION. The authenticated identity, never a body field. This is
 *      the one that matters most: `approvalRequestTimeoutJob.ts` wrote `decided_by` from its own
 *      code, and a route that accepted an approver from the wire would be the same hole with a
 *      nicer shape.
 *   3. THAT A REFUSAL IS AN HTTP ANSWER. Not a 200 with `ok: false` that a screen renders as
 *      "sent", and not a 500 that reads as a bug.
 *   4. THAT NO BULK CONTROL EXISTS. Read structurally, from the source.
 */

const mockList = jest.fn();
const mockApprove = jest.fn();
const mockReject = jest.fn();
jest.mock('../../../services/maya/mayaOutboundQueue', () => ({
  listPendingOutbound: (...a: unknown[]) => mockList(...a),
  approveOutbound: (...a: unknown[]) => mockApprove(...a),
  rejectOutbound: (...a: unknown[]) => mockReject(...a),
}));

const mockFindByPk = jest.fn();
jest.mock('../../../models/MayaOutboundApproval', () => ({
  __esModule: true,
  default: { findByPk: (...a: unknown[]) => mockFindByPk(...a) },
}));

import routes from '../mayaOutboundRoutes';
import { env } from '../../../config/env';

const token = (email: string, role: string) =>
  `Bearer ${jwt.sign({ sub: 'u1', email, role }, env.jwtSecret, { expiresIn: '5m' })}`;
const ALI = token('ali@colaberry.com', 'admin');
const OTHER_ADMIN = token('ops@colaberry.com', 'admin');
/** A token whose identity is the literal default this repo uses when nobody is known. */
const UNKNOWN_ADMIN = token('unknown', 'admin');

/** A real v4 uuid: the route validates the shape strictly, because the column is `UUIDV4`. */
const ID = '11111111-2222-4333-8444-555555555555';

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(routes);
  return a;
}

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ID,
    recipient_ref: 'lead:abc-123',
    recipient_address: 'student@example.com',
    recipient_display: 'A Student',
    channel: 'email',
    subject: 'Your program guide',
    body: '<p>Hello from Maya, an AI assistant.</p>',
    body_hash: 'deadbeef',
    composed_by: 'send_document',
    capability: 'sendDocument',
    correlation_id: 'corr-1',
    status: 'pending_approval',
    decided_by: null,
    decided_at: null,
    decision_note: null,
    delivered_at: null,
    failure_reason: null,
    created_at: new Date('2026-11-15T12:00:00Z'),
    expires_at: new Date('2026-11-22T12:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  mockList.mockReset().mockResolvedValue([row()]);
  mockFindByPk.mockReset().mockResolvedValue(row());
  mockApprove.mockReset().mockResolvedValue({ ok: true, id: ID, status: 'sent' });
  mockReject.mockReset().mockResolvedValue({ ok: true, id: ID, status: 'rejected' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/admin/maya/outbound', () => {
  it('401 without a token', async () => {
    expect((await request(app()).get('/api/admin/maya/outbound')).status).toBe(401);
  });

  it('200 for any admin: seeing what is waiting is not a risk', async () => {
    const res = await request(app()).get('/api/admin/maya/outbound').set('Authorization', OTHER_ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.pending[0]).toMatchObject({ id: ID, capability: 'sendDocument', status: 'pending_approval' });
  });

  it('masks the address and never returns it, because an API response carries no PII', async () => {
    const res = await request(app()).get('/api/admin/maya/outbound').set('Authorization', ALI);
    expect(res.body.pending[0].recipient_masked).toBe('s***@example.com');
    // The whole payload, not just the field we remembered to check: a future projection that
    // adds the raw column back fails here.
    expect(JSON.stringify(res.body)).not.toContain('student@example.com');
    // And the opaque ref IS present, because that is what a log line or a follow-up uses.
    expect(res.body.pending[0].recipient_ref).toBe('lead:abc-123');
  });

  it('sends a preview rather than the bodies, so a list cannot become a bulk review screen', async () => {
    const res = await request(app()).get('/api/admin/maya/outbound').set('Authorization', ALI);
    expect(res.body.pending[0].body_preview).toBe('Hello from Maya, an AI assistant.');
    expect(res.body.pending[0].body).toBeUndefined();
  });

  it('400 on a malformed limit, rather than silently listing the default', async () => {
    const res = await request(app()).get('/api/admin/maya/outbound?limit=everything').set('Authorization', ALI);
    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('ValidationError');
    expect(mockList).not.toHaveBeenCalled();
  });

  it('passes a valid limit through', async () => {
    await request(app()).get('/api/admin/maya/outbound?limit=5').set('Authorization', ALI);
    expect(mockList).toHaveBeenCalledWith(5);
  });
});

describe('GET /api/admin/maya/outbound/:id — the one message being reviewed', () => {
  it('401 without a token', async () => {
    expect((await request(app()).get(`/api/admin/maya/outbound/${ID}`)).status).toBe(401);
  });

  it('returns the exact bytes and the hash they were pinned at', async () => {
    const res = await request(app()).get(`/api/admin/maya/outbound/${ID}`).set('Authorization', ALI);
    expect(res.status).toBe(200);
    // Unmasked ON PURPOSE. The body is the thing being approved; a redacted review is no review.
    expect(res.body.body).toBe('<p>Hello from Maya, an AI assistant.</p>');
    expect(res.body.body_hash).toBe('deadbeef');
    expect(res.body.recipient_masked).toBe('s***@example.com');
    expect(res.body.recipient_address).toBeUndefined();
  });

  it('400 on an id that is not a uuid, without touching the database', async () => {
    const res = await request(app()).get('/api/admin/maya/outbound/not-a-uuid').set('Authorization', ALI);
    expect(res.status).toBe(400);
    expect(mockFindByPk).not.toHaveBeenCalled();
  });

  it('404 when there is no such message', async () => {
    mockFindByPk.mockResolvedValue(null);
    expect((await request(app()).get(`/api/admin/maya/outbound/${ID}`).set('Authorization', ALI)).status)
      .toBe(404);
  });
});

describe('POST approve — the decision that is Ali\'s', () => {
  it('401 without a token', async () => {
    expect((await request(app()).post(`/api/admin/maya/outbound/${ID}/approve`).send({})).status).toBe(401);
  });

  it('403 for an admin who is not Ali, and nothing is sent', async () => {
    const res = await request(app())
      .post(`/api/admin/maya/outbound/${ID}/approve`).set('Authorization', OTHER_ADMIN).send({});
    expect(res.status).toBe(403);
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it('200 for Ali, and the approver is HIS identity, not a body field', async () => {
    // THE ONE THAT MATTERS. A request that names its own approver must not be believed: this is
    // the shape the auto-approving sweep had, with `decided_by` written by the caller.
    const res = await request(app())
      .post(`/api/admin/maya/outbound/${ID}/approve`)
      .set('Authorization', ALI)
      .send({ decision_note: 'read it, send it', approved_by: 'unknown', decided_by: 'system:cron' });
    expect(res.status).toBe(200);
    expect(mockApprove).toHaveBeenCalledWith(ID, 'ali@colaberry.com', 'read it, send it');
    const [, approver] = mockApprove.mock.calls[0];
    expect(approver).not.toBe('unknown');
    expect(String(approver).startsWith('system:')).toBe(false);
  });

  it('403 when the authenticated identity itself is `unknown`', async () => {
    // Belt and braces: the route cannot be handed an approver, but a token could carry the
    // literal default. The queue refuses it, and the route answers that as a 403 rather than a
    // 200 a screen would render as sent.
    mockApprove.mockResolvedValue({
      ok: false, id: ID, status: 'pending_approval', refusal: 'approver_is_non_human',
      message: 'Approving a message Maya composed requires a person we hold a record of.',
    });
    const res = await request(app())
      .post(`/api/admin/maya/outbound/${ID}/approve`).set('Authorization', UNKNOWN_ADMIN).send({});
    // `unknown` is not Ali, so the middleware refuses first; either way nothing is delivered.
    expect([403]).toContain(res.status);
  });

  it('400 on a malformed body, without calling the service', async () => {
    const res = await request(app())
      .post(`/api/admin/maya/outbound/${ID}/approve`).set('Authorization', ALI)
      .send({ decision_note: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('ValidationError');
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it('400 on an id that is not a uuid', async () => {
    const res = await request(app())
      .post('/api/admin/maya/outbound/42/approve').set('Authorization', ALI).send({});
    expect(res.status).toBe(400);
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it('409 approving a message that is already decided', async () => {
    mockApprove.mockResolvedValue({
      ok: false, id: ID, status: 'sent', refusal: 'not_awaiting_approval',
      message: 'This message is sent, not awaiting approval. It was not sent again.',
    });
    const res = await request(app())
      .post(`/api/admin/maya/outbound/${ID}/approve`).set('Authorization', ALI).send({});
    expect(res.status).toBe(409);
    expect(res.body.refusal).toBe('not_awaiting_approval');
    expect(res.body.error).toMatch(/not sent again/i);
  });

  it('409 when the body moved after it was reviewed', async () => {
    mockApprove.mockResolvedValue({
      ok: false, id: ID, status: 'pending_approval', refusal: 'body_changed_since_review',
      message: 'This message changed after it was composed. It was not sent. Compose it again.',
    });
    const res = await request(app())
      .post(`/api/admin/maya/outbound/${ID}/approve`).set('Authorization', ALI).send({});
    expect(res.status).toBe(409);
  });

  it('404 when the message is gone', async () => {
    mockApprove.mockResolvedValue({ ok: false, id: ID, status: 'pending_approval', refusal: 'row_not_found' });
    expect((await request(app())
      .post(`/api/admin/maya/outbound/${ID}/approve`).set('Authorization', ALI).send({})).status).toBe(404);
  });

  it('502, not 200, when the decision was recorded but the provider would not take it', async () => {
    mockApprove.mockResolvedValue({
      ok: false, id: ID, status: 'failed', message: 'Delivery failed (TimeoutError). Nothing was sent.',
    });
    const res = await request(app())
      .post(`/api/admin/maya/outbound/${ID}/approve`).set('Authorization', ALI).send({});
    expect(res.status).toBe(502);
    expect(res.body.status).toBe('failed');
    // And it is NOT retried from here.
    expect(mockApprove).toHaveBeenCalledTimes(1);
  });

  it('500 on a thrown error, classified', async () => {
    mockApprove.mockRejectedValue(new Error('boom'));
    const res = await request(app())
      .post(`/api/admin/maya/outbound/${ID}/approve`).set('Authorization', ALI).send({});
    expect(res.status).toBe(500);
    expect(res.body.error_class).toBeTruthy();
  });
});

describe('POST reject — any admin, because stopping a message must not wait on one person', () => {
  it('401 without a token', async () => {
    expect((await request(app()).post(`/api/admin/maya/outbound/${ID}/reject`).send({ decision_note: 'no' })).status)
      .toBe(401);
  });

  it('200 for an admin who is not Ali', async () => {
    const res = await request(app())
      .post(`/api/admin/maya/outbound/${ID}/reject`).set('Authorization', OTHER_ADMIN)
      .send({ decision_note: 'wrong person' });
    expect(res.status).toBe(200);
    expect(mockReject).toHaveBeenCalledWith(ID, 'ops@colaberry.com', 'wrong person');
  });

  it('400 without a note, because a rejection records why', async () => {
    const res = await request(app())
      .post(`/api/admin/maya/outbound/${ID}/reject`).set('Authorization', ALI).send({});
    expect(res.status).toBe(400);
    expect(mockReject).not.toHaveBeenCalled();
  });

  it('409 rejecting something already decided', async () => {
    mockReject.mockResolvedValue({
      ok: false, id: ID, status: 'rejected', refusal: 'not_awaiting_approval',
      message: 'This message is already rejected.',
    });
    const res = await request(app())
      .post(`/api/admin/maya/outbound/${ID}/reject`).set('Authorization', ALI).send({ decision_note: 'again' });
    expect(res.status).toBe(409);
  });
});

describe('THERE IS NO BULK APPROVE, read from the source', () => {
  const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'mayaOutboundRoutes.ts'), 'utf8');
  /** Comments stripped: the file DISCUSSES bulk approval at length, and should keep doing so. */
  const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

  it('CONTROL — the stripping is load-bearing, the prose really does mention it', () => {
    expect(SOURCE).toMatch(/bulk/i);
    expect(code).not.toMatch(/bulk/i);
  });

  it('declares no route whose path is a mass decision', () => {
    const paths = [...code.matchAll(/router\.(?:get|post|put|patch|delete)\(\s*'([^']+)'/g)].map((m) => m[1]);
    // POSITIVE CONTROL: the scan found the real routes, so an empty list cannot read as a pass.
    expect(paths).toContain('/api/admin/maya/outbound/:id/approve');
    expect(paths.length).toBeGreaterThanOrEqual(4);
    for (const p of paths) {
      expect(p).not.toMatch(/approve-all|approve_all|bulk|batch|all\/|\/all$/i);
    }
  });

  it('every decision route is keyed on one :id', () => {
    const decisions = [...code.matchAll(/router\.post\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(decisions.length).toBe(2);
    for (const p of decisions) expect(p).toMatch(/:id\/(approve|reject)$/);
  });

  it('accepts no array of ids from the wire', () => {
    // A `z.array` in this file would be the body shape a bulk decision needs.
    expect(code).not.toMatch(/z\.array/);
    expect(code).not.toMatch(/\bids\b/);
  });

  it('calls the queue once per request, never in a loop', () => {
    // `approveOutbound` inside a `for`, `map` or `Promise.all` is a bulk approve wearing a
    // single-id route as a disguise.
    expect(code).not.toMatch(/(?:for|while|forEach|map|Promise\.all)[\s\S]{0,120}approveOutbound/);
  });
});
