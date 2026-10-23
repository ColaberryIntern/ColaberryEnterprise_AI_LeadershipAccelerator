/**
 * WP-3, travel feel and map dressing, on the real map:
 *  - the prototype's walk: 330 units/s (560 running) times the ride, ease-in-out, never under 600 ms; while walking the red route
 *    line, footsteps, the destination highlighted and the "Walking to X… Skip" toast (Skip stands you at the door);
 *  - the people chip opens the peek (named people open their card, private ones are "Learner"), "—" chips while presence is down,
 *    a partner's "N · M yours" with teal dots;
 *  - a member's time badges and the urgent ring; the night look when nobody else is on campus;
 *  - your pin: account colour, photo or name initials, "Lv N";
 *  - the gate fades from 1.3 s and lets you in at 2 s; the schematic mini maps.
 */
import React, { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import CampusWorld from '../CampusWorld';
import type { CampusWorldProps } from '../CampusWorld';
import { CAMPUS_BUILDINGS } from '../campusMap';
import { easeInOut, walkMs, MIN_WALK_MS } from '../useWalk';
import { travelSpeed, travelVerb } from '../campusGear';
import { momentsFrom, shortIn } from '../home/useMapMoments';
import CampusGate, { FADE_AT_MS, OPEN_MS } from '../home/CampusGate';
import CampusMiniMap from '../CampusMiniMap';
import type { CampusPresence } from '../campusApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => undefined);

let frames: FrameRequestCallback[] = [];
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  frames = [];
  // jsdom here has no requestAnimationFrame to spy on: stand in for it, as campusGear does
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => { frames.push(cb); return frames.length; }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.restoreAllMocks(); jest.useRealTimers(); });
let t = 0;
const frame = (ms: number) => { const f = frames.shift(); if (f) { t += ms; act(() => f(t)); } };
const runAll = () => { for (let i = 0; i < 2000 && frames.length; i++) frame(16); };
const q = (s: string) => container.querySelector(s) as HTMLElement | null;
const click = (s: string, init: MouseEventInit = {}) => act(() => { q(s)!.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init })); });

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

describe('the walk (prototype travelTo)', () => {
  it('speed, ride and easing', () => {
    expect(travelSpeed(undefined)).toBe(330);
    expect(travelSpeed(undefined, true)).toBe(560);
    expect(travelSpeed('board')).toBeCloseTo(445.5);
    expect(travelSpeed('cruiser')).toBeCloseTo(627);
    expect([travelVerb(undefined), travelVerb(undefined, true), travelVerb('board'), travelVerb('cruiser')]).toEqual(['Walking', 'Running', 'Skating', 'Driving']);
    expect(walkMs(33)).toBe(MIN_WALK_MS); // a short hop still takes 600 ms
    expect(walkMs(660)).toBe(2000);
    expect([easeInOut(0), easeInOut(0.25), easeInOut(0.5), easeInOut(1)]).toEqual([0, 0.125, 0.5, 1]);
  });

  it('while walking: the route line, footsteps, the destination highlighted and the toast; Skip stands you at the door', () => {
    mount();
    click('[data-testid="cm-bld-library"]');
    frame(16); frame(200);
    expect(q('[data-testid="cm-route-line"]')!.getAttribute('d')).toMatch(/^M500 640L/);
    expect(container.querySelectorAll('.cm-steps .cm-step').length).toBeGreaterThan(0);
    expect(q('[data-testid="cm-bld-library"]')!.getAttribute('class')).toContain('is-hl');
    expect(q('[data-testid="cm-travel-text"]')!.textContent).toBe('Walking to Library…');
    click('[data-testid="cm-travel-skip"]');
    runAll();
    expect(q('[data-testid="cm-card"]')?.getAttribute('data-building')).toBe('library');
    expect(q('[data-testid="cm-route-line"]')!.getAttribute('d')).toBe('');
    expect(q('[data-testid="cm-travel-text"]')).toBeNull();
  });

  it('on a skateboard the toast says Skating; the walk eases (slow start)', () => {
    mount({ ownGear: { ride: 'board' } });
    click('[data-testid="cm-bld-observatory"]');
    frame(16);
    const before = q('[data-testid="cm-avatar"]')!.getAttribute('transform');
    frame(50);
    expect(q('[data-testid="cm-travel-text"]')!.textContent).toBe('Skating to My Progress…');
    const [, x0, y0] = /translate\(([\d.]+) ([\d.]+)\)/.exec(before!)!.map(Number);
    const [, x1, y1] = /translate\(([\d.]+) ([\d.]+)\)/.exec(q('[data-testid="cm-avatar"]')!.getAttribute('transform')!)!.map(Number);
    expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThan(5); // ease-in: barely moved after 50 ms
  });
});

const PRESENCE: CampusPresence = {
  commons: { count: 3, people: [{ enrollment_id: 'e1', display_name: 'Sam Lee', avatar_url: null, can_message: true, rung_name: 'AI Aware II' }, { anonymous: true }] },
};

describe('people on the map', () => {
  it('the people chip opens the peek: named people open their card, private ones say Learner, Walk to walks', () => {
    const opened: string[] = [];
    mount({ presence: PRESENCE, onOpenPerson: (tg) => opened.push(tg.person.display_name) });
    click('[data-testid="cm-count-commons"]', { clientX: 300, clientY: 200 });
    expect(q('[data-testid="cm-peek"]')!.textContent).toContain('In Community Lounge');
    expect(q('[data-testid="cm-peek"]')!.textContent).toContain('3 classmates right now');
    expect(q('[data-testid="cm-peek-anon"]')!.textContent).toContain('Name private to their account');
    expect(q('[data-testid="cm-card"]')).toBeNull(); // the chip press does not walk to the building
    click('[data-testid="cm-peek-person"]');
    expect(opened).toEqual(['Sam Lee']);
    expect(q('[data-testid="cm-peek"]')).toBeNull();
  });

  it('no row of person tokens under the buildings any more (not in the prototype)', () => {
    mount({ presence: PRESENCE, onOpenPerson: () => undefined });
    expect(container.querySelector('.cm-token')).toBeNull();
    expect(container.querySelector('[data-testid^="cm-tokens-"]')).toBeNull();
  });

  it('presence down: every chip reads "—" (unknown, not zero); presence not wired: no chips', () => {
    mount({ presence: null, presenceError: true });
    expect(q('[data-testid="cm-count-library"]')!.textContent).toBe('—');
    act(() => setExtra({ presence: undefined, presenceError: false }));
    expect(q('[data-testid^="cm-count-"]')).toBeNull();
  });

  it('a partner sees "N · M yours" with teammates\' dots in teal', () => {
    mount({ audience: 'business', presence: PRESENCE });
    expect(q('[data-testid="cm-count-commons"]')!.textContent).toBe('3 · 1 yours');
    expect(q('[data-testid="cm-count-commons"] .cm-count-dot')!.getAttribute('class')).toContain('is-team');
  });
});

describe('what is next on the map (members), and the quiet look', () => {
  const now = new Date('2026-10-22T10:00:00').getTime();
  const session = (date: string, time: string, status: 'scheduled' | 'live' = 'scheduled') => ({ id: 's', session_number: 1, title: 'Build Day', session_date: date,
    start_time: time, end_time: '23:00', status, meeting_link: null, meeting_provider: null, timezone: 'America/Chicago', room_id: null });
  it('"Class in 1d 3h", "In 15d"; within 15 minutes the badge turns red and the ring pulses; live says Live now', () => {
    expect(shortIn(now + 27 * 3600000, now)).toBe('1d 3h');
    const far = momentsFrom({ session: session('2026-10-23', '13:00') }, { event: { id: 'e', title: 'Open House', starts_at: new Date(now + 15 * 86400000).toISOString() } as never }, now);
    expect(far).toEqual({ urgent: null, badges: { lecture: { text: 'Class in 1d 3h', tone: '' }, amphi: { text: 'In 15d', tone: '' } } });
    const soon = momentsFrom({ session: session('2026-10-22', '10:12') }, {}, now);
    expect(soon).toEqual({ urgent: 'lecture', badges: { lecture: { text: 'Class in 12 min', tone: 'hot' } } });
    expect(momentsFrom({ session: session('2026-10-22', '09:00', 'live') }, {}, now).badges.lecture).toEqual({ text: 'Live now', tone: 'hot' });
    expect(momentsFrom({}, {}, now)).toEqual({ urgent: null, badges: {} });
  });
  it('on the map: the badge in the building\'s slot, the urgent ring, and the quiet look', () => {
    mount({ moments: { urgent: 'lecture', badges: { lecture: { text: 'Class in 12 min', tone: 'hot' } } }, quiet: true });
    expect(q('[data-testid="cm-badge-lecture"]')!.textContent).toBe('Class in 12 min');
    expect(q('[data-testid="cm-bld-lecture"]')!.getAttribute('class')).toContain('is-urgent');
    expect(q('svg.cm-map')!.getAttribute('class')).toContain('is-quiet');
  });
});

describe('your pin', () => {
  it('your colour, your photo or your initials, and "Lv N"', () => {
    mount({ me: { initials: 'AM', photo: null, level: 4, tone: 'explorer' } });
    expect(q('[data-testid="cm-avatar"]')!.getAttribute('class')).toContain('is-explorer');
    expect(q('.cm-pin-initials')!.textContent).toBe('AM');
    expect(q('[data-testid="cm-avatar-level"]')!.textContent).toBe('Lv4');
    act(() => setExtra({ me: { initials: 'AM', photo: 'data:image/png;base64,AAAA', level: null, tone: 'member' } }));
    expect(q('[data-testid="cm-avatar-photo"]')).not.toBeNull();
    expect(q('.cm-pin-initials')).toBeNull();
    expect(q('[data-testid="cm-avatar-level"]')).toBeNull();
  });
});

describe('the gate and the mini maps', () => {
  it('the gate fades from 1.3 s and lets you in at 2 s', () => {
    jest.useFakeTimers();
    const entered: boolean[] = [];
    act(() => { root.render(<CampusGate audience="member" firstName="Ali" fullName="Ali M" initials="AM" rung={null} points={null} streak={null} online={null}
      workplace={false} hasTour reduceMotion={false} now={new Date()} onEnter={(x) => entered.push(x)} />); });
    click('[data-testid="cm-gate-enter"]');
    // the prototype's numbers, written out (reading the constants back would pass whatever they were set to)
    expect([FADE_AT_MS, OPEN_MS]).toEqual([1300, 2000]);
    act(() => { jest.advanceTimersByTime(1299); });
    expect(q('[data-testid="cm-gate"]')!.getAttribute('class')).not.toContain('is-done');
    act(() => { jest.advanceTimersByTime(1); });
    expect(q('[data-testid="cm-gate"]')!.getAttribute('class')).toContain('is-done');
    expect(entered).toEqual([]);
    act(() => { jest.advanceTimersByTime(700); });
    expect(entered).toEqual([false]);
  });
  it('tile: grey blocks, the current building in its colour, a pin; side: tints, icons, locked grey, outlined current', () => {
    act(() => { root.render(<CampusMiniMap variant="tile" buildings={[...CAMPUS_BUILDINGS]} here="library" />); });
    const fill = (id: string) => q(`[data-building="${id}"] rect`)!.getAttribute('fill');
    expect(fill('library')).toBe('var(--cm-art-library)');
    expect(fill('lecture')).toBe('var(--cm-art-mini-block)');
    expect(container.querySelector('.cm-mini-pin')).not.toBeNull();
    act(() => { root.render(<CampusMiniMap variant="side" buildings={[...CAMPUS_BUILDINGS]} here="library" accessOf={(b) => (b.id === 'testing' ? 'locked' : 'open')} />); });
    expect(fill('testing')).toBe('var(--cm-art-dot)');
    expect(fill('lecture')).toContain('color-mix');
    expect(q('[data-building="library"] rect')!.getAttribute('stroke-width')).toBe('5');
    expect(q('[data-building="library"] text')!.textContent).toBe('📚');
  });
});
