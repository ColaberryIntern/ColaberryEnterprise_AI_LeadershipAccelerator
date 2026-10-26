/**
 * C50 (v13 T2): "Your Today page" in the side panel. Explorers: a whole-card link, START HERE - YOUR HOME BASE, up to four facts from
 * real data (each left out when there is nothing real: next step, today's plan, the next event, Maya only while on duty), and Open
 * Today. Members and staff: a slim row. Both open /portal/today?stay=1. The concierge puts it first under the greeting.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

let mockEvents: unknown[] | null = null;
jest.mock('../events/EventSignup', () => ({ useCampusEvents: () => mockEvents }));
// eslint-disable-next-line import/first
import { TodayCard, todayFacts, TODAY_HREF } from '../home/TodayCard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const NOW = new Date('2026-10-26T15:00:00Z');
const STOPS = [{ title: 'Watch the intro', done: true }, { title: 'Deep Dive - Understanding Modern Software', done: false }, { title: 'Reflect', done: false }] as never;
const DESKS = [{ id: 'maya', on_duty: true }, { id: 'reese', on_duty: true }] as never;
const EVENTS = [{ id: 'e', title: 'AI Internship Presentation Event', starts_at: '2026-10-27T15:00:00Z', ends_at: null, is_registered: false }];

it('the four facts come from real data, and each is left out when there is nothing to show', () => {
  expect(todayFacts(STOPS, EVENTS as never, DESKS, NOW)).toEqual([
    { label: 'Next step', value: 'Deep Dive - Understanding Modern Software' },
    { label: 'Today’s plan', value: '1 of 3 done' },
    { label: 'Coming up', value: 'AI Internship Presentation Event' },
    { label: 'Help', value: 'Maya, admissions · replies in seconds' },
  ]);
  expect(todayFacts(null, null, [{ id: 'maya', on_duty: false }] as never, NOW)).toEqual([]);
  expect(todayFacts([] as never, [], [], NOW)).toEqual([]);
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const q = (s: string) => container.querySelector(s) as HTMLElement | null;

it('Explorers: the whole card opens Today, with the facts and Open Today', () => {
  mockEvents = EVENTS;
  act(() => { root.render(<MemoryRouter><TodayCard audience="explorer" stops={STOPS} desks={DESKS} now={NOW} /></MemoryRouter>); });
  const card = q('[data-testid="cm-today-card"]')!;
  expect(card.getAttribute('href')).toBe(TODAY_HREF);
  expect(card.textContent).toContain('START HERE');
  expect(card.textContent).toContain('Your Today page');
  expect(card.querySelectorAll('dl > div')).toHaveLength(4);
  expect(card.textContent).toContain('Open Today');
  expect(q('[data-testid="cm-today-row"]')).toBeNull();
});

it('an Explorer with no data still gets the card, without a facts list', () => {
  mockEvents = null;
  act(() => { root.render(<MemoryRouter><TodayCard audience="explorer" stops={null} desks={[]} now={NOW} /></MemoryRouter>); });
  expect(q('[data-testid="cm-today-card"] dl')).toBeNull();
});

it('members and staff get the slim row, with the plan count when there is one', () => {
  act(() => { root.render(<MemoryRouter><TodayCard audience="member" stops={STOPS} desks={DESKS} now={NOW} /></MemoryRouter>); });
  expect(q('[data-testid="cm-today-row"]')!.textContent).toContain('1 of 3 done');
  expect(q('[data-testid="cm-today-row"]')!.getAttribute('href')).toBe(TODAY_HREF);
  expect(q('[data-testid="cm-today-card"]')).toBeNull();
});

it('the concierge renders it right under the greeting and lead, before people on campus and Coming up', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'home', 'CampusConcierge.tsx'), 'utf8');
  const i = (s: string) => src.indexOf(s);
  expect(i('<TodayCard')).toBeGreaterThan(i('data-testid="cm-cc-lead"'));
  expect(i('<TodayCard')).toBeLessThan(i('<Pulse p={p} />'));
  expect(i('<TodayCard')).toBeLessThan(i('<OpenHouseCard'));
});
