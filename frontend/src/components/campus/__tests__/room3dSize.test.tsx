/**
 * C41 (room fix F1): the room is sized from its LAYOUT box, never from getBoundingClientRect. The room mounts while .cm-in-frame
 * plays its reveal (scale 1.5 -> 1), so the painted rect reads 1.5x the real width: a 985 px room measured 1478 and was built 1.5x
 * too wide (the screen ran past the right wall, text clipped, the window became a sliver). The room re-measures when the reveal ends.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import Room3D from '../interior/room3d/Room3D';
import { spotOf } from '../interior/roomSpots';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let layout = { w: 985, h: 560 };
const props = ['clientWidth', 'clientHeight'] as const;
const saved = props.map((k) => Object.getOwnPropertyDescriptor(HTMLElement.prototype, k));
const savedRect = HTMLElement.prototype.getBoundingClientRect;

beforeEach(() => {
  layout = { w: 985, h: 560 };
  // the room's layout box; every other element keeps jsdom's 0
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get(this: HTMLElement) { return this.classList.contains('cm-r3') ? layout.w : 0; } });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get(this: HTMLElement) { return this.classList.contains('cm-r3') ? layout.h : 0; } });
  // the painted box mid-reveal: 1.5x
  HTMLElement.prototype.getBoundingClientRect = function rect(this: HTMLElement) {
    const w = this.classList.contains('cm-r3') ? 1478 : 0, h = this.classList.contains('cm-r3') ? 840 : 0;
    return { width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
  container = document.createElement('div');
  container.className = 'cm-in-frame';
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  props.forEach((k, i) => { if (saved[i]) Object.defineProperty(HTMLElement.prototype, k, saved[i]!); else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k]; });
  HTMLElement.prototype.getBoundingClientRect = savedRect;
});

const you = { key: 'you', name: 'You', initials: 'AM', photo: null, you: true, tone: 'red' };
const mount = () => act(() => {
  root.render(<Room3D id="studio" name="Project Studio" people={[]} you={you} summary={null} spot={spotOf('studio')} firstName="ALI"
    sectionRoute="/portal/projects" onOpen={() => undefined} reduceMotion />);
});
const vars = () => { const s = (container.querySelector('[data-testid="cm-room3d"]') as HTMLElement).style; return [s.getPropertyValue('--fw'), s.getPropertyValue('--d'), s.getPropertyValue('--persp')]; };

it('sizes the room from its layout width (985), not the painted 1478 of the reveal: --fw 985px, --d 394px (0.4 x, 2026-10-26), --persp 936px', () => {
  mount();
  expect(vars()).toEqual(['985px', '394px', '936px']);
});

it('re-measures when the reveal animation ends', () => {
  mount();
  layout = { w: 1200, h: 640 };
  act(() => { container.dispatchEvent(new Event('animationend')); });
  expect(vars()).toEqual(['1200px', '480px', '1140px']);
});
