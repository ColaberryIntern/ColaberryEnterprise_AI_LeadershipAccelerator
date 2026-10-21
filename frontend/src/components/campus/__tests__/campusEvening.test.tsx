/**
 * C11b Colaberry Live on the map: evening, spotlights, rings and the path to the room only while a building is really on air
 * (never on the compact maps), and the concierge's "Colaberry Live . <day> night" kicker in Central time.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import CampusWorldMap from '../CampusWorldMap';
import { CAMPUS_BUILDINGS } from '../campusMap';
import { liveKicker } from '../home/CampusConcierge';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = (p: Partial<React.ComponentProps<typeof CampusWorldMap>> = {}) => act(() => {
  root.render(<CampusWorldMap buildings={[...CAMPUS_BUILDINGS]} accessOf={() => 'open'} workplaceNames={false} reduceMotion onArrive={() => undefined} {...p} />);
});
const svg = () => container.querySelector('svg.cm-map')!;

describe('the campus at Colaberry Live', () => {
  it('nothing on air: daytime, no beams, no path', () => {
    render({ onAir: new Set() });
    expect(svg().getAttribute('class')).not.toContain('is-evening');
    expect(container.querySelector('[data-testid="cm-beams"]')).toBeNull();
  });

  it('a building on air: evening, its spotlights and rings, and a path from you (at the gate) to it', () => {
    render({ onAir: new Set(['commons']) });
    expect(svg().getAttribute('class')).toContain('is-evening');
    expect(container.querySelectorAll('.cm-beam')).toHaveLength(2);
    expect(container.querySelectorAll('.cm-wave')).toHaveLength(3);
    const d = container.querySelector('[data-testid="cm-live-path"]')!.getAttribute('d')!;
    expect(d.startsWith('M500 640')).toBe(true);
    expect(d.endsWith('310 552')).toBe(true); // the Community Lounge door
  });

  it('once you are there, the path is gone (the spotlights stay)', () => {
    render({ onAir: new Set(['commons']), initialTarget: 'commons' });
    expect(container.querySelector('[data-testid="cm-live-path"]')).toBeNull();
    expect(container.querySelectorAll('.cm-beam')).toHaveLength(2);
  });

  it('the compact maps stay daytime pictures (their ON AIR badge is enough)', () => {
    render({ onAir: new Set(['commons']), compact: true });
    expect(svg().getAttribute('class')).not.toContain('is-evening');
    expect(container.querySelector('.cm-beam')).toBeNull();
  });

  it('reduce motion marks the map so the beams, rings and path stop', () => {
    render({ onAir: new Set(['commons']) });
    expect(svg().getAttribute('class')).toContain('is-reduced');
  });
});

describe('liveKicker', () => {
  it('names the Central weekday, and "night" from 5 PM Central', () => {
    expect(liveKicker(new Date('2026-10-22T23:30:00Z'))).toBe('Colaberry Live · Thursday night'); // 6:30 PM CDT
    expect(liveKicker(new Date('2026-10-22T16:00:00Z'))).toBe('Colaberry Live · Thursday'); // 11 AM CDT
    expect(liveKicker(new Date('2026-10-23T03:30:00Z'))).toBe('Colaberry Live · Thursday night'); // 10:30 PM CDT, still Thursday
  });
});
