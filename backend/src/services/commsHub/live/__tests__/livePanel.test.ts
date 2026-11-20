/**
 * CH5.2 the Live panel's rules, driven through the REAL broadcast state machine: a fake occurrence
 * store applies applyProducerCommand exactly as broadcastCommandService does, and the test plays the
 * provider by setting provider_health. One live at a time, not-ready refusals, idempotent Go live,
 * the event following the broadcast, and the stream key never in a log.
 */
type Row = Record<string, any>;
const occ = new Map<string, Row>();
const activity: Row[] = [];
const sent: string[] = [];
const locks: string[] = [];
const KEY = 'SECRET-STREAM-KEY-1234567890abcdef';
const UID = 'b'.repeat(32);

jest.mock('../../../../config/database', () => ({
  sequelize: {
    transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb({})),
    query: jest.fn(async (sql: string, opts: Row) => {
      const r = opts.replacements;
      if (/pg_advisory_xact_lock/.test(sql)) { locks.push(r.k); return [[]]; }
      if (/FROM broadcast_occurrences WHERE id = :id/.test(sql)) return [occ.has(r.id) ? [{ ...occ.get(r.id) }] : []];
      if (/WHERE provider_session_id = :uid/.test(sql)) {
        const hit = [...occ.values()].find((o) => o.provider_session_id === r.uid && r.active.includes(o.editorial_state) && o.id !== r.except);
        return [hit ? [{ id: hit.id, title: hit.title, editorial_state: hit.editorial_state }] : []];
      }
      throw new Error(`unexpected sql ${sql}`);
    }),
  },
}));
jest.mock('../../../broadcast/broadcastCommandService', () => {
  const { applyProducerCommand } = jest.requireActual('../../../broadcast/broadcastStateMachine');
  return {
    runProducerCommand: jest.fn(async (req: Row) => {
      const o = occ.get(req.occurrenceId);
      if (!o) return { ok: false, status: 404, error_class: 'NotFoundError' };
      sent.push(req.command);
      const d = applyProducerCommand(o, req.command, { expectedVersion: req.expectedVersion, nowMs: Date.now(), isProducer: req.isProducer });
      if (!d.ok) return { ok: false, occurrence: o, error_class: d.error_class, status: d.status, reason: d.reason };
      if (d.noop || !d.patch) return { ok: true, noop: true, occurrence: o };
      Object.assign(o, d.patch);
      return { ok: true, occurrence: o };
    }),
  };
});
const events = new Map<string, Row>();
jest.mock('../../../../models/CommsHubEvent', () => ({ __esModule: true, default: { findByPk: jest.fn(async (id: string) => events.get(id) ?? null), findAll: jest.fn(async ({ where }: Row) => [...events.values()].filter((e) => e.status === where.status)) } }));
jest.mock('../../activityLog', () => ({ logActivity: jest.fn(async (_a: Row, action: string, _t: string, id: string) => { activity.push({ action, id }); }) }));
jest.mock('../../../../models/BroadcastOccurrence', () => ({ __esModule: true, BROADCAST_ACCESS_MODES: ['free', 'paid', 'preview', 'private'], default: {} }));
jest.mock('../../../../models/Cohort', () => ({ __esModule: true, default: {} }));
jest.mock('../../../../models/CommunityRoom', () => ({ __esModule: true, default: {} }));
jest.mock('../../../communityRooms/cohortRoomService', () => ({ cohortRoomSlug: (id: string) => id, ensureRoomForCohort: jest.fn() }));
const mockEnsure = jest.fn();
jest.mock('../eventOccurrence', () => ({ ...jest.requireActual('../eventOccurrence'), ensureOccurrenceForCommunityEvent: (...a: unknown[]) => mockEnsure(...a) }));
const mockReadLiveInput = jest.fn();
jest.mock('../../../broadcast/providers/cloudflareStreamProvider', () => ({
  readCloudflareStreamConfig: () => ({ accountId: 'acct', apiToken: 'tok' }),
  readLiveInput: (...a: unknown[]) => mockReadLiveInput(...a),
}));

import { LiveRefusedError } from '../eventOccurrence';
import { cancelPreparedLive, LivePanelError, prepareLive, readIngest, readLivePanel, runLiveCommand, syncLiveEvents } from '../livePanel';

const JACKIE = { id: 'jackie-1', label: 'j' };
const NOW = new Date('2026-12-01T23:50:00Z');
const newOcc = (id: string, o: Row = {}): Row => ({ id, title: 'Demo Tuesday', editorial_state: 'scheduled', provider_health: 'unknown', version: 1, content_started_at: null, ended_at: null, end_reason: null, scheduled_start_at: new Date('2026-12-02T00:00:00Z'), provider_session_id: UID, ...o });
const newEvent = (o: Row = {}): Row => {
  const e: Row = { id: 'e1', title: 'Demo Tuesday', status: 'scheduled', starts_at: new Date('2026-12-02T00:00:00Z'), ends_at: new Date('2026-12-02T01:00:00Z'), repeat_rule: null, broadcast_occurrence_id: null, ...o };
  e.update = jest.fn(async (p: Row) => Object.assign(e, p));
  return e;
};
const err = async (p: Promise<unknown>): Promise<LivePanelError> => { try { await p; } catch (x) { return x as LivePanelError; } throw new Error('expected a refusal'); };

beforeEach(() => {
  occ.clear(); events.clear(); activity.length = 0; sent.length = 0; locks.length = 0; jest.clearAllMocks();
  process.env.BROADCAST_INPUT_STRATEGY = 'shared';
  process.env.CLOUDFLARE_STREAM_LIVE_INPUT_UID = UID;
  events.set('e1', newEvent());
  mockEnsure.mockImplementation(async (e: Row) => {
    if (!occ.has('o1')) occ.set('o1', newOcc('o1'));
    e.broadcast_occurrence_id = 'o1';
    return { outcome: 'created', occurrenceId: 'o1', startsAt: new Date('2026-12-02T00:00:00Z'), accessMode: 'free', roomId: null };
  });
});

describe('CH5.2 the state follows the provider through backstage, live, ended', () => {
  it('prepare -> backstage (health watched) -> provider ready -> Go live -> End; the event follows', async () => {
    let view = await readLivePanel('e1');
    expect(view).toMatchObject({ input_configured: true, occurrence: null, commands: [], input_held_by: null });

    view = await prepareLive('e1', null, JACKIE, NOW);
    expect(view.occurrence).toMatchObject({ id: 'o1', editorial_state: 'backstage' });
    expect(view.commands.find((c) => c.command === 'go_live')).toMatchObject({ available: false });

    occ.get('o1')!.provider_health = 'ready'; // the provider reports the Zoom push arriving
    view = await runLiveCommand('e1', 'go_live', view.occurrence!.version, JACKIE, NOW);
    expect(sent).toEqual(['enter_backstage', 'mark_content_started', 'go_live']);
    expect(view.occurrence!.editorial_state).toBe('live');
    expect(events.get('e1')!.status).toBe('live');

    view = await runLiveCommand('e1', 'end', view.occurrence!.version, JACKIE, NOW);
    expect(view.occurrence!.editorial_state).toBe('ended');
    expect(events.get('e1')!.status).toBe('ended'); // a one-off
    expect(activity.map((a) => a.action)).toEqual(['live.prepared', 'live.went_live', 'live.ended']);
  });

  it('a series with dates left goes back to scheduled when one airing ends', async () => {
    events.set('e1', newEvent({ repeat_rule: { freq: 'weekly', until: '2027-01-31' } }));
    occ.set('o1', newOcc('o1', { editorial_state: 'live', provider_health: 'ready', content_started_at: NOW, version: 4 }));
    events.get('e1')!.broadcast_occurrence_id = 'o1';
    await runLiveCommand('e1', 'end', 4, JACKIE, NOW);
    expect(events.get('e1')!.status).toBe('scheduled');
  });
});

describe('CH5.2 refusals', () => {
  it('Go live before the stream is ready: the not-ready sentence, and nothing written (not even the content mark)', async () => {
    const view = await prepareLive('e1', null, JACKIE, NOW);
    sent.length = 0;
    const e = await err(runLiveCommand('e1', 'go_live', view.occurrence!.version, JACKIE, NOW));
    expect([e.status, e.reason]).toEqual([409, 'not_ready']);
    expect(e.message).toContain('not reaching Cloudflare yet');
    expect(sent).toEqual([]);
    expect(occ.get('o1')!.content_started_at).toBeNull();
    expect(events.get('e1')!.status).toBe('scheduled');
  });

  it('one live at a time: another event on the shared input blocks Prepare and Go live, by name', async () => {
    occ.set('other', newOcc('other', { title: 'Weekly Live', editorial_state: 'live', provider_health: 'ready' }));
    const a = await err(prepareLive('e1', null, JACKIE, NOW));
    expect([a.status, a.reason]).toEqual([409, 'input_busy']);
    expect(a.message).toBe('"Weekly Live" is live on the stream right now. Only one event can use it at a time; end that one first.');
    expect(mockEnsure).not.toHaveBeenCalled(); // checked BEFORE anything is created
    expect(occ.has('o1')).toBe(false);
    expect(sent).toEqual([]);
    // Ready to go, but the other one is still on the input.
    occ.set('o1', newOcc('o1', { editorial_state: 'backstage', provider_health: 'ready' }));
    events.get('e1')!.broadcast_occurrence_id = 'o1';
    const b = await err(runLiveCommand('e1', 'go_live', 1, JACKIE, NOW));
    expect(b.reason).toBe('input_busy');
    expect(occ.get('o1')!.editorial_state).toBe('backstage');
  });

  it('an occurrence on a DIFFERENT input does not block', async () => {
    occ.set('other', newOcc('other', { editorial_state: 'live', provider_session_id: 'c'.repeat(32) }));
    await expect(prepareLive('e1', null, JACKIE, NOW)).resolves.toMatchObject({ input_held_by: null });
  });

  it('a stale version is refused before anything is sent', async () => {
    await prepareLive('e1', null, JACKIE, NOW);
    sent.length = 0;
    const e = await err(runLiveCommand('e1', 'end', 999, JACKIE, NOW));
    expect(e.reason).toBe('version_conflict');
    expect(sent).toEqual([]);
  });

  it('CH5.1 refusals come through as the organizer\'s sentence', async () => {
    mockEnsure.mockRejectedValue(new LiveRefusedError('several_cohorts'));
    const e = await err(prepareLive('e1', null, JACKIE, NOW));
    expect([e.status, e.reason, e.message]).toEqual([409, 'several_cohorts', 'An event for several cohorts cannot stream yet. Choose one cohort, or all members.']);
  });

  it('commands before preparing: "Prepare the stream first."', async () => {
    expect((await err(runLiveCommand('e1', 'go_live', 1, JACKIE, NOW))).message).toBe('Prepare the stream first.');
  });
});

describe('CH5.2 idempotency', () => {
  it('double Go live: the second is a no-op; the event and the log change once', async () => {
    const v = await prepareLive('e1', null, JACKIE, NOW);
    occ.get('o1')!.provider_health = 'ready';
    const live = await runLiveCommand('e1', 'go_live', v.occurrence!.version, JACKIE, NOW);
    const again = await runLiveCommand('e1', 'go_live', live.occurrence!.version, JACKIE, NOW);
    expect(again.occurrence!.version).toBe(live.occurrence!.version);
    expect(events.get('e1')!.update).toHaveBeenCalledTimes(1);
    expect(activity.filter((a) => a.action === 'live.went_live')).toHaveLength(1);
  });

  it('Prepare twice: backstage once', async () => {
    await prepareLive('e1', null, JACKIE, NOW);
    await prepareLive('e1', null, JACKIE, NOW);
    expect(sent).toEqual(['enter_backstage']);
  });
});

describe('CH5.2 the stream key', () => {
  it('is returned to the caller and never written to any log, on success or failure', async () => {
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
    mockReadLiveInput.mockResolvedValue({ uid: UID, rtmpsUrl: 'rtmps://live.cloudflare.com:443/live/', rtmpsStreamKey: KEY });
    expect(await readIngest('e1')).toEqual({ rtmps_url: 'rtmps://live.cloudflare.com:443/live/', stream_key: KEY });
    expect(mockReadLiveInput).toHaveBeenCalledWith(UID, expect.objectContaining({ config: expect.any(Object) }));
    mockReadLiveInput.mockRejectedValue(Object.assign(new Error(`upstream said ${KEY}`), { error_class: 'UpstreamUnavailable' }));
    const e = await err(readIngest('e1'));
    expect([e.status, e.reason]).toEqual([502, 'UpstreamUnavailable']);
    expect(e.message).not.toContain(KEY);
    const logged = spies.flatMap((s) => s.mock.calls.map((c) => c.join(' '))).join('\n');
    expect(logged).not.toContain(KEY);
    spies.forEach((s) => s.mockRestore());
  });

  it('no input configured: a clear refusal, no provider call', async () => {
    delete process.env.CLOUDFLARE_STREAM_LIVE_INPUT_UID;
    expect((await err(readIngest('e1'))).reason).toBe('no_live_input');
    expect(mockReadLiveInput).not.toHaveBeenCalled();
  });
});

describe('CH5.2 attempt 2: the event follows the occurrence however it changes', () => {
  const liveNow = (o: Row = {}): void => {
    occ.set('o1', newOcc('o1', { editorial_state: 'live', provider_health: 'ready', content_started_at: NOW, version: 4 }));
    events.set('e1', newEvent({ status: 'live', broadcast_occurrence_id: 'o1', ...o }));
  };

  it('the safety net ends the stream outside the panel (auto_stream_gone): reading the panel repairs a one-off to ended', async () => {
    liveNow();
    Object.assign(occ.get('o1')!, { editorial_state: 'ended', end_reason: 'auto_stream_gone', version: 5 });
    await readLivePanel('e1');
    expect(events.get('e1')!.status).toBe('ended');
  });

  it('...a series goes back to scheduled; and End pressed afterwards (a no-op) also repairs it', async () => {
    liveNow({ repeat_rule: { freq: 'weekly', until: '2027-01-31' } });
    Object.assign(occ.get('o1')!, { editorial_state: 'ended', end_reason: 'auto_stream_gone' });
    const v = await runLiveCommand('e1', 'end', 4, JACKIE, NOW);
    expect(v.occurrence!.editorial_state).toBe('ended');
    expect(events.get('e1')!.status).toBe('scheduled');
    expect(activity).toEqual([]); // nothing was ended by this call, so nothing is logged as ended
  });

  it('Go live that is a no-op on an occurrence already live sets the event live (e.g. the first status write failed)', async () => {
    liveNow({ status: 'scheduled' });
    await runLiveCommand('e1', 'go_live', 4, JACKIE, NOW);
    expect(events.get('e1')!.status).toBe('live');
  });

  it('a retried click with the old version, whose first attempt landed, is a success, not a conflict', async () => {
    liveNow();
    occ.get('o1')!.version = 6;
    await expect(runLiveCommand('e1', 'go_live', 4, JACKIE, NOW)).resolves.toMatchObject({ occurrence: { editorial_state: 'live' } });
    occ.get('o1')!.editorial_state = 'ended';
    await expect(runLiveCommand('e1', 'end', 4, JACKIE, NOW)).resolves.toMatchObject({ occurrence: { editorial_state: 'ended' } });
    // ...but a stale version for something that has NOT happened is still refused.
    occ.get('o1')!.editorial_state = 'backstage';
    expect((await err(runLiveCommand('e1', 'go_live', 4, JACKIE, NOW))).reason).toBe('version_conflict');
  });

  it('an occurrence put back to scheduled elsewhere takes a "live" event back to scheduled', async () => {
    liveNow();
    occ.get('o1')!.editorial_state = 'scheduled';
    await readLivePanel('e1');
    expect(events.get('e1')!.status).toBe('scheduled');
  });

  it('syncLiveEvents repairs every stale live event with nobody looking, and leaves a truly live one alone', async () => {
    liveNow();
    Object.assign(occ.get('o1')!, { editorial_state: 'ended' });
    occ.set('o2', newOcc('o2', { editorial_state: 'live', provider_health: 'ready' }));
    events.set('e2', newEvent({ id: 'e2', status: 'live', broadcast_occurrence_id: 'o2' }));
    expect(await syncLiveEvents(NOW.getTime())).toBe(1);
    expect([events.get('e1')!.status, events.get('e2')!.status]).toEqual(['ended', 'live']);
  });

  it('Prepare and Go live take the input lock (one after the other across organizers)', async () => {
    await prepareLive('e1', null, JACKIE, NOW);
    occ.get('o1')!.provider_health = 'ready';
    await runLiveCommand('e1', 'go_live', occ.get('o1')!.version, JACKIE, NOW);
    expect(locks).toEqual([`comms_hub_live_input:${UID}`, `comms_hub_live_input:${UID}`]);
  });
});

describe('CH7.3 cancelling the event cancels a prepared stream that is not live yet', () => {
  it('backstage (prepared) or scheduled: cancelled through the broadcast state machine, and logged', async () => {
    await prepareLive('e1', null, JACKIE, NOW);
    expect(occ.get('o1')!.editorial_state).toBe('backstage');
    expect(await cancelPreparedLive(events.get('e1') as never, JACKIE)).toBe('cancelled');
    expect(sent[sent.length - 1]).toBe('cancel');
    expect(occ.get('o1')!.editorial_state).toBe('cancelled');
    expect(activity).toContainEqual({ action: 'broadcast.cancelled', id: 'o1' });
    occ.set('o2', newOcc('o2', { editorial_state: 'scheduled' }));
    expect(await cancelPreparedLive(newEvent({ broadcast_occurrence_id: 'o2' }) as never, JACKIE)).toBe('cancelled');
    expect(occ.get('o2')!.editorial_state).toBe('cancelled');
  });
  it('nothing prepared, or a stream already over: nothing to cancel', async () => {
    expect(await cancelPreparedLive(events.get('e1') as never, JACKIE)).toBe('none');
    occ.set('o3', newOcc('o3', { editorial_state: 'ended' }));
    const before = sent.length;
    expect(await cancelPreparedLive(newEvent({ broadcast_occurrence_id: 'o3' }) as never, JACKIE)).toBe('none');
    expect(sent.length).toBe(before);
  });
});
