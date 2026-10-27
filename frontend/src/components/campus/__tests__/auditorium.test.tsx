/**
 * C26 (v6 D4): the Events Hall as an auditorium.
 *  - six tiered rows of seats under a raised stage; the room is deeper (0.95 x width, at most 1100);
 *  - 0 people present: empty seats, no heads; 3 present: 3 heads (never an invented crowd); a head opens that person's card;
 *  - no spot; the board is the next event with one-tap Sign up (Eventbrite) and All events, or says there is none.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { OpenHouseView } from '../../../services/onboardingApi';

let mockEvents: OpenHouseView[] = [];
jest.mock('../../../services/onboardingApi', () => ({ ...jest.requireActual('../../../services/onboardingApi'), fetchPublicEvents: () => Promise.resolve(mockEvents) }));

import Room3D from '../interior/room3d/Room3D';
import { roomDepth, TIER_SEATS, peoplePlaces } from '../interior/room3d/roomPlaces';
import { ROOMS } from '../interior/roomModel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); mockEvents = []; });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const you = { key: 'you', name: 'You', initials: 'YO', photo: null, you: true, tone: 'red' };
const person = (n: number) => ({ key: `p${n}`, name: `Person ${n}`, initials: `P${n}`, photo: null, tone: 'blue' });
async function mount(people = [] as ReturnType<typeof person>[], onPick?: (k: string) => void) {
  await act(async () => {
    root.render(<Room3D id="amphi" name="Events Hall" people={people} you={you} summary={null} spot={null} firstName="ADA" sectionRoute="/portal/events"
      onOpen={() => undefined} reduceMotion onPick={onPick ? (k) => onPick(k) : undefined} />);
  });
  await flush();
}

it('the model: tiers, 42 seats front row first, a deeper and darker room', () => {
  expect(ROOMS.amphi).toEqual({ layout: 'tiers', feature: 'stage', dark: true });
  expect(peoplePlaces('tiers', false)).toBe(TIER_SEATS);
  expect(TIER_SEATS).toHaveLength(42);
  expect(TIER_SEATS[0][1]).toBeLessThan(TIER_SEATS[41][1]); // front first
  expect(roomDepth(1000, true)).toBe(700); // 2026-10-26: shallower rooms, the back wall reads larger
  expect(roomDepth(2000, true)).toBe(820);
  expect(roomDepth(1000)).toBe(400);
  expect(roomDepth(2000)).toBe(560);
});

it('0 people present: six rows of empty seats, the stage, no heads, no spot', async () => {
  await mount();
  expect(container.querySelectorAll('[data-testid="cm-r3-tier"]')).toHaveLength(6);
  expect(container.querySelector('[data-testid="cm-r3-stage"]')).not.toBeNull();
  expect(container.querySelectorAll('.cm-r3-head')).toHaveLength(0);
  expect(container.querySelector('.cm-r3-spot')).toBeNull();
  expect(container.querySelector('.cm-r3.is-dark')).not.toBeNull();
});

it('3 present: 3 heads, and a head opens that person\'s card', async () => {
  const picked: string[] = [];
  await mount([person(1), person(2), person(3)], (k) => picked.push(k));
  const heads = container.querySelectorAll('.cm-r3-head');
  expect(heads).toHaveLength(3);
  act(() => { (heads[1].querySelector('button') as HTMLElement).click(); });
  expect(picked).toEqual(['p2']);
});

it('the board: the next event with Sign up and All events; none says so', async () => {
  mockEvents = [{ id: 'e1', title: 'Open House', description: null, starts_at: '2099-01-06T00:30:00Z', ends_at: null, timezone: 'America/Chicago',
    registration_url: 'https://www.eventbrite.com/e/1', meeting_link: null, image_url: null, signup_count: null, is_registered: false }];
  await mount();
  expect(container.querySelector('[data-testid="cm-board-title"]')!.textContent).toBe('Open House');
  expect(container.querySelector('[data-testid="cm-ev-signup-e1"]')!.getAttribute('href')).toBe('https://www.eventbrite.com/e/1');
  expect(container.querySelector('[data-testid="cm-board-section"]')!.textContent).toBe('All events');
  act(() => root.unmount()); root = createRoot(container); mockEvents = [];
  await mount();
  expect(container.querySelector('[data-testid="cm-board-title"]')!.textContent).toBe('No events on the calendar yet');
});
