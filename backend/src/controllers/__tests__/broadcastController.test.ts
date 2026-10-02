/**
 * The HTTP edge. What matters here is not the business logic (covered exhaustively in the
 * service suites) but the things that silently regress at a route boundary:
 *
 *   - a client cannot supply its own identity or entitlement
 *   - .strict() actually rejects an unknown key rather than ignoring it
 *   - a denied viewer gets NO url field, not a url that fails later
 *   - a 5xx never echoes an internal message back to the caller
 */
jest.mock('../../models/BroadcastOccurrence', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../services/broadcast/broadcastCommandService', () => ({ runProducerCommand: jest.fn() }));

import { postProducerCommand, postPlaybackGrant } from '../broadcastController';
import BroadcastOccurrence from '../../models/BroadcastOccurrence';
import { runProducerCommand } from '../../services/broadcast/broadcastCommandService';

const findByPk = (BroadcastOccurrence as any).findByPk as jest.Mock;
const runCommand = runProducerCommand as jest.Mock;

const OCC = '11111111-2222-4333-8444-555555555555';

function mockRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const req = (over: any = {}): any => ({
  params: { id: OCC },
  body: {},
  participant: { sub: 'enr-1', isStaff: false },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
});

describe('postProducerCommand', () => {
  it('rejects an unknown body key — .strict() is doing its job', () => {
    const res = mockRes();
    return postProducerCommand(
      req({ body: { command: 'go_live', expected_version: 1, is_producer: true } }),
      res,
    ).then(() => {
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toBe('Validation failed');
      // The point: a client trying to grant itself producer rights is a 400, not an ignored field.
      expect(runCommand).not.toHaveBeenCalled();
    });
  });

  it('requires expected_version — optimistic concurrency a client can skip is not concurrency control', async () => {
    const res = mockRes();
    await postProducerCommand(req({ body: { command: 'go_live' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('rejects an unknown command value', async () => {
    const res = mockRes();
    await postProducerCommand(req({ body: { command: 'seize_control', expected_version: 1 } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects a non-uuid occurrence id', async () => {
    const res = mockRes();
    await postProducerCommand(req({ params: { id: 'not-a-uuid' }, body: { command: 'end', expected_version: 1 } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('passes isProducer from STAFF CONTEXT, never from the body', async () => {
    runCommand.mockResolvedValue({ ok: true, occurrence: { id: OCC, editorial_state: 'live', provider_health: 'ready', version: 2, content_started_at: null } });
    const res = mockRes();
    await postProducerCommand(
      req({ participant: { sub: 'enr-1', isStaff: true }, body: { command: 'go_live', expected_version: 1 } }),
      res,
    );
    expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({ isProducer: true, expectedVersion: 1 }));
  });

  it('a non-staff caller is passed through as a non-producer and the service refuses', async () => {
    runCommand.mockResolvedValue({ ok: false, error_class: 'Forbidden', status: 403, reason: 'not_a_producer' });
    const res = mockRes();
    await postProducerCommand(req({ body: { command: 'go_live', expected_version: 1 } }), res);
    expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({ isProducer: false }));
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('surfaces a version conflict with its own status', async () => {
    runCommand.mockResolvedValue({ ok: false, error_class: 'VersionConflict', status: 409, reason: 'stale' });
    const res = mockRes();
    await postProducerCommand(req({ body: { command: 'end', expected_version: 3 } }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({ error: 'VersionConflict' });
  });

  it('does not leak an internal message on a 5xx', async () => {
    runCommand.mockRejectedValue(new Error('connection string postgres://user:pw@host/db failed'));
    const res = mockRes();
    await postProducerCommand(req({ body: { command: 'end', expected_version: 1 } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toEqual({ error: 'Internal error' });
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('postgres://');
  });
});

describe('postPlaybackGrant', () => {
  const live = (over: any = {}) => ({
    id: OCC, access_mode: 'preview', editorial_state: 'live',
    preview_seconds: 900, content_started_at: new Date(Date.now() - 60_000), ...over,
  });

  it('404s an unknown occurrence', async () => {
    findByPk.mockResolvedValue(null);
    const res = mockRes();
    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('rejects a path-traversal asset at the EDGE, before the signer sees it', async () => {
    findByPk.mockResolvedValue(live());
    const res = mockRes();
    await postPlaybackGrant(req({ body: { asset: '../../etc/passwd' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects an unknown body key', async () => {
    findByPk.mockResolvedValue(live());
    const res = mockRes();
    await postPlaybackGrant(req({ body: { asset: 'master.m3u8', preview_seconds: 99999 } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('gives a preview viewer a url whose ttl is bounded', async () => {
    findByPk.mockResolvedValue(live());
    const res = mockRes();
    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.grant).toBe('preview');
    expect(body.url).toMatch(/^\/bm\/broadcast\//);   // relative, same-origin
    expect(body.ttl_seconds).toBeGreaterThan(0);
    expect(body.expires_at).toBeLessThanOrEqual(live().content_started_at.getTime() + 900_000);
  });

  it('DENIES with no url once the preview window is spent', async () => {
    findByPk.mockResolvedValue(live({ content_started_at: new Date(Date.now() - 901_000) }));
    const res = mockRes();
    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ error: 'NotEntitled', reason: 'preview_expired', offer_upgrade: true });
    // The whole point: no url field at all, not a url that fails later.
    expect(body).not.toHaveProperty('url');
  });

  it('denies a private occurrence rather than guessing room eligibility', async () => {
    findByPk.mockResolvedValue(live({ access_mode: 'private' }));
    const res = mockRes();
    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0]).toMatchObject({ reason: 'not_room_eligible' });
  });

  it('denies when nothing is airing', async () => {
    findByPk.mockResolvedValue(live({ editorial_state: 'backstage' }));
    const res = mockRes();
    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0]).toMatchObject({ reason: 'not_watchable' });
  });
});
