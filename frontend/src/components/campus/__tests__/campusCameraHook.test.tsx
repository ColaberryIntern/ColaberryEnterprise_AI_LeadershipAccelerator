/**
 * C11b camera on the real map (useCampusCamera through CampusWorldMap): the first frame is the whole campus, a drag pans and
 * swallows the click that ends it, the zoom buttons and arrow keys move the view, reduce motion jumps, and the compact map never
 * gets a camera. jsdom has no layout, so the svg is given a size here.
 */
import React, { useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import CampusWorldMap from '../CampusWorldMap';
import CampusZoomControls from '../CampusZoomControls';
import { CAMPUS_BUILDINGS } from '../campusMap';
import type { CameraApi } from '../useCampusCamera';
import { baseView, viewBoxOf } from '../campusCamera';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const W = 1440, H = 900;
let frames: FrameRequestCallback[] = [];
beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, 'clientWidth', { configurable: true, get() { return (this as Element).tagName === 'svg' ? W : 0; } });
  Object.defineProperty(SVGElement.prototype, 'clientHeight', { configurable: true, get() { return (this as Element).tagName === 'svg' ? H : 0; } });
});
afterAll(() => {
  delete (SVGElement.prototype as unknown as Record<string, unknown>).clientWidth;
  delete (SVGElement.prototype as unknown as Record<string, unknown>).clientHeight;
});

let container: HTMLDivElement;
let root: Root;
let rafSpy: jest.SpyInstance;
beforeEach(() => {
  frames = [];
  rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); return frames.length; });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.restoreAllMocks(); });

const runFrames = (n = 400) => { for (let i = 0; i < n && frames.length; i++) { const f = frames.shift()!; act(() => f(i * 16)); } };
const vb = () => container.querySelector('svg.cm-map')!.getAttribute('viewBox')!;
const parse = (s: string) => s.split(' ').map(Number);

function Harness({ reduceMotion = false, compact = false, onArrive = () => undefined }: { reduceMotion?: boolean; compact?: boolean; onArrive?: (id: string) => void }) {
  const api = useRef<CameraApi | null>(null);
  return (
    <>
      <CampusWorldMap buildings={[...CAMPUS_BUILDINGS]} accessOf={() => 'open'} workplaceNames={false} reduceMotion={reduceMotion} compact={compact}
        onArrive={onArrive} camera={{ apiRef: api }} />
      <CampusZoomControls apiRef={api} />
    </>
  );
}
const mount = (p: React.ComponentProps<typeof Harness> = {}) => act(() => { root.render(<Harness {...p} />); });

describe('the campus camera', () => {
  it('starts on the whole campus, matched to the screen aspect', () => {
    mount();
    expect(vb()).toBe(viewBoxOf(baseView({ W, H }), { W, H }));
  });

  it('a drag pans the view and the click that ends it does not pick a building', () => {
    const arrived: string[] = [];
    mount({ onArrive: (id) => arrived.push(id) });
    const before = parse(vb());
    const bld = container.querySelector('[data-testid="cm-bld-library"]')!;
    act(() => {
      bld.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100 }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 130 }));
      window.dispatchEvent(new MouseEvent('pointerup', {}));
      bld.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const after = parse(vb());
    expect(after[0]).toBeLessThan(before[0]); // the world moved right: the view's left edge moved left
    expect(arrived).toEqual([]);
  });

  it('a tiny pointer wobble (under 6 px) is still a click', () => {
    const arrived: string[] = [];
    mount({ reduceMotion: true, onArrive: (id) => arrived.push(id) });
    const bld = container.querySelector('[data-testid="cm-bld-library"]')!;
    act(() => {
      bld.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100 }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 103, clientY: 102 }));
      window.dispatchEvent(new MouseEvent('pointerup', {}));
      bld.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(arrived).toEqual(['library']);
  });

  it('zoom in narrows the view, zoom out widens it, and Whole campus returns to the base view', () => {
    mount();
    const w0 = parse(vb())[2];
    act(() => { (container.querySelector('[data-testid="cm-zoom-in"]') as HTMLButtonElement).click(); });
    runFrames();
    expect(parse(vb())[2]).toBeLessThan(w0);
    act(() => { (container.querySelector('[data-testid="cm-zoom-out"]') as HTMLButtonElement).click(); });
    act(() => { (container.querySelector('[data-testid="cm-zoom-out"]') as HTMLButtonElement).click(); });
    runFrames();
    expect(parse(vb())[2]).toBeGreaterThan(w0);
    act(() => { (container.querySelector('[data-testid="cm-zoom-reset"]') as HTMLButtonElement).click(); });
    runFrames();
    expect(parse(vb())[2]).toBeCloseTo(w0, 0);
  });

  it('arrow keys pan the view (the keyboard alternative to dragging)', () => {
    mount();
    const x0 = parse(vb())[0];
    act(() => { container.querySelector('svg.cm-map')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    runFrames();
    expect(parse(vb())[0]).toBeGreaterThan(x0);
  });

  it('reduce motion: a zoom lands in one frame', () => {
    mount({ reduceMotion: true });
    const w0 = parse(vb())[2];
    act(() => { (container.querySelector('[data-testid="cm-zoom-in"]') as HTMLButtonElement).click(); });
    runFrames(1);
    expect(parse(vb())[2]).toBeCloseTo(w0 * 0.8, 0);
  });

  it('arriving frames the building (closer than the whole campus)', () => {
    mount({ reduceMotion: true });
    const w0 = parse(vb())[2];
    act(() => { container.querySelector('[data-testid="cm-bld-library"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    runFrames(2);
    expect(parse(vb())[2]).toBeLessThan(w0);
  });

  it('the compact map has no camera: its viewBox stays the whole world', () => {
    mount({ compact: true });
    expect(vb()).toBe('0 0 1000 700');
    expect(rafSpy).not.toHaveBeenCalled();
  });
});
