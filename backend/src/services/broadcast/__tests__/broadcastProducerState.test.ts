/**
 * broadcastProducerState — the read that makes a Go Live control possible.
 *
 * The assertions that carry weight are about the two answers this module has to keep apart,
 * because the whole subsystem's defect history is made of surfaces that blurred them:
 *
 *   - "live was never enabled for this session" is a 200 with `found: false`, not an error
 *   - a FAILED READ is a thrown error, never an empty-looking control
 *
 * The second is the opposite choice from `resolveSessionMoment`, which degrades to `unknown`
 * on a database blip. That one answers a public landing page; this one is about to put a
 * class on air, and a producer must never press Go Live against a picture built on a failure.
 *
 * Decision logic is NOT retested here — `describeProducerCommands` is covered exhaustively in
 * broadcastStateMachine.test.ts. What is tested is that this module hands the machine the real
 * state and does not reinterpret the answer.
 */
const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: any[]) => mockQuery(...a) } }));

import { readProducerStateBySession } from '../broadcastProducerState';

const SID = '7aa7ce89-187d-4604-9b86-a3b2a69579ce';
const NOW = Date.parse('2026-07-23T23:30:00.000Z');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'occ-1',
  title: 'Week 8 — Build Day',
  editorial_state: 'scheduled',
  provider_health: 'unknown',
  version: 4,
  content_started_at: null,
  ended_at: null,
  end_reason: null,
  scheduled_start_at: new Date(NOW),
  ...over,
});

const rows = (r: any[]) => { mockQuery.mockResolvedValue([r]); };

beforeEach(() => { jest.clearAllMocks(); rows([row()]); });

describe('finding the occurrence', () => {
  it('joins through broadcast_source_refs on the session, not the occurrence', async () => {
    await readProducerStateBySession(SID, NOW);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain('broadcast_source_refs');
    expect(sql).toContain("source_type = 'live_session'");
    // Parameterized, never interpolated: a session id arrives from a URL.
    expect(sql).toContain(':sid');
    expect(opts.replacements).toEqual({ sid: SID });
  });

  it('answers found:false for a session that never had live enabled', async () => {
    rows([]);
    const r = await readProducerStateBySession(SID, NOW);
    // Not an error and not a 404-shaped refusal: most sessions have no broadcast, and a
    // producer who opened the wrong class should be told that plainly.
    expect(r).toEqual({ found: false, occurrence: null, commands: [] });
  });

  it('THROWS when the read fails, rather than rendering an empty control', async () => {
    mockQuery.mockRejectedValue(new Error('connection terminated'));
    await expect(readProducerStateBySession(SID, NOW)).rejects.toThrow('connection terminated');
  });
});

describe('the projection', () => {
  it('carries the version, which is the whole reason this endpoint exists', async () => {
    const r = await readProducerStateBySession(SID, NOW);
    expect(r.occurrence!.version).toBe(4);
  });

  it('renders instants as ISO-8601 whether the driver returned a Date or a string', async () => {
    rows([row({
      content_started_at: new Date(NOW),
      ended_at: '2026-07-24T01:00:00.000Z',
    })]);
    const r = await readProducerStateBySession(SID, NOW);
    expect(r.occurrence!.content_started_at).toBe('2026-07-23T23:30:00.000Z');
    expect(r.occurrence!.ended_at).toBe('2026-07-24T01:00:00.000Z');
  });

  it('keeps a null instant null instead of inventing an epoch', async () => {
    const r = await readProducerStateBySession(SID, NOW);
    expect(r.occurrence!.content_started_at).toBeNull();
    expect(r.occurrence!.ended_at).toBeNull();
    expect(r.occurrence!.end_reason).toBeNull();
  });

  it('accepts a numeric-string version from a raw query', async () => {
    rows([row({ version: '11' })]);
    const r = await readProducerStateBySession(SID, NOW);
    expect(r.occurrence!.version).toBe(11);
  });

  it('REFUSES an unreadable version rather than handing a client a plausible zero', async () => {
    // The client sends this number straight back on the next command. A coerced 0 would be
    // guarded against a state that never existed.
    rows([row({ version: 'not-a-number' })]);
    await expect(readProducerStateBySession(SID, NOW)).rejects.toMatchObject({
      error_class: 'ContractViolation',
    });
  });
});

describe('the command description', () => {
  it('describes the occurrence it actually read', async () => {
    rows([row({ editorial_state: 'backstage', provider_health: 'ready', content_started_at: new Date(NOW) })]);
    const r = await readProducerStateBySession(SID, NOW);
    const go = r.commands.find((c) => c.command === 'go_live')!;
    expect(go.available).toBe(true);
  });

  it('passes content_started_at through as a real instant, not a string the machine cannot read', async () => {
    // A string here would be truthy and the anchor check would pass by accident; this asserts
    // the conversion happens rather than the bug being invisible.
    rows([row({ editorial_state: 'backstage', provider_health: 'ready', content_started_at: '2026-07-23T23:30:00.000Z' })]);
    const r = await readProducerStateBySession(SID, NOW);
    expect(r.commands.find((c) => c.command === 'go_live')!.available).toBe(true);
    expect(r.commands.find((c) => c.command === 'mark_content_started')!.available).toBe(false);
  });

  it('restricts the list when the caller says which commands it can send', async () => {
    // The HTTP surface accepts a subset; offering a button the route would 400 is worse than
    // offering none.
    const r = await readProducerStateBySession(SID, NOW, ['enter_backstage', 'cancel']);
    expect(r.commands.map((c) => c.command)).toEqual(['enter_backstage', 'cancel']);
  });

  it('describes every command when no restriction is given', async () => {
    const r = await readProducerStateBySession(SID, NOW);
    expect(r.commands.map((c) => c.command)).toContain('publish_replay');
  });
});
