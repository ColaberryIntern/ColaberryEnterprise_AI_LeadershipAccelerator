/**
 * Clicks on the real map and camera. C17 let a click on open ground walk you there; Ali retired that on 2026-10-25 ("If I click on
 * something that is not a building or Community Board, don't try to navigate there"), so now:
 *  - a click on open ground never walks: no drop pin, no route, no toast;
 *  - a building, a staff desk or you are not ground; a drag's closing click never walks; a new click re-routes;
 *  - with a room (arrival panel) open, a ground click closes it and recenters instead of walking; during a tour it does nothing.
 */
import React, { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import CampusWorld from '../CampusWorld';
import type { CampusWorldProps } from '../CampusWorld';
import { CAMPUS_BUILDINGS } from '../campusMap';
import { baseView, viewBoxOf } from '../campusCamera';
import { tourFor } from '../tourSteps';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => undefined);

const W = 1440, H = 900;
type Proto = Record<string, unknown>;
const svgProto = SVGElement.prototype as unknown as Proto;
beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, 'clientWidth', { configurable: true, get() { return (this as Element).tagName === 'svg' ? W : 0; } });
  Object.defineProperty(SVGElement.prototype, 'clientHeight', { configurable: true, get() { return (this as Element).tagName === 'svg' ? H : 0; } });
  // jsdom has no SVG geometry: screen px map 1:1 to world units, which is all the click needs to be tested.
  svgProto.getScreenCTM = () => ({ inverse: () => ({}) });
  svgProto.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform(this: { x: number; y: number }) { return { x: this.x, y: this.y }; } });
});
afterAll(() => { ['clientWidth', 'clientHeight', 'getScreenCTM', 'createSVGPoint'].forEach((k) => { delete svgProto[k]; }); });

// A frame queue that really cancels (as a browser does), so a re-route or Skip leaves no stray frame of the old walk behind.
let frames: { id: number; cb: FrameRequestCallback }[] = [];
let nextId = 0;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  frames = [];
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { nextId += 1; frames.push({ id: nextId, cb }); return nextId; });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames = frames.filter((f) => f.id !== id); });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.restoreAllMocks(); });

let t = 0;
const frame = (ms = 16) => { const f = frames.shift(); if (f) { t += ms; act(() => f.cb(t)); } };
const runAll = () => { for (let i = 0; i < 3000 && frames.length; i++) frame(); };
const q = (s: string) => container.querySelector(s) as HTMLElement | null;
const map = () => container.querySelector('svg.cm-map') as SVGSVGElement;
const ground = (x: number, y: number) => act(() => { map().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y })); });
const click = (s: string) => act(() => { q(s)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const avatar = () => q('[data-testid="cm-avatar"]')!.getAttribute('transform')!.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!.slice(1).map(Number);
const expectBase = () => {
  const a = map().getAttribute('viewBox')!.split(' ').map(Number), b = viewBoxOf(baseView({ W, H }), { W, H }).split(' ').map(Number);
  a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThanOrEqual(1));
};

let setExtra: (e: Partial<CampusWorldProps>) => void = () => undefined;
function Harness({ initial }: { initial: Partial<CampusWorldProps> }) {
  const [extra, set] = useState<Partial<CampusWorldProps>>(initial);
  setExtra = set;
  return (
    <MemoryRouter>
      <CampusWorld buildings={[...CAMPUS_BUILDINGS]} audience="member" hasFullAccess workplaceNames={false} reduceMotion={false}
        onExit={() => undefined} onNavigate={() => undefined} {...extra} />
    </MemoryRouter>
  );
}
const mount = (initial: Partial<CampusWorldProps> = {}) => act(() => { root.render(<Harness initial={initial} />); });

describe('click on the grass: nothing walks (Ali, 2026-10-25: never show navigating to a non place)', () => {
  it('grass clicks start no walk: no drop pin, no route, no toast, you stay put, no card', () => {
    const onGround = jest.fn();
    mount({ onGround });
    const start = avatar();
    for (const [x, y] of [[720, 520], [180, 470], [860, 250], [2, 2000]]) {
      ground(x, y);
      expect(q('[data-testid="cm-drop-pin"]')).toBeNull();
      expect(q('[data-testid="cm-travel-text"]')).toBeNull();
      expect(q('[data-testid="cm-route-line"]')!.getAttribute('d')).toBe('');
      runAll();
      expect(avatar()).toEqual(start);
      expect(q('[data-testid="cm-card"]')).toBeNull();
    }
    expect(onGround).not.toHaveBeenCalled();
  });

  it('a building is still walked to (a place), and its card opens', () => {
    mount();
    ground(720, 520);
    click('[data-testid="cm-bld-library"]');
    runAll();
    expect(q('[data-testid="cm-card"]')?.getAttribute('data-building')).toBe('library');
  });
});

describe('what is not ground', () => {
  it('a building walks to the building (its card opens), never to a spot', () => {
    const onGround = jest.fn();
    mount({ onGround });
    click('[data-testid="cm-bld-library"]');
    expect(q('[data-testid="cm-travel-text"]')!.textContent).toBe('Walking to Library…');
    expect(q('[data-testid="cm-drop-pin"]')).toBeNull();
    runAll();
    expect(q('[data-testid="cm-card"]')?.getAttribute('data-building')).toBe('library');
    expect(onGround).not.toHaveBeenCalled();
  });

  it('the click area round a building and your own pin are not ground either', () => {
    mount();
    click('[data-testid="cm-hit-lecture"]');
    expect(q('[data-testid="cm-drop-pin"]')).toBeNull();
    runAll();
    act(() => { root.render(<Harness initial={{}} />); });
    click('[data-testid="cm-avatar"]');
    expect(q('[data-testid="cm-drop-pin"]')).toBeNull();
  });

  it('the click that ends a drag (past 6 px) never walks', () => {
    mount();
    act(() => {
      map().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 400, clientY: 400 }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 460, clientY: 400 }));
      window.dispatchEvent(new MouseEvent('pointerup', {}));
    });
    ground(460, 400);
    expect(q('[data-testid="cm-drop-pin"]')).toBeNull();
    expect(q('[data-testid="cm-travel-text"]')).toBeNull();
  });
});

describe('a ground click with something open', () => {
  it('a room open: the click closes it and the campus recenters; you do not walk', () => {
    mount();
    click('[data-testid="cm-bld-library"]');
    runAll();
    expect(q('[data-testid="cm-card"]')).not.toBeNull();
    const at = avatar();
    ground(720, 520);
    runAll();
    expect(q('[data-testid="cm-card"]')).toBeNull();
    expect(q('[data-testid="cm-drop-pin"]')).toBeNull();
    expect(avatar()).toEqual(at);
    expectBase();
  });

  it('during a tour a ground click does nothing: not while walking to a stop, not at the stop', () => {
    const onGround = jest.fn();
    const model = tourFor('member', [...CAMPUS_BUILDINGS], () => 'open', false)!;
    mount({ onGround, tour: { model, index: 0, onIndex: () => undefined, onEnd: () => setExtra({}), onFinish: () => undefined } });
    frame(); frame(200); // walking to the first stop: nothing is open yet
    ground(720, 520);
    expect(q('[data-testid="cm-drop-pin"]')).toBeNull();
    runAll();
    expect(q('[data-testid="cm-card"]')?.getAttribute('data-building')).toBe(model.stops[0].buildingId); // the tour's walk went on
    const at = avatar();
    ground(720, 520);
    runAll();
    expect(q('[data-testid="cm-drop-pin"]')).toBeNull();
    expect(avatar()).toEqual(at);
    expect(onGround).not.toHaveBeenCalled();
  });
});
