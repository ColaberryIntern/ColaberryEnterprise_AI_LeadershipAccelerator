import { CAMPUS_SETTINGS_KEY, DEFAULT_CAMPUS_SETTINGS, effectiveReduceMotion, readCampusSettings, writeCampusSettings } from '../campusSettings';

describe('campusSettings', () => {
  beforeEach(() => { window.localStorage.clear(); jest.restoreAllMocks(); });

  it('returns the defaults when nothing is stored (motion follows the device)', () => {
    expect(readCampusSettings()).toEqual(DEFAULT_CAMPUS_SETTINGS);
    expect(DEFAULT_CAMPUS_SETTINGS.motion).toBe('device');
  });

  it('round-trips a saved choice and stores only the choices', () => {
    expect(writeCampusSettings({ nav: 'classic', workplaceNames: true, motion: 'off' })).toBe(true);
    expect(readCampusSettings()).toEqual({ nav: 'classic', workplaceNames: true, motion: 'off' });
    expect(JSON.parse(window.localStorage.getItem(CAMPUS_SETTINGS_KEY) as string)).toEqual({ nav: 'classic', workplaceNames: true, motion: 'off' });
  });

  it('migrates the pre-C11 boolean one way: true stays reduced, false follows the device', () => {
    window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, reduceMotion: true }));
    expect(readCampusSettings().motion).toBe('on');
    window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, reduceMotion: false }));
    expect(readCampusSettings().motion).toBe('device');
  });

  it('ignores junk and wrong types field by field', () => {
    window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'map', workplaceNames: 'yes', motion: 'sometimes' }));
    expect(readCampusSettings()).toEqual(DEFAULT_CAMPUS_SETTINGS);
    window.localStorage.setItem(CAMPUS_SETTINGS_KEY, '{not json');
    expect(readCampusSettings()).toEqual(DEFAULT_CAMPUS_SETTINGS);
  });

  it('survives storage that throws on read and on write', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(readCampusSettings()).toEqual(DEFAULT_CAMPUS_SETTINGS);
    expect(writeCampusSettings({ ...DEFAULT_CAMPUS_SETTINGS, nav: 'classic' })).toBe(false);
  });

  it('effective reduce motion: the choice wins, otherwise the device (all six cases)', () => {
    expect(effectiveReduceMotion('device', false)).toBe(false);
    expect(effectiveReduceMotion('device', true)).toBe(true);
    expect(effectiveReduceMotion('on', false)).toBe(true);
    expect(effectiveReduceMotion('on', true)).toBe(true);
    expect(effectiveReduceMotion('off', false)).toBe(false);
    expect(effectiveReduceMotion('off', true)).toBe(false);
  });
});
