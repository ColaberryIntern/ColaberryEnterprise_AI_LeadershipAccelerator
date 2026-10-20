/**
 * C11b arrival panel: the building card drawn as the prototype's (hero with place and one line, Happening here from real data,
 * the main action with its route, rooms with their routes, Back to the Quad / Go somewhere else).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import BuildingCard from '../BuildingCard';
import { CAMPUS_BUILDINGS } from '../campusMap';
import { happeningAt, zoneLabelOf } from '../campusArrival';
import { buildingLine } from '../tourSteps';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const b = (id: string) => CAMPUS_BUILDINGS.find((x) => x.id === id)!;

describe('arrival data', () => {
  it('place names by zone; the gate card has none', () => {
    expect(zoneLabelOf(b('commons'))).toBe('South Avenue');
    expect(zoneLabelOf(b('library'))).toBe('North Campus');
    expect(zoneLabelOf(b('studio'))).toBe('Business District');
    expect(zoneLabelOf(b('gate'))).toBeUndefined();
  });

  it('Happening here says only what is true, and quiet when nothing is', () => {
    expect(happeningAt('commons', { onAir: true, routeIndex: 1, count: 3, presenceError: false }).map((h) => h.title))
      .toEqual(['On air now', 'On today’s plan', '3 people here now']);
    expect(happeningAt('commons', { onAir: false, routeIndex: 1, count: 3, presenceError: false })[0].detail).toBe('Stop 2 of your route');
    expect(happeningAt('library', { onAir: false, routeIndex: -1, count: 1, presenceError: false })[0].title).toBe('1 person here now');
    expect(happeningAt('library', { onAir: false, routeIndex: -1, count: 0, presenceError: false })[0].title).toBe('Quiet right now');
    expect(happeningAt('library', { onAir: false, routeIndex: -1, count: null, presenceError: true })[0].title).toBe('Who is here is unavailable');
  });

  it('the one-line description is the tour copy for this viewer', () => {
    expect(buildingLine('member', 'library')).toBe('Documents shared with everyone in the program.');
    expect(buildingLine('staff', 'commons')).toBe(buildingLine('member', 'commons'));
    expect(buildingLine('business', 'lecture')).toContain('your people');
  });
});

describe('the arrival panel', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('renders the hero, Happening here, the main action with its route, rooms with routes, and the footer', () => {
    const closed: string[] = [];
    act(() => {
      root.render(<MemoryRouter><BuildingCard building={b('commons')} access="open" workplaceNames={false} onClose={() => closed.push('back')} onNavigate={() => undefined}
        zoneLabel="South Avenue" line="Live rooms, the community feed and the people in your program."
        happening={[{ title: '3 people here now', detail: 'From live presence', tone: 'live' }]} onElsewhere={() => closed.push('elsewhere')} /></MemoryRouter>);
    });
    const q = (s: string) => container.querySelector(s);
    expect(q('[data-testid="cm-arrive-hero"]')!.textContent).toContain('You’ve arrived · South Avenue');
    expect(q('.cm-card-title')!.textContent).toBe('Community Lounge');
    expect(q('[data-testid="cm-arrive-line"]')!.textContent).toContain('Live rooms');
    expect(q('[data-testid="cm-arrive-now"]')!.textContent).toContain('3 people here now');
    expect(q('[data-testid="cm-arrive-cta"]')!.getAttribute('href')).toBe(b('commons').primary.route);
    expect(q('.cm-arrive-route')!.textContent).toBe(b('commons').primary.route);
    const room = q('.cm-room small');
    expect(room!.getAttribute('aria-hidden')).toBe('true'); // the route is a visual hint, not part of the link's name
    act(() => { (q('[data-testid="cm-arrive-back"]') as HTMLButtonElement).click(); });
    act(() => { (q('[data-testid="cm-arrive-elsewhere"]') as HTMLButtonElement).click(); });
    expect(closed).toEqual(['back', 'elsewhere']);
  });

  it('without the new props it still renders (older callers) and shows no Happening section or Go somewhere else', () => {
    act(() => { root.render(<MemoryRouter><BuildingCard building={b('library')} access="open" workplaceNames={false} onClose={() => undefined} onNavigate={() => undefined} /></MemoryRouter>); });
    expect(container.querySelector('[data-testid="cm-arrive-now"]')).toBeNull();
    expect(container.querySelector('[data-testid="cm-arrive-elsewhere"]')).toBeNull();
    expect(container.querySelector('[data-testid="cm-arrive-back"]')).not.toBeNull();
  });
});
