import { runReplayTick, PromotableOccurrence } from '../broadcastReplayRunner';

/**
 * L8.4 — the loop that carries a finished recording to the surface.
 *
 * The policy is pinned purely elsewhere. What these pin is what a pure test cannot reach: that
 * an unreachable provider is never mistaken for a failed recording, that a refusal does not
 * stop the loop reaching the next class, and that running it every minute converges instead of
 * thrashing.
 */

const VIDEO = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

const occ = (over: Partial<PromotableOccurrence> = {}): PromotableOccurrence => ({
  id: 'occ-1', editorial_state: 'ended', provider: 'cloudflare',
  provider_instance_uuid: VIDEO, version: 5, ...over,
});

function harness(opts: {
  rows?: PromotableOccurrence[];
  state?: () => string | null | 'throw';
} = {}) {
  const rows = opts.rows ?? [occ()];
  const runCommand = jest.fn().mockResolvedValue({ ok: true });
  const logged: string[] = [];
  const state = opts.state ?? (() => 'ready');

  const deps = {
    loadPromotable: async () => rows,
    readRecordingState: async () => {
      const v = state();
      if (v === 'throw') throw new Error('cloudflare unreachable');
      return v;
    },
    runCommand: (id: string, cmd: any, v: number) => runCommand(id, cmd, v),
    log: (l: string) => { logged.push(l); },
  };

  return { deps, runCommand, logged, rows, tick: () => runReplayTick(deps) };
}

const events = (lines: string[]) => lines.map((l) => JSON.parse(l));

describe('publishing a finished recording', () => {
  it('moves a finished show into processing, with its version', () => {
    const h = harness();
    return h.tick().then((r) => {
      expect(r.promoted).toBe(1);
      expect(h.runCommand).toHaveBeenCalledWith('occ-1', 'begin_processing', 5);
    });
  });

  it('publishes on the next tick, once it is processing', async () => {
    const h = harness({ rows: [occ({ editorial_state: 'processing', version: 6 })] });
    await h.tick();

    expect(h.runCommand).toHaveBeenCalledWith('occ-1', 'publish_replay', 6);
  });

  it('converges: a published replay is examined and left alone', async () => {
    // The loop runs every minute for ever. It has to stop doing anything.
    const h = harness({ rows: [occ({ editorial_state: 'replay_ready' })] });
    const r = await h.tick();

    expect(r.promoted).toBe(0);
    expect(h.runCommand).not.toHaveBeenCalled();
  });

  it('says what it did, and from where', async () => {
    const h = harness();
    await h.tick();

    const line = events(h.logged).find((l) => l.event === 'broadcast_replay_promoted');
    expect(line.context).toMatchObject({
      occurrenceId: 'occ-1', from: 'ended', command: 'begin_processing', providerState: 'ready',
    });
  });
});

describe('a provider we cannot reach', () => {
  it('is NEVER read as a failed recording', async () => {
    // The distinction that matters. "We could not ask" and "Cloudflare gave up" look the same
    // from here and mean opposite things: one is retried, the other is final.
    const h = harness({ state: () => 'throw' });
    const r = await h.tick();

    expect(r.promoted).toBe(0);
    expect(h.runCommand).not.toHaveBeenCalled();
    expect(events(h.logged).some((l) => l.event === 'broadcast_replay_unavailable')).toBe(false);
  });

  it('CONTROL: a recording Cloudflare DID fail is reported', async () => {
    // Without this, the test above could pass because nothing is ever reported.
    const h = harness({ state: () => 'error' });
    await h.tick();

    const line = events(h.logged).find((l) => l.event === 'broadcast_replay_unavailable');
    expect(line).toBeDefined();
    expect(line.outcome).toBe('failure');
    expect(line.context.providerState).toBe('error');
  });

  it('treats an undocumented provider state as unreadable, not as ready', async () => {
    const h = harness({ state: () => 'some-new-cloudflare-state' });
    await h.tick();

    expect(h.runCommand).not.toHaveBeenCalled();
  });
});

describe('nothing bound', () => {
  it('is skipped, and counted apart from a refusal', async () => {
    const h = harness({ rows: [occ({ provider_instance_uuid: null })] });
    const r = await h.tick();

    expect(r.skipped).toBe(1);
    expect(r.examined).toBe(0);
    expect(h.runCommand).not.toHaveBeenCalled();
  });
});

describe('when a command is refused', () => {
  it('counts it and keeps reaching the next class', async () => {
    const h = harness({ rows: [occ({ id: 'occ-1' }), occ({ id: 'occ-2' })] });
    h.runCommand.mockImplementation(async (id: string) => (
      id === 'occ-1' ? { ok: false, reason: 'expected version 5, found 6' } : { ok: true }
    ));

    const r = await h.tick();

    expect(r.failed).toBe(1);
    expect(r.promoted).toBe(1);
    expect(h.runCommand.mock.calls.map((c: any[]) => c[0])).toEqual(['occ-1', 'occ-2']);
  });

  it('survives a throw', async () => {
    const h = harness();
    h.runCommand.mockRejectedValue(new Error('connection terminated'));
    const r = await h.tick();

    expect(r.failed).toBe(1);
  });

  it('never throws out of the tick when the load itself fails', async () => {
    // A promotion loop that dies stops publishing replays for every class, and the symptom
    // looks like a product decision rather than a crash.
    const h = harness();
    (h.deps as any).loadPromotable = async () => { throw new Error('db down'); };

    await expect(h.tick()).resolves.toMatchObject({ failed: 1, promoted: 0 });
  });
});
