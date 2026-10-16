import { CAMPUS_SETTINGS_KEY, DEFAULT_CAMPUS_SETTINGS, readCampusSettings, writeCampusSettings } from '../campusSettings';

describe('campusSettings', () => {
  beforeEach(() => { window.localStorage.clear(); jest.restoreAllMocks(); });

  it('returns the defaults when nothing is stored', () => {
    expect(readCampusSettings()).toEqual(DEFAULT_CAMPUS_SETTINGS);
  });

  it('round-trips a saved choice', () => {
    expect(writeCampusSettings({ nav: 'classic', workplaceNames: true, reduceMotion: true })).toBe(true);
    expect(readCampusSettings()).toEqual({ nav: 'classic', workplaceNames: true, reduceMotion: true });
  });

  it('ignores junk and wrong types field by field', () => {
    window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'map', workplaceNames: 'yes', reduceMotion: true }));
    expect(readCampusSettings()).toEqual({ ...DEFAULT_CAMPUS_SETTINGS, reduceMotion: true });
    window.localStorage.setItem(CAMPUS_SETTINGS_KEY, '{not json');
    expect(readCampusSettings()).toEqual(DEFAULT_CAMPUS_SETTINGS);
  });

  it('survives storage that throws on read and on write', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(readCampusSettings()).toEqual(DEFAULT_CAMPUS_SETTINGS);
    expect(writeCampusSettings({ ...DEFAULT_CAMPUS_SETTINGS, nav: 'classic' })).toBe(false);
  });
});
