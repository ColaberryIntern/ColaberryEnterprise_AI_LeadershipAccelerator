/**
 * C7 tours: member 10 (C77: from the Schedule), Explorer 8 (C53, C77: from the Schedule), business 6, staff none; every stop is a building on that audience's own campus; Explorer
 * states come from the pages' own signals; the copy invents nothing and never says "free".
 */
import { tourFor, STATE_NOTE, explorerFinishLine } from '../tourSteps';
import { campusViewFor } from '../useCampusView';
import type { CampusAudience } from '../campusMap';

const view = (audience: CampusAudience, s = { isStaff: false, hasFullAccess: true, isExplorer: audience === 'explorer' }) => campusViewFor(audience, s);
const tour = (audience: CampusAudience, workplaceNames = false, s?: Parameters<typeof view>[1]) => {
  const v = view(audience, s);
  return tourFor(audience, v.buildings, v.accessOf, workplaceNames);
};

describe('stop counts per audience', () => {
  it.each([['member', 10], ['explorer', 8], ['business', 6]] as const)('%s has %i stops', (aud, n) => {
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

describe('C53 (v13 T5) + C77: every tour starts at the Schedule', () => {
  it('Explorer stop 1 is the Schedule: what is coming up first, then Today (included, no card needed); never "free"', () => {
    const t = tour('explorer')!;
    expect(t.name).toBe('Explorer tour');
    expect(t.stops.map((s) => s.buildingId)).toEqual(['tower', 'commons', 'library', 'amphi', 'lecture', 'studio', 'testing', 'gallery']);
    expect(t.stops[0]).toMatchObject({ title: 'Start here: what is coming up', state: 'open' });
    expect(t.stops[0].what).toContain('what is coming up');
    expect(t.stops[0].what).toContain('no card needed');
    expect(JSON.stringify(t.stops[0])).not.toMatch(/\bfree\b/i);
  });
  it('C77: the member tour starts at the Schedule too, then follows the old order', () => {
    expect(tour('member')!.stops.map((s) => s.buildingId)).toEqual(['tower', 'lecture', 'library', 'studio', 'testing', 'observatory', 'commons', 'gallery', 'career', 'arcade']);
    expect(tour('member')!.stops[0].title).toBe('Start here: your week');
    expect(tour('member')!.name).toBe('What’s in your seat');
  });
  it('the finishing toast names the Explorer when the name is known, and reads without it', () => {
    expect(explorerFinishLine('Ali')).toBe('That’s the campus, Ali. Today is always one tap away: the red 📅 Today button at the top.');
    expect(explorerFinishLine('')).toBe('That’s the campus. Today is always one tap away: the red 📅 Today button at the top.');
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
    expect(tour('member', true)!.stops.find((s) => s.buildingId === 'lecture')!.name).toBe('Training Room');
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
  it('the Game Room stop (C10 shipped) names the games, the 15-minute cap and that points never change', () => {
    const stop = tour('member')!.stops.find((s) => s.buildingId === 'arcade')!;
    expect(stop.can.join(' ')).toMatch(/Byte Chase, Launch Lab or Bug Breaker/);
    expect(stop.tip).toMatch(/fifteen minutes a day/);
    expect(stop.tip).toMatch(/never change your learning points/);
  });
});
