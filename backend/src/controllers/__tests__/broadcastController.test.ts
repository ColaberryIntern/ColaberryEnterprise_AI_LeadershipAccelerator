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
// L4.6's measurement path. Mocked because this file tests the HTTP edge, not Postgres:
// what matters here is which facts the controller decides for itself and what it refuses.
jest.mock('../../services/broadcast/broadcastTelemetryService', () => ({
  recordPlaybackBeat: jest.fn(),
  readLiveAudience: jest.fn(),
}));
jest.mock('../../services/broadcast/broadcastActiveQuery', () => ({
  ACTIVE_DISCOVERY_STATES: ['live', 'reconnecting'],
  findActiveOccurrences: jest.fn(),
}));
// L8.3's read. The query itself is pinned in broadcastReplayQuery.test.ts; what is left to
// the controller is who may know about each row, which is the half this ticket is judged on.
jest.mock('../../services/broadcast/broadcastReplayQuery', () => ({
  REPLAY_DISCOVERY_STATES: ['replay_ready'],
  REPLAY_DISCOVERY_LIMIT: 25,
  findReplayOccurrences: jest.fn(),
}));

import {
  postProducerCommand, postPlaybackGrant, getActiveBroadcasts, getReplayBroadcasts,
} from '../broadcastController';
import BroadcastOccurrence from '../../models/BroadcastOccurrence';
import { runProducerCommand } from '../../services/broadcast/broadcastCommandService';
import { resolveRoomEligibility } from '../../services/broadcast/broadcastRoomEligibility';
import { loadViewerAccessFacts, broadcastAccessDeps } from '../../services/broadcast/broadcastAccessDeps';
import { findActiveOccurrences } from '../../services/broadcast/broadcastActiveQuery';
import { findReplayOccurrences } from '../../services/broadcast/broadcastReplayQuery';
import { postPlaybackHeartbeat, getLiveAudience } from '../broadcastController';
import { recordPlaybackBeat, readLiveAudience } from '../../services/broadcast/broadcastTelemetryService';

const findByPk = (BroadcastOccurrence as any).findByPk as jest.Mock;
const runCommand = runProducerCommand as jest.Mock;
const roomEligible = resolveRoomEligibility as jest.Mock;
const viewerFacts = loadViewerAccessFacts as jest.Mock;
const loadEnrollment = broadcastAccessDeps.loadEnrollment as jest.Mock;
const loadCohort = broadcastAccessDeps.loadCohort as jest.Mock;
const loadRoleInfo = broadcastAccessDeps.loadRoleInfo as jest.Mock;
const activeOccurrences = findActiveOccurrences as jest.Mock;
const replayOccurrences = findReplayOccurrences as jest.Mock;
const recordBeat = recordPlaybackBeat as jest.Mock;
const readAudience = readLiveAudience as jest.Mock;

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
  replayOccurrences.mockResolvedValue([]);
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

  /**
   * L7.4: the producer End control is gated on these two fields, and both are SERVER-decided.
   * `is_producer` is on the forbidden-client-supplied list, which governs what a client may
   * send; this asserts the server answers for itself, which is the only trustworthy direction.
   */
  it('reports is_producer from the staff context, not from the body', async () => {
    findByPk.mockResolvedValue(live());
    const res = mockRes();
    await postPlaybackGrant(
      req({ body: { asset: 'master.m3u8' }, participant: { sub: 'enr-1', isStaff: true } }),
      res,
    );
    expect(res.json.mock.calls[0][0].is_producer).toBe(true);
  });

  it('reports is_producer false for an ordinary viewer who claims otherwise', async () => {
    findByPk.mockResolvedValue(live());
    const res = mockRes();
    // The claim in the body is not merely ignored - the route rejects an unknown key outright.
    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);
    expect(res.json.mock.calls[0][0].is_producer).toBe(false);
  });

  it('carries the occurrence version, so a producer command can be version-guarded', async () => {
    findByPk.mockResolvedValue(live({ version: 12 }));
    const res = mockRes();
    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);
    expect(res.json.mock.calls[0][0].version).toBe(12);
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

/**
 * getReplayBroadcasts (L8.3) — what a viewer may know about a class that has already aired.
 *
 * The ticket is judged on one sentence: a private occurrence the viewer is not eligible for
 * must be OMITTED ENTIRELY rather than returned as a locked shell. That is `mayKnowAbout`,
 * reused rather than re-copied, and these pin that the replay route actually goes through it.
 *
 * It also pins the field replay adds on top of the live projection. Dating a past class is
 * the whole point of listing it, and the first version of this handler read `ended_at` by
 * POSITION out of the pre-filter array — so the moment an entitlement omission shortened the
 * list, every later class was dated from an earlier one. The requirement and the defect were
 * the same case, which is why it survived a green query suite.
 */
describe('getReplayBroadcasts', () => {
  const PRIVATE_TITLE = 'Cohort 12 private retro';

  const past = (over: any = {}) => ({
    id: OCC, title: PRIVATE_TITLE, room_id: 'room-1', access_mode: 'private',
    editorial_state: 'replay_ready', scheduled_start_at: new Date('2026-10-07T18:00:00Z'),
    content_started_at: new Date('2026-10-07T18:02:00Z'),
    ended_at: new Date('2026-10-07T19:10:00Z'), preview_seconds: 900, session_id: null, ...over,
  });

  it('NEVER sends a private replay title to an ineligible viewer', async () => {
    replayOccurrences.mockResolvedValue([past()]);
    roomEligible.mockResolvedValue(false);
    const res = mockRes();

    await getReplayBroadcasts(req(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.replays).toEqual([]);
    // Asserted on the wire. A locked shell that still carries the title is the failure mode.
    expect(JSON.stringify(body)).not.toContain(PRIVATE_TITLE);
  });

  it('CONTROL: sends that same replay to an eligible room member', async () => {
    // Without this the assertion above would pass against a handler that returns nothing ever.
    replayOccurrences.mockResolvedValue([past()]);
    roomEligible.mockResolvedValue(true);
    const res = mockRes();

    await getReplayBroadcasts(req(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.replays).toHaveLength(1);
    expect(body.replays[0]).toMatchObject({ title: PRIVATE_TITLE, can_watch: true });
  });

  it('dates every replay from its OWN class, even when entitlement omitted an earlier one', async () => {
    // The omission is what breaks a positional read: three rows in, one filtered out, two
    // listed — and the two that remain are at indices 0 and 1 of a different array.
    replayOccurrences.mockResolvedValue([
      past({ id: 'occ-private', ended_at: new Date('2026-10-01T19:00:00Z') }),
      past({
        id: 'occ-week-9', title: 'Week 9 Build Day', access_mode: 'free', room_id: 'room-2',
        ended_at: new Date('2026-10-13T19:40:00Z'),
      }),
      past({
        id: 'occ-week-10', title: 'Week 10 Build Day', access_mode: 'free', room_id: 'room-3',
        ended_at: new Date('2026-10-20T19:40:00Z'),
      }),
    ]);
    roomEligible.mockResolvedValue(false);
    const res = mockRes();

    await getReplayBroadcasts(req(), res);

    const { replays } = res.json.mock.calls[0][0];
    expect(replays.map((r: any) => r.id)).toEqual(['occ-week-9', 'occ-week-10']);
    // Positional: Week 9 would be dated 1 Oct (the private class it cannot even see) and
    // Week 10 dated 13 Oct. A student reading the list is told the wrong week, twice.
    expect(replays[0].ended_at).toBe(new Date('2026-10-13T19:40:00Z').getTime());
    expect(replays[1].ended_at).toBe(new Date('2026-10-20T19:40:00Z').getTime());
  });

  it('carries a null ended_at as null rather than inventing an epoch', async () => {
    replayOccurrences.mockResolvedValue([past({ access_mode: 'free', ended_at: null })]);
    const res = mockRes();
    await getReplayBroadcasts(req(), res);
    expect(res.json.mock.calls[0][0].replays[0].ended_at).toBeNull();
  });

  it('loads the viewer facts ONCE however long the replay list is', async () => {
    replayOccurrences.mockResolvedValue([
      past({ id: 'a', access_mode: 'free' }),
      past({ id: 'b', access_mode: 'free', room_id: 'room-2' }),
      past({ id: 'c', access_mode: 'free', room_id: 'room-3' }),
    ]);
    const res = mockRes();

    await getReplayBroadcasts(req(), res);

    expect(viewerFacts).toHaveBeenCalledTimes(1);
    expect(roomEligible).toHaveBeenCalledTimes(3);
  });

  it('hands staff context to the eligibility resolver rather than deciding staff itself', async () => {
    // Staff are eligible everywhere, but that is resolveRoomEligibility's rule to apply. What
    // this route owes it is the fact — a second staff check here would be the copy the ticket
    // forbids.
    replayOccurrences.mockResolvedValue([past()]);
    const res = mockRes();

    await getReplayBroadcasts(req({ participant: { sub: 'enr-1', isStaff: true } }), res);

    expect(roomEligible).toHaveBeenCalledWith('room-1', expect.objectContaining({ isAdmin: true }));
  });

  it('answers 503 when it cannot work out what can be watched back — NOT an empty list', async () => {
    replayOccurrences.mockRejectedValue(new Error('connect ECONNREFUSED postgres://u:pw@db/x'));
    const res = mockRes();

    await getReplayBroadcasts(req(), res);

    // "your class was never recorded" and "we could not tell" are different facts, and
    // reporting the second as the first is the one that loses trust.
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0]).toEqual({ error: 'ReplayDiscoveryUnavailable' });
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('postgres://');
  });

  it('reports which states it considered, so the client is not guessing', async () => {
    const res = mockRes();
    await getReplayBroadcasts(req(), res);
    expect(res.json.mock.calls[0][0].states).toEqual(['replay_ready']);
  });
});

/**
 * THE PROVIDER BRANCH (L5.1).
 *
 * What is worth asserting here is not that Cloudflare works — the adapter suite covers that
 * against a mocked API — but that the branch cannot hand out a url it should not, and that
 * every occurrence written before it existed still takes the replay path untouched.
 *
 * The provider is deliberately left UNCONFIGURED in these tests. That is the state production
 * is in right now, and it is the state in which a fallback would be most tempting and most
 * damaging.
 */
describe('postPlaybackGrant — the Cloudflare provider branch', () => {
  const cfEnvKeys = [
    'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_STREAM_SUBDOMAIN', 'CLOUDFLARE_STREAM_TOKEN',
    'CLOUDFLARE_STREAM_SIGNING_KEY_ID', 'CLOUDFLARE_STREAM_SIGNING_KEY_PEM',
  ];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    cfEnvKeys.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
  });
  afterEach(() => {
    cfEnvKeys.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  });

  const liveCf = (over: any = {}) => ({
    id: OCC, access_mode: 'preview', editorial_state: 'live',
    preview_seconds: 900, content_started_at: new Date(Date.now() - 60_000),
    provider: 'cloudflare', provider_session_id: 'f256e6ea9341d51eea64c9454659e576', ...over,
  });

  it('fails CLOSED with no url when the provider is not configured', async () => {
    findByPk.mockResolvedValue(liveCf());
    const res = mockRes();
    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);
    expect(res.status).toHaveBeenCalledWith(503);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ error: 'ProviderNotReady', reason: 'live_playback_unavailable' });
    // The property that matters: no url at all. Not a /bm/ url, not an unsigned one.
    expect(body).not.toHaveProperty('url');
  });

  it('says the live input is not bound yet, rather than 404ing an occurrence that exists', async () => {
    findByPk.mockResolvedValue(liveCf({ provider_session_id: null }));
    const res = mockRes();
    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0]).toMatchObject({ reason: 'live_input_not_bound' });
  });

  /**
   * L8.4 — an occurrence that is no longer on air must not be handed its live input.
   *
   * The shipped behaviour signed `provider_session_id` for any state, so a replay grant
   * returned a correctly signed, correctly expiring manifest for an input that had stopped
   * streaming days earlier. Well-formed and wrong.
   *
   * Which uid is chosen is pinned purely in broadcastRecordingBinding.test.ts; what these pin
   * is that the controller asks, and that the two refusals stay distinguishable — one sends a
   * producer to configuration, the other to a show whose recording was never captured.
   */
  /**
   * `replay_ready`, not `ended`.
   *
   * Writing these against `ended` first was instructive: they came back 403, because
   * entitlement's WATCHABLE set is live / reconnecting / replay_ready. An ended occurrence
   * is refused before any playback target is resolved, so `ended` could never have
   * exercised this branch. The fixture was wrong, not the code.
   */
  const replayCf = (over: any = {}) => liveCf({
    editorial_state: 'replay_ready',
    provider_instance_uuid: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    ...over,
  });

  it('says recording_not_bound for a replay-ready occurrence with no recording', async () => {
    // NOT live_input_not_bound: the input is configured and irrelevant. Absence of a recording
    // has to be distinguishable from absence of configuration.
    findByPk.mockResolvedValue(replayCf({ provider_instance_uuid: null }));
    const res = mockRes();
    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0]).toMatchObject({ reason: 'recording_not_bound' });
  });

  it('does NOT fall back to the live input when the recording is missing', async () => {
    // The fallback is the bug. A viewer would get a playable-looking url for dead air.
    findByPk.mockResolvedValue(replayCf({ provider_instance_uuid: null }));
    const res = mockRes();
    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('url');
    expect(res.json.mock.calls[0][0].reason).not.toBe('live_input_not_bound');
  });

  it('CONTROL: with a recording bound it gets past target resolution to the signer', async () => {
    // Reaching live_playback_unavailable means the target resolved and signing was attempted
    // (the provider env is deleted by this block's beforeEach). Without this, the two tests
    // above could pass against a branch that never resolves anything.
    findByPk.mockResolvedValue(replayCf());
    const res = mockRes();
    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0]).toMatchObject({ reason: 'live_playback_unavailable' });
  });

  it('still reports is_live false for a replay-ready occurrence', async () => {
    findByPk.mockResolvedValue(replayCf());
    const res = mockRes();
    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);
    // It never reaches the success payload here, but the refusal must not be a 200 either.
    expect(res.status).not.toHaveBeenCalledWith(200);
  });

  it('still denies a spent preview window BEFORE it ever reaches the provider', async () => {
    findByPk.mockResolvedValue(liveCf({ content_started_at: new Date(Date.now() - 901_000) }));
    const res = mockRes();
    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ error: 'NotEntitled', reason: 'preview_expired' });
    expect(body).not.toHaveProperty('url');
  });

  it('leaves every pre-existing occurrence on the replay path, byte for byte', async () => {
    // `provider` defaults to 'zoom' on the model, so nothing written before this commit can
    // take the branch above.
    findByPk.mockResolvedValue({
      id: OCC, access_mode: 'preview', editorial_state: 'live', preview_seconds: 900,
      content_started_at: new Date(Date.now() - 60_000), provider: 'zoom',
    });
    const res = mockRes();
    await postPlaybackGrant(req({ body: { asset: 'master.m3u8' } }), res);
    expect(res.json.mock.calls[0][0].url).toMatch(/^\/bm\/broadcast\//);
  });
});

describe('postPlaybackHeartbeat', () => {
  const live = () => ({ id: OCC, access_mode: 'free', editorial_state: 'live', preview_seconds: 900, content_started_at: new Date() });
  const beatBody = { session_id: 'tab-abcdefgh', state: 'playing', intent: 'deliberate' };

  beforeEach(() => { recordBeat.mockResolvedValue(true); });

  it('NAMES the fields when a client asserts identity, entitlement or counts', async () => {
    findByPk.mockResolvedValue(live());
    const res = mockRes();
    await postPlaybackHeartbeat(req({ body: { ...beatBody, enrollment_id: 'someone-else', watching_now: 500 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('UntrustedFields');
    // Naming them is the point. A silently dropped field is indistinguishable from an
    // accepted one, and a client that believes it is reporting viewers would go on believing
    // it - and the number it inflates would be trusted.
    expect(body.fields).toEqual(expect.arrayContaining(['enrollment_id', 'watching_now']));
    expect(recordBeat).not.toHaveBeenCalled();
  });

  it('takes identity and staff status from the SERVER, never from the body', async () => {
    findByPk.mockResolvedValue(live());
    await postPlaybackHeartbeat(
      req({ participant: { sub: 'enr-real', isStaff: true }, body: beatBody }),
      mockRes(),
    );
    const [, facts] = recordBeat.mock.calls[0];
    expect(facts).toMatchObject({ enrollmentId: 'enr-real', isStaff: true, accessMode: 'free' });
  });

  it('records an UNRECOGNISED access mode as null rather than inventing a label', async () => {
    findByPk.mockResolvedValue({ ...live(), access_mode: 'something_new' });
    await postPlaybackHeartbeat(req({ body: beatBody }), mockRes());
    expect(recordBeat.mock.calls[0][1].accessMode).toBeNull();
  });

  it('answers 204 even when the write FAILS - telemetry must not break playback', async () => {
    findByPk.mockResolvedValue(live());
    recordBeat.mockResolvedValue(false);
    const res = mockRes();
    await postPlaybackHeartbeat(req({ body: beatBody }), res);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('rejects an unknown body key', async () => {
    findByPk.mockResolvedValue(live());
    const res = mockRes();
    await postPlaybackHeartbeat(req({ body: { ...beatBody, nonsense: 1 } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('404s an unknown occurrence', async () => {
    findByPk.mockResolvedValue(null);
    const res = mockRes();
    await postPlaybackHeartbeat(req({ body: beatBody }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

/**
 * "Nobody watched" is a verdict on the broadcast. "Collection is down" is a verdict on us.
 * Rendering the second as the first would have a producer stop a class people were watching,
 * which is why the metrics dictionary calls a fabricated zero a defect rather than a
 * cosmetic issue.
 */
describe('getLiveAudience keeps zero and "we do not know" apart', () => {
  it('reports a real zero as zero', async () => {
    readAudience.mockResolvedValue({ watchingNow: 0, deliberate: 0, auto: 0, byMode: {} });
    const res = mockRes();
    await getLiveAudience(req({ participant: { sub: 'enr-1', isStaff: true } }), res);
    expect(res.json.mock.calls[0][0]).toMatchObject({ available: true, watching_now: 0 });
  });

  it('a COLLECTION FAILURE carries no count field at all - not zero, not null, absent', async () => {
    readAudience.mockRejectedValue(new Error('connection terminated'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await getLiveAudience(req({ participant: { sub: 'enr-1', isStaff: true } }), res);
    spy.mockRestore();

    expect(res.status).toHaveBeenCalledWith(503);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ available: false, reason: 'collection_unavailable' });
    // A client cannot render a number that is not there. That is a stronger guarantee than
    // asking it to check a flag first.
    expect(body).not.toHaveProperty('watching_now');
    expect(body).not.toHaveProperty('deliberate');
    expect(body).not.toHaveProperty('auto');
  });

  it('reports the splits a producer actually needs', async () => {
    readAudience.mockResolvedValue({ watchingNow: 7, deliberate: 5, auto: 2, byMode: { free: 7 } });
    const res = mockRes();
    await getLiveAudience(req({ participant: { sub: 'enr-1', isStaff: true } }), res);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      available: true, watching_now: 7, deliberate: 5, auto: 2, by_mode: { free: 7 },
    });
  });

  it('403s a non-producer - a live viewer count is producer information', async () => {
    const res = mockRes();
    await getLiveAudience(req({ participant: { sub: 'enr-1', isStaff: false } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(readAudience).not.toHaveBeenCalled();
  });
});
