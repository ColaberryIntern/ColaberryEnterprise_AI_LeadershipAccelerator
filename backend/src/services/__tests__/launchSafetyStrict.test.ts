const getSetting = jest.fn();
jest.mock('../settingsService', () => ({ getSetting: (...a: unknown[]) => getSetting(...a), setSetting: jest.fn() }));
jest.mock('../../models', () => ({ AiAgent: { sequelize: { query: jest.fn() } } }));
jest.mock('../aiEventService', () => ({ logAiEvent: jest.fn() }));

import { isKillSwitchActive, isKillSwitchActiveStrict } from '../launchSafety';

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
