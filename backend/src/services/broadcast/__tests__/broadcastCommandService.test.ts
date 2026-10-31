/**
 * broadcastCommandService — the I/O layer. The decision logic is covered exhaustively in
 * broadcastStateMachine.test.ts; what matters here is the write path:
 *
 *   - the UPDATE carries `WHERE version = :expected`, so the DATABASE arbitrates a race,
 *     not the app's earlier read
 *   - SessionWentLive is emitted ONLY after a committed transition, and only for go_live
 *   - a provider event never emits it
 *
 * Models are mocked, so this runs in CI (no database). The pattern follows
 * communityDigestService.test.ts, which mocks its collaborators the same way.
 */
jest.mock('../../../models/BroadcastOccurrence', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(), update: jest.fn() },
}));
jest.mock('../../communityRooms/roomOutboxService', () => ({ emitRoomEvent: jest.fn() }));
jest.mock('../../../config/database', () => ({
  sequelize: { transaction: jest.fn(async (fn: any) => fn({})) },
}));
jest.mock('../../../utils/requestContext', () => ({ ensureTraceId: () => 'trace-0000' }));

import { runProducerCommand, runProviderEvent } from '../broadcastCommandService';
import BroadcastOccurrence from '../../../models/BroadcastOccurrence';
import { emitRoomEvent } from '../../communityRooms/roomOutboxService';

const findByPk = (BroadcastOccurrence as any).findByPk as jest.Mock;
const update = (BroadcastOccurrence as any).update as jest.Mock;
const emit = emitRoomEvent as jest.Mock;

const NOW = Date.parse('2026-07-23T23:30:00.000Z');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'occ-1',
  occurrence_key: 'live_session:s1:2026-07-23T23:30',
  room_id: 'room-1',
  editorial_state: 'backstage',
  provider_health: 'ready',
  version: 4,
  content_started_at: new Date(NOW),
  access_mode: 'preview',
  preview_seconds: 900,
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('runProducerCommand', () => {
  it('404s on a missing occurrence', async () => {
    findByPk.mockResolvedValue(null);
    const r = await runProducerCommand({ occurrenceId: 'nope', command: 'go_live', expectedVersion: 1, isProducer: true });
    expect(r).toMatchObject({ ok: false, error_class: 'NotFoundError', status: 404 });
  });

  it('refuses a non-producer without touching the database', async () => {
    findByPk.mockResolvedValue(row());
    const r = await runProducerCommand({ occurrenceId: 'occ-1', command: 'go_live', expectedVersion: 4, isProducer: false });
    expect(r).toMatchObject({ ok: false, error_class: 'Forbidden', status: 403 });
    expect(update).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('guards the UPDATE with the expected version — the database arbitrates the race', async () => {
    findByPk.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ editorial_state: 'live', version: 5 }));
    update.mockResolvedValue([1]);

    await runProducerCommand({ occurrenceId: 'occ-1', command: 'go_live', expectedVersion: 4, isProducer: true, nowMs: NOW });

    const [, options] = update.mock.calls[0];
    expect(options.where).toMatchObject({ id: 'occ-1', version: 4 });
  });

  it('treats an affected-row count of 0 as the real conflict signal', async () => {
    // Both callers read version 4 and both passed the in-memory check; only one UPDATE wins.
    findByPk.mockResolvedValue(row());
    update.mockResolvedValue([0]);

    const r = await runProducerCommand({ occurrenceId: 'occ-1', command: 'go_live', expectedVersion: 4, isProducer: true, nowMs: NOW });

    expect(r).toMatchObject({ ok: false, error_class: 'VersionConflict', status: 409 });
    expect(emit).not.toHaveBeenCalled(); // nothing committed, so nothing announced
  });

  /**
   * A conflict is the one refusal a client can resolve by itself, by acting on the version
   * that is actually current. The End control has been reading a `version` off this response
   * since it shipped and nothing ever put one there, so every conflict told the producer
   * "someone moved this" and nothing more.
   */
  it('returns the row a refusal was judged against, so a conflict can report the real version', async () => {
    findByPk.mockResolvedValue(row({ version: 9 }));
    const r = await runProducerCommand({ occurrenceId: 'occ-1', command: 'go_live', expectedVersion: 4, isProducer: true, nowMs: NOW });
    expect(r).toMatchObject({ ok: false, error_class: 'VersionConflict', status: 409 });
    expect(r.occurrence!.version).toBe(9);
    expect(update).not.toHaveBeenCalled();
  });

  it('RE-READS after losing the write race, rather than echoing the version that just failed', async () => {
    // Echoing our own read would send the client back with the exact number the database
    // rejected, which is a retry loop dressed up as a conflict report.
    findByPk.mockResolvedValueOnce(row({ version: 4 })).mockResolvedValueOnce(row({ version: 5, editorial_state: 'live' }));
    update.mockResolvedValue([0]);

    const r = await runProducerCommand({ occurrenceId: 'occ-1', command: 'go_live', expectedVersion: 4, isProducer: true, nowMs: NOW });

    expect(r).toMatchObject({ ok: false, error_class: 'VersionConflict' });
    expect(r.occurrence!.version).toBe(5);
  });

  it('omits the row when the occurrence vanished mid-flight', async () => {
    // Deleted between read and write. Still a conflict, but there is no version to report and
    // guessing one would be worse than silence — the client would send it.
    findByPk.mockResolvedValueOnce(row({ version: 4 })).mockResolvedValueOnce(null);
    update.mockResolvedValue([0]);

    const r = await runProducerCommand({ occurrenceId: 'occ-1', command: 'go_live', expectedVersion: 4, isProducer: true, nowMs: NOW });

    expect(r).toMatchObject({ ok: false, error_class: 'VersionConflict' });
    expect(r.occurrence).toBeUndefined();
  });

  it('emits SessionWentLive once, AFTER the committed transition', async () => {
    findByPk.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ editorial_state: 'live', version: 5 }));
    update.mockResolvedValue([1]);

    const r = await runProducerCommand({ occurrenceId: 'occ-1', command: 'go_live', expectedVersion: 4, isProducer: true, nowMs: NOW });

    expect(r.ok).toBe(true);
    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0][0];
    expect(payload).toMatchObject({
      eventType: 'SessionWentLive',
      aggregateType: 'broadcast',
      aggregateId: 'occ-1',
      discriminator: '5',          // the post-transition version — a retry dedupes on it
      correlationId: 'trace-0000', // the column exists but no caller has ever populated it
    });
    expect(payload.payload).toMatchObject({ access_mode: 'preview', preview_seconds: 900 });
  });

  it('does NOT emit for a command that is not go_live', async () => {
    findByPk.mockResolvedValueOnce(row({ editorial_state: 'live' }))
      .mockResolvedValueOnce(row({ editorial_state: 'ended', version: 5 }));
    update.mockResolvedValue([1]);

    await runProducerCommand({ occurrenceId: 'occ-1', command: 'end', expectedVersion: 4, isProducer: true });
    expect(emit).not.toHaveBeenCalled();
  });

  it('a duplicate go_live writes nothing and emits nothing', async () => {
    findByPk.mockResolvedValue(row({ editorial_state: 'live' }));

    const r = await runProducerCommand({ occurrenceId: 'occ-1', command: 'go_live', expectedVersion: 4, isProducer: true });

    expect(r).toMatchObject({ ok: true, noop: true });
    expect(update).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('refuses go_live when the provider is not ready, and writes nothing', async () => {
    findByPk.mockResolvedValue(row({ provider_health: 'down' }));
    const r = await runProducerCommand({ occurrenceId: 'occ-1', command: 'go_live', expectedVersion: 4, isProducer: true });
    expect(r).toMatchObject({ ok: false, error_class: 'ProviderNotReady' });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('runProviderEvent', () => {
  it('drops a stale delivery without writing', async () => {
    findByPk.mockResolvedValue(row({ editorial_state: 'live' }));
    const r = await runProviderEvent('occ-1', { health: 'down', occurredAtMs: NOW - 1 }, NOW);
    expect(r).toMatchObject({ ok: true, noop: true });
    expect(update).not.toHaveBeenCalled();
  });

  it('moves live -> reconnecting and NEVER emits SessionWentLive', async () => {
    findByPk.mockResolvedValueOnce(row({ editorial_state: 'live' }))
      .mockResolvedValueOnce(row({ editorial_state: 'reconnecting', version: 5 }));
    update.mockResolvedValue([1]);

    const r = await runProviderEvent('occ-1', { health: 'down', occurredAtMs: NOW + 1000 }, NOW);

    expect(r.ok).toBe(true);
    expect(update.mock.calls[0][0]).toMatchObject({ editorial_state: 'reconnecting' });
    // A provider cannot publish a broadcast. Only a producer can.
    expect(emit).not.toHaveBeenCalled();
  });

  it('never writes content_started_at, so a reconnect cannot refill the preview', async () => {
    findByPk.mockResolvedValueOnce(row({ editorial_state: 'reconnecting', provider_health: 'down' }))
      .mockResolvedValueOnce(row({ editorial_state: 'live', version: 5 }));
    update.mockResolvedValue([1]);

    await runProviderEvent('occ-1', { health: 'ready', occurredAtMs: NOW + 5000 }, NOW);

    expect(update.mock.calls[0][0]).not.toHaveProperty('content_started_at');
  });

  it('guards its UPDATE with the version it read', async () => {
    findByPk.mockResolvedValueOnce(row({ editorial_state: 'live', version: 9 }))
      .mockResolvedValueOnce(row({ editorial_state: 'reconnecting', version: 10 }));
    update.mockResolvedValue([1]);

    await runProviderEvent('occ-1', { health: 'down', occurredAtMs: NOW + 1000 }, NOW);

    expect(update.mock.calls[0][1].where).toMatchObject({ id: 'occ-1', version: 9 });
  });
});
