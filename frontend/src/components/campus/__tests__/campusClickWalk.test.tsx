/**
 * Campus round 3 §2.5 (C17), click anywhere on the map to walk there, on the real map and camera:
 *  - a click on open ground walks you to that exact spot over the paths (route line, footsteps, drop pin, "Walking to this spot…
 *    Skip"); on arrival nothing opens, "here" clears and the view is the whole campus again;
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
import { campusGraph, project } from '../walkGraph';
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
const near = (a: number[], x: number, y: number, tol = 4) => Math.hypot(a[0] - x, a[1] - y) <= tol;
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

describe('click on the grass: walk to that spot', () => {
  it('three grass points: each time you end within 4 units of the click, no card opens, and the view is the whole campus', () => {
    const onGround = jest.fn();
    mount({ onGround });
    for (const [x, y] of [[720, 520], [180, 470], [860, 250]]) {
      ground(x, y);
      expect(q('[data-testid="cm-travel-text"]')!.textContent).toBe('Walking to this spot…');
      expect(q('[data-testid="cm-drop-pin"]')!.getAttribute('transform')).toBe(`translate(${x} ${y})`);
      frame(); frame(200);
      expect(q('[data-testid="cm-route-line"]')!.getAttribute('d')).toMatch(new RegExp(`L${x} ${y}$`));
      expect(container.querySelectorAll('.cm-steps .cm-step').length).toBeGreaterThan(0);
      runAll();
      expect(near(avatar(), x, y)).toBe(true);
      expect(q('[data-testid="cm-card"]')).toBeNull();
      expect(q('[data-testid="cm-drop-pin"]')).toBeNull();
      expect(q('[data-testid="cm-travel-text"]')).toBeNull();
      expectBase();
    }
    expect(onGround).toHaveBeenCalledTimes(3);
  });

  it('the route goes onto the paths first: from the gate, up the spine', () => {
    mount();
    ground(260, 300);
    frame();
    const d = q('[data-testid="cm-route-line"]')!.getAttribute('d')!;
    expect(d.startsWith('M500 640')).toBe(true);
    expect(d).toContain('L500 400'); // the hub
  });

  it('a click outside the drawn campus is clamped to its edge (the prototype bounds)', () => {
    mount();
    ground(2, 2000);
    expect(q('[data-testid="cm-drop-pin"]')!.getAttribute('transform')).toBe('translate(40 690)');
  });

  it('a new click mid-walk re-routes from where you stand', () => {
    mount();
    ground(720, 520);
    frame(); frame(300);
    const mid = avatar();
    ground(180, 470);
    expect(q('[data-testid="cm-drop-pin"]')!.getAttribute('transform')).toBe('translate(180 470)');
    frame();
    expect(q('[data-testid="cm-route-line"]')!.getAttribute('d')!.startsWith(`M${mid[0]} ${mid[1]}`)).toBe(true);
    runAll();
    expect(near(avatar(), 180, 470)).toBe(true);
  });

  it('Skip stands you on the spot at once', () => {
    const onGround = jest.fn();
    mount({ onGround });
    ground(720, 520);
    frame();
    click('[data-testid="cm-travel-skip"]');
    // at once: no frame of the walk runs after Skip
    expect(avatar()).toEqual([720, 520]);
    expect(onGround).toHaveBeenCalledTimes(1);
    expect(q('[data-testid="cm-travel-text"]')).toBeNull();
    runAll();
    expect(onGround).toHaveBeenCalledTimes(1);
    expect(q('[data-testid="cm-card"]')).toBeNull();
  });

  it('with reduce motion you are there at once: no route line, no toast', () => {
    mount({ reduceMotion: true });
    ground(720, 520);
    expect(avatar()).toEqual([720, 520]);
    expect(q('[data-testid="cm-route-line"]')!.getAttribute('d')).toBe('');
    expect(q('[data-testid="cm-travel-text"]')).toBeNull();
  });

  it('from the grass, a building walk finds the paths first (not straight over the lawn)', () => {
    mount();
    ground(720, 520);
    runAll();
    click('[data-testid="cm-bld-library"]');
    frame();
    const pts = q('[data-testid="cm-route-line"]')!.getAttribute('d')!.slice(1).split('L').map((s) => s.split(' ').map(Number));
    const onto = project(campusGraph([...CAMPUS_BUILDINGS]), { x: 720, y: 520 }).q;
    expect(pts[1]).toEqual([onto.x, onto.y]);
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
