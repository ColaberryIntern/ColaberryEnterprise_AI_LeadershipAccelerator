/**
 * C11b prototype fidelity, the building markers (art/BuildingBadges.tsx): the people chip, the status badge and the stop badge
 * sit where the prototype puts them and say only what real data says.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import CampusWorldMap from '../CampusWorldMap';
import { CAMPUS_BUILDINGS } from '../campusMap';
import type { ExplorerAccess } from '../campusMap';
import { statusOf } from '../art/BuildingBadges';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const render = (props: Partial<React.ComponentProps<typeof CampusWorldMap>> = {}) => act(() => {
  root.render(<CampusWorldMap buildings={[...CAMPUS_BUILDINGS]} accessOf={() => 'open'} workplaceNames={false} reduceMotion onArrive={() => undefined} {...props} />);
});
const inBld = (id: string, sel: string) => container.querySelector(`[data-testid="cm-bld-${id}"] ${sel}`);
const person = (id: string, rung?: string) => ({ enrollment_id: id, display_name: `Person ${id}`, avatar_url: null, rung_name: rung });

describe('statusOf: the badge says only what is true', () => {
  it('on air wins; OPEN only for the Explorer view; preview, demo and a lock otherwise', () => {
    expect(statusOf('locked', true, false)).toEqual({ text: 'ON AIR', tone: 'hot' });
    expect(statusOf('open', false, true)).toEqual({ text: 'OPEN', tone: 'live' });
    expect(statusOf('open', false, false)).toBeNull();
    expect(statusOf('preview', false, false)!.text).toBe('PREVIEW');
    expect(statusOf('demo', false, true)!.text).toBe('DEMO');
    expect(statusOf('locked', false, true)!.text).toBe('\u{1F512}');
  });
});

describe('the markers on the map', () => {
  it('the people chip shows the real count, right-aligned left of the body, with at most three level-toned dots', () => {
    render({ counts: { library: 5 }, people: { library: { shown: [person('a', 'AI Aware I'), person('b'), person('c'), person('d')], more: 1 } }, onPeek: () => undefined });
    const chip = inBld('library', '.cm-count')!;
    expect(chip.getAttribute('data-count')).toBe('5');
    expect(chip.textContent).toBe('5');
    const lib = CAMPUS_BUILDINGS.find((b) => b.id === 'library')!;
    expect(chip.getAttribute('transform')).toBe(`translate(${-lib.pos.w / 2 - 6} ${-lib.pos.h + 14})`);
    const dots = chip.querySelectorAll('.cm-count-dot');
    expect(dots).toHaveLength(3);
    expect(dots[0].getAttribute('class')).toMatch(/rung-/);
    expect(dots[1].getAttribute('class')).toBe('cm-count-dot');
    expect(inBld('lecture', '.cm-count')).toBeNull(); // no count, no chip (never a zero)
  });

  it('the status badge: ON AIR in red, and an Explorer sees OPEN in green / PREVIEW / DEMO / a lock', () => {
    const access: Record<string, ExplorerAccess> = { library: 'open', lecture: 'preview', studio: 'demo', testing: 'locked' };
    render({ accessOf: (b) => access[b.id] ?? 'open', showOpen: true, onAir: new Set(['commons']) });
    expect(inBld('commons', '[data-testid="cm-onair-commons"]')!.getAttribute('class')).toContain('is-hot');
    expect(inBld('commons', '.cm-badge')!.textContent).toBe('ON AIR');
    expect(inBld('library', '.cm-badge')!.getAttribute('class')).toContain('is-live');
    expect(inBld('library', '.cm-badge')!.textContent).toBe('OPEN');
    expect(inBld('lecture', '.cm-badge')!.textContent).toBe('PREVIEW');
    expect(inBld('studio', '.cm-badge')!.textContent).toBe('DEMO');
    expect(inBld('testing', '.cm-badge')!.textContent).toBe('\u{1F512}');
  });

  it('a member with every building open sees no status badges at all', () => {
    render();
    expect(container.querySelector('.cm-badge')).toBeNull();
  });

  it('the markers are pictures: aria-hidden, while the building label says the same things', () => {
    render({ counts: { commons: 2 }, onAir: new Set(['commons']) });
    expect(inBld('commons', '.cm-count')!.getAttribute('aria-hidden')).toBe('true');
    expect(inBld('commons', '.cm-badge')!.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[data-testid="cm-bld-commons"]')!.getAttribute('aria-label')).toContain('on air now');
    expect(container.querySelector('[data-testid="cm-bld-commons"]')!.getAttribute('aria-label')).toContain('2 here now');
  });

  it('compact maps scale the markers up to stay readable and draw no dots', () => {
    render({ compact: true, counts: { library: 3 }, onAir: new Set(['library']) });
    expect(inBld('library', '.cm-count')!.getAttribute('transform')).toContain('scale(');
    expect(inBld('library', '.cm-badge')!.getAttribute('transform')).toContain('scale(');
    expect(container.querySelector('.cm-count-dot')).toBeNull();
  });
});
