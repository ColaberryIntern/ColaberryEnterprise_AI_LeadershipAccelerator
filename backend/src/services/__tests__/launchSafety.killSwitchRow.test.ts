/**
 * T602 (Growth Journey Phase 6, the hardening set) — the kill switch as a row.
 *
 * `ensureKillSwitchRow` seeds `system_kill_switch = false` once, through the
 * model, and never touches a present row - on OR off. A boot must not turn off
 * a switch somebody turned on, and must not fail because the seed did.
 */
const m = { findOrCreate: jest.fn(), getSetting: jest.fn(), setSetting: jest.fn() };

jest.mock('../../models/SystemSetting', () => ({ __esModule: true, default: { findOrCreate: (...a: unknown[]) => m.findOrCreate(...a), findOne: jest.fn(), create: jest.fn(), update: jest.fn() } }));
jest.mock('../../models/AiAgent', () => ({ __esModule: true, default: { findAll: jest.fn(), update: jest.fn() } }));
jest.mock('../aiEventService', () => ({ logAiEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../settingsService', () => ({ getSetting: (...a: unknown[]) => m.getSetting(...a), setSetting: (...a: unknown[]) => m.setSetting(...a) }));

import SystemSetting from '../../models/SystemSetting';
import { ensureKillSwitchRow, isKillSwitchActive, isKillSwitchActiveStrict } from '../launchSafety';

let warn: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

describe('ensureKillSwitchRow', () => {
  it('seeds the row through findOrCreate on the key, value false, and reports created', async () => {
    m.findOrCreate.mockResolvedValue([{ key: 'system_kill_switch', value: false }, true]);
    expect(await ensureKillSwitchRow()).toEqual({ created: true });
    expect(m.findOrCreate).toHaveBeenCalledTimes(1);
    expect(m.findOrCreate).toHaveBeenCalledWith({ where: { key: 'system_kill_switch' }, defaults: { value: false } });
  });

  it('a present row is reported as not created and is never written: no update, no create, no setSetting - whatever it holds', async () => {
    for (const value of [true, false, 'true']) {
      m.findOrCreate.mockResolvedValue([{ key: 'system_kill_switch', value }, false]);
      expect(await ensureKillSwitchRow()).toEqual({ created: false });
    }
    expect(m.findOrCreate).toHaveBeenCalledTimes(3);
    expect(SystemSetting.update).not.toHaveBeenCalled();
    expect(SystemSetting.create).not.toHaveBeenCalled();
    expect(m.setSetting).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('a failure is one structured warning and { created: false, error_class }, never a throw', async () => {
    m.findOrCreate.mockRejectedValue(Object.assign(new Error('relation "system_settings" does not exist'), { name: 'SequelizeDatabaseError' }));
    await expect(ensureKillSwitchRow()).resolves.toEqual({ created: false, error_class: 'SequelizeDatabaseError' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toEqual({ service: 'launch-safety', level: 'warn', outcome: 'failure', event: 'kill_switch.row_seed_failed', key: 'system_kill_switch', error_class: 'SequelizeDatabaseError' });
  });

  it('the readers are untouched by the seed: an absent row still reads off leniently and strictly, and a read error still splits them', async () => {
    m.getSetting.mockResolvedValue(null);
    expect(await isKillSwitchActive()).toBe(false);
    expect(await isKillSwitchActiveStrict()).toBe(false);
    m.getSetting.mockRejectedValue(new Error('connection reset'));
    expect(await isKillSwitchActive()).toBe(false);
    await expect(isKillSwitchActiveStrict()).rejects.toThrow('connection reset');
  });
});
