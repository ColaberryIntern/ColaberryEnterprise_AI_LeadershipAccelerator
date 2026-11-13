const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: any[]) => mockQuery(...a) } }));
jest.spyOn(console, 'warn').mockImplementation(() => undefined);

import { presenterTally, readPresenterTally, type TallyState } from '../broadcastPresenterTally';
import { EDITORIAL_STATES } from '../broadcastStateMachine';

/**
 * D9 - what the person teaching is told about whether the room can hear them.
 *
 * THE ASSERTION THAT MATTERS IS `assumeLive`, AND IT IS NOT SYMMETRIC.
 *
 * Saying ON AIR when nothing is transmitting makes a presenter needlessly careful. Saying OFF
 * AIR when the room can hear them makes them say something they would not have said, to an
 * audience, into a recording that is published. Only the second is a harm, so every uncertain
 * answer has to land on the harmless side.
 *
 * It is swept over the machine's own state list rather than asserted case by case, because the
 * failure to guard against is a NEW editorial state defaulting into the harmful direction -
 * which is exactly how `cancelled` once came to tell viewers a called-off class was about to
 * start.
 */

const SID = '7aa7ce89-187d-4604-9b86-a3b2a69579ce';
const rows = (r: any[]) => { mockQuery.mockResolvedValue([r]); };

beforeEach(() => { jest.clearAllMocks(); rows([]); });

describe('the tally for every state the machine can hold', () => {
  /**
   * The expected answer per state, as a table rather than a loop over branches, so a state
   * whose treatment nobody decided fails the first assertion below instead of passing quietly.
   */
  const EXPECTED: Record<string, { state: TallyState; assumeLive: boolean }> = {
    scheduled: { state: 'off_air', assumeLive: false },
    backstage: { state: 'backstage', assumeLive: false },
    live: { state: 'on_air', assumeLive: true },
    reconnecting: { state: 'reconnecting', assumeLive: true },
    ended: { state: 'off_air', assumeLive: false },
    processing: { state: 'off_air', assumeLive: false },
    replay_ready: { state: 'off_air', assumeLive: false },
    cancelled: { state: 'called_off', assumeLive: false },
  };

  it('covers every editorial state, read from the machine rather than restated here', () => {
    // So adding a ninth state to the machine fails this file rather than silently falling
    // through to whatever the last branch happens to be.
    expect([...EDITORIAL_STATES].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.entries(EXPECTED))('%s resolves deliberately', (state, want) => {
    const t = presenterTally(state);
    expect(t.state).toBe(want.state);
    expect(t.assumeLive).toBe(want.assumeLive);
  });

  it('gives every state a label and a line, so none renders as an empty badge', () => {
    for (const state of EDITORIAL_STATES) {
      const t = presenterTally(state);
      expect(t.label.trim().length).toBeGreaterThan(0);
      expect(t.detail.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('assumeLive is false ONLY where something says nothing is transmitting', () => {
  it('is true for both on-air states', () => {
    expect(presenterTally('live').assumeLive).toBe(true);
    expect(presenterTally('reconnecting').assumeLive).toBe(true);
  });

  /**
   * THE LOAD-BEARING CASE. An unrecognized state must not fall through to off air.
   *
   * A ninth editorial state added without touching this module would otherwise tell a
   * presenter the room cannot hear them, on no evidence at all.
   */
  it('is TRUE for a state this module has never been taught', () => {
    const t = presenterTally('some_future_state');
    expect(t.state).toBe('unknown');
    expect(t.assumeLive).toBe(true);
    expect(t.label).not.toMatch(/off air/i);
  });

  it('is true when the check itself failed', async () => {
    mockQuery.mockRejectedValue(new Error('connection terminated'));
    const t = await readPresenterTally(SID);
    expect(t.state).toBe('unknown');
    expect(t.assumeLive).toBe(true);
    // The specific wrong answer: a database blip must never read as silence.
    expect(t.label).not.toMatch(/off air/i);
    expect(t.detail).toMatch(/assume you are on air/i);
  });

  it('NEVER says the words "off air" while assumeLive is true', () => {
    // Belt and braces over the whole table: the flag and the words cannot disagree, because
    // the presenter reads the words and only the tests read the flag.
    const all = [...EDITORIAL_STATES, 'some_future_state', 'another'];
    for (const s of all) {
      const t = presenterTally(s);
      if (t.assumeLive) expect(t.label).not.toMatch(/off air/i);
    }
  });
});

describe('backstage tells the presenter the same truth the producer is told', () => {
  it('says viewers get nothing, and that the feed is still recorded', () => {
    // The provider records with `mode: 'automatic'`, so a rehearsal IS recorded. The producer's
    // banner says so and the presenter is the person most likely to be harmed by believing
    // otherwise, because they are the one talking.
    const t = presenterTally('backstage');
    expect(t.detail).toMatch(/viewers get nothing/i);
    expect(t.detail).toMatch(/still records/i);
    expect(t.detail).not.toMatch(/not recorded/i);
  });

  it('does not claim the room can hear them, because it cannot', () => {
    expect(presenterTally('backstage').assumeLive).toBe(false);
  });
});

describe('a class with no broadcast at all', () => {
  it('says live was never set up, rather than off air', async () => {
    // Different advice. "Off air" invites waiting to be put on air; this says nobody will.
    rows([]);
    const t = await readPresenterTally(SID);
    expect(t.state).toBe('not_set_up');
    expect(t.detail).toMatch(/never set up/i);
    expect(t.assumeLive).toBe(false);
  });
});

describe('reading the occurrence', () => {
  it('resolves the live occurrence through the source refs, the only link there is', async () => {
    rows([{ editorial_state: 'live' }]);
    const t = await readPresenterTally(SID);
    expect(t.state).toBe('on_air');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toMatch(/broadcast_source_refs/);
    expect(sql).toMatch(/source_type\s*=\s*'live_session'/);
  });

  it('CONTROL: a different stored state gives a different answer', async () => {
    // Without this, the assertions above could be a function that always says on air.
    rows([{ editorial_state: 'cancelled' }]);
    expect((await readPresenterTally(SID)).state).toBe('called_off');
  });
});
