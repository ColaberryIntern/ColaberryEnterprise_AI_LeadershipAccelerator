/**
 * C39 (v11): Chow Hall's food links. foodRegion from the time zone; foodLead per meal window and with rain; the URL builder (encoding
 * "ice cream"); the order sheet: craving chips, Pizza -> the exact DoorDash and Uber Eats hrefs, every link a new tab with noopener,
 * Show all apps = 8, Esc closes; London shows Deliveroo / Just Eat / Uber Eats.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { CRAVINGS, foodRegion, foodLead, urlFor, DELIVERY_APPS, mealAt, appsFor } from '../chow/deliveryApps';
import { OrderSheet, ORDER_EVENT } from '../chow/OrderSheet';
import { CravingScreen, Chalkboard } from '../chow/ChowRoom';
import { CAMPUS_BUILDINGS } from '../campusMap';
import { chipsFor, FOOD } from '../home/CampusConcierge';
import { wayfinderSearch, type WfContext } from '../wayfinderIndex';
import { spotOf } from '../interior/roomSpots';
import { ROOMS } from '../interior/roomModel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const at = (h: number, m = 0) => new Date(2026, 9, 25, h, m);

it('the region from the time zone', () => {
  expect([foodRegion('America/Chicago'), foodRegion('America/Los_Angeles'), foodRegion('Europe/London'), foodRegion('Asia/Kolkata'), foodRegion('Asia/Calcutta'), foodRegion('Europe/Berlin'), foodRegion('America/Sao_Paulo')])
    .toEqual(['US', 'US', 'GB', 'IN', 'IN', 'ANY', 'ANY']);
  expect(appsFor('GB').map((a) => a.name)).toEqual(['Uber Eats', 'Deliveroo', 'Just Eat']);
});

it('the lead line per meal window, and rain adds the delivery line', () => {
  expect([at(9), at(10, 30), at(14, 29), at(14, 30), at(16, 59), at(17), at(21, 29), at(21, 30)].map(mealAt))
    .toEqual(['breakfast', 'lunch', 'lunch', 'snack', 'snack', 'dinner', 'dinner', 'late']);
  expect(foodLead(at(12), 'clear')).toBe('Lunchtime: something good between lessons.');
  expect(foodLead(at(19), 'rain')).toBe('Dinner time: order in and keep building, a perfect day for delivery.');
  expect(foodLead(at(8), 'snow')).toContain('perfect day for delivery');
});

it('the URL builder encodes the craving; apps without search open their home page', () => {
  const dd = DELIVERY_APPS.find((a) => a.name === 'DoorDash')!;
  expect(urlFor(dd, 'ice cream')).toBe('https://www.doordash.com/search/store/ice%20cream/');
  expect(urlFor(DELIVERY_APPS.find((a) => a.name === 'Grubhub')!, 'pizza')).toBe('https://www.grubhub.com/');
});

it('C93: twenty distinct cravings including Indian, each searchable by the apps that search', () => {
  expect(CRAVINGS).toHaveLength(20);
  expect(new Set(CRAVINGS.map((c) => c.id)).size).toBe(20);
  expect(new Set(CRAVINGS.map((c) => c.label)).size).toBe(20);
  expect(CRAVINGS.map((c) => c.label)).toEqual(expect.arrayContaining(['Indian', 'Chinese', 'Thai', 'Greek']));
  const dd = DELIVERY_APPS.find((a) => a.name === 'DoorDash')!;
  expect(urlFor(dd, 'Indian')).toBe('https://www.doordash.com/search/store/indian/');
  expect(urlFor(DELIVERY_APPS.find((a) => a.name === 'Uber Eats')!, 'Greek')).toBe('https://www.ubereats.com/search?q=greek');
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const q = (s: string) => container.querySelector(s);

it('the sheet: Pizza gives the exact links, all open a new tab with noopener; Show all apps = 8; Esc closes', () => {
  const onClose = jest.fn();
  act(() => { root.render(<OrderSheet onClose={onClose} now={at(12)} tz="America/Chicago" />); });
  act(() => { (q('[data-testid="cm-crave-pizza"]') as HTMLButtonElement).click(); });
  expect(q('[data-testid="cm-app-doordash"]')!.getAttribute('href')).toBe('https://www.doordash.com/search/store/pizza/');
  expect(q('[data-testid="cm-app-uber-eats"]')!.getAttribute('href')).toBe('https://www.ubereats.com/search?q=pizza');
  const links = Array.from(container.querySelectorAll('[data-testid="cm-order-apps"] a'));
  expect(links.every((a) => a.getAttribute('target') === '_blank' && (a.getAttribute('rel') || '').includes('noopener'))).toBe(true);
  act(() => { (q('[data-testid="cm-order-all"]') as HTMLInputElement).click(); });
  expect(container.querySelectorAll('[data-testid="cm-order-apps"] a')).toHaveLength(8);
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  expect(onClose).toHaveBeenCalled();
  expect(container.textContent).toContain('Colaberry doesn’t take orders or payments.');
});

it('London shows Deliveroo, Just Eat and Uber Eats; the default craving follows the meal time', () => {
  act(() => { root.render(<OrderSheet onClose={() => undefined} now={at(8)} tz="Europe/London" />); });
  expect(Array.from(container.querySelectorAll('[data-testid="cm-order-apps"] b')).map((b) => b.textContent).sort()).toEqual(['Deliveroo', 'Just Eat', 'Uber Eats']);
  expect(q('[data-testid="cm-crave-coffee"]')!.getAttribute('aria-pressed')).toBe('true');
});

it('the room: the screen grid has twenty cravings (C93) and each tile opens the sheet on it; the chalkboard and Order food open it too', () => {
  const opened: unknown[] = [];
  const on = (e: Event) => opened.push((e as CustomEvent).detail);
  window.addEventListener(ORDER_EVENT, on);
  act(() => { root.render(<><CravingScreen now={at(12)} condition="rain" /><Chalkboard now={at(19)} condition={null} /></>); });
  expect(container.querySelectorAll('[data-testid^="cm-crave-tile-"]')).toHaveLength(20);
  act(() => { (q('[data-testid="cm-crave-tile-tacos"]') as HTMLButtonElement).click(); });
  act(() => { (q('[data-testid="cm-crave-order"]') as HTMLButtonElement).click(); });
  act(() => { (q('[data-testid="cm-chalkboard"]') as HTMLButtonElement).click(); });
  window.removeEventListener(ORDER_EVENT, on);
  expect(opened).toEqual(['tacos', null, 'pizza']); // a CustomEvent with no detail carries null
  expect(q('[data-testid="cm-crave-screen"]')!.textContent).toContain('perfect day for delivery');
  expect(q('[data-testid="cm-chalkboard"]')!.textContent).toContain('Dinner time');
});

it('the building: left of the gate in the gate zone, no rooms, a counter spot that opens the order sheet, a cafe-tables room', () => {
  const chow = CAMPUS_BUILDINGS.find((b) => b.id === 'chow')!;
  const gate = CAMPUS_BUILDINGS.find((b) => b.id === 'gate')!;
  expect([chow.name, chow.zone, chow.rooms.length, chow.pos.x < gate.pos.x]).toEqual(['Chow Hall', 'gate', 0, true]);
  expect(spotOf('chow')).toMatchObject({ kind: 'counter', opens: 'order' });
  expect(ROOMS.chow).toMatchObject({ layout: 'tables' });
});

it('"Grab food" is a side-panel chip for every audience while Chow Hall is on the map; Where-to offers a Food group', () => {
  for (const a of ['member', 'explorer', 'business'] as const) expect(chipsFor(a, false, [...CAMPUS_BUILDINGS]).some(([, id]) => id === FOOD)).toBe(true);
  expect(chipsFor('member', true, [...CAMPUS_BUILDINGS]).some(([, id]) => id === FOOD)).toBe(true);
  expect(chipsFor('member', false, CAMPUS_BUILDINGS.filter((b) => b.id !== 'chow')).some(([, id]) => id === FOOD)).toBe(false);
  const ctx: WfContext = { audience: 'member', workplace: false, buildings: [...CAMPUS_BUILDINGS], accessOf: () => 'open', presence: null, desks: [], urgent: null, suggested: [] };
  for (const word of ['pizza', 'hungry', 'doordash', 'lunch']) {
    const hit = wayfinderSearch(word, ctx).find((it) => it.kind === 'food');
    expect([word, hit?.group, hit?.buildingId]).toEqual([word, 'Food', 'chow']);
  }
  expect(wayfinderSearch('pizza', { ...ctx, buildings: CAMPUS_BUILDINGS.filter((b) => b.id !== 'chow') }).some((it) => it.kind === 'food')).toBe(false);
});

it('Esc closes the sheet even when the map below stops Escape on its own subtree (e2e C39), and the sheet takes focus', () => {
  const onClose = jest.fn();
  const mapClosed = jest.fn();
  act(() => { root.render(<><div onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); mapClosed(); } }}><button type="button" data-testid="spot">spot</button></div><OrderSheet onClose={onClose} now={at(12)} tz="America/Chicago" /></>); });
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Close');
  act(() => { q('[data-testid="spot"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(mapClosed).not.toHaveBeenCalled(); // the sheet consumes it, so the room's card stays open
});
