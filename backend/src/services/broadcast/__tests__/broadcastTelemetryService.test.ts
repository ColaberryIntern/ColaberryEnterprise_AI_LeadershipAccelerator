/**
 * The telemetry WRITE path, which shipped with no tests at all and was flagged as such in its
 * own commit. These are the tests that make its claims checkable.
 *
 * WHAT IS BEING PROVEN, AND WHY IT IS HERE RATHER THAN IN THE POLICY SUITE.
 * `broadcastTelemetryPolicy` already proves `creditSeconds` as arithmetic, exhaustively and
 * under mutation. What it cannot prove is that the SERVICE asks that function the right
 * question — specifically that the credit anchor it reads belongs to the PERSON and not to
 * the tab. That single choice is the whole dedup rule: watch time is credited from the person
 * row, so a second tab finds the anchor the first tab just moved and earns nothing. Get it
 * wrong and every figure doubles for anyone with the player open twice, silently, and the
 * policy suite stays green throughout.
 *
 * No database. `sequelize` is mocked and the assertions are on the SQL and the replacements
 * actually sent, which is the only honest thing to assert without one.
 */
jest.mock('../../../config/database', () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));

import { sequelize } from '../../../config/database';
import { recordPlaybackBeat, type PlaybackBeat, type ServerViewerFacts } from '../broadcastTelemetryService';
import type { TelemetryConfig } from '../broadcastTelemetryPolicy';

const query = sequelize.query as unknown as jest.Mock;
const transaction = sequelize.transaction as unknown as jest.Mock;

const CFG: TelemetryConfig = {
  appHeartbeatSeconds: 30,
  appActiveWindowSeconds: 90,
  playbackHeartbeatSeconds: 15,
  viewerExpirySeconds: 45,
  bufferingGraceSeconds: 20,
};

const T0 = Date.parse('2026-10-15T15:00:00.000Z');
const OCC = '11111111-2222-4333-8444-555555555555';
const ENR = 'enr-1';

const beat = (over: Partial<PlaybackBeat> = {}): PlaybackBeat => ({
  occurrenceId: OCC, sessionId: 'tab-a', state: 'playing', intent: 'deliberate', ...over,
});
const facts = (over: Partial<ServerViewerFacts> = {}): ServerViewerFacts => ({
  enrollmentId: ENR, isStaff: false, isTest: false, accessMode: 'free', ...over,
});

/** The person row the SELECT ... FOR UPDATE finds, or none for a first-ever beat. */
function withPersonRow(lastCreditedAt: Date | null, intent: 'deliberate' | 'auto' = 'deliberate'): void {
  transaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb('TX'));
  query.mockReset();
  query.mockImplementation(async (sql: string) => (
    /FOR UPDATE/.test(sql) ? [{ last_credited_at: lastCreditedAt, intent }] : []
  ));
}

/** No person row at all — the first beat this viewer has ever sent. */
function withNoPersonRow(): void {
  transaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb('TX'));
  query.mockReset();
  query.mockImplementation(async () => []);
}

/** The replacements sent with the broadcast_viewer_people upsert. */
function peopleUpsert(): Record<string, unknown> {
  const call = query.mock.calls.find(([sql]) => /INSERT INTO broadcast_viewer_people/.test(sql as string));
  if (!call) throw new Error('no broadcast_viewer_people upsert was issued');
  return (call[1] as { replacements: Record<string, unknown> }).replacements;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the credit anchor belongs to the PERSON, not the tab', () => {
  it('TWO TABS FOR ONE PERSON CREDIT ONCE', async () => {
    // Tab A beats ten seconds after this person last earned credit, and earns those ten.
    withPersonRow(new Date(T0 - 10_000));
    await recordPlaybackBeat(beat({ sessionId: 'tab-a' }), facts(), CFG, T0);
    expect(peopleUpsert().earned).toBe(10);

    // Tab B beats at the SAME INSTANT. Because the anchor it reads is the person's — which
    // tab A has just moved to now — the gap is zero and it earns nothing. This is the entire
    // dedup rule. Reading the anchor from the session row instead would credit ten again.
    withPersonRow(new Date(T0));
    await recordPlaybackBeat(beat({ sessionId: 'tab-b' }), facts(), CFG, T0);
    expect(peopleUpsert().earned).toBe(0);
  });

  it('serialises concurrent tabs with FOR UPDATE, or both would read the same stale anchor', async () => {
    withPersonRow(new Date(T0 - 10_000));
    await recordPlaybackBeat(beat(), facts(), CFG, T0);
    const select = query.mock.calls.find(([sql]) => /SELECT last_credited_at/.test(sql as string));
    expect(select).toBeDefined();
    expect(select![0]).toMatch(/FOR UPDATE/);
  });

  /**
   * THE ASSERTION THAT MAKES THE TEST ABOVE MEAN ANYTHING.
   *
   * `sequelize` is mocked by SQL pattern here, so the two-tabs test proves the service hands
   * the anchor it was GIVEN to `creditSeconds` — it cannot prove that anchor came from the
   * person. Re-keying the query to `session_id` would reverse the entire dedup rule and leave
   * every other test in this file green, because the mock would answer just the same.
   *
   * So the key itself is asserted directly. Without this, the suite would be checking the
   * plumbing and not the rule.
   */
  it('reads the anchor keyed on the PERSON, not on the tab', async () => {
    withPersonRow(new Date(T0 - 10_000));
    await recordPlaybackBeat(beat(), facts(), CFG, T0);
    const sql = query.mock.calls.find(([s]) => /SELECT last_credited_at/.test(s as string))![0] as string;
    expect(sql).toMatch(/FROM broadcast_viewer_people/);
    expect(sql).toMatch(/enrollment_id\s*=\s*:enr/);
    // A session_id anywhere in the anchor query means the credit is being read per tab, which
    // is exactly the doubling this rule exists to prevent.
    expect(sql).not.toMatch(/session_id/);
  });

  it('a first-ever beat credits nothing - it establishes the baseline', async () => {
    withNoPersonRow();
    await recordPlaybackBeat(beat(), facts(), CFG, T0);
    expect(peopleUpsert().earned).toBe(0);
  });

  it('caps a long gap, so a laptop asleep for an hour does not bank an hour of watching', async () => {
    // The cap is two heartbeats: 30s here. A ten-minute gap must not credit ten minutes.
    withPersonRow(new Date(T0 - 600_000));
    await recordPlaybackBeat(beat(), facts(), CFG, T0);
    expect(peopleUpsert().earned).toBe(30);
  });
});

describe('only playing earns', () => {
  it('a PAUSED beat earns nothing and does not advance the anchor', async () => {
    withPersonRow(new Date(T0 - 10_000));
    await recordPlaybackBeat(beat({ state: 'paused' }), facts(), CFG, T0);
    const r = peopleUpsert();
    expect(r.earned).toBe(0);
    // `playing` false is what makes the SQL keep the existing last_credited_at. If it were
    // true, a paused viewer would reset their own baseline and lose earned seconds.
    expect(r.playing).toBe(false);
  });

  it('a BUFFERING beat earns nothing either - it is keeping the session alive, not watching', async () => {
    withPersonRow(new Date(T0 - 10_000));
    await recordPlaybackBeat(beat({ state: 'buffering' }), facts(), CFG, T0);
    expect(peopleUpsert().earned).toBe(0);
  });
});

describe('intent is sticky towards deliberate', () => {
  it('a stored deliberate survives a later auto beat', async () => {
    withPersonRow(new Date(T0 - 10_000), 'deliberate');
    await recordPlaybackBeat(beat({ intent: 'auto' }), facts(), CFG, T0);
    expect(peopleUpsert().intent).toBe('deliberate');
  });

  it('an auto viewer who deliberately clicks play becomes deliberate', async () => {
    withPersonRow(new Date(T0 - 10_000), 'auto');
    await recordPlaybackBeat(beat({ intent: 'deliberate' }), facts(), CFG, T0);
    expect(peopleUpsert().intent).toBe('deliberate');
  });
});

describe('telemetry never breaks the thing it measures', () => {
  it('returns false instead of throwing when the write fails', async () => {
    transaction.mockImplementation(async () => { throw new Error('connection terminated'); });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(recordPlaybackBeat(beat(), facts(), CFG, T0)).resolves.toBe(false);
    spy.mockRestore();
  });

  it('logs the failure with a stable error_class rather than swallowing it silently', async () => {
    transaction.mockImplementation(async () => { throw Object.assign(new Error('x'), { name: 'SequelizeConnectionError' }); });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await recordPlaybackBeat(beat(), facts(), CFG, T0);
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged).toMatchObject({ event: 'broadcast_beat_write_failed', error_class: 'SequelizeConnectionError' });
    spy.mockRestore();
  });

  it('a successful write reports true', async () => {
    withPersonRow(new Date(T0 - 10_000));
    await expect(recordPlaybackBeat(beat(), facts(), CFG, T0)).resolves.toBe(true);
  });
});

describe('the client cannot assert who it is', () => {
  it('identity, staff and test flags come from the SERVER facts, never from the beat', async () => {
    withPersonRow(new Date(T0 - 10_000));
    await recordPlaybackBeat(
      // A beat carrying nothing but a tab id and a state - there is no field on PlaybackBeat
      // through which a client could claim an enrollment, and this asserts what reaches SQL.
      beat(),
      facts({ enrollmentId: 'server-decided', isStaff: true, isTest: true, accessMode: 'paid' }),
      CFG, T0,
    );
    expect(peopleUpsert()).toMatchObject({
      enr: 'server-decided', staff: true, test: true, mode: 'paid',
    });
  });
});
