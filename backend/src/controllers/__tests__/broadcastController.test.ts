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
// Mocked rather than exercised: each has its own suite, and broadcastAccessDeps reaches
// the models barrel at import time, which is what turned the entitlement suite from
// seconds into minutes before it was stubbed there too.
jest.mock('../../services/broadcast/broadcastRoomEligibility', () => ({ resolveRoomEligibility: jest.fn() }));
// The deps OBJECT is mocked, not `resolveBroadcastAccess`. The playback path now goes
// through that wrapper, and its fail-closed catch is the property most worth exercising
// here — so the wrapper stays real and only its loaders are injected.
jest.mock('../../services/broadcast/broadcastAccessDeps', () => ({
  loadViewerAccessFacts: jest.fn(),
  broadcastAccessDeps: {
    loadEnrollment: jest.fn(),
    loadCohort: jest.fn(),
    loadRoleInfo: jest.fn(),
    cohortIdOf: (e: { cohort_id?: string | null } | null) => e?.cohort_id ?? null,
  },
}));
jest.mock('../../services/broadcast/broadcastActiveQuery', () => ({
  ACTIVE_DISCOVERY_STATES: ['live', 'reconnecting'],
  findActiveOccurrences: jest.fn(),
}));

import { postProducerCommand, postPlaybackGrant, getActiveBroadcasts } from '../broadcastController';
import BroadcastOccurrence from '../../models/BroadcastOccurrence';
import { runProducerCommand } from '../../services/broadcast/broadcastCommandService';
import { resolveRoomEligibility } from '../../services/broadcast/broadcastRoomEligibility';
import { loadViewerAccessFacts, broadcastAccessDeps } from '../../services/broadcast/broadcastAccessDeps';
import { findActiveOccurrences } from '../../services/broadcast/broadcastActiveQuery';

const findByPk = (BroadcastOccurrence as any).findByPk as jest.Mock;
const runCommand = runProducerCommand as jest.Mock;
const roomEligible = resolveRoomEligibility as jest.Mock;
const viewerFacts = loadViewerAccessFacts as jest.Mock;
const loadEnrollment = broadcastAccessDeps.loadEnrollment as jest.Mock;
const loadCohort = broadcastAccessDeps.loadCohort as jest.Mock;
const loadRoleInfo = broadcastAccessDeps.loadRoleInfo as jest.Mock;
const activeOccurrences = findActiveOccurrences as jest.Mock;

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
  // Defaults: not room-eligible, and no paid entitlement. Each test opts into more.
  roomEligible.mockResolvedValue(false);
  viewerFacts.mockResolvedValue({ enrollment: null, cohort: null, roleInfo: null });
  loadEnrollment.mockResolvedValue(null);
  loadCohort.mockResolvedValue(null);
  loadRoleInfo.mockResolvedValue({ isStaff: false, hasActiveComp: false });
  activeOccurrences.mockResolvedValue([]);
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

describe('5xx logging does not leak a connection string to stdout', () => {
  // The verifier flagged this: the RESPONSE was already clean, but the log line carried
  // err.message, and stdout is captured by the container runtime. A clean response is not
  // enough on its own.
  let errLines: string[];
  beforeEach(() => {
    errLines = [];
    jest.spyOn(console, 'error').mockImplementation((s: any) => { errLines.push(String(s)); });
  });
  afterEach(() => jest.restoreAllMocks());

  it('logs error_class but NOT the raw message', async () => {
    runCommand.mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED postgres://user:pw@db.internal:5432/accel'), { name: 'SequelizeConnectionError' }),
    );
    const res = mockRes();
    await postProducerCommand(req({ body: { command: 'end', expected_version: 1 } }), res);

    expect(errLines).toHaveLength(1);
    expect(errLines[0]).not.toContain('postgres://');
    expect(errLines[0]).not.toContain('db.internal');
    const line = JSON.parse(errLines[0]);
    expect(line).toMatchObject({ level: 'error', outcome: 'failure', event: 'broadcast_command_failed' });
    expect(line.context).toEqual({ error_name: 'SequelizeConnectionError' });
  });
});


describe('the entitlement inputs are resolved, not stubbed', () => {
  // Until 2026-10-07 this controller passed `roomEligible: false` and `null, null, null`.
  // Both stubs denied rather than leaked, so the surface looked fine while the feature was
  // broken for exactly the people it was built for. One test per stub.
  const occ = (over: any = {}) => ({
    id: OCC, access_mode: 'private', editorial_state: 'live',
    preview_seconds: 900, content_started_at: new Date(Date.now() - 60_000),
    room_id: 'room-1', ...over,
  });

  it('asks the room gate about the occurrence ROOM, with the viewer cohort from the JWT', async () => {
    findByPk.mockResolvedValue(occ());
    roomEligible.mockResolvedValue(true);
    const res = mockRes();

    await postPlaybackGrant(req({
      participant: { sub: 'enr-1', isStaff: false, cohort_id: 'coh-7' },
      body: { asset: 'master.m3u8' },
    }), res);

    expect(roomEligible).toHaveBeenCalledWith('room-1', {
      enrollmentId: 'enr-1', cohortId: 'coh-7', isAdmin: false,
    });
  });

  it('GRANTS a private broadcast to an eligible room member — the bug this fixes', async () => {
    findByPk.mockResolvedValue(occ());
    roomEligible.mockResolvedValue(true);
    const res = mockRes();

    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);

    const body = res.json.mock.calls[0][0];
    expect(body.grant).toBe('full');
    expect(body.url).toMatch(/^\/bm\/broadcast\//);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it('still denies a private broadcast to someone outside the room', async () => {
    findByPk.mockResolvedValue(occ());
    roomEligible.mockResolvedValue(false);
    const res = mockRes();

    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0]).toMatchObject({ reason: 'not_room_eligible' });
  });

  it('passes the loaded paid-access facts through, so a paying viewer is not treated as unpaid', async () => {
    findByPk.mockResolvedValue(occ({ access_mode: 'paid' }));
    // hasFullCurriculumAccess is the real implementation here, reached through the real
    // resolveBroadcastAccess; these are the shapes it reads.
    loadEnrollment.mockResolvedValue({
      id: 'enr-1', payment_status: 'paid', cohort_id: 'coh-7', access_starts_at: new Date(0),
    });
    loadCohort.mockResolvedValue({ id: 'coh-7', cohort_type: 'standard' });
    const res = mockRes();

    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);

    expect(loadEnrollment).toHaveBeenCalledWith('enr-1');
    // The cohort is read off the enrollment, not off the request.
    expect(loadCohort).toHaveBeenCalledWith('coh-7');
    const body = res.json.mock.calls[0][0];
    expect(body.grant).toBe('full');
    expect(body.grant).not.toBe('preview');
  });

  it('DENIES when the entitlement loaders reject — the fail-closed wrapper, exercised for real', async () => {
    findByPk.mockResolvedValue(occ({ access_mode: 'paid' }));
    loadEnrollment.mockRejectedValue(new Error('connect ECONNREFUSED db.internal:5432'));
    const res = mockRes();

    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);

    // A paywall that opens under load is not a paywall. This is the property the PURE
    // function cannot have, and the reason the playback path goes through the wrapper.
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0]).toMatchObject({ reason: 'error' });
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('db.internal');
  });

  it('a paid broadcast still denies a viewer with no entitlement, and offers the upgrade', async () => {
    findByPk.mockResolvedValue(occ({ access_mode: 'paid' }));
    const res = mockRes();

    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0]).toMatchObject({ reason: 'requires_payment', offer_upgrade: true });
  });
});

describe('getActiveBroadcasts', () => {
  const PRIVATE_TITLE = 'Cohort 12 private review';

  const live = (over: any = {}) => ({
    id: OCC, title: PRIVATE_TITLE, room_id: 'room-1', access_mode: 'private',
    editorial_state: 'live', scheduled_start_at: new Date('2026-10-07T18:00:00Z'),
    content_started_at: new Date('2026-10-07T18:02:00Z'), preview_seconds: 900, ...over,
  });

  it('NEVER sends a private title to an ineligible viewer', async () => {
    activeOccurrences.mockResolvedValue([live()]);
    roomEligible.mockResolvedValue(false);
    const res = mockRes();

    await getActiveBroadcasts(req(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.broadcasts).toEqual([]);
    // The criterion, asserted on the wire rather than on a rendered DOM.
    expect(JSON.stringify(body)).not.toContain(PRIVATE_TITLE);
  });

  it('sends it to an eligible room member', async () => {
    activeOccurrences.mockResolvedValue([live()]);
    roomEligible.mockResolvedValue(true);
    const res = mockRes();

    await getActiveBroadcasts(req(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.broadcasts).toHaveLength(1);
    expect(body.broadcasts[0]).toMatchObject({ title: PRIVATE_TITLE, can_watch: true });
  });

  it('loads the viewer facts ONCE however many broadcasts are airing', async () => {
    activeOccurrences.mockResolvedValue([live(), live({ id: 'occ-2', room_id: 'room-2' }), live({ id: 'occ-3', room_id: 'room-3' })]);
    roomEligible.mockResolvedValue(true);
    const res = mockRes();

    await getActiveBroadcasts(req(), res);

    expect(viewerFacts).toHaveBeenCalledTimes(1);
    // Room eligibility is per room, so that one is expected to be asked once per occurrence.
    expect(roomEligible).toHaveBeenCalledTimes(3);
  });

  it('answers 503 when it cannot work out what is airing — NOT an empty list', async () => {
    activeOccurrences.mockRejectedValue(new Error('connect ECONNREFUSED postgres://u:pw@db/x'));
    const res = mockRes();

    await getActiveBroadcasts(req(), res);

    // "nothing is airing" and "we could not tell" are different facts.
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0]).toEqual({ error: 'DiscoveryUnavailable' });
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('postgres://');
  });

  it('reports which states it considered, so the client is not guessing', async () => {
    activeOccurrences.mockResolvedValue([]);
    const res = mockRes();
    await getActiveBroadcasts(req(), res);
    expect(res.json.mock.calls[0][0].states).toEqual(['live', 'reconnecting']);
  });

  it('tells the client when to come back, so the cadence is tunable without a frontend deploy', async () => {
    activeOccurrences.mockResolvedValue([]);
    const previous = process.env.BROADCAST_DISCOVERY_POLL_MS;
    process.env.BROADCAST_DISCOVERY_POLL_MS = '90000';
    try {
      const res = mockRes();
      await getActiveBroadcasts(req(), res);
      expect(res.json.mock.calls[0][0].poll_after_ms).toBe(90_000);
    } finally {
      if (previous === undefined) delete process.env.BROADCAST_DISCOVERY_POLL_MS;
      else process.env.BROADCAST_DISCOVERY_POLL_MS = previous;
    }
  });

  it('clamps a nonsense cadence rather than passing it to every open tab', async () => {
    activeOccurrences.mockResolvedValue([]);
    const previous = process.env.BROADCAST_DISCOVERY_POLL_MS;
    process.env.BROADCAST_DISCOVERY_POLL_MS = '250';
    try {
      const res = mockRes();
      await getActiveBroadcasts(req(), res);
      expect(res.json.mock.calls[0][0].poll_after_ms).toBe(15_000);
    } finally {
      if (previous === undefined) delete process.env.BROADCAST_DISCOVERY_POLL_MS;
      else process.env.BROADCAST_DISCOVERY_POLL_MS = previous;
    }
  });
});
