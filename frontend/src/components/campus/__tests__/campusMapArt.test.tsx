/**
 * C11b prototype fidelity, the map art: every building is drawn in its prototype roof family on its ground line, the grounds
 * carry the prototype's landmarks (fountain, THE QUAD, the district and its sign, trees, the Main Gate), the avatar walks the
 * campus paths, and reduce motion marks the map so the water shimmer and walk bob stop.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import CampusWorldMap from '../CampusWorldMap';
import { CAMPUS_BUILDINGS } from '../campusMap';
import { doorOf } from '../walkPath';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = (props: Partial<React.ComponentProps<typeof CampusWorldMap>> = {}) => act(() => {
  root.render(<CampusWorldMap buildings={[...CAMPUS_BUILDINGS]} accessOf={() => 'open'} workplaceNames={false} reduceMotion onArrive={() => undefined} {...props} />);
});
const q = (sel: string) => container.querySelector(sel);

describe('the map is drawn as the prototype draws it', () => {
  it('every building stands on its ground line, in its own roof family', () => {
    render();
    for (const b of CAMPUS_BUILDINGS) {
      const g = q(`[data-testid="cm-bld-${b.id}"]`)!;
      expect(g).not.toBeNull();
      if (b.kind === 'gate') { expect(g.getAttribute('transform')).toBe('translate(500 640)'); continue; }
      expect(g.getAttribute('transform')).toBe(`translate(${b.pos.x} ${b.pos.y})`);
      expect(g.querySelector('[data-roof]')!.getAttribute('data-roof')).toBe(b.kind);
    }
  });

  it('each roof family draws its signature part', () => {
    render();
    const roof = (id: string) => q(`[data-testid="cm-bld-${id}"]`)!;
    expect(roof('lecture').querySelector('polygon.roof')).not.toBeNull(); // pediment
    expect(roof('observatory').querySelector('path.roof')!.getAttribute('d')).toContain('A'); // dome arc
    expect(roof('arcade').textContent).toContain('GAME ROOM'); // neon sign
    expect(roof('gate').textContent).toContain('MAIN GATE');
  });

  it('the grounds carry the prototype landmarks', () => {
    render();
    for (const id of ['cm-world', 'cm-ground-grass', 'cm-quad-lawn', 'cm-quad-label', 'cm-fountain', 'cm-paths', 'cm-trees', 'cm-district', 'cm-district-sign', 'cm-gate-pillars', 'cm-avatar']) {
      expect(q(`[data-testid="${id}"]`)).not.toBeNull();
    }
    expect(q('[data-testid="cm-quad-label"]')!.textContent).toBe('THE QUAD');
  });

  it('name pills use the catalog names, and Workplace names swap them', () => {
    render();
    expect(q('[data-testid="cm-label-library"]')!.textContent).toBe(CAMPUS_BUILDINGS.find((b) => b.id === 'library')!.name);
    render({ workplaceNames: true });
    expect(q('[data-testid="cm-label-library"]')!.textContent).toBe(CAMPUS_BUILDINGS.find((b) => b.id === 'library')!.workplaceName);
  });

  it('the Main Gate is scenery for everyone: drawn even when the gate is not a building for this viewer', () => {
    render({ buildings: CAMPUS_BUILDINGS.filter((b) => b.kind !== 'gate') });
    expect(q('[data-testid="cm-bld-gate"]')).toBeNull();
    expect(q('[data-testid="cm-gate-pillars"]')).not.toBeNull();
    render();
    expect(container.querySelectorAll('[data-testid="cm-gate-pillars"]')).toHaveLength(1);
  });

  it('compact maps are pictures: no labels, no avatar, no tab stops, no world test id', () => {
    render({ compact: true });
    expect(q('[data-testid^="cm-label-"]')).toBeNull();
    expect(q('[data-testid="cm-avatar"]')).toBeNull();
    expect(q('[tabindex]')).toBeNull();
    expect(q('[data-testid="cm-world"]')).toBeNull();
  });

  it('reduce motion marks the map (the shimmer and bob stop) and arrives at the door at once', () => {
    const arrived: string[] = [];
    render({ initialTarget: 'commons', onArrive: (id) => arrived.push(id) });
    expect(q('svg')!.getAttribute('class')).toContain('is-reduced');
    const d = doorOf(CAMPUS_BUILDINGS.find((b) => b.id === 'commons')!);
    expect(q('[data-testid="cm-avatar"]')!.getAttribute('transform')).toBe(`translate(${d.x} ${d.y})`);
    expect(arrived).toEqual(['commons']);
    expect(q('[data-testid="cm-bld-commons"]')!.getAttribute('class')).toContain('is-here');
  });

  it('with motion on, the map is not marked reduced and the avatar walks (never teleports) to the door', () => {
    const frames: FrameRequestCallback[] = [];
    const spy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); return frames.length; });
    try {
      const arrived: string[] = [];
      render({ reduceMotion: false, initialTarget: 'library', onArrive: (id) => arrived.push(id) });
      expect(q('svg')!.getAttribute('class')).not.toContain('is-reduced');
      expect(q('[data-testid="cm-avatar"]')!.getAttribute('class')).toContain('is-walking');
      act(() => { frames.shift()!(0); });
      act(() => { frames.shift()!(100); });
      // WP-3: 100 ms into the prototype's eased walk (330 units/s, slow start): a little up the spine from the gate (500,640),
      // nowhere near the door yet
      const [, x, y] = /translate\(([\d.]+) ([\d.]+)\)/.exec(q('[data-testid="cm-avatar"]')!.getAttribute('transform')!)!.map(Number);
      expect(x).toBe(500);
      expect(y).toBeLessThan(640);
      expect(y).toBeGreaterThan(620);
      expect(arrived).toEqual([]);
      act(() => { frames.shift()!(100000); });
      const d = doorOf(CAMPUS_BUILDINGS.find((b) => b.id === 'library')!);
      expect(q('[data-testid="cm-avatar"]')!.getAttribute('transform')).toBe(`translate(${d.x} ${d.y})`);
      expect(arrived).toEqual(['library']);
    } finally { spy.mockRestore(); }
  });
});

describe('people on the map (C11b F13)', () => {
  it('the on-duty AI desks stand at their buildings with a STAFF tag; C21: Maya on the Admissions building (no bench at the gate); a press walks there', () => {
    const arrived: string[] = [];
    // an older server still says 'gate' for Maya: she is drawn on Admissions all the same
    render({ desks: [{ id: 'reese', name: 'Reese', building: 'commons' }, { id: 'maya', name: 'Maya', building: 'gate' }], onArrive: (id) => arrived.push(id) });
    const reese = q('[data-testid="cm-staff-reese"]')!;
    expect(reese.textContent).toContain('STAFF');
    expect(reese.getAttribute('aria-label')).toContain('Reese');
    expect(q('[data-testid="cm-maya-desk"]')).toBeNull();
    const maya = q('[data-testid="cm-staff-maya"]')!;
    expect(maya.getAttribute('transform')).toMatch(/^translate\(6\d\d /); // on the Admissions building (x 614), not the gate (500)
    act(() => { reese.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { maya.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(arrived).toEqual(['commons', 'admissions']);
  });

  it('no desks listed, no staff tokens; none on the compact maps', () => {
    render({ desks: [] });
    expect(q('[data-testid="cm-staff-tokens"]')).toBeNull();
    render({ compact: true, desks: [{ id: 'reese', name: 'Reese', building: 'commons' }] });
    expect(q('[data-testid="cm-staff-tokens"]')).toBeNull();
  });

  it('your initials are in your pin when known', () => {
    render({ me: { initials: 'AM' } });
    expect(q('[data-testid="cm-avatar"] .cm-pin-initials')!.textContent).toBe('AM');
    render({ me: null });
    expect(q('[data-testid="cm-avatar"] .cm-pin-initials')).toBeNull();
  });
});
