/**
 * The telemetry credit anchor is serialised, proved against REAL Postgres.
 *
 * Session CC-20261001-q7m4. Sixth of the seven locks this programme listed as "covered only
 * by asserting their SQL contains FOR UPDATE".
 *
 * ## The test it already had
 *
 * `broadcastTelemetryService.test.ts:89` is titled *"serialises concurrent tabs with FOR
 * UPDATE, or both would read the same stale anchor"*. Its body:
 *
 *     const select = query.mock.calls.find(([sql]) => /SELECT last_credited_at/.test(sql));
 *     expect(select![0]).toMatch(/FOR UPDATE/);
 *
 * One beat, a mocked `sequelize`, and a regex. There is no second tab and no database, so the
 * thing the title promises - that two tabs cannot both credit the same ten seconds - is the one
 * thing it cannot observe. That suite says so itself ("No database... the only honest thing to
 * assert without one"), which is fair; this is the suite with one.
 *
 * ## What the lock is for
 *
 * Watch time is CREDITED, not summed: the service adds the gap since this PERSON was last
 * credited. Two tabs beating in the same millisecond would otherwise both read the same stale
 * anchor and both credit the full gap, so every figure doubles for anyone with the player open
 * twice. `three tabs credit the same ten seconds as one` is the documented claim; here it is
 * measured.
 *
 * ## The controls
 *
 * - `POSITIVE CONTROL` replays the same two steps with the lock removed and asserts the double
 *   credit appears. If it stops appearing, nothing above it is evidence.
 * - Every test asserts `recordPlaybackBeat` returned **true**. It is best-effort by design and
 *   swallows its own failures, so without that assertion a broken statement would read as a
 *   quietly passing test.
 * - The two tables under test are created from the PRODUCTION DDL
 *   (`BROADCAST_TELEMETRY_STATEMENTS`), not from hand-written copies.
 *
 * ## Also measured here: the lock does nothing on a first beat
 *
 * `FOR UPDATE` on a row that does not exist yet locks nothing, so two first-ever beats from the
 * same person are NOT serialised. That is safe only because `creditSeconds(null, …)` returns 0 -
 * a fact in a different file, with nothing tying the two together. The last test pins both
 * halves so the coupling is visible to whoever changes either one.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 *   docker run --rm -d --name anchor-pg-test -p 55438:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=anchor_test \
 *     postgres:16-alpine
 *
 *   # from backend/, once pg_isready reports "accepting connections":
 *   DATABASE_URL=postgres://test:test@127.0.0.1:55438/anchor_test \
 *     npx jest -c jest.config.ts src/services/broadcast/__tests__/broadcastTelemetryAnchorRace
 *
 *   docker rm -f anchor-pg-test
 *
 * Port 55438: 55433-55437 belong to the agent-domain, stale-claim, lease, execution-run and
 * room-outbox suites, so all six can run at once. Throwaway credentials, one run, nothing
 * persists. With no `DATABASE_URL` the suite SKIPS AND SAYS SO.
 *
 * It must never be pointed at production: it creates its own tables and writes only rows it
 * made.
 */
import { QueryTypes } from 'sequelize';
import type { TelemetryConfig } from '../broadcastTelemetryPolicy';

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[broadcastTelemetryAnchorRace] SKIPPED: no DATABASE_URL. This suite needs a real Postgres; '
    + 'the docblock has the one-line docker run and the exact command. It is NOT evidence that '
    + 'two tabs credit the same seconds once unless it actually ran.',
  );
}

const CFG: TelemetryConfig = {
  appHeartbeatSeconds: 30,
  appActiveWindowSeconds: 90,
  playbackHeartbeatSeconds: 15,
  viewerExpirySeconds: 45,
  bufferingGraceSeconds: 20,
};

const T0 = Date.parse('2026-10-15T15:00:00.000Z');
const OCCURRENCE = '11111111-2222-4333-8444-555555555555';
// A UUID, not the 'enr-1' the mocked suite uses: `enrollment_id` is `UUID NOT NULL`, so the
// existing fixture is one a real column would reject. Another thing only a database notices.
const ENROLLMENT = '66666666-7777-4888-8999-aaaaaaaaaaaa';

describeIfDb('the telemetry credit anchor is serialised, so two tabs credit ten seconds once', () => {
  let sequelize: import('sequelize').Sequelize;
  let recordPlaybackBeat: typeof import('../broadcastTelemetryService').recordPlaybackBeat;
  let creditSeconds: typeof import('../broadcastTelemetryPolicy').creditSeconds;
  type Beat = import('../broadcastTelemetryService').PlaybackBeat;
  type Facts = import('../broadcastTelemetryService').ServerViewerFacts;

  const beat = (over: Partial<Beat> = {}): Beat => ({
    occurrenceId: OCCURRENCE, sessionId: 'tab-a', state: 'playing', intent: 'deliberate', ...over,
  });
  const facts = (over: Partial<Facts> = {}): Facts => ({
    enrollmentId: ENROLLMENT, isStaff: false, isTest: false, accessMode: 'free', ...over,
  });

  /**
   * Jest renders a Sequelize error as an EMPTY failure body here - no message, no SQL. Every
   * database call in this suite is therefore wrapped, so a broken statement says what broke
   * instead of printing five blank failures.
   */
  const explain = async <T>(what: string, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (err) {
      throw new Error(`${what} failed: ${(err as Error).message}`);
    }
  };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({ recordPlaybackBeat } = await import('../broadcastTelemetryService'));
    ({ creditSeconds } = await import('../broadcastTelemetryPolicy'));

    // The FK parent only needs its primary key for the references to resolve; nothing about
    // this lock depends on an occurrence's other columns, so it is a deliberate stub.
    await explain('creating the occurrence stub', () => sequelize.query(
      'CREATE TABLE IF NOT EXISTS broadcast_occurrences (id UUID PRIMARY KEY DEFAULT gen_random_uuid())',
    ));
    const { BROADCAST_TELEMETRY_STATEMENTS } = await import('../../../db/ensureBroadcastTelemetrySchema');
    for (const statement of BROADCAST_TELEMETRY_STATEMENTS) {
      await explain(`production DDL [${statement.slice(0, 60).replace(/\s+/g, ' ')}...]`,
        () => sequelize.query(statement));
    }
    await explain('seeding the occurrence', () => sequelize.query(
      'INSERT INTO broadcast_occurrences (id) VALUES ($1) ON CONFLICT DO NOTHING',
      { bind: [OCCURRENCE], type: QueryTypes.INSERT },
    ));
  });

  afterAll(async () => {
    await sequelize.query('DROP TABLE IF EXISTS broadcast_occurrence_metrics');
    await sequelize.query('DROP TABLE IF EXISTS broadcast_viewer_people');
    await sequelize.query('DROP TABLE IF EXISTS broadcast_viewer_sessions');
    await sequelize.query('DROP TABLE IF EXISTS broadcast_occurrences');
    await sequelize.close();
  });

  beforeEach(async () => {
    await explain('clearing the viewer tables', async () => {
      await sequelize.query('DELETE FROM broadcast_viewer_people', { type: QueryTypes.DELETE });
      await sequelize.query('DELETE FROM broadcast_viewer_sessions', { type: QueryTypes.DELETE });
    });
  });

  /**
   * A person already watching, last credited `secondsAgo` before T0.
   *
   * Each placeholder appears exactly once. Sequelize builds its bind array by scanning the
   * placeholders in order, so reusing `$3` three times sends three values for one parameter
   * and the driver rejects the statement.
   */
  async function seedPerson(secondsAgo: number): Promise<void> {
    const at = new Date(T0 - secondsAgo * 1000);
    try {
      await sequelize.query(
        `INSERT INTO broadcast_viewer_people
           (occurrence_id, enrollment_id, first_seen_at, last_beat_at, last_credited_at,
            playing_seconds, intent)
         VALUES ($1, $2, $3, $4, $5, 0, 'deliberate')`,
        { bind: [OCCURRENCE, ENROLLMENT, at, at, at], type: QueryTypes.INSERT },
      );
    } catch (err) {
      // Jest renders a Sequelize error as an empty failure body, which costs more time than
      // this line saves. Say what went wrong.
      throw new Error(`seedPerson failed: ${(err as Error).message}`);
    }
  }

  const person = async () => {
    const rows = await sequelize.query<{ playing_seconds: number; last_credited_at: Date | null }>(
      `SELECT playing_seconds, last_credited_at FROM broadcast_viewer_people
        WHERE occurrence_id = $1 AND enrollment_id = $2`,
      { bind: [OCCURRENCE, ENROLLMENT], type: QueryTypes.SELECT },
    );
    return rows[0];
  };

  it('TWO TABS beating in the same instant credit the ten seconds ONCE', async () => {
    await seedPerson(10);

    const results = await Promise.all([
      recordPlaybackBeat(beat({ sessionId: 'tab-a' }), facts(), CFG, T0),
      recordPlaybackBeat(beat({ sessionId: 'tab-b' }), facts(), CFG, T0),
    ]);

    // Asserted first: the call is best-effort and swallows its own failures, so a broken
    // statement would otherwise read as a passing test.
    expect(results).toEqual([true, true]);
    expect((await person()).playing_seconds).toBe(10);
  });

  it('THREE TABS credit the same ten seconds as one tab - the documented claim', async () => {
    await seedPerson(10);

    const results = await Promise.all(['tab-a', 'tab-b', 'tab-c'].map(
      (sessionId) => recordPlaybackBeat(beat({ sessionId }), facts(), CFG, T0),
    ));

    expect(results).toEqual([true, true, true]);
    expect((await person()).playing_seconds).toBe(10);

    // One row per person, three rows per tab: that is the shape the credit rule depends on.
    const sessions = await sequelize.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM broadcast_viewer_sessions WHERE occurrence_id = $1",
      { bind: [OCCURRENCE], type: QueryTypes.SELECT },
    );
    expect(Number(sessions[0].n)).toBe(3);
  });

  it('POSITIVE CONTROL: without the lock, ten seconds of broadcast is credited as twenty', async () => {
    // Mandatory. The same read-then-credit the service performs, with `FOR UPDATE` removed and
    // both reads taken before either write - the interleaving a real race produces, made
    // determinate. This is the doubling the lock exists to prevent.
    await seedPerson(10);

    const readAnchor = async (): Promise<number | null> => {
      const rows = await sequelize.query<{ last_credited_at: Date | null }>(
        `SELECT last_credited_at FROM broadcast_viewer_people
          WHERE occurrence_id = $1 AND enrollment_id = $2`,
        { bind: [OCCURRENCE, ENROLLMENT], type: QueryTypes.SELECT },
      );
      const value = rows[0]?.last_credited_at;
      return value ? new Date(value).getTime() : null;
    };
    const [anchorA, anchorB] = await Promise.all([readAnchor(), readAnchor()]);
    expect(anchorA).toBe(anchorB); // both unlocked tabs saw the same anchor

    const credit = async (anchor: number | null) => {
      await sequelize.query(
        `UPDATE broadcast_viewer_people
            SET playing_seconds = playing_seconds + $3, last_credited_at = $4
          WHERE occurrence_id = $1 AND enrollment_id = $2`,
        {
          bind: [OCCURRENCE, ENROLLMENT, Math.round(creditSeconds(anchor, T0, CFG)), new Date(T0)],
          type: QueryTypes.UPDATE,
        },
      );
    };
    await credit(anchorA);
    await credit(anchorB);

    expect((await person()).playing_seconds).toBe(20);
  });

  it('a PAUSED beat does not advance the anchor, so the viewer keeps what they earned', async () => {
    await seedPerson(10);

    expect(await recordPlaybackBeat(beat({ state: 'paused' }), facts(), CFG, T0)).toBe(true);

    const row = await person();
    expect(row.playing_seconds).toBe(0); // a paused tab earns nothing
    // And crucially the anchor is NOT moved to now: moving it would silently reset the
    // baseline and erase the seconds this viewer had already earned.
    expect(new Date(row.last_credited_at as Date).getTime()).toBe(T0 - 10_000);
  });

  it('on a FIRST beat the lock holds nothing - safe only because a null anchor credits 0', async () => {
    // `FOR UPDATE` on a row that does not exist locks no row, so these two are not serialised
    // at all. Both halves of why that is still correct are pinned here, because they live in
    // two different files and nothing else connects them.
    expect(creditSeconds(null, T0, CFG)).toBe(0);

    const results = await Promise.all([
      recordPlaybackBeat(beat({ sessionId: 'first-a' }), facts(), CFG, T0),
      recordPlaybackBeat(beat({ sessionId: 'first-b' }), facts(), CFG, T0),
    ]);

    expect(results).toEqual([true, true]);
    const row = await person();
    expect(row.playing_seconds).toBe(0);
    expect(new Date(row.last_credited_at as Date).getTime()).toBe(T0);
  });
});
