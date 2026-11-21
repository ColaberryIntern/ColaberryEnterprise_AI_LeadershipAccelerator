import { centralLabel, centralToIso, isoToCentral } from '../centralTime';

/** CH6.5 the "At a set time" conversion is Central whatever the browser zone, across both clock changes. */
describe('centralToIso / isoToCentral', () => {
  it.each([
    ['2026-11-30', '18:00', '2026-12-01T00:00:00.000Z'], // CST
    ['2026-07-07', '18:00', '2026-07-07T23:00:00.000Z'], // CDT
    ['2026-11-01', '03:00', '2026-11-01T09:00:00.000Z'], // after the autumn change (CST)
    ['2027-03-14', '04:00', '2027-03-14T09:00:00.000Z'], // after the spring change (CDT)
    ['2026-10-31', '23:30', '2026-11-01T04:30:00.000Z'], // the night before the autumn change (CDT)
  ])('%s %s Central -> %s, and back', (date, time, iso) => {
    expect(centralToIso(date, time)).toBe(iso);
    expect(isoToCentral(iso)).toEqual({ date, time });
  });

  it('bad input gives null, not a guess', () => {
    expect(centralToIso('', '18:00')).toBeNull();
    expect(centralToIso('2026-11-30', '6pm')).toBeNull();
  });

  it('the label reads in Central with the zone', () => {
    expect(centralLabel('2026-12-01T00:00:00.000Z')).toBe('Mon, Nov 30, 6:00 PM CST');
  });
});
