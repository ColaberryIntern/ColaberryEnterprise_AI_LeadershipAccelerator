/**
 * WP-1, owner rule: the map recenters itself every time you come back to the campus. For each return event the map is first
 * dragged 300 px and zoomed in twice, then the event fires, and the viewBox must settle on the whole-campus view (within 1 world
 * unit). Also: a resize re-frames the open building instead; a drag during a walk does not break the follow camera; the entry
 * starts on the gate close-up and flies out to the whole campus. jsdom has no layout, so the svg is given a size here.
 */
import React, { useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import CampusWorld from '../CampusWorld';
import type { CampusWorldProps } from '../CampusWorld';
import { CAMPUS_BUILDINGS } from '../campusMap';
import type { CameraApi } from '../useCampusCamera';
import { baseView, viewBoxOf } from '../campusCamera';
import { GATE_CLOSE_UP } from '../home/useHomeMap';
import { tourFor } from '../tourSteps';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => undefined);

let W = 1440, H = 900;
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
beforeEach(() => {
  W = 1440; H = 900; frames = [];
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); return frames.length; });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.restoreAllMocks(); });

let t = 0;
const runFrames = (n = 600) => { for (let i = 0; i < n && frames.length; i++) { const f = frames.shift()!; t += 16; act(() => f(t)); } };
const svg = () => container.querySelector('svg.cm-map')!;
const vb = () => svg().getAttribute('viewBox')!.split(' ').map(Number);
const base = () => viewBoxOf(baseView({ W, H }), { W, H }).split(' ').map(Number);
const expectBase = () => { const a = vb(), b = base(); a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThanOrEqual(1)); };
const click = (sel: string) => act(() => { container.querySelector(sel)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

/** Drag the map 300 px and zoom in twice, so the view is far from the whole campus. */
function disturb(): void {
  act(() => {
    svg().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 400, clientY: 400 }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 700, clientY: 400 }));
    window.dispatchEvent(new MouseEvent('pointerup', {}));
  });
  click('[data-testid="cm-zoom-in"]');
  click('[data-testid="cm-zoom-in"]');
  runFrames();
  const a = vb(), b = base();
  expect(Math.abs(a[2] - b[2])).toBeGreaterThan(50);
}

type Extra = Partial<CampusWorldProps>;
let cam: React.MutableRefObject<CameraApi | null>;
let setExtra: (e: Extra) => void = () => undefined;
function Harness({ initial }: { initial: Extra }) {
  cam = useRef<CameraApi | null>(null);
  const [extra, set] = useState<Extra>(initial);
  setExtra = set;
  return (
    <MemoryRouter>
      <CampusWorld buildings={[...CAMPUS_BUILDINGS]} audience="member" hasFullAccess workplaceNames={false} reduceMotion={false}
        onExit={() => undefined} onNavigate={() => undefined} cameraRef={cam} {...extra} />
    </MemoryRouter>
  );
}
const mount = (initial: Extra = {}) => act(() => { root.render(<Harness initial={initial} />); });
const arriveAt = (id: string) => { click(`[data-testid="cm-bld-${id}"]`); runFrames(); expect(container.querySelector('[data-testid="cm-card"]')).not.toBeNull(); };

describe('every return to the campus recenters (R1-R11)', () => {
  it('R1: closing the building card (Back to the Quad)', () => {
    mount(); arriveAt('library'); disturb();
    click('[data-testid="cm-arrive-back"]'); runFrames();
    expectBase();
  });

  it('R1: closing the building card (the x)', () => {
    mount(); arriveAt('library'); disturb();
    click('[data-testid="cm-card"] .cm-card-x'); runFrames();
    expectBase();
  });

  it('R2: Step outside inside the room', () => {
    mount(); arriveAt('library'); disturb();
    click('[data-testid="cm-inside-out"]'); runFrames();
    expectBase();
  });

  it('R3: Esc with a card open', () => {
    mount(); arriveAt('library'); disturb();
    act(() => { container.querySelector('[data-testid="cm-card"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    runFrames();
    expect(container.querySelector('[data-testid="cm-card"]')).toBeNull();
    expectBase();
  });

  it('R4: the tour ending (End tour in the stop\'s arrival panel)', () => {
    const model = tourFor('member', [...CAMPUS_BUILDINGS], () => 'open', false)!;
    mount({ tour: { model, index: 1, onIndex: () => undefined, onEnd: () => setExtra({}), onFinish: () => undefined } });
    runFrames();
    expect(container.querySelector('[data-testid="cm-card"] [data-testid="cm-tour"]')).not.toBeNull(); // the tour lives in the panel (WP-2)
    disturb();
    click('[data-testid="cm-tour-stop"]');
    runFrames();
    expect(container.querySelector('[data-testid="cm-card"]')).toBeNull();
    expectBase();
  });

  it('R5: a resize with no card re-bases, whatever pan or zoom came before', () => {
    mount(); disturb();
    W = 1280; H = 800;
    act(() => { window.dispatchEvent(new Event('resize')); });
    expectBase();
  });

  it('R5: a resize with a card open keeps that building framed (closer than the whole campus)', () => {
    mount(); arriveAt('library'); disturb();
    W = 1280; H = 800;
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(vb()[2]).toBeLessThan(base()[2]);
  });

  it('R7 / R10: a "back to the campus" request closes the card and recenters', () => {
    mount({ recenter: 0 }); arriveAt('library'); disturb();
    act(() => setExtra({ recenter: 1 }));
    runFrames();
    expect(container.querySelector('[data-testid="cm-card"]')).toBeNull();
    expectBase();
  });

  it('R10: a person card closing', () => {
    const person = { enrollment_id: 'e1', display_name: 'Sam Lee', avatar_url: null, rung_name: null, can_message: true, gear: {} };
    mount({ personCard: { person: person as never, buildingId: 'commons' }, onClosePerson: () => setExtra({ personCard: null }) });
    runFrames(); disturb();
    act(() => setExtra({ personCard: null }));
    runFrames();
    expectBase();
  });

  it('R11: the tab becoming visible again, with no card open', () => {
    mount(); disturb();
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    runFrames();
    expectBase();
  });
});

describe('walks keep their camera', () => {
  it('a drag while the avatar walks does not pan the view away from it', () => {
    mount();
    click('[data-testid="cm-bld-observatory"]');
    runFrames(4);
    const before = vb();
    act(() => {
      svg().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 400, clientY: 400 }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 700, clientY: 400 }));
      window.dispatchEvent(new MouseEvent('pointerup', {}));
    });
    runFrames(1);
    const s = W / before[2];
    expect(Math.abs(vb()[0] - before[0])).toBeLessThan(300 / s / 2);
    runFrames();
    expect(container.querySelector('[data-testid="cm-card"]')).not.toBeNull(); // the walk still arrives
  });
});

describe('R9: the entry flies out of the gate', () => {
  it('starts on the gate close-up, then eases out to the whole campus', () => {
    mount({ startCam: GATE_CLOSE_UP });
    expect(svg().getAttribute('viewBox')).toBe(viewBoxOf(GATE_CLOSE_UP, { W, H }));
    act(() => { cam.current!.base(0.035); });
    runFrames(1);
    expect(vb()[2]).toBeGreaterThan(GATE_CLOSE_UP.w); // widening, not jumping
    expect(vb()[2]).toBeLessThan(base()[2]);
    runFrames(2000);
    expectBase();
  });
});
