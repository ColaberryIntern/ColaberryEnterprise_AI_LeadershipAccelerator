/**
 * C9 gear drawing: every item the server catalog defines has a drawing in the right slot; C46: there are no rides, and an old saved
 * ride draws nothing; nobody else's gear is drawn on the map; their chip dots carry the level.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import CampusWorldMap from '../CampusWorldMap';
import { GEAR_DRAWINGS, GEAR_NAMES, publicOnly } from '../campusGear';
import { CAMPUS_BUILDINGS } from '../campusMap';
import type { CampusPerson } from '../campusApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('the server catalog and the drawings agree', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'backend', 'src', 'services', 'campus', 'campusUnlocks.ts'), 'utf8');
  const found = Array.from(src.matchAll(/\{ id: '([a-z]+)', name: '([^']+)', slot: '([a-z]+)', threshold: \d+ \}/g));
  const items = found.map((m) => [m[1], m[3]]);
  const names = found.map((m) => [m[1], m[2]]);
  it('found the catalog', () => { expect(items.length).toBeGreaterThanOrEqual(6); });
  it.each(items)('%s draws in its %s slot', (id, slot) => { expect(GEAR_DRAWINGS[id]).toBe(slot); });
  it.each(names)('%s is called %s, as on the server', (id, name) => { expect(GEAR_NAMES[id]).toBe(name); });
  it('publicOnly drops an old saved ride, unknown ids and anything in the wrong slot', () => {
    expect(publicOnly({ head: 'cap', ride: 'cruiser', face: 'board', neck: 'chain' })).toEqual({ head: 'cap', neck: 'chain' });
    expect(publicOnly(undefined)).toEqual({});
  });
});

let container: HTMLDivElement;
let root: Root | undefined;
let frames: Array<(t: number) => void> = [];
beforeEach(() => {
  frames = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  window.requestAnimationFrame = ((cb: (t: number) => void) => { frames.push(cb); return frames.length; }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
});
afterEach(() => { const r = root; if (r) act(() => r.unmount()); root = undefined; container.remove(); });

const map = (props: Partial<React.ComponentProps<typeof CampusWorldMap>>) => (
  <CampusWorldMap buildings={[...CAMPUS_BUILDINGS]} accessOf={() => 'open'} workplaceNames={false} reduceMotion={false} onArrive={() => undefined} {...props} />
);
const render = (el: React.ReactElement) => act(() => { root = root ?? createRoot(container); root!.render(el); });
const runFrames = (t: number) => act(() => { const fs2 = frames; frames = []; fs2.forEach((f) => f(t)); });
const ride = () => container.querySelector('[data-testid="cm-ride"]');

describe('C46: walking only, no ride ever drawn', () => {
  it('your pin keeps its gear while walking, and an old saved ride draws nothing', () => {
    root = createRoot(container);
    const oldLook = { head: 'cap', ride: 'board' } as unknown as React.ComponentProps<typeof CampusWorldMap>['ownGear'];
    render(map({ ownGear: oldLook, walkRequest: { id: 'library', seq: 1 } }));
    expect(container.querySelector('[data-testid="cm-avatar"] [data-gear="cap"]')).not.toBeNull();
    expect(ride()).toBeNull();
    expect(container.querySelector('[data-ride]')).toBeNull();
  });

  it('the two jackets draw on your pin as a collar in their own colour', () => {
    root = createRoot(container);
    render(map({ ownGear: { body: 'architect' } }));
    expect(container.querySelector('[data-testid="cm-avatar"] [data-gear="architect"]')?.getAttribute('class')).toBe('cm-gear-architect');
    render(map({ ownGear: { body: 'jacket' } }));
    expect(container.querySelector('[data-testid="cm-avatar"] [data-gear="jacket"]')?.getAttribute('class')).toBe('cm-gear-jacket');
  });
});

describe('other people on the map (WP-3: level-toned dots on the chip, as the prototype; no tokens)', () => {
  const p = (o: Partial<CampusPerson>): CampusPerson => ({ enrollment_id: 'e1', display_name: 'Mia Lopez', avatar_url: null, ...o });
  const withPeople = (people: CampusPerson[]) => map({ counts: { library: people.length }, people: { library: { shown: people, more: 0 } } });

  it('never draw anyone else\'s ride or gear, even if it arrived', () => {
    root = createRoot(container);
    render(withPeople([p({ gear: { head: 'cap', ride: 'cruiser', face: 'shades' } })]));
    expect(container.querySelector('[data-ride]')).toBeNull();
    expect(container.querySelectorAll('[data-gear]')).toHaveLength(0); // no gear of your own either
  });

  it('carry the level: the chip dot takes the rung tone', () => {
    root = createRoot(container);
    render(withPeople([p({ rung_name: 'AI Enabled II' })]));
    expect(container.querySelector('[data-testid="cm-count-library"] .cm-count-dot')?.getAttribute('class')).toContain('rung-enabled-2');
  });

  it('no level known: the plain dot', () => {
    root = createRoot(container);
    render(withPeople([p({})]));
    expect(container.querySelector('[data-testid="cm-count-library"] .cm-count-dot')?.getAttribute('class')).toBe('cm-count-dot');
  });
});
