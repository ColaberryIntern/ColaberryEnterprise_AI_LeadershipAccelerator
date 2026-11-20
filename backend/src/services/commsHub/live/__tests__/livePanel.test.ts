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
const KEY = 'SECRET-STREAM-KEY-1234567890abcdef';
const UID = 'b'.repeat(32);

jest.mock('../../../../config/database', () => ({
  sequelize: {
    query: jest.fn(async (sql: string, opts: Row) => {
      const r = opts.replacements;
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
jest.mock('../../../../models/CommsHubEvent', () => ({ __esModule: true, default: { findByPk: jest.fn(async (id: string) => events.get(id) ?? null) } }));
jest.mock('../../activityLog', () => ({ logActivity: jest.fn(async (_a: Row, action: string, _t: string, id: string) => { activity.push({ action, id }); }) }));
jest.mock('../../../../models/BroadcastOccurrence', () => ({ __esModule: true, default: {} }));
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
import { LivePanelError, prepareLive, readIngest, readLivePanel, runLiveCommand } from '../livePanel';

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
  occ.clear(); events.clear(); activity.length = 0; sent.length = 0; jest.clearAllMocks();
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
    expect(occ.get('o1')!.editorial_state).toBe('scheduled'); // created by ensure, but never opened backstage
    expect(sent).toEqual([]);
    // Ready to go, but the other one is still on the input.
    Object.assign(occ.get('o1')!, { editorial_state: 'backstage', provider_health: 'ready' });
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
