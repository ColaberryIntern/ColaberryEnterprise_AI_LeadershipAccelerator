import {
  runHealthTick, __resetHealthMemory, ObservableOccurrence,
} from '../broadcastHealthRunner';

/**
 * L8.4 — capturing the recording while the show is still on air.
 *
 * The rule worth testing hardest is the LAST-TICK one. The uid is only visible while the input
 * is streaming, so the tick that observes the stream gone is the last chance to have seen it.
 * A capture that ran after the health decision, or after the auto-end, would miss exactly the
 * broadcasts that ended cleanly — which is all of them.
 */

const VIDEO = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const OTHER = 'ffffffffffffffffffffffffffffffff';
const WINDOW = 5 * 60 * 1000;

const occ = (over: Partial<ObservableOccurrence> = {}): ObservableOccurrence => ({
  id: 'occ-1', editorial_state: 'live', provider: 'cloudflare',
  provider_session_id: 'input-abc', version: 3, provider_instance_uuid: null, ...over,
});

function harness(opts: {
  occurrences?: ObservableOccurrence[];
  lifecycle?: () => { live: boolean; videoUid: string | null };
} = {}) {
  let nowMs = 1_000_000;
  const list = opts.occurrences ?? [occ()];
  const bindRecording = jest.fn().mockResolvedValue(undefined);
  const endOccurrence = jest.fn().mockResolvedValue({ ok: true });
  const logged: string[] = [];
  const lifecycle = opts.lifecycle ?? (() => ({ live: true, videoUid: VIDEO }));

  const deps = {
    loadObservable: async () => list,
    observe: async () => lifecycle(),
    applyEvent: jest.fn().mockResolvedValue(undefined),
    endOccurrence: (o: ObservableOccurrence, atMs: number) => endOccurrence(o, atMs),
    bindRecording: (id: string, uid: string) => bindRecording(id, uid),
    now: () => nowMs,
    autoEndWindowMs: WINDOW,
    log: (line: string) => { logged.push(line); },
  };

  return {
    deps,
    bindRecording,
    endOccurrence,
    logged,
    list,
    advance: (ms: number) => { nowMs += ms; },
    tick: () => runHealthTick(deps),
  };
}

const events = (lines: string[]) => lines.map((l) => JSON.parse(l));

beforeEach(() => { __resetHealthMemory(); });

describe('capturing the recording', () => {
  it('captures the uid the first time the provider reports it', async () => {
    const h = harness();
    const r = await h.tick();

    expect(r.bound).toBe(1);
    expect(h.bindRecording).toHaveBeenCalledWith('occ-1', VIDEO);
  });

  it('writes once, not once a minute for the length of the class', async () => {
    const h = harness();
    await h.tick();
    // The next load reflects the write, as the real query would.
    h.list[0] = occ({ provider_instance_uuid: VIDEO });
    await h.tick();
    await h.tick();

    expect(h.bindRecording).toHaveBeenCalledTimes(1);
  });

  it('captures on the SAME tick that ends the broadcast', async () => {
    // The last chance. The uid is only visible while the input is streaming, so a capture that
    // ran after the auto-end would miss every show that ended cleanly.
    const h = harness({ lifecycle: () => ({ live: false, videoUid: VIDEO }) });

    await h.tick();                 // absent: clock starts, uid still reported
    h.list[0] = occ({ provider_instance_uuid: null });
    h.advance(WINDOW + 1000);
    const r = await h.tick();       // this tick ends it

    expect(r.ended).toBe(1);
    expect(h.bindRecording).toHaveBeenCalledWith('occ-1', VIDEO);
  });

  it('captures nothing while the input is idle', async () => {
    const h = harness({ lifecycle: () => ({ live: false, videoUid: null }) });
    const r = await h.tick();

    expect(r.bound).toBe(0);
    expect(h.bindRecording).not.toHaveBeenCalled();
  });

  it('captures nothing when the provider could not be reached', async () => {
    const h = harness();
    (h.deps as any).observe = async () => { throw new Error('cloudflare 503'); };
    const r = await h.tick();

    expect(r.bound).toBe(0);
    expect(h.bindRecording).not.toHaveBeenCalled();
  });

  it('ignores an occurrence that is not on Cloudflare', async () => {
    const h = harness({ occurrences: [occ({ provider: 'zoom' })] });
    await h.tick();

    expect(h.bindRecording).not.toHaveBeenCalled();
  });

  it('CONTROL: the same tick DOES capture for a Cloudflare occurrence', async () => {
    // Without this, every refusal above could be a runner that never captures anything.
    const h = harness({ occurrences: [occ({ provider: 'cloudflare' })] });
    await h.tick();

    expect(h.bindRecording).toHaveBeenCalledTimes(1);
  });
});

describe('a second recording under one occurrence', () => {
  it('refuses to overwrite, and says so', async () => {
    // Cloudflare mints a new video per broadcast, so a different uid means the input streamed
    // twice. Overwriting would discard the recording the audience actually watched.
    const h = harness({
      occurrences: [occ({ provider_instance_uuid: VIDEO })],
      lifecycle: () => ({ live: true, videoUid: OTHER }),
    });
    const r = await h.tick();

    expect(r.bound).toBe(0);
    expect(h.bindRecording).not.toHaveBeenCalled();
    const conflict = events(h.logged).find((l) => l.event === 'broadcast_recording_conflict');
    expect(conflict).toBeDefined();
    expect(conflict.context.bound).toBe(VIDEO);
    expect(conflict.context.seen).toBe(OTHER);
    expect(conflict.outcome).toBe('failure');
  });
});

describe('when the write fails', () => {
  it('counts it and keeps the loop reaching the next class', async () => {
    const h = harness({ occurrences: [occ({ id: 'occ-1' }), occ({ id: 'occ-2' })] });
    h.bindRecording.mockImplementation(async (id: string) => {
      if (id === 'occ-1') throw new Error('connection terminated');
    });

    const r = await h.tick();

    expect(r.failed).toBe(1);
    expect(r.bound).toBe(1);
    expect(h.bindRecording.mock.calls.map((c: any[]) => c[0])).toEqual(['occ-1', 'occ-2']);
  });

  it('logs the failure as a failure, not as a success', async () => {
    const h = harness();
    h.bindRecording.mockRejectedValue(new Error('nope'));
    await h.tick();

    const line = events(h.logged).find((l) => l.event === 'broadcast_recording_bind_failed');
    expect(line.outcome).toBe('failure');
    expect(line.level).toBe('warn');
  });
});
