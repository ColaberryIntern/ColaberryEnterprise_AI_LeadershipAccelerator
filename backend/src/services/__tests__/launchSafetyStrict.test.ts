const getSetting = jest.fn();
jest.mock('../settingsService', () => ({ getSetting: (...a: unknown[]) => getSetting(...a), setSetting: jest.fn() }));
jest.mock('../../models', () => ({ AiAgent: { sequelize: { query: jest.fn() } } }));
jest.mock('../aiEventService', () => ({ logAiEvent: jest.fn() }));

import { isKillSwitchActive, isKillSwitchActiveStrict, readSchedulerPause } from '../launchSafety';

/**
 * T504 — the kill switch has two readers, on purpose.
 *
 * The long-standing one fails OPEN: a database blip must not pause campaigns or
 * disable agents by accident. Governed execution's reader fails CLOSED: the
 * switch that decides whether a person may be contacted must never read as
 * "off" because a query failed. Same key, same truth, different failure mode.
 */

beforeEach(() => getSetting.mockReset());

describe('the two readers agree on every readable value', () => {
  it.each([
    [true, true],
    ['true', true],
    [false, false],
    ['false', false],
    [null, false],
    [undefined, false],
  ])('%p -> %p from both', async (stored, expected) => {
    getSetting.mockResolvedValue(stored);
    expect(await isKillSwitchActive()).toBe(expected);
    expect(await isKillSwitchActiveStrict()).toBe(expected);
  });

  it('both read the SAME setting key - one switch, not two', async () => {
    getSetting.mockResolvedValue(false);
    await isKillSwitchActive();
    await isKillSwitchActiveStrict();
    const keys = new Set(getSetting.mock.calls.map((c) => c[0]));
    expect([...keys]).toEqual(['system_kill_switch']);
  });
});

describe('they differ only when the switch cannot be read', () => {
  it('the strict reader THROWS where the existing one answers false', async () => {
    getSetting.mockRejectedValue(new Error('connection reset'));
    await expect(isKillSwitchActiveStrict()).rejects.toThrow('connection reset');
    // The control: the old reader's fail-open behaviour is unchanged, and callers still depend on it.
    await expect(isKillSwitchActive()).resolves.toBe(false);
  });
});

/**
 * AF12.5 — the scheduler pause, the third reader in this file, and the one that BLOCKS when it
 * cannot read. It used to sit inline at the send chokepoint inside a bare `catch {}` commented
 * "fail open ... other checks will catch it". They do not: the lead and campaign checks fail
 * closed on their OWN errors, so a readable lead plus a readable campaign sent the mail with
 * the pause never examined.
 */
describe('readSchedulerPause', () => {
  it.each([
    [true, true],
    ['true', true],
    [false, false],
    ['false', false],
    [null, false],
    [undefined, false],
  ])('stored %p -> blocked %p', async (stored, blocked) => {
    getSetting.mockResolvedValue(stored);
    expect((await readSchedulerPause()).blocked).toBe(blocked);
  });

  it('reads scheduler_paused, NOT the kill switch key', async () => {
    // Two global flags in one module is exactly how a reader ends up consulting the wrong one.
    getSetting.mockResolvedValue(false);
    await readSchedulerPause();
    expect(getSetting.mock.calls.map((c) => c[0])).toEqual(['scheduler_paused']);
  });

  it('BLOCKS with a distinct reason when the flag cannot be read', async () => {
    getSetting.mockRejectedValue(Object.assign(new Error('no route to host'), { code: 'ECONNREFUSED' }));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const verdict = await readSchedulerPause();
      expect(verdict).toEqual({ blocked: true, reason: 'scheduler_pause_unreadable' });
      // "we are paused" and "we cannot tell whether we are paused" are different operational
      // facts, and only the second one means somebody has to go and look at the database.
      const logged = spy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logged).toContain('scheduler_pause_unreadable');
      // A canonical bucket, not the bare 'Error' that CLAUDE.md rules out.
      expect(logged).toContain('UpstreamUnavailable');
    } finally {
      spy.mockRestore();
    }
  });

  it('does NOT block when the flag has simply never been set', async () => {
    // The outage guard. `scheduler_paused` is absent from settingsService DEFAULTS, so an
    // untouched flag is a SUCCESSFUL read of null. If failing closed ever starts treating that
    // as unknown, every outbound send in the system stops.
    getSetting.mockResolvedValue(null);
    expect(await readSchedulerPause()).toEqual({ blocked: false });
  });

  it('passes its caller context through to the log, for tracing a refusal', async () => {
    getSetting.mockRejectedValue(new Error('connection reset'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await readSchedulerPause({ channel: 'email', campaign_id: 'c-99' });
      const logged = spy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logged).toContain('c-99');
      expect(logged).toContain('email');
    } finally {
      spy.mockRestore();
    }
  });
});
