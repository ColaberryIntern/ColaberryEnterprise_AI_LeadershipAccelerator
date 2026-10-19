import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import CampusWorld from '../CampusWorld';
import { campusBuildingsFor } from '../useCampusView';
import type { CampusAudience } from '../campusMap';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let exits = 0;

async function mount(opts: { audience?: CampusAudience; full?: boolean; reduceMotion?: boolean } = {}): Promise<void> {
  const audience = opts.audience ?? 'member';
  exits = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter>
        <CampusWorld buildings={campusBuildingsFor(audience)} audience={audience} hasFullAccess={opts.full ?? false}
          workplaceNames={false} reduceMotion={opts.reduceMotion ?? true} onExit={() => { exits += 1; }} onNavigate={() => {}} />
      </MemoryRouter>,
    );
  });
}
afterEach(() => { act(() => root.unmount()); container.remove(); jest.restoreAllMocks(); });

const bld = (id: string) => container.querySelector(`.cm-bld[data-building="${id}"]`) as SVGGElement;
const card = () => container.querySelector('[data-testid="cm-card"]') as HTMLElement | null;
const press = (el: Element, key: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });

describe('campus map and building card', () => {
  it('every building the member sees opens its own card, with rooms as real links from the catalog', async () => {
    await mount();
    for (const b of campusBuildingsFor('member')) {
      act(() => { bld(b.id).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(card()?.getAttribute('data-building')).toBe(b.id);
      const hrefs = Array.from(card()!.querySelectorAll('a.cm-room')).map((a) => a.getAttribute('href'));
      expect(hrefs).toEqual(b.rooms.filter((r) => !r.planned).map((r) => r.route));
    }
  });

  it('the Game Room (C10) is open: its card links to /portal/game-room and says nothing about opening soon', async () => {
    await mount();
    act(() => { bld('arcade').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(card()!.querySelector('a[href="/portal/game-room"]')).not.toBeNull();
    expect(card()!.textContent).not.toMatch(/opening soon/i);
  });

  it('an Explorer without a seat sees the members-only notice and the enroll link on a locked building', async () => {
    await mount({ audience: 'explorer', full: false });
    act(() => { bld('testing').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(card()!.textContent).toContain('Members only');
    expect(card()!.querySelector('a[href="/portal/settings?tab=subscription"]')).not.toBeNull();
    expect(bld('testing').getAttribute('aria-label')).toBe('Cert Prep Center, Members only');
  });

  // C6: the state is what the page does. A member with full access is never paywalled; one WITHOUT full access is shown the
  // lock PageGate would show them at a paywalled page (C2 assumed members were never blocked, which PageGate does not).
  it('a member with full access sees no access notice anywhere', async () => {
    await mount({ audience: 'member', full: true });
    act(() => { bld('testing').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(card()!.textContent).not.toContain('Members only');
    expect(container.querySelector('.cm-chip')).toBeNull();
  });

  it('a member without full access sees the paywalled Cert Prep Center as locked, as PageGate would show it', async () => {
    await mount({ audience: 'member', full: false });
    act(() => { bld('testing').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(card()!.textContent).toContain('Members only');
  });

  it('reduce motion: arrives at once and never schedules an animation frame', async () => {
    const raf = jest.spyOn(window, 'requestAnimationFrame');
    await mount({ reduceMotion: true });
    act(() => { bld('library').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(raf).not.toHaveBeenCalled();
    expect(card()?.getAttribute('data-building')).toBe('library');
  });

  it('with motion: the avatar walks over frames and the card opens on arrival, not before', async () => {
    let now = 0;
    const queue: FrameRequestCallback[] = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { queue.push(cb); return queue.length; });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    await mount({ reduceMotion: false });
    act(() => { bld('library').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(queue.length).toBe(1);
    expect(card()).toBeNull();
    for (let i = 0; i < 200 && queue.length; i++) { const cb = queue.shift()!; now += 50; act(() => cb(now)); }
    expect(card()?.getAttribute('data-building')).toBe('library');
  });

  it('keyboard: buildings are in Tab order, Enter opens, Esc closes the card and returns focus, a second Esc exits', async () => {
    await mount();
    expect(bld('lecture').getAttribute('tabindex')).toBe('0');
    expect(bld('lecture').getAttribute('role')).toBe('button');
    act(() => bld('lecture').focus());
    press(bld('lecture'), 'Enter');
    expect(card()?.getAttribute('data-building')).toBe('lecture');
    press(card()!, 'Escape');
    expect(card()).toBeNull();
    expect(document.activeElement).toBe(bld('lecture'));
    expect(exits).toBe(0);
    press(bld('lecture'), 'Escape');
    expect(exits).toBe(1);
  });
});
