/**
 * Campus v6 D1 (with v3 §2.1's CSS 3D room): the board and your spot.
 *  - the screen shows the page's Next step; its body opens the section, its primary button the workstation for that card;
 *  - ONE board on the left wall (the card right of the Next step), opening flat with "See it on the page";
 *  - your spot (front right, your name card) walks you there, the camera drops in, then the SAME workstation opens; reduce motion
 *    opens it at once; no spot in rooms where nobody works; no door elements anywhere;
 *  - fallbacks: the plan step, then a plain sign; the arrival card's two tiles.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import Room3D, { WALK_MS, ZOOM_MS } from '../interior/room3d/Room3D';
import type { Room3DProps } from '../interior/room3d/Room3D';
import ArrivalWays from '../ArrivalWays';
import { spotOf } from '../interior/roomSpots';
import type { PageSummary } from '../interior/pageSummary';
import type { PlanStop } from '../campusPlan';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });
const q = (s: string) => container.querySelector(s) as HTMLElement | null;
const click = (s: string) => act(() => { q(s)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

const SUMMARY: PageSummary = {
  next: { kicker: 'Your next step · PropertyPulse AI', points: 50, title: 'STORY-001 · Opportunity Score', sub: 'As an investor…', cta: 'Build · +50 pts', secondary: { label: 'Copy prompt', copy: 'Implement STORY-001' } },
  sideTop: { title: 'Your builds', rows: [{ label: 'Active builds', value: '4' }, { label: 'Build points', value: '130/2380' }] },
  card: '/portal/projects/workspace/p1/STORY-001',
  doorName: 'Projects',
};
const you = { key: 'you', name: 'You', initials: 'AM', photo: null, you: true, tone: 'red' };
function mount(o: Partial<Room3DProps> = {}): jest.Mock {
  const onOpen = jest.fn();
  act(() => { root.render(<Room3D id="studio" name="Project Studio" people={[]} you={you} summary={SUMMARY} spot={spotOf('studio')} firstName="ALI"
    sectionRoute="/portal/projects" onOpen={onOpen} reduceMotion={false} {...o} />); });
  return onOpen;
}

describe('the board (back wall)', () => {
  it('shows the page\'s Next step: kicker with points, title, line, primary and Copy prompt', () => {
    mount();
    expect(q('[data-testid="cm-board"]')!.textContent).toContain('Your next step · PropertyPulse AI');
    expect(q('[data-testid="cm-board"] .pts')!.textContent).toBe('+50 PTS');
    expect(q('[data-testid="cm-board-title"]')!.textContent).toBe('STORY-001 · Opportunity Score');
    expect(q('[data-testid="cm-board-primary"]')!.textContent).toContain('Build · +50 pts');
    expect(q('[data-testid="cm-board-copy"]')!.textContent).toBe('Copy prompt');
  });

  it('C73: the screen body enlarges the board over the room; clicking it again restores it; Escape restores it too', () => {
    const onOpen = mount({ reduceMotion: true });
    click('[data-testid="cm-board"]');
    expect(q('[data-testid="cm-board-zoom"]')).not.toBeNull();
    expect(q('[data-testid="cm-board-big"]')!.textContent).toContain('STORY-001 · Opportunity Score');
    click('[data-testid="cm-board-big"]');
    expect(q('[data-testid="cm-board-zoom"]')).toBeNull();
    click('[data-testid="cm-board-enlarge"]'); // the keyboard's toggle
    expect(q('[data-testid="cm-board-zoom"]')).not.toBeNull();
    act(() => { q('[data-testid="cm-board-zoom"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(q('[data-testid="cm-board-zoom"]')).toBeNull();
    expect(onOpen).not.toHaveBeenCalled(); // enlarging never leaves the room
  });

  it('the board\'s buttons keep their job in both sizes and never toggle the size; See all opens the section', () => {
    const onOpen = mount({ reduceMotion: true });
    click('[data-testid="cm-board-primary"]');
    expect(onOpen).toHaveBeenLastCalledWith('/portal/projects/workspace/p1/STORY-001');
    expect(q('[data-testid="cm-board-zoom"]')).toBeNull();
    click('[data-testid="cm-board-section"]');
    expect(onOpen).toHaveBeenLastCalledWith('/portal/projects');
    click('[data-testid="cm-board"]');
    click('[data-testid="cm-board-zoom"] [data-testid="cm-board-primary"]');
    expect(onOpen).toHaveBeenCalledTimes(3);
    expect(onOpen).toHaveBeenLastCalledWith('/portal/projects/workspace/p1/STORY-001');
  });

  it('C86: a custom screen\'s own button (Chow Hall\'s "Order food") does its job and never also enlarges the board', () => {
    mount({ id: 'chow', name: 'Chow Hall', spot: spotOf('chow'), reduceMotion: true });
    expect(q('[data-testid="cm-board"] [data-testid="cm-crave-order"]')).not.toBeNull();
    click('[data-testid="cm-board"] [data-testid="cm-crave-order"]');
    expect(q('[data-testid="cm-board-zoom"]')).toBeNull();
    click('[data-testid="cm-board"]'); // the body still enlarges it
    expect(q('[data-testid="cm-board-zoom"]')).not.toBeNull();
  });

  it('no Next step: the building\'s plan step; neither: a plain sign with the section name (never placeholder bars)', () => {
    const step = { label: 'Deep Dive · Modern Software', minutes: 6, route: '/portal/runtime/s1' } as unknown as PlanStop;
    const onOpen = mount({ summary: { ...SUMMARY, next: null }, planStep: step, reduceMotion: true });
    expect(q('[data-testid="cm-board-title"]')!.textContent).toBe('Deep Dive · Modern Software');
    click('[data-testid="cm-board-primary"]');
    expect(onOpen).toHaveBeenLastCalledWith('/portal/runtime/s1');
    mount({ summary: { next: null, sideTop: null, card: null, doorName: 'Library' }, id: 'library', spot: null, planStep: null });
    expect(q('[data-testid="cm-board-title"]')!.textContent).toBe('Library');
  });
});

describe('the left wall: one board', () => {
  it('C74: the card right of the Next step enlarges on click and restores on the next; its page link works in both sizes', () => {
    const onOpen = mount();
    expect(container.querySelectorAll('[data-testid="cm-wall-board"]')).toHaveLength(1);
    expect(q('[data-testid="cm-wall-board"]')!.textContent).toContain('Your builds');
    click('[data-testid="cm-wall-board"]');
    expect(q('[data-testid="cm-wall-zoom"] [data-testid="cm-wall-board-big"]')!.textContent).toContain('130/2380');
    click('[data-testid="cm-wall-board-big"]');
    expect(q('[data-testid="cm-wall-zoom"]')).toBeNull();
    click('[data-testid="cm-wall-board-page"]');
    expect(onOpen).toHaveBeenLastCalledWith('/portal/projects');
    expect(q('[data-testid="cm-wall-zoom"]')).toBeNull(); // the link did not also enlarge it
    click('[data-testid="cm-wall-board-enlarge"]');
    click('[data-testid="cm-wall-board-page-big"]');
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('C75: the Schedule\'s Today board: an item opens its assignment, Open Today opens the Today page, anywhere else enlarges it', () => {
    const today = { title: '📅 Today · start learning here', note: 'Included for everyone, no card needed. Pick one to start it.', open: 'Open Today', route: '/portal/today',
      rows: [{ label: 'Deep Dive · Understanding AI', value: '6 min', route: '/portal/runtime/s1' }, { label: 'The Architect Time Machine', value: '30 min', route: '/portal/runtime/s2' }] };
    const onOpen = mount({ id: 'tower', spot: null, sectionRoute: '/portal/schedule', summary: { next: null, sideTop: today, card: null, doorName: 'Schedule' } });
    expect(q('[data-testid="cm-wall-board-note"]')!.textContent).toContain('no card needed');
    expect(container.querySelectorAll('[data-testid="cm-wall-board"] [data-testid="cm-wall-board-row"]')).toHaveLength(2);
    click('[data-testid="cm-wall-board"] [data-testid="cm-wall-board-row"]');
    expect(onOpen).toHaveBeenLastCalledWith('/portal/runtime/s1');
    click('[data-testid="cm-wall-board-page"]');
    expect(onOpen).toHaveBeenLastCalledWith('/portal/today');
    expect(q('[data-testid="cm-wall-zoom"]')).toBeNull(); // neither enlarged it
    click('[data-testid="cm-wall-board-note"]');
    expect(q('[data-testid="cm-wall-zoom"]')).not.toBeNull();
    click('[data-testid="cm-wall-zoom"] [data-testid="cm-wall-board-row"]'); // the enlarged board's items work too
    expect(onOpen).toHaveBeenLastCalledWith('/portal/runtime/s1');
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it('C74: the Chow Hall chalkboard enlarges too; the Meeting Rooms hallway doors do not', () => {
    mount({ id: 'chow', spot: spotOf('chow'), sectionRoute: '/portal/chow', summary: null });
    click('[data-testid="cm-wall-slot"]');
    expect(q('[data-testid="cm-wall-zoom"] [data-testid="cm-wall-slot-big"]')).not.toBeNull();
    click('[data-testid="cm-wall-slot-big"]');
    expect(q('[data-testid="cm-wall-zoom"]')).toBeNull();
  });
});

describe('your spot', () => {
  it('your desk with your name card; no door elements in the room', () => {
    mount();
    expect(q('[data-testid="cm-spot-desk"]')).not.toBeNull();
    expect(q('[data-testid="cm-spot-desk"] [data-testid="cm-spot-name"]')!.textContent).toBe('ALI');
    expect(q('[data-testid="cm-inside-door"]')).toBeNull();
    expect(container.textContent).not.toMatch(/FRONT DOOR|YOUR PAGE/);
  });

  it('click: you walk to it, the camera drops in, then the SAME workstation as the screen\'s button opens', () => {
    jest.useFakeTimers();
    const onOpen = mount();
    click('[data-testid="cm-spot-desk"]');
    expect(onOpen).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(WALK_MS); });
    expect(q('[data-testid="cm-room3d"]')!.className).toContain('is-zoom');
    act(() => { jest.advanceTimersByTime(ZOOM_MS); });
    expect(onOpen).toHaveBeenCalledWith('/portal/projects/workspace/p1/STORY-001');
  });

  it('reduce motion: it opens at once; the Game Room is an aisle of five cabinets (C36); rooms where nobody works have no spot', () => {
    const onOpen = mount({ reduceMotion: true });
    click('[data-testid="cm-spot-desk"]');
    expect(onOpen).toHaveBeenLastCalledWith('/portal/projects/workspace/p1/STORY-001');
    mount({ id: 'arcade', spot: spotOf('arcade'), sectionRoute: '/portal/game-room', reduceMotion: true });
    expect(q('.cm-r3-spot')).toBeNull();
    expect(container.querySelectorAll('[data-testid^="cm-cabinet-"][role="button"]')).toHaveLength(5);
    mount({ id: 'amphi', spot: null });
    expect(q('.cm-r3-spot')).toBeNull();
  });

  it('C76: the Schedule\'s planning desk, with your name card, opens the next unfinished Today item', () => {
    const onOpen = mount({ id: 'tower', spot: spotOf('tower'), sectionRoute: '/portal/schedule', reduceMotion: true,
      summary: { next: null, sideTop: null, card: '/portal/runtime/s2', doorName: 'Schedule' } });
    expect(q('[data-testid="cm-spot-planner"] [data-testid="cm-spot-name"]')!.textContent).toBe('ALI');
    click('[data-testid="cm-spot-planner"]');
    expect(onOpen).toHaveBeenLastCalledWith('/portal/runtime/s2');
  });

  it('a workstation with nothing on it yet: the spot opens the section instead', () => {
    const onOpen = mount({ summary: { ...SUMMARY, card: null }, reduceMotion: true });
    click('[data-testid="cm-spot-desk"]');
    expect(onOpen).toHaveBeenLastCalledWith('/portal/projects');
  });
});

describe('the arrival card: two ways in', () => {
  const render = (el: React.ReactElement) => act(() => { root.render(el); });
  it('a spot room: "Look up, or sit down", the board tile and the spot tile', () => {
    const onSection = jest.fn(), onSpot = jest.fn();
    render(<ArrivalWays spot={spotOf('studio')} summary={SUMMARY} name="Project Studio" primaryLabel="Open your builds" onSection={onSection} onSpot={onSpot} />);
    expect(q('.cm-ways-h')!.textContent).toBe('Look up, or sit down');
    expect(q('[data-testid="cm-way-board"]')!.textContent).toContain('📺 The board');
    expect(q('[data-testid="cm-way-board"]')!.textContent).toContain('The whole section: every card, in order');
    expect(q('[data-testid="cm-way-spot"]')!.textContent).toContain('🪑 Your desk');
    expect(q('[data-testid="cm-way-spot"]')!.textContent).toContain('STORY-001 · Opportunity Score');
    click('[data-testid="cm-way-board"]'); click('[data-testid="cm-way-spot"]');
    expect(onSection).toHaveBeenCalledTimes(1); expect(onSpot).toHaveBeenCalledTimes(1);
  });

  it('a room without a spot: one tile, "On the board"', () => {
    render(<ArrivalWays spot={null} summary={{ next: null, sideTop: null, card: null, doorName: 'Events' }} name="Events Hall" primaryLabel="See events" onSection={() => undefined} onSpot={() => undefined} />);
    expect(q('.cm-ways-h')!.textContent).toBe('On the board');
    expect(q('[data-testid="cm-way-spot"]')).toBeNull();
    expect(q('[data-testid="cm-way-board"]')!.textContent).toContain('See events');
  });
});
