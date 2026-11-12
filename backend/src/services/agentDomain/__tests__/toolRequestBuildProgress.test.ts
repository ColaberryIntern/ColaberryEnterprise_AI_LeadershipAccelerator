/**
 * Tests for delivery progress on an approved tool request (Agent Tools Phase 3).
 *
 * WHAT THESE PIN, in order of how badly each would mislead somebody:
 *
 *   1. **A build event cannot route around approval.** Recording "handed over" on a request
 *      nobody approved would mark a tool delivered that was never allowed. Refused by name.
 *   2. **Handover is terminal.** A "started building" after a handover makes the sequence
 *      unreadable, and a dashboard reading the sequence would then report nonsense.
 *   3. **The sentence reports what happened, not what phase exists.** Phase 2's placeholder read
 *      "Not yet tracked through to handover, which Phase 3 adds". That promise is now a lie if
 *      it survives, so a test asserts it is gone.
 *
 * Models are mocked so this stays a unit test with no database.
 */
export {};

const parentsHolder: { current: Record<string, Record<string, unknown> | null> } = { current: {} };
const eventsHolder: { current: Array<Record<string, unknown>> } = { current: [] };
const created: Array<Record<string, unknown>> = [];

jest.mock('../../../models/AgentDomainChangeRequest', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(async (id: string) => parentsHolder.current[id] ?? null) },
}));

jest.mock('../../../models/AgentDomainToolRequestBuildEvent', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async () => eventsHolder.current),
    create: jest.fn(async (row: Record<string, unknown>) => {
      const saved = { id: 'ev-' + (created.length + 1), ...row };
      created.push(saved);
      eventsHolder.current.push(saved);
      return saved;
    }),
  },
  TOOL_REQUEST_BUILD_EVENTS: ['started_build', 'handed_over'],
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  recordBuildEvent, listBuildEvents, describeDelivery, BUILD_NOTE_MAX,
} = require('../toolRequestBuildProgressService');

const approved = (id = 'req-1') => { parentsHolder.current[id] = { status: 'approved' }; return id; };

beforeEach(() => {
  parentsHolder.current = {};
  eventsHolder.current = [];
  created.length = 0;
  jest.clearAllMocks();
});

describe('a build event cannot route around approval', () => {
  it('refuses a milestone on a request that is only submitted', async () => {
    parentsHolder.current['req-1'] = { status: 'submitted' };

    await expect(
      recordBuildEvent({ changeRequestId: 'req-1', event: 'handed_over', actorIdentity: 'b@c.d' }),
    ).rejects.toMatchObject({ rule: 'not_approved' });
    expect(created).toHaveLength(0);
  });

  it('refuses a milestone on a declined request', async () => {
    parentsHolder.current['req-1'] = { status: 'declined' };

    await expect(
      recordBuildEvent({ changeRequestId: 'req-1', event: 'started_build', actorIdentity: 'b@c.d' }),
    ).rejects.toMatchObject({ rule: 'not_approved' });
  });

  it('names the actual status in the refusal, so the person knows why', async () => {
    parentsHolder.current['req-1'] = { status: 'withdrawn' };

    await expect(
      recordBuildEvent({ changeRequestId: 'req-1', event: 'started_build', actorIdentity: 'b@c.d' }),
    ).rejects.toThrow(/withdrawn/);
  });

  it('refuses a milestone on a request that does not exist', async () => {
    await expect(
      recordBuildEvent({ changeRequestId: 'nope', event: 'started_build', actorIdentity: 'b@c.d' }),
    ).rejects.toMatchObject({ rule: 'request_not_found' });
  });

  it('writes no status, verb or grant onto the row', async () => {
    approved();
    await recordBuildEvent({ changeRequestId: 'req-1', event: 'started_build', actorIdentity: 'b@c.d' });

    const row = created[0];
    for (const forbidden of ['status', 'verb', 'tools_granted', 'autonomy_level', 'enabled']) {
      expect(row).not.toHaveProperty(forbidden);
    }
    expect(parentsHolder.current['req-1']).toEqual({ status: 'approved' });
  });
});

describe('handover is terminal', () => {
  it('refuses a second handover', async () => {
    approved();
    await recordBuildEvent({ changeRequestId: 'req-1', event: 'handed_over', actorIdentity: 'b@c.d' });

    await expect(
      recordBuildEvent({ changeRequestId: 'req-1', event: 'handed_over', actorIdentity: 'b@c.d' }),
    ).rejects.toMatchObject({ rule: 'already_handed_over' });
  });

  it('refuses starting a build after it was handed over', async () => {
    approved();
    await recordBuildEvent({ changeRequestId: 'req-1', event: 'handed_over', actorIdentity: 'b@c.d' });

    await expect(
      recordBuildEvent({ changeRequestId: 'req-1', event: 'started_build', actorIdentity: 'b@c.d' }),
    ).rejects.toMatchObject({ rule: 'already_handed_over' });
  });

  it('refuses starting a build twice', async () => {
    approved();
    await recordBuildEvent({ changeRequestId: 'req-1', event: 'started_build', actorIdentity: 'b@c.d' });

    await expect(
      recordBuildEvent({ changeRequestId: 'req-1', event: 'started_build', actorIdentity: 'b@c.d' }),
    ).rejects.toMatchObject({ rule: 'already_started' });
  });

  it('allows handing over without a recorded start, because some work is done in one sitting', async () => {
    approved();
    const ev = await recordBuildEvent({ changeRequestId: 'req-1', event: 'handed_over', actorIdentity: 'b@c.d' });
    expect(ev.event).toBe('handed_over');
  });
});

describe('what else it refuses, by name', () => {
  it('refuses an unattributed event', async () => {
    approved();
    await expect(
      recordBuildEvent({ changeRequestId: 'req-1', event: 'started_build', actorIdentity: '  ' }),
    ).rejects.toMatchObject({ rule: 'actor_missing' });
  });

  it('refuses an invented milestone', async () => {
    approved();
    await expect(
      recordBuildEvent({ changeRequestId: 'req-1', event: 'shipped' as never, actorIdentity: 'b@c.d' }),
    ).rejects.toMatchObject({ rule: 'event_unknown' });
  });

  it('refuses an over-long note, naming the limit and the actual length', async () => {
    approved();
    await expect(
      recordBuildEvent({
        changeRequestId: 'req-1', event: 'started_build', actorIdentity: 'b@c.d',
        note: 'x'.repeat(BUILD_NOTE_MAX + 1),
      }),
    ).rejects.toMatchObject({ rule: 'note_too_long' });
  });

  it('stores a blank note as null rather than an empty string', async () => {
    approved();
    await recordBuildEvent({ changeRequestId: 'req-1', event: 'started_build', actorIdentity: 'b@c.d', note: '   ' });
    expect(created[0].note).toBeNull();
  });
});

describe('the delivery sentence reports what happened', () => {
  it('no longer promises a phase that now exists', () => {
    // Phase 2's placeholder. If this string survives anywhere, the UI is advertising unbuilt work.
    for (const events of [[], [{ id: 'e', event: 'started_build', actor_identity: 'b', occurred_at: '2026-11-11T00:00:00.000Z', note: null }]]) {
      expect(describeDelivery(events as never)).not.toContain('Phase 3');
    }
  });

  it('says nobody has started when there are no events', () => {
    expect(describeDelivery([])).toContain('Nobody has started it yet');
  });

  it('reports who is building it and since when', () => {
    const line = describeDelivery([
      { id: 'e1', event: 'started_build', actor_identity: 'builder@colaberry.com', occurred_at: '2026-11-11T09:00:00.000Z', note: null },
    ] as never);
    expect(line).toContain('Being built since 2026-11-11');
    expect(line).toContain('builder@colaberry.com');
    expect(line).toContain('Not handed over yet');
  });

  it('reports the handover date and carries its note', () => {
    const line = describeDelivery([
      { id: 'e1', event: 'started_build', actor_identity: 'b', occurred_at: '2026-11-11T09:00:00.000Z', note: null },
      { id: 'e2', event: 'handed_over', actor_identity: 'builder@colaberry.com', occurred_at: '2026-11-20T09:00:00.000Z', note: 'Live as send_document' },
    ] as never);
    expect(line).toContain('Handed over on 2026-11-20');
    expect(line).toContain('Live as send_document');
  });

  it('prefers the handover over an earlier start, whatever order they arrive in', () => {
    const line = describeDelivery([
      { id: 'e2', event: 'handed_over', actor_identity: 'b', occurred_at: '2026-11-20T09:00:00.000Z', note: null },
      { id: 'e1', event: 'started_build', actor_identity: 'b', occurred_at: '2026-11-11T09:00:00.000Z', note: null },
    ] as never);
    expect(line).toContain('Handed over');
    expect(line).not.toContain('Being built');
  });
});

describe('reading the milestones', () => {
  it('returns an empty list, not null, when nothing has happened', async () => {
    expect(await listBuildEvents('req-1')).toEqual([]);
  });

  it('returns them with actor and ISO time', async () => {
    eventsHolder.current = [
      { id: 'e1', event: 'started_build', actor_identity: 'b@c.d', occurred_at: new Date('2026-11-11T09:00:00Z'), note: null },
    ];
    const out = await listBuildEvents('req-1');
    expect(out[0]).toMatchObject({ event: 'started_build', actor_identity: 'b@c.d', occurred_at: '2026-11-11T09:00:00.000Z' });
  });
});
