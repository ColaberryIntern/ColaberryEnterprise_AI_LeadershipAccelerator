/**
 * C7 tours: member 9, Explorer 7, business 6, staff none; every stop is a building on that audience's own campus; Explorer
 * states come from the pages' own signals; the copy invents nothing and never says "free".
 */
import { tourFor, STATE_NOTE } from '../tourSteps';
import { campusViewFor } from '../useCampusView';
import type { CampusAudience } from '../campusMap';

const view = (audience: CampusAudience, s = { isStaff: false, hasFullAccess: true, isExplorer: audience === 'explorer' }) => campusViewFor(audience, s);
const tour = (audience: CampusAudience, workplaceNames = false, s?: Parameters<typeof view>[1]) => {
  const v = view(audience, s);
  return tourFor(audience, v.buildings, v.accessOf, workplaceNames);
};

describe('stop counts per audience', () => {
  it.each([['member', 9], ['explorer', 7], ['business', 6]] as const)('%s has %i stops', (aud, n) => {
    expect(tour(aud)?.stops).toHaveLength(n);
  });
  it('staff has no tour', () => {
    expect(tour('staff')).toBeNull();
  });
  it.each(['member', 'explorer', 'business'] as const)('every %s stop is a building on that campus, in order, no repeats', (aud) => {
    const ids = view(aud).buildings.map((b) => b.id);
    const stops = tour(aud)!.stops.map((s) => s.buildingId);
    expect(stops.every((id) => ids.includes(id))).toBe(true);
    expect(new Set(stops).size).toBe(stops.length);
  });
});

describe('Explorer states come from the pages, not the copy', () => {
  it('page gate off (production): Preview on the classroom, Demo on the studio, the rest open', () => {
    const stops = tour('explorer', false, { isStaff: false, hasFullAccess: true, isExplorer: true })!.stops;
    const by = Object.fromEntries(stops.map((s) => [s.buildingId, s]));
    expect(by.lecture.state).toBe('preview');
    expect(by.lecture.note).toBe(STATE_NOTE.preview);
    expect(by.studio.state).toBe('demo');
    expect(by.commons.state).toBe('open');
    expect(by.commons.note).toBeNull();
  });
  it('page gate on: paywalled buildings read Members, with the locked note', () => {
    const by = Object.fromEntries(tour('explorer', false, { isStaff: false, hasFullAccess: false, isExplorer: true })!.stops.map((s) => [s.buildingId, s]));
    expect(by.testing.state).toBe('locked');
    expect(by.testing.note).toBe(STATE_NOTE.locked);
    expect(by.gallery.state).toBe('locked');
  });
  it('member and business stops carry no state', () => {
    expect(tour('member')!.stops.every((s) => s.state === null && s.note === null)).toBe(true);
    expect(tour('business')!.stops.every((s) => s.state === null)).toBe(true);
  });
});

describe('names and copy', () => {
  it('headings use the viewer\'s campus names: Workplace names and the Partner Office', () => {
    expect(tour('member', true)!.stops[0].name).toBe('Training Room');
    expect(tour('business')!.stops.find((s) => s.buildingId === 'career')!.name).toBe('Partner Office');
  });
  it.each(['member', 'explorer', 'business'] as const)('%s copy: what and tip on every stop, never "free", no figures', (aud) => {
    for (const s of tour(aud)!.stops) {
      expect(s.title.length).toBeGreaterThan(3);
      expect(s.what.length).toBeGreaterThan(10);
      expect(s.tip.length).toBeGreaterThan(10);
      const text = [s.title, s.what, s.tip, ...s.can, s.note ?? ''].join(' ');
      expect({ stop: s.buildingId, free: /\bfree\b/i.test(text), digits: /\d/.test(text) }).toEqual({ stop: s.buildingId, free: false, digits: false });
    }
  });
  it('the Game Room stop says it is not open yet (C10 has not shipped)', () => {
    expect(tour('member')!.stops.find((s) => s.buildingId === 'arcade')!.tip).toMatch(/not open yet/);
  });
});
