/**
 * C60 (Ali, 2026-10-26: "Open house should not be promoted for business accounts"): one rule every events source runs through. A
 * business account loses Open House events only; other events still show; every other account sees them all.
 */
import { eventsFor, isOpenHouse, promotable } from '../events/eventsModel';
import type { OpenHouseView } from '../../../services/onboardingApi';

const ev = (id: string, title: string): OpenHouseView => ({ id, title, starts_at: '2026-10-29T23:00:00Z', ends_at: null, is_registered: false } as unknown as OpenHouseView);
const OH = ev('oh', 'Colaberry Open House - Colaberry Live #1');
const TALK = ev('t', 'AI Internship Presentation Event');

it('recognises an Open House by its title', () => {
  expect(isOpenHouse(OH)).toBe(true);
  expect(isOpenHouse({ title: 'open house: Q&A' })).toBe(true);
  expect(isOpenHouse(TALK)).toBe(false);
});

it('business accounts lose the Open House and keep every other event', () => {
  expect(eventsFor('business', [OH, TALK])).toEqual([TALK]);
});

it.each(['member', 'explorer', 'staff', undefined])('%s sees every event', (a) => {
  expect(eventsFor(a, [OH, TALK])).toEqual([OH, TALK]);
});

it('a promoted strip or chip: hidden from business for an Open House, shown for anything else', () => {
  expect(promotable('business', OH)).toBeNull();
  expect(promotable('business', TALK)).toBe(TALK);
  expect(promotable('member', OH)).toBe(OH);
  expect(promotable('business', null)).toBeNull();
});
