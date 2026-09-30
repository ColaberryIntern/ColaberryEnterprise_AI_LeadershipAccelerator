/**
 * The rails switch, now that on is the default.
 *
 * The risk has inverted. While rails were dark, a bug here showed an unfinished
 * feature to a few people. Now, a bug here decides whether every student's
 * classroom renders its rails at all — and the failure worth guarding is the
 * quiet one: a `localStorage` read that throws in a private window must not
 * take the rails away from somebody who has done nothing wrong.
 */
import { classroomRailsEnabled, RAILS_STORAGE_KEY } from '../classroomRailsFlag';

const setSearch = (search: string) => {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search },
    writable: true,
    configurable: true,
  });
};

beforeEach(() => {
  setSearch('');
  try { localStorage.clear(); } catch { /* ignore */ }
});

describe('on by default', () => {
  it('is on with no query and no stored preference', () => {
    expect(classroomRailsEnabled()).toBe(true);
  });

  it('is on when storage holds something that is not "0"', () => {
    localStorage.setItem(RAILS_STORAGE_KEY, '1');
    expect(classroomRailsEnabled()).toBe(true);
    localStorage.setItem(RAILS_STORAGE_KEY, 'yes');
    expect(classroomRailsEnabled()).toBe(true);
  });
});

describe('the off switch', () => {
  it('?rails=0 turns them off for the page load', () => {
    setSearch('?rails=0');
    expect(classroomRailsEnabled()).toBe(false);
  });

  it('accepts ?rails=false as well', () => {
    setSearch('?rails=false');
    expect(classroomRailsEnabled()).toBe(false);
  });

  it('a stored "0" keeps them off across loads', () => {
    localStorage.setItem(RAILS_STORAGE_KEY, '0');
    expect(classroomRailsEnabled()).toBe(false);
  });

  it('?rails=1 beats a stored "0" — the query always wins', () => {
    localStorage.setItem(RAILS_STORAGE_KEY, '0');
    setSearch('?rails=1');
    expect(classroomRailsEnabled()).toBe(true);
  });

  it('an unrelated query parameter changes nothing', () => {
    setSearch('?week=7');
    expect(classroomRailsEnabled()).toBe(true);
  });
});

describe('it fails ON, never off', () => {
  it('storage throwing does not take the rails away', () => {
    // A private window, or a browser set to block site data. The student has
    // done nothing wrong and must not silently lose half the page.
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('site data blocked');
    });
    expect(classroomRailsEnabled()).toBe(true);
    spy.mockRestore();
  });
});
